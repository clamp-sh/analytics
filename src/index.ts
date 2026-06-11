import type { EventPayload, BatchPayload, EventMap, AnyEvents, EventProperties, EventPropertyValue } from "./types.js";
import type * as ErrorsModule from "./errors.js";
import { isReservedWireName, RESERVED_NAME_ERROR } from "./wire-names.js";

// ── Default endpoint ────────────────────────────────────────────────
const DEFAULT_ENDPOINT = "https://api.clamp.sh";

// 30 minutes in ms — session rotates after this long hidden
const SESSION_IDLE_MS = 30 * 60 * 1000;

// Flush early when this many events queue up. Half the per-batch ceiling
// of 100, so burst traffic doesn't have to wait the 5-second interval and
// no batch ever risks blowing past the cap.
const BATCH_FLUSH_AT_LENGTH = 50;

/** Opt-in auto-tracking extensions. See docs/sdk for the full list. */
export interface Extensions {
  /** Track clicks on links to external domains. Emits `outbound_click`. */
  outboundLinks?: boolean;
  /** Track clicks on links to downloadable files. Emits `download`. */
  downloads?: boolean | { extensions: string[] };
  /** Track Core Web Vitals (LCP, CLS, INP, FCP, TTFB). Requires `web-vitals` peer dep. */
  webVitals?: boolean | { sampleRate: number };
  /** Detect likely 404 pages by matching the document title. Emits `404`. */
  notFound?: boolean | { pattern: RegExp };
  /** Auto-track clicks on elements with `data-clamp-event` attributes. */
  dataAttributes?: boolean;
  /**
   * Fire `section_viewed` once per session per element with
   * `data-clamp-section="<name>"` when it scrolls into view. Useful for
   * measuring which sections of a page actually get seen.
   */
  sectionViews?: boolean | { threshold: number };
}

export interface InitOptions {
  endpoint?: string;
  debug?: boolean;
  extensions?: Extensions;
  /**
   * Pathname prefixes to skip auto-pageview tracking on. Matched
   * case-insensitively against `location.pathname` (not search). Explicit
   * `track()` calls are unaffected. Useful for authenticated product
   * surfaces (e.g. `/dashboard`) whose traffic would pollute a marketing
   * funnel.
   */
  excludePaths?: string[];
  /**
   * Auto-capture uncaught exceptions and unhandled promise rejections as
   * `$error` events. Defaults to `false` so existing installs are unaffected;
   * opt in when you want errors to land alongside your other analytics.
   * `captureError()` works regardless of this setting.
   */
  captureErrors?: boolean;
}

// ── Internal client ─────────────────────────────────────────────────
class BrowserClient<E extends EventMap = AnyEvents> {
  private projectId: string | null = null;
  private endpoint: string = DEFAULT_ENDPOINT;
  private sessionId: string | null = null;
  private anonymousId: string | null = null;
  /** Authenticated user id, set by identify(). Persisted in localStorage
   *  so it survives reloads + crosses tabs. Cleared by reset(). */
  private userId: string | null = null;
  private queue: EventPayload[] = [];
  private preInitQueue: Array<{ name: string; props?: EventProperties }> = [];
  private initialized = false;
  private debug = false;

  // Dedup state
  private lastPageviewPath: string | null = null;
  private lastPageviewTime = 0;

  // Engagement tracking
  private engagementSeconds = 0;
  private engagementTimer: ReturnType<typeof setInterval> | null = null;
  private pageviewEndSent = false;
  // Highest scroll % the user has reached on the current pageview. Updated
  // on each scroll (rAF-throttled). Sent in pageview_end alongside
  // engagement_seconds — together they answer "how far did the user get,
  // and did they linger?". Resets on pageview() for SPA navs.
  private maxScrollPct = 0;
  private scrollRafId: number | null = null;

  // Session idle tracking
  private hiddenAt: number | null = null;

  // Path-based auto-pageview exclusions (lowercased prefixes)
  private excludedPathPrefixes: string[] = [];

  // Cached errors module reference. Set once the module is dynamically
  // imported (either via init({ captureErrors: true }) or via the first
  // captureError() call). Used so session-rotation can clear the rate-limit
  // state without re-importing.
  private errorsModule: typeof ErrorsModule | null = null;

  private log(msg: string, data?: unknown) {
    if (!this.debug) return;
    if (data !== undefined) console.log(`[clamp] ${msg}`, data);
    else console.log(`[clamp] ${msg}`);
  }

  init(projectId: string, opts?: InitOptions) {
    if (typeof window === "undefined") return;

    if (opts?.debug) this.debug = true;

    if (this.initialized) {
      this.log("init: already initialized, ignoring duplicate call");
      return;
    }

    // Guardrail: a missing or malformed projectId is the #1 cause of silent
    // integration failures. Refuse to initialize and log one loud warning so
    // it's obvious in the browser console instead of an opaque 400 on every
    // beacon. Matches the server-issued id shape (`proj_<cuid>`).
    if (typeof projectId !== "string" || !/^proj_[A-Za-z0-9_-]+$/.test(projectId)) {
      const received =
        projectId === undefined
          ? "undefined"
          : projectId === null
            ? "null"
            : typeof projectId === "string"
              ? `"${projectId}"`
              : typeof projectId;
      console.warn(
        `[clamp] Missing or invalid project_id (${received}). See https://clamp.sh/docs/sdk`,
      );
      return;
    }

    // Skip tracking on localhost / dev environments
    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
      this.log("Skipping init on localhost");
      return;
    }

    this.projectId = projectId;
    if (opts?.endpoint) this.endpoint = opts.endpoint;
    if (Array.isArray(opts?.excludePaths)) {
      this.excludedPathPrefixes = opts.excludePaths
        .filter((p): p is string => typeof p === "string" && p.length > 0)
        .map((p) => p.toLowerCase());
    }
    this.initialized = true;

    // Session ID: per-tab, resets on new tab or after 30 min idle
    this.sessionId =
      sessionStorage.getItem("clamp_sid") ?? this.newId("ses");
    sessionStorage.setItem("clamp_sid", this.sessionId);

    // Anonymous ID: persists across sessions
    this.anonymousId =
      localStorage.getItem("clamp_aid") ?? this.newId("anon");
    localStorage.setItem("clamp_aid", this.anonymousId);

    // User ID: persists across sessions, set by identify(), cleared by
    // reset(). When non-null, every emitted event carries it as userId.
    this.userId = localStorage.getItem("clamp_uid");

    this.log("Initialized", { projectId, endpoint: this.endpoint, sessionId: this.sessionId, anonymousId: this.anonymousId, userId: this.userId });

    // Flush pre-init buffer. Use emit() directly so any $-prefixed system
    // events buffered via emitSystem() (e.g. an early captureError()) replay
    // without being re-rejected by the reserved-prefix guard on track().
    for (const e of this.preInitQueue) {
      this.emit(e.name, e.props);
    }
    this.preInitQueue = [];

    // Auto-pageview on load
    this.pageview();

    // Auto-pageview on SPA navigation
    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);
    history.pushState = (...args) => {
      origPushState(...args);
      this.pageview();
    };
    history.replaceState = (...args) => {
      origReplaceState(...args);
      this.pageview();
    };
    window.addEventListener("popstate", () => this.pageview());

    // bfcache: restore counts as a new pageview
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) {
        this.pageviewEndSent = false;
        this.maxScrollPct = 0;
        this.pageview();
      }
    });

    // Batch flush every 5s
    setInterval(() => this.flush(), 5000);

    // Engagement + session idle handling
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.hiddenAt = Date.now();
        this.stopEngagement();
        this.sendPageviewEnd();
        this.flush(true);
      } else {
        // Returning from hidden — rotate session if idle too long
        if (this.hiddenAt !== null && Date.now() - this.hiddenAt >= SESSION_IDLE_MS) {
          this.sessionId = this.newId("ses");
          sessionStorage.setItem("clamp_sid", this.sessionId);
          // Reset error rate-limit for the new session so a recurring
          // bug gets fresh budget. No-op if errors module hasn't loaded.
          this.errorsModule?.resetErrorRateLimit();
          this.log(`Session rotated after ${Math.round((Date.now() - this.hiddenAt) / 1000)}s idle`, { sessionId: this.sessionId });
        }
        this.hiddenAt = null;
        this.startEngagement();
      }
    });

    window.addEventListener("pagehide", () => {
      this.stopEngagement();
      this.sendPageviewEnd();
      this.flush(true);
    });

    // Max-scroll tracking — rAF-throttled passive listener. One update per
    // paint at most, so scroll-heavy pages don't pay measurable CPU.
    // Captures the initial visible fold once on install so a user who
    // never scrolls still gets a non-zero reading.
    window.addEventListener("scroll", () => {
      if (this.scrollRafId !== null) return;
      this.scrollRafId = requestAnimationFrame(() => {
        this.scrollRafId = null;
        this.updateMaxScroll();
      });
    }, { passive: true });
    this.updateMaxScroll();

    // Start engagement counter
    this.startEngagement();

    // Install opt-in extensions. Each is a no-op unless enabled.
    this.installExtensions(opts?.extensions);

    // Opt-in auto-capture for uncaught errors and unhandled promise rejections.
    // The errors module is a separate subpath export (`@clamp-sh/analytics/errors`)
    // and is dynamically imported so the main bundle stays minimal for users
    // who don't opt in.
    if (opts?.captureErrors) {
      this.loadErrorsModule()
        .then((mod) => {
          // captureError emits $error — route through emitSystem to bypass
          // the reserved-prefix guard on the public track().
          const trackFn = (name: string, properties: EventProperties) =>
            this.emitSystem(name, properties);
          mod.installErrorCapture(trackFn);
          this.log("error capture: installed window.onerror + unhandledrejection listeners");
        })
        .catch((err) => console.warn("[clamp] failed to load errors module", err));
    }
  }

  loadErrorsModule(): Promise<typeof ErrorsModule> {
    if (this.errorsModule) return Promise.resolve(this.errorsModule);
    return import("./errors.js").then((mod) => {
      this.errorsModule = mod;
      return mod;
    });
  }

  private installExtensions(ext?: Extensions) {
    if (!ext) return;

    // Each extension lives at its own subpath and is dynamic-imported
    // independently. Users who only enable one extension only download
    // that one chunk; the others stay out of the bundle entirely.
    //
    // System extensions emit $-prefixed wire names ($web_vital,
    // $section_viewed, etc.) so the bridge routes through emitSystem to
    // bypass the reserved-prefix guard on the public track().
    const systemTrack = (name: string, props?: EventProperties) =>
      this.emitSystem(name, props);
    // The data-attributes extension forwards user-supplied event names
    // straight from HTML, so it must use the guarded track() path — a
    // page author can't smuggle in a $-prefixed canonical name via a
    // data-clamp-event attribute.
    const userTrack = (name: string, props?: EventProperties) =>
      this.track(name as keyof E & string, props as E[keyof E & string] extends EventProperties ? E[keyof E & string] : EventProperties);

    if (ext.outboundLinks) {
      import("./extensions/outbound-links.js")
        .then((mod) => {
          mod.installOutboundLinks(systemTrack);
          this.log("ext: outboundLinks installed");
        })
        .catch((err) => console.warn("[clamp] failed to load outbound-links extension", err));
    }
    if (ext.downloads) {
      const exts = typeof ext.downloads === "object" ? ext.downloads.extensions : undefined;
      import("./extensions/downloads.js")
        .then((mod) => {
          mod.installDownloads(systemTrack, exts);
          this.log("ext: downloads installed");
        })
        .catch((err) => console.warn("[clamp] failed to load downloads extension", err));
    }
    if (ext.notFound) {
      const pattern = typeof ext.notFound === "object" ? ext.notFound.pattern : undefined;
      import("./extensions/not-found.js")
        .then((mod) => {
          mod.install404(systemTrack, pattern);
          this.log("ext: 404 detection installed");
        })
        .catch((err) => console.warn("[clamp] failed to load not-found extension", err));
    }
    if (ext.dataAttributes) {
      import("./extensions/data-attributes.js")
        .then((mod) => {
          mod.installDataAttributes(userTrack);
          this.log("ext: dataAttributes installed");
        })
        .catch((err) => console.warn("[clamp] failed to load data-attributes extension", err));
    }
    if (ext.webVitals) {
      const rate = typeof ext.webVitals === "object" ? ext.webVitals.sampleRate : 1;
      import("./extensions/web-vitals.js")
        .then((mod) => mod.installWebVitals(systemTrack, rate))
        .then(() => this.log(`ext: webVitals installed (sampleRate=${rate})`))
        .catch((err) => console.warn("[clamp] failed to load web-vitals extension", err));
    }
    if (ext.sectionViews) {
      const threshold = typeof ext.sectionViews === "object" ? ext.sectionViews.threshold : 0.4;
      import("./extensions/section-views.js")
        .then((mod) => {
          mod.installSectionViews(systemTrack, threshold);
          this.log(`ext: sectionViews installed (threshold=${threshold})`);
        })
        .catch((err) => console.warn("[clamp] failed to load section-views extension", err));
    }
  }

  track<K extends keyof E & string>(
    name: K,
    properties?: E[K] extends EventProperties ? E[K] : EventProperties,
  ) {
    // Reserve $-prefixed names for canonical revenue events + SDK-emitted
    // system events. Drop silently with a console.warn so the rest of the
    // app keeps working; users land on a clearer error than an opaque
    // server-side rejection of a name collision.
    if (typeof name === "string" && isReservedWireName(name)) {
      console.warn(`[clamp] ${RESERVED_NAME_ERROR} (got "${name}")`);
      return;
    }
    this.emit(name, properties as EventProperties | undefined);
  }

  /**
   * Internal emission path shared by the public `track()` and the
   * `emitSystem()` helper. Pushes onto the pre-init buffer if init hasn't
   * run yet, otherwise builds an EventPayload and queues it for the next
   * flush. Bypasses the reserved-prefix guard so the SDK can emit its own
   * $-prefixed system events.
   */
  private emit(name: string, properties?: EventProperties) {
    if (!this.initialized) {
      this.preInitQueue.push({ name, props: properties });
      return;
    }

    const event: EventPayload = {
      name,
      url: location.href,
      referrer: document.referrer,
      sessionId: this.sessionId!,
      anonymousId: this.anonymousId!,
      userId: this.userId ?? "",
      timestamp: new Date().toISOString(),
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      language: navigator.language,
      platform: "web",
      properties,
    };
    this.queue.push(event);
    this.log(`track: ${name}`, properties || {});
    if (this.queue.length >= BATCH_FLUSH_AT_LENGTH) this.flush();
  }

  /**
   * Emit a $-prefixed system event. Used by the SDK's own instrumentation
   * (pageview, identify, error capture, extensions, revenue) to bypass the
   * reserved-prefix guard that fires on the public `track()`.
   */
  emitSystem(name: string, properties?: EventProperties) {
    this.emit(name, properties);
  }

  /**
   * Bind subsequent events to an authenticated user. Every event after this
   * call carries `userId` on the wire; the server inserts a row into
   * `identity_links` so pre-signup activity from the same `anonymousId` can
   * be retroactively attributed to this user at query time.
   *
   * Call this the moment a user signs in or signs up. Safe to call repeatedly
   * with the same id (no-op).
   *
   * @param userId  Your app's stable id for this user. Anything <=128 chars.
   * @param traits  Optional user attributes (email, plan, etc.) sent with the
   *                `$identify` event as properties. Use for profile enrichment
   *                without polluting every subsequent event.
   */
  identify(userId: string, traits?: EventProperties) {
    if (typeof userId !== "string" || userId.length === 0 || userId.length > 128) {
      console.warn("[clamp] identify() requires a non-empty userId (<=128 chars)");
      return;
    }
    if (!this.initialized) {
      console.warn("[clamp] identify() called before init() — ignoring");
      return;
    }
    if (this.userId === userId) {
      this.log(`identify deduped: ${userId}`);
      return;
    }
    this.userId = userId;
    localStorage.setItem("clamp_uid", userId);
    // Fire $identify so the server inserts an identity_links row and any
    // attached traits land in event properties for profile enrichment.
    this.emitSystem("$identify", { user_id: userId, ...(traits as EventProperties | undefined) });
    this.log(`identify: ${userId}`);
  }

  /**
   * Clear the bound user id and rotate the anonymous id, as if a brand-new
   * visitor just arrived. Call this on logout. Does NOT flush queued events
   * to a server before rotating — anything in the queue gets sent under the
   * previous identity (correct: those events belong to the user who was
   * signed in when they happened).
   */
  reset() {
    if (!this.initialized) return;
    this.flush(true);
    this.userId = null;
    localStorage.removeItem("clamp_uid");
    this.anonymousId = this.newId("anon");
    localStorage.setItem("clamp_aid", this.anonymousId);
    this.sessionId = this.newId("ses");
    sessionStorage.setItem("clamp_sid", this.sessionId);
    this.log(`reset: new anonymousId=${this.anonymousId} sessionId=${this.sessionId}`);
  }

  getAnonymousId(): string | null {
    return this.anonymousId;
  }

  getUserId(): string | null {
    return this.userId;
  }

  // ── Private ─────────────────────────────────────────────────────────

  private pageview() {
    const path = location.pathname + location.search;
    const now = Date.now();

    // Dedup: skip if same path fired within 500ms (double-fire from pushState+replaceState or Strict Mode)
    if (path === this.lastPageviewPath && now - this.lastPageviewTime < 500) {
      this.log(`pageview deduped: ${path}`);
      return;
    }

    // Finalize previous page engagement before any early return — the prior
    // page was valid regardless of whether the new one is excluded.
    if (this.lastPageviewPath !== null) {
      this.sendPageviewEnd();
    }

    if (this.isPathExcluded(location.pathname)) {
      this.lastPageviewPath = null;
      this.engagementSeconds = 0;
      this.maxScrollPct = 0;
      this.pageviewEndSent = false;
      this.log(`pageview excluded by path: ${path}`);
      return;
    }

    this.lastPageviewPath = path;
    this.lastPageviewTime = now;
    this.engagementSeconds = 0;
    this.maxScrollPct = 0;
    this.pageviewEndSent = false;

    this.emitSystem("$pageview");
    // Capture the new page's initial visible fold immediately — handles
    // anchor-link landings (/page#section) which arrive scrolled.
    this.updateMaxScroll();
  }

  /** Compute current visible-bottom % and update the high-water mark. */
  private updateMaxScroll() {
    const scroller = document.scrollingElement ?? document.documentElement;
    const scrollHeight = scroller.scrollHeight;
    const viewportHeight = window.innerHeight;
    // Page is shorter than the viewport — everything's been visible.
    if (scrollHeight <= viewportHeight) {
      this.maxScrollPct = 100;
      return;
    }
    const scrollY = window.scrollY || scroller.scrollTop;
    const visibleBottom = scrollY + viewportHeight;
    const pct = Math.min(100, Math.round((visibleBottom / scrollHeight) * 100));
    if (pct > this.maxScrollPct) this.maxScrollPct = pct;
  }

  private isPathExcluded(pathname: string): boolean {
    if (this.excludedPathPrefixes.length === 0) return false;
    const p = pathname.toLowerCase();
    for (const prefix of this.excludedPathPrefixes) {
      if (p.startsWith(prefix)) return true;
    }
    return false;
  }

  private startEngagement() {
    if (this.engagementTimer) return;
    this.engagementTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        this.engagementSeconds += 1;
      }
    }, 1000);
  }

  private stopEngagement() {
    if (this.engagementTimer) {
      clearInterval(this.engagementTimer);
      this.engagementTimer = null;
    }
  }

  private sendPageviewEnd() {
    if (this.pageviewEndSent || this.engagementSeconds < 1 || !this.lastPageviewPath) return;
    this.pageviewEndSent = true;

    const payload: BatchPayload = {
      p: this.projectId!,
      events: [{
        name: "$pageview_end",
        url: location.origin + this.lastPageviewPath,
        referrer: "",
        sessionId: this.sessionId!,
        anonymousId: this.anonymousId!,
        timestamp: new Date().toISOString(),
        platform: "web",
        properties: {
          engagement_seconds: String(this.engagementSeconds),
          max_scroll_pct: String(this.maxScrollPct),
        },
      }],
    };

    const url = `${this.endpoint}/e/batch`;
    const body = JSON.stringify(payload);
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(url, body);
    } else {
      fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  }

  private flush(useBeacon = false) {
    if (!this.projectId || this.queue.length === 0) return;

    const events = this.queue.splice(0, 100);
    this.log(`flush: ${events.length} event(s)${useBeacon ? " via beacon" : ""}`);
    const payload: BatchPayload = { p: this.projectId, events };
    const url = `${this.endpoint}/e/batch`;
    const body = JSON.stringify(payload);

    if (useBeacon && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(url, body);
    } else {
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }

    if (this.queue.length > 0) this.flush(useBeacon);
  }

  private newId(prefix: string): string {
    const rand = Math.random().toString(36).slice(2, 10);
    const ts = Date.now().toString(36);
    return `${prefix}_${ts}${rand}`;
  }
}

// ── Singleton ───────────────────────────────────────────────────────
const client = new BrowserClient();

/**
 * Initialize the browser SDK. Call once at app startup.
 * Starts auto-pageview tracking, session management, and batching.
 */
export function init<_E extends EventMap = AnyEvents>(
  projectId: string,
  opts?: InitOptions,
): void {
  client.init(projectId, opts);
}

/**
 * Track a custom event. Fire-and-forget; events are batched and sent every 5s.
 * If called before init(), events are buffered and flushed when init() runs.
 *
 * Event names starting with `$` are reserved for canonical SDK events
 * (revenue, page lifecycle, identity, errors, built-in extensions) and
 * will be rejected at the type level. The same check runs at runtime —
 * a $-prefixed name passed via `as any` or a JS caller drops the event
 * with a console.warn rather than throwing.
 */
export function track<
  E extends EventMap = AnyEvents,
  K extends keyof E & string = string,
>(
  name: K extends `$${string}` ? never : K,
  properties?: E[K] extends EventProperties ? E[K] : EventProperties,
): void {
  client.track(name, properties as EventProperties | undefined);
}

/**
 * Get the anonymous visitor ID (persisted in localStorage).
 * Pass this to your server so server-side events can be linked to the visitor.
 */
export function getAnonymousId(): string | null {
  return client.getAnonymousId();
}

/**
 * Bind subsequent events to a known user. Call when a visitor signs up or
 * signs in. Every event after this carries `userId`; the server links the
 * pre-signup `anonymousId` activity to the new `userId` at query time so
 * the full journey (from first marketing-page view to first paid event)
 * attributes to one identity.
 *
 *     clamp.identify('user_42abc', { email: 'jane@example.com', plan: 'pro' });
 *
 * `traits` are sent once with the `$identify` event for profile enrichment
 * — they don't ride along on every subsequent event.
 */
export function identify(userId: string, traits?: EventProperties): void {
  client.identify(userId, traits);
}

/**
 * Clear the bound user id and rotate the anonymous id, as if a brand-new
 * visitor just arrived. Call on logout so the next user on the same browser
 * is tracked independently. Flushes any queued events first so they remain
 * attributed to the previous user.
 */
export function reset(): void {
  client.reset();
}

/**
 * Get the currently bound user id (set by identify(), cleared by reset()).
 * Returns null when the visitor hasn't identified.
 */
export function getUserId(): string | null {
  return client.getUserId();
}

// Revenue types + validation are shared with the server SDK in
// `./revenue.ts` so the two surfaces can't drift on canonical events,
// mrr_delta inference, or warning text. Re-export the public surface so
// browser callers can still import everything from "@clamp-sh/analytics".
export type {
  BillingPeriod,
  CanonicalRevenueEvent,
  SubscriptionRevenueEvent,
  SubscriptionRevenueArgs,
  PurchaseRevenueArgs,
  RefundRevenueArgs,
  RevenueArgs,
} from "./revenue.js";
import type { RevenueArgs } from "./revenue.js";
import { prepareRevenue } from "./revenue.js";

/**
 * Record a revenue event with typed, reserved-property semantics that the
 * dashboard's revenue view depends on.
 *
 *     clamp.revenue({
 *       event: 'subscription_started',
 *       amount: 29.99,
 *       currency: 'USD',
 *       plan: 'pro',
 *       billing: 'monthly',
 *       subscriptionId: 'sub_abc123',
 *     });
 *
 * Under the hood this calls `track()` with a Money-typed `total` property +
 * the canonical revenue properties (`plan`, `billing_period`, `mrr_delta`,
 * `subscription_id`). The amount lands in the dedicated Decimal64 storage,
 * not floats — pennies don't get lost.
 *
 * Server-side webhook ingestion (Stripe → @clamp-sh/analytics/server) is
 * usually the source of truth for paid customers. Client-side
 * `revenue()` is for capturing the **attribution context** (utm, referrer,
 * landing page) at the moment of conversion — which channel actually drove
 * this customer.
 */
export function revenue(args: RevenueArgs): void {
  const prepared = prepareRevenue(args);
  if (!prepared) return;
  // prepared.event is already the $-prefixed wire name — route through
  // emitSystem so the reserved-prefix guard doesn't reject it.
  client.emitSystem(prepared.event, prepared.properties);
}

/**
 * Manually capture an error as a `$error` event. Works regardless of the
 * `captureErrors` init option (which only governs auto-capture of uncaught
 * exceptions and unhandled promise rejections).
 *
 *     try {
 *       riskyOperation()
 *     } catch (err) {
 *       captureError(err, { feature: "checkout", retry: 1 })
 *     }
 *
 * Pass extra context as a flat object of primitive values; nested objects
 * and arrays are dropped silently. Per-session rate limit applies: at most
 * 5 errors with the same message per session land on the wire, to prevent
 * runaway loops from burning through the event quota. Server-side
 * fingerprinting still groups across sessions for the dashboard view.
 *
 * The error-capture machinery lives in a separate chunk (subpath:
 * `@clamp-sh/analytics/errors`) lazy-loaded on first call, so users who
 * never call captureError pay zero bytes for it. Concurrent calls during
 * the chunk load are processed in arrival order via promise ordering.
 */
export function captureError(
  error: Error | unknown,
  context?: Record<string, EventPropertyValue> & { handled?: boolean },
): void {
  client.loadErrorsModule().then((mod) => {
    const trackFn = (name: string, properties: EventProperties) =>
      client.emitSystem(name, properties);
    mod.captureError(trackFn, error, context);
  });
}

export type {
  EventMap,
  AnyEvents,
  Money,
  CurrencyCode,
  EventPropertyValue,
  EventProperties,
  EventPayload,
  BatchPayload,
  SinglePayload,
} from "./types.js";

/* ── CDN auto-init ──────────────────────────────────────────────────
   When the SDK is loaded via <script src> with a data-clamp-project
   attribute, init automatically. Lets users on hosted platforms
   (Webflow, Shopify, WordPress, etc.) paste a single tag.

   Skipped if the consumer imported the ESM/CJS build directly and
   didn't set the attribute on the loading script. */
if (typeof document !== "undefined") {
  const currentScript = document.currentScript as HTMLScriptElement | null;
  const projectId = currentScript?.dataset.clampProject;
  if (projectId) {
    const extensions: Extensions = {};
    const extAttr = currentScript?.dataset.clampExtensions;
    if (extAttr) {
      for (const ext of extAttr.split(",").map((s) => s.trim())) {
        switch (ext) {
          case "outbound-links": extensions.outboundLinks = true; break;
          case "downloads": extensions.downloads = true; break;
          case "data-attributes": extensions.dataAttributes = true; break;
          case "section-views": extensions.sectionViews = true; break;
          case "web-vitals": extensions.webVitals = true; break;
          case "not-found": extensions.notFound = true; break;
        }
      }
    }
    init(projectId, { extensions });
  }
}

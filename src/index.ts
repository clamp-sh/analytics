import type { EventPayload, BatchPayload, EventMap, AnyEvents, EventProperties, EventPropertyValue } from "./types.js";
import type * as ErrorsModule from "./errors.js";

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

    this.log("Initialized", { projectId, endpoint: this.endpoint, sessionId: this.sessionId, anonymousId: this.anonymousId });

    // Flush pre-init buffer
    for (const e of this.preInitQueue) {
      this.track(e.name as any, e.props as any);
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

    // Start engagement counter
    this.startEngagement();

    // Install opt-in extensions. Each is a no-op unless enabled.
    this.installExtensions(opts?.extensions);

    // Opt-in auto-capture for uncaught errors and unhandled promise rejections.
    // The errors module is a separate subpath export (`@clamp-sh/analytics/errors`)
    // and is dynamically imported so the main bundle stays minimal for users
    // who don't opt in.
    if (opts?.captureErrors) {
      this.loadErrorsModule().then((mod) => {
        const trackFn = (name: string, properties: EventProperties) =>
          this.track(name as any, properties as any);
        mod.installErrorCapture(trackFn);
        this.log("error capture: installed window.onerror + unhandledrejection listeners");
      });
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
    const track = (name: string, props?: EventProperties) =>
      this.track(name as any, props as any);

    if (ext.outboundLinks) {
      import("./extensions/outbound-links.js")
        .then((mod) => {
          mod.installOutboundLinks(track);
          this.log("ext: outboundLinks installed");
        })
        .catch(() => this.log("ext: failed to load outbound-links chunk"));
    }
    if (ext.downloads) {
      const exts = typeof ext.downloads === "object" ? ext.downloads.extensions : undefined;
      import("./extensions/downloads.js")
        .then((mod) => {
          mod.installDownloads(track, exts);
          this.log("ext: downloads installed");
        })
        .catch(() => this.log("ext: failed to load downloads chunk"));
    }
    if (ext.notFound) {
      const pattern = typeof ext.notFound === "object" ? ext.notFound.pattern : undefined;
      import("./extensions/not-found.js")
        .then((mod) => {
          mod.install404(track, pattern);
          this.log("ext: 404 detection installed");
        })
        .catch(() => this.log("ext: failed to load not-found chunk"));
    }
    if (ext.dataAttributes) {
      import("./extensions/data-attributes.js")
        .then((mod) => {
          mod.installDataAttributes(track);
          this.log("ext: dataAttributes installed");
        })
        .catch(() => this.log("ext: failed to load data-attributes chunk"));
    }
    if (ext.webVitals) {
      const rate = typeof ext.webVitals === "object" ? ext.webVitals.sampleRate : 1;
      import("./extensions/web-vitals.js")
        .then((mod) => mod.installWebVitals(track, rate))
        .then(() => this.log(`ext: webVitals installed (sampleRate=${rate})`))
        .catch(() => this.log("ext: failed to load web-vitals chunk"));
    }
    if (ext.sectionViews) {
      const threshold = typeof ext.sectionViews === "object" ? ext.sectionViews.threshold : 0.4;
      import("./extensions/section-views.js")
        .then((mod) => {
          mod.installSectionViews(track, threshold);
          this.log(`ext: sectionViews installed (threshold=${threshold})`);
        })
        .catch(() => this.log("ext: failed to load section-views chunk"));
    }
  }

  track<K extends keyof E & string>(
    name: K,
    properties?: E[K] extends EventProperties ? E[K] : EventProperties,
  ) {
    if (!this.initialized) {
      this.preInitQueue.push({ name, props: properties as EventProperties });
      return;
    }

    const event: EventPayload = {
      name,
      url: location.href,
      referrer: document.referrer,
      sessionId: this.sessionId!,
      anonymousId: this.anonymousId!,
      timestamp: new Date().toISOString(),
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      language: navigator.language,
      platform: "web",
      properties: properties as EventProperties,
    };
    this.queue.push(event);
    this.log(`track: ${name}`, properties || {});
    if (this.queue.length >= BATCH_FLUSH_AT_LENGTH) this.flush();
  }

  getAnonymousId(): string | null {
    return this.anonymousId;
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
      this.pageviewEndSent = false;
      this.log(`pageview excluded by path: ${path}`);
      return;
    }

    this.lastPageviewPath = path;
    this.lastPageviewTime = now;
    this.engagementSeconds = 0;
    this.pageviewEndSent = false;

    this.track("pageview" as any);
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
        name: "pageview_end",
        url: location.origin + this.lastPageviewPath,
        referrer: "",
        sessionId: this.sessionId!,
        anonymousId: this.anonymousId!,
        timestamp: new Date().toISOString(),
        platform: "web",
        properties: { engagement_seconds: String(this.engagementSeconds) },
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
 */
export function track<E extends EventMap = AnyEvents, K extends keyof E & string = string>(
  name: K,
  properties?: E[K] extends EventProperties ? E[K] : EventProperties,
): void {
  (client as any).track(name, properties);
}

/**
 * Get the anonymous visitor ID (persisted in localStorage).
 * Pass this to your server so server-side events can be linked to the visitor.
 */
export function getAnonymousId(): string | null {
  return client.getAnonymousId();
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
      (client as any).track(name, properties);
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
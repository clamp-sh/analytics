import type { EventPayload, BatchPayload, EventMap, AnyEvents } from "./types.js";

// ── Default endpoint ────────────────────────────────────────────────
const DEFAULT_ENDPOINT = "https://api.clamp.sh";

// 30 minutes in ms — session rotates after this long hidden
const SESSION_IDLE_MS = 30 * 60 * 1000;

// ── Internal client ─────────────────────────────────────────────────
class BrowserClient<E extends EventMap = AnyEvents> {
  private projectId: string | null = null;
  private endpoint: string = DEFAULT_ENDPOINT;
  private sessionId: string | null = null;
  private anonymousId: string | null = null;
  private queue: EventPayload[] = [];
  private preInitQueue: Array<{ name: string; props?: Record<string, string> }> = [];
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

  private log(msg: string, data?: unknown) {
    if (!this.debug) return;
    if (data !== undefined) console.log(`[clamp] ${msg}`, data);
    else console.log(`[clamp] ${msg}`);
  }

  init(projectId: string, opts?: { endpoint?: string; debug?: boolean }) {
    if (typeof window === "undefined") return;

    if (opts?.debug) this.debug = true;

    // Skip tracking on localhost / dev environments
    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
      this.log("Skipping init on localhost");
      return;
    }

    this.projectId = projectId;
    if (opts?.endpoint) this.endpoint = opts.endpoint;
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
  }

  track<K extends keyof E & string>(
    name: K,
    properties?: E[K] extends Record<string, string> ? E[K] : Record<string, string>,
  ) {
    if (!this.initialized) {
      this.preInitQueue.push({ name, props: properties as Record<string, string> });
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
      properties: properties as Record<string, string>,
    };
    this.queue.push(event);
    this.log(`track: ${name}`, properties || {});
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

    // Finalize previous page engagement before recording new pageview
    if (this.lastPageviewPath !== null) {
      this.sendPageviewEnd();
    }

    this.lastPageviewPath = path;
    this.lastPageviewTime = now;
    this.engagementSeconds = 0;
    this.pageviewEndSent = false;

    this.track("pageview" as any);
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
  opts?: { endpoint?: string; debug?: boolean },
): void {
  client.init(projectId, opts);
}

/**
 * Track a custom event. Fire-and-forget; events are batched and sent every 5s.
 * If called before init(), events are buffered and flushed when init() runs.
 */
export function track<E extends EventMap = AnyEvents, K extends keyof E & string = string>(
  name: K,
  properties?: E[K] extends Record<string, string> ? E[K] : Record<string, string>,
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

export type { EventMap, AnyEvents } from "./types.js";

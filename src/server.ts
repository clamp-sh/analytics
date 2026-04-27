import type { ServerPayload, EventMap, AnyEvents, EventProperties } from "./types.js";

// ── Default endpoint ────────────────────────────────────────────────
const DEFAULT_ENDPOINT = "https://api.clamp.sh";

// ── Internal client ─────────────────────────────────────────────────
class ServerClient<E extends EventMap = AnyEvents> {
  private projectId: string | null = null;
  private apiKey: string | null = null;
  private endpoint: string = DEFAULT_ENDPOINT;
  private initialized = false;

  init(config: { projectId: string; apiKey: string; endpoint?: string }) {
    this.projectId = config.projectId;
    this.apiKey = config.apiKey;
    if (config.endpoint) this.endpoint = config.endpoint;
    this.initialized = true;
  }

  async track<K extends keyof E & string>(
    name: K,
    opts?: {
      anonymousId?: string;
      properties?: E[K] extends EventProperties ? E[K] : EventProperties;
      timestamp?: string;
    },
  ): Promise<{ ok: boolean }> {
    if (!this.initialized || !this.projectId || !this.apiKey) {
      throw new Error("@clamp-sh/analytics/server: call init() before track()");
    }

    const payload: ServerPayload = {
      p: this.projectId,
      name,
      anonymousId: opts?.anonymousId,
      properties: opts?.properties as EventProperties,
      timestamp: opts?.timestamp ?? new Date().toISOString(),
    };

    const res = await fetch(`${this.endpoint}/e/s`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-clamp-key": this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`@clamp-sh/analytics/server: ${res.status} ${body}`);
    }

    return { ok: true };
  }
}

// ── Singleton ───────────────────────────────────────────────────────
const client = new ServerClient();

/**
 * Initialize the server SDK. Call once at server startup.
 * Requires a project API key (found in project settings).
 */
export function init<_E extends EventMap = AnyEvents>(config: {
  projectId: string;
  apiKey: string;
  endpoint?: string;
}): void {
  client.init(config);
}

/**
 * Track a server-side event. Returns a promise that resolves when the event is sent.
 * Accepts an optional anonymousId to link to a browser visitor.
 */
export async function track<E extends EventMap = AnyEvents, K extends keyof E & string = string>(
  name: K,
  opts?: {
    anonymousId?: string;
    properties?: E[K] extends EventProperties ? E[K] : EventProperties;
    timestamp?: string;
  },
): Promise<{ ok: boolean }> {
  return (client as any).track(name, opts);
}

export type {
  EventMap,
  AnyEvents,
  Money,
  CurrencyCode,
  EventPropertyValue,
  EventProperties,
} from "./types.js";

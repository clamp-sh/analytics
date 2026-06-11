import type { ServerPayload, EventMap, AnyEvents, EventProperties } from "./types.js";
import type { RevenueArgs } from "./revenue.js";
import { prepareRevenue } from "./revenue.js";
import { isReservedWireName, RESERVED_NAME_ERROR } from "./wire-names.js";

// Public revenue types re-exported from "./revenue.js" so server callers
// can import everything from "@clamp-sh/analytics/server".
export type {
  BillingPeriod,
  CanonicalRevenueEvent,
  SubscriptionRevenueEvent,
  SubscriptionRevenueArgs,
  PurchaseRevenueArgs,
  RefundRevenueArgs,
  RevenueArgs,
} from "./revenue.js";

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
      userId?: string;
      properties?: E[K] extends EventProperties ? E[K] : EventProperties;
      timestamp?: string;
    },
  ): Promise<{ ok: boolean }> {
    // Reserve $-prefixed names for canonical revenue events + SDK-emitted
    // system events. Drop silently with a console.warn so a misconfigured
    // call doesn't blow up the request pipeline.
    if (typeof name === "string" && isReservedWireName(name)) {
      console.warn(`[clamp] ${RESERVED_NAME_ERROR} (got "${name}")`);
      return { ok: false };
    }
    return this.emit(name, opts);
  }

  /**
   * Internal emission path shared by the public `track()` and the
   * `emitSystem()` helper. Bypasses the reserved-prefix guard so the SDK
   * can emit its own $-prefixed canonical events (revenue, $error).
   */
  private async emit(
    name: string,
    opts?: {
      anonymousId?: string;
      userId?: string;
      properties?: EventProperties;
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
      userId: opts?.userId,
      properties: opts?.properties,
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

  /**
   * Emit a $-prefixed system event. Used by the server SDK's own
   * instrumentation (revenue, captureError) to bypass the reserved-prefix
   * guard that fires on the public `track()`.
   */
  emitSystem(
    name: string,
    opts?: {
      anonymousId?: string;
      userId?: string;
      properties?: EventProperties;
      timestamp?: string;
    },
  ): Promise<{ ok: boolean }> {
    return this.emit(name, opts);
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
 * Track a server-side event. Returns a promise that resolves when the event
 * lands. Pass `userId` when the user is already identified (Stripe webhook,
 * background job, server-rendered action) so the event joins the visitor's
 * browser activity automatically. For pre-identify visitors, pass
 * `anonymousId` instead — Clamp's identity-links table retroactively binds
 * the anon to a userId once `clamp.identify()` fires on the browser.
 */
export async function track<
  E extends EventMap = AnyEvents,
  K extends keyof E & string = string,
>(
  name: K extends `$${string}` ? never : K,
  opts?: {
    anonymousId?: string;
    userId?: string;
    properties?: E[K] extends EventProperties ? E[K] : EventProperties;
    timestamp?: string;
  },
): Promise<{ ok: boolean }> {
  return client.track(name, opts);
}

/**
 * Record a server-authoritative revenue event. The webhook handler is
 * usually the source of truth for paid subscriptions and purchases —
 * trust the gateway's confirmation, not whatever happened in the browser
 * after redirect.
 *
 *     await revenue({
 *       userId: customer.id,
 *       amount: 29,
 *       currency: "USD",
 *       plan: "pro",
 *       billing: "monthly",
 *       subscriptionId: sub.id,
 *     });
 *
 * The args type is a discriminated union — subscription events require
 * `plan`, purchases require `product`, refunds require an explicit `event`
 * name. See the browser `clamp.revenue()` for the full inference table
 * (mrr_delta, default event names, the canonical event allowlist). The
 * server helper shares the same validation + inference module so the two
 * surfaces can't drift.
 *
 * Identity: pass `userId` when you have it (most webhook flows do — the
 * gateway includes the customer id). Pass `anonymousId` when the user
 * hasn't logged in yet (a guest checkout where you stored
 * `getAnonymousId()` on the order at session-create time). Pass neither
 * for an unattributed cash event — the row still counts in totals but
 * won't join any visitor's funnel.
 */
export async function revenue(
  args: RevenueArgs & { userId?: string; anonymousId?: string; timestamp?: string },
): Promise<{ ok: boolean } | void> {
  const prepared = prepareRevenue(args);
  if (!prepared) return;
  // prepared.event is the $-prefixed wire name — route through emitSystem
  // so the reserved-prefix guard doesn't reject it.
  return client.emitSystem(prepared.event, {
    userId: args.userId,
    anonymousId: args.anonymousId,
    properties: prepared.properties,
    timestamp: args.timestamp,
  });
}

/**
 * Capture a server-side error or exception as a `$error` event. Convenience
 * wrapper that extracts message/type/stack from a JS Error and forwards to
 * track(). Server adds a stable fingerprint at ingest so the same bug groups
 * across occurrences.
 *
 *     try {
 *       await processWebhook(payload);
 *     } catch (err) {
 *       await captureError(err, { anonymousId, context: { webhook: "stripe" } });
 *     }
 */
export async function captureError(
  error: Error | unknown,
  opts?: {
    anonymousId?: string;
    userId?: string;
    context?: Record<string, string | number | boolean>;
    timestamp?: string;
  },
): Promise<{ ok: boolean }> {
  const err: Error =
    error instanceof Error ? error : new Error(String(error ?? "Unknown error"));

  const properties: Record<string, string | number | boolean> = {
    "error.message": (err.message ?? "Unknown error").slice(0, 1024),
    "error.type": (err.name ?? "Error").slice(0, 64),
    "error.stack": (err.stack ?? "").slice(0, 16384),
    "error.handled": true,
  };
  if (opts?.context) {
    for (const [k, v] of Object.entries(opts.context)) {
      if (k === "handled") continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        properties[k] = v;
      }
    }
  }

  // $error is a canonical system event — route through emitSystem so the
  // reserved-prefix guard on the public track() doesn't reject it.
  return client.emitSystem("$error", {
    anonymousId: opts?.anonymousId,
    userId: opts?.userId,
    properties: properties as EventProperties,
    timestamp: opts?.timestamp,
  });
}

export type {
  EventMap,
  AnyEvents,
  Money,
  CurrencyCode,
  EventPropertyValue,
  EventProperties,
} from "./types.js";

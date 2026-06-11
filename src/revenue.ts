/**
 * Shared revenue helper logic used by both the browser and server SDKs.
 *
 * Exports the canonical types (BillingPeriod, CanonicalRevenueEvent,
 * SubscriptionRevenueArgs / PurchaseRevenueArgs / RefundRevenueArgs,
 * RevenueArgs), the runtime guards (canonical-event check, plan/product
 * symmetry check), and `prepareRevenue()` — which validates an args
 * object, derives the event name + mrr_delta, and returns the canonical
 * properties to emit. Returns null when validation fails so the caller
 * can short-circuit.
 *
 * Keeping this in one place means the browser revenue() and server
 * revenue() can't drift on validation, inference, or warning text.
 */

import type { EventProperties } from "./types.js";
import { toRevenueWireName } from "./wire-names.js";

/** Billing cadence. */
export type BillingPeriod = "one_time" | "monthly" | "annual" | "weekly";

/** Subscription lifecycle event names. */
export type SubscriptionRevenueEvent =
  | "subscription_started"
  | "subscription_renewed"
  | "subscription_upgraded"
  | "subscription_downgraded"
  | "subscription_canceled"
  | "subscription_paused"
  | "subscription_resumed";

/** All canonical revenue event names. */
export type CanonicalRevenueEvent =
  | SubscriptionRevenueEvent
  | "purchase"
  | "refund_issued";

interface RevenueArgsCommon {
  amount: number;
  currency?: string;
  previousAmount?: number;
  mrrDelta?: number;
}

export interface SubscriptionRevenueArgs extends RevenueArgsCommon {
  event?: SubscriptionRevenueEvent;
  plan: string;
  product?: never;
  subscriptionId?: string;
  billing?: "monthly" | "annual" | "weekly";
}

export interface PurchaseRevenueArgs extends RevenueArgsCommon {
  event?: "purchase";
  product: string;
  plan?: never;
  subscriptionId?: never;
  billing?: "one_time";
}

export interface RefundRevenueArgs extends RevenueArgsCommon {
  event: "refund_issued";
  plan?: string;
  product?: string;
  subscriptionId?: string;
  billing?: BillingPeriod;
}

export type RevenueArgs =
  | SubscriptionRevenueArgs
  | PurchaseRevenueArgs
  | RefundRevenueArgs;

/** Mapping from common misspellings + close-but-not-canonical names to the
 *  canonical equivalent. The runtime warning uses this to suggest the
 *  right name. */
const REVENUE_EVENT_ALIASES: Record<string, CanonicalRevenueEvent> = {
  subscription_created: "subscription_started",
  subscription_completed: "subscription_started",
  subscription_renewal: "subscription_renewed",
  subscription_cancelled: "subscription_canceled",   // British spelling
  subscription_cancel: "subscription_canceled",
  subscription_ended: "subscription_canceled",
  subscription_upgrade: "subscription_upgraded",
  subscription_downgrade: "subscription_downgraded",
  checkout_completed: "purchase",
  order_completed: "purchase",
  payment_succeeded: "purchase",
  refund: "refund_issued",
  refunded: "refund_issued",
};

const CANONICAL_REVENUE_EVENTS = new Set<string>([
  "subscription_started",
  "subscription_renewed",
  "subscription_upgraded",
  "subscription_downgraded",
  "subscription_canceled",
  "subscription_paused",
  "subscription_resumed",
  "purchase",
  "refund_issued",
]);

const warnedEvents = new Set<string>();
const warnedMissing = new Set<string>();

function isCanonicalEvent(event: string): boolean {
  if (CANONICAL_REVENUE_EVENTS.has(event)) return true;
  if (warnedEvents.has(event)) return false;
  warnedEvents.add(event);
  const alias = REVENUE_EVENT_ALIASES[event];
  const tail = `For custom revenue-shaped events drop to track() with a Money property + mrr_delta numeric prop.`;
  if (alias) {
    console.warn(
      `[clamp] revenue() rejected non-canonical event "${event}". Did you mean "${alias}"? ${tail}`,
    );
  } else {
    const list: string[] = [];
    CANONICAL_REVENUE_EVENTS.forEach((v) => list.push(v));
    console.warn(
      `[clamp] revenue() rejected non-canonical event "${event}". Canonical names: ${list.join(", ")}. ${tail}`,
    );
  }
  return false;
}

function warnOnceMissingField(event: string, field: string, drives: string): void {
  const key = `${event}:${field}`;
  if (warnedMissing.has(key)) return;
  warnedMissing.add(key);
  console.warn(
    `[clamp] revenue() ${event} called without ${field}. ` +
      `${field} drives ${drives} on the Revenue tab; without it the breakdown collapses. ` +
      `Pass ${field}: "<your-${field}-name>".`,
  );
}

/**
 * Derive mrr_delta from event + billing + amount.
 *
 *   subscription_started   →  +amount (monthly) or +amount/12 (annual)
 *   subscription_renewed   →   0 — balance unchanged, just cash collected
 *   subscription_upgraded  →  new_mrr − previous_mrr (requires previousAmount)
 *   subscription_downgraded → same shape, negative diff
 *   subscription_canceled  →  −previousAmount (or −amount as shorthand)
 *   purchase / refund_issued →  0 — not recurring
 *   one_time billing       →   0 always
 */
function inferMrrDelta(
  event: CanonicalRevenueEvent,
  billing: BillingPeriod,
  amount: number,
  previousAmount: number | undefined,
): number {
  if (billing === "one_time") return 0;
  const toMonthly = (n: number): number =>
    billing === "annual" ? n / 12 : billing === "weekly" ? n * (52 / 12) : n;
  const monthly = toMonthly(amount);
  switch (event) {
    case "subscription_started":
    case "subscription_resumed":
      return monthly;
    case "subscription_renewed":
    case "purchase":
    case "refund_issued":
      return 0;
    case "subscription_canceled":
    case "subscription_paused": {
      const basis = previousAmount ?? amount;
      if (basis === 0) {
        console.warn(
          `[clamp] revenue() ${event} called with amount=0 and no previousAmount — mrr_delta will be 0. ` +
            `Pass previousAmount (the rate the customer was paying), or set mrrDelta explicitly.`,
        );
        return 0;
      }
      return -toMonthly(basis);
    }
    case "subscription_upgraded":
    case "subscription_downgraded":
      if (previousAmount == null) {
        console.warn(
          `[clamp] revenue() ${event} called without previousAmount — mrr_delta will be 0. ` +
            `Pass previousAmount (the prior price in the same billing cadence), or set mrrDelta explicitly.`,
        );
        return 0;
      }
      return monthly - toMonthly(previousAmount);
  }
}

/**
 * Validate revenue() args + derive the event name and canonical
 * properties. Returns null when validation fails (already warned to the
 * console). Used identically by the browser and server revenue()
 * helpers — keeping the validation in one place means the two surfaces
 * can't drift.
 */
export function prepareRevenue(
  args: RevenueArgs,
): { event: string; properties: EventProperties } | null {
  const amount = args.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    console.warn("[clamp] revenue() requires a finite numeric amount");
    return null;
  }
  const currency = (args.currency ?? "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    console.warn(
      `[clamp] revenue() currency must be a 3-letter ISO 4217 code (got "${args.currency}")`,
    );
    return null;
  }
  // Billing default keys off which dimension is set. plan → monthly
  // subscription, product → one-time purchase.
  const billing: BillingPeriod =
    args.billing ?? (("plan" in args && args.plan) ? "monthly" : "one_time");
  // Default event follows the billing model — one_time defaults to a
  // purchase, anything recurring defaults to subscription_started.
  const event =
    args.event ?? (billing === "one_time" ? "purchase" : "subscription_started");
  if (!isCanonicalEvent(event)) return null;

  const plan = "plan" in args ? args.plan : undefined;
  const product = "product" in args ? args.product : undefined;
  const subscriptionId = "subscriptionId" in args ? args.subscriptionId : undefined;
  if (event.startsWith("subscription_") && !plan) {
    warnOnceMissingField(event, "plan", "the Plans card");
    return null;
  }
  if (event === "purchase" && !product) {
    warnOnceMissingField(event, "product", "the Products card");
    return null;
  }

  const mrrDelta =
    args.mrrDelta !== undefined
      ? args.mrrDelta
      : inferMrrDelta(event as CanonicalRevenueEvent, billing, amount, args.previousAmount);

  const properties: EventProperties = {
    total: { amount, currency },
    billing_period: billing,
  };
  if (plan) properties.plan = plan;
  if (product) properties.product = product;
  if (subscriptionId) properties.subscription_id = subscriptionId;
  if (mrrDelta !== 0) properties.mrr_delta = mrrDelta;
  // Translate the canonical public name into its $-prefixed wire name so
  // downstream callers don't need to know about the reserved-prefix convention.
  const wireEvent = toRevenueWireName(event as CanonicalRevenueEvent);
  return { event: wireEvent, properties };
}

/**
 * Wire-level event naming convention for the Clamp SDK.
 *
 * Canonical events (revenue + system instrumentation) are $-prefixed on
 * the wire. User track() calls cannot emit $-prefixed names — this is
 * enforced at the type level (template literal type) and at runtime in
 * track().
 *
 * This module is the single source of truth for:
 *   - the reserved prefix
 *   - the full list of system event wire names the SDK can emit
 *   - the public-name → wire-name map for canonical revenue events
 *   - the helpers + error string used by the runtime guard in track()
 *
 * Browser and server SDKs both import from here so the two surfaces
 * can't drift on naming.
 */

import type { CanonicalRevenueEvent } from "./revenue.js";

/** Reserved prefix for system + canonical events on the wire. */
export const WIRE_PREFIX = "$";

/**
 * Every $-prefixed event the SDK can emit. Kept in sync with the
 * call-sites in index.ts, server.ts, errors.ts, and extensions/*.
 */
export const SYSTEM_EVENT_NAMES: readonly string[] = [
  // Page lifecycle
  "$pageview",
  "$pageview_end",
  // Identity + errors
  "$identify",
  "$error",
  // Built-in extensions
  "$web_vital",
  "$section_viewed",
  "$outbound_link",
  "$download",
  "$not_found",
  // Canonical revenue (mirrors CANONICAL_REVENUE_WIRE_NAMES below)
  "$subscription_started",
  "$subscription_renewed",
  "$subscription_upgraded",
  "$subscription_downgraded",
  "$subscription_canceled",
  "$subscription_paused",
  "$subscription_resumed",
  "$purchase",
  "$refund_issued",
] as const;

/**
 * Public revenue event name → wire name. The public name is what
 * developers pass to revenue({ event }); the wire name is what the SDK
 * actually sends to the ingest endpoint.
 */
export const CANONICAL_REVENUE_WIRE_NAMES: Record<CanonicalRevenueEvent, string> = {
  subscription_started: "$subscription_started",
  subscription_renewed: "$subscription_renewed",
  subscription_upgraded: "$subscription_upgraded",
  subscription_downgraded: "$subscription_downgraded",
  subscription_canceled: "$subscription_canceled",
  subscription_paused: "$subscription_paused",
  subscription_resumed: "$subscription_resumed",
  purchase: "$purchase",
  refund_issued: "$refund_issued",
};

/** Translate a public canonical revenue event name to its wire name. */
export function toRevenueWireName(publicName: CanonicalRevenueEvent): string {
  return CANONICAL_REVENUE_WIRE_NAMES[publicName];
}

/**
 * Whether a name is reserved (i.e. starts with the wire prefix). Used by
 * the runtime guard in track() to reject user-supplied $-prefixed names.
 */
export function isReservedWireName(name: string): boolean {
  return name.startsWith(WIRE_PREFIX);
}

/** Error string emitted when a user track() call uses a reserved name. */
export const RESERVED_NAME_ERROR =
  "Event names starting with $ are reserved for the Clamp SDK. Use revenue() for billing events or pick another name.";

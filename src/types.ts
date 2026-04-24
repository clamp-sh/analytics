/** ISO 4217 currency code (e.g. "USD", "EUR", "JPY"). Three uppercase letters on the wire. */
export type CurrencyCode = string;

/**
 * A typed monetary value attached to any event property. Send multiple per
 * event when a purchase has subtotal, tax, shipping, etc.
 *
 * ```ts
 * track("purchase", {
 *   plan:  "pro",
 *   total: { amount: 29.00, currency: "USD" },
 *   tax:   { amount: 4.35,  currency: "USD" },
 * });
 * ```
 */
export interface Money {
  amount: number;
  currency: CurrencyCode;
}

/** A single event property value. Either a plain string or a typed monetary value. */
export type EventPropertyValue = string | Money;

/** Property bag attached to a tracked event. Values are strings or `Money`. */
export type EventProperties = Record<string, EventPropertyValue>;

/** Event payload sent to the ingestion API. */
export interface EventPayload {
  name: string;
  url?: string;
  referrer?: string;
  sessionId?: string;
  anonymousId?: string;
  timestamp?: string;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
  platform?: "web" | "ios" | "android";
  properties?: EventProperties;
}

/** Batch payload for POST /e/batch */
export interface BatchPayload {
  p: string;
  events: EventPayload[];
}

/** Single event payload for POST /e */
export interface SinglePayload extends EventPayload {
  p: string;
}

/** Server event payload for POST /e/s */
export interface ServerPayload {
  p: string;
  name: string;
  anonymousId?: string;
  properties?: EventProperties;
  timestamp?: string;
}

/** Typed event map for generics. Keys = event names, values = property shapes. */
export type EventMap = Record<string, EventProperties | undefined>;

/** Default event map (no type checking on event names). */
export type AnyEvents = Record<string, EventProperties | undefined>;

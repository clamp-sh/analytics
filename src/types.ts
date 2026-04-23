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
  properties?: Record<string, string>;
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
  properties?: Record<string, string>;
  timestamp?: string;
}

/** Typed event map for generics. Keys = event names, values = property shapes. */
export type EventMap = Record<string, Record<string, string> | undefined>;

/** Default event map (no type checking on event names). */
export type AnyEvents = Record<string, Record<string, string> | undefined>;

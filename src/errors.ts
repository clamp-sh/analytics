/**
 * Error capture: opt-in via subpath import.
 *
 *   import { captureError, installErrorCapture } from "@clamp-sh/analytics/errors"
 *
 * Or trigger auto-capture via the main bundle's init option (which lazy-loads
 * this module so users who don't opt in pay no bytes):
 *
 *   init("proj_xxx", { captureErrors: true })
 *
 * The main bundle's top-level `captureError()` export is a thin wrapper that
 * lazy-loads this module on first call and replays any queued captures.
 */

import type { EventProperties, EventPropertyValue } from "./types.js";

/** Plain Error subclass used when reconstructing an Error from an ErrorEvent
 *  whose .error property was nulled out (cross-origin scripts) or from a
 *  promise rejection whose reason isn't an Error instance. Carries the same
 *  message/name/stack contract Error has so captureError() can treat it
 *  uniformly. */
class SyntheticError extends Error {
  constructor(message: string, type: string, stack: string) {
    super(message);
    this.name = type;
    this.stack = stack;
  }
}

/** Safe stringify for promise rejection reasons that aren't Errors or strings.
 *  JSON.stringify can throw on circular objects; fall back to a String()
 *  coercion. */
function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? "Unknown rejection";
  } catch {
    return String(v ?? "Unknown rejection");
  }
}

/** Track function shape — same as the main bundle's `track`, decoupled from
 *  the BrowserClient class so errors.ts has no circular import. */
export type TrackFn = (name: string, properties: EventProperties) => void;

// Per-session client-side rate limit on identical error messages. Resets via
// resetErrorRateLimit() (called by the main bundle on session rotation).
// Prevents a runaway loop from blowing through the event quota.
const errorMessageCounts: Map<string, number> = new Map();
const ERROR_MESSAGE_LIMIT = 5;

/** Clear the rate-limit state. Called by the main bundle when the session
 *  rotates so a new session gets a fresh budget for each unique error. */
export function resetErrorRateLimit(): void {
  errorMessageCounts.clear();
}

/** Capture an arbitrary error as a `$error` event.
 *
 *  The `handled` flag in context distinguishes manual captures (handled=true,
 *  default) from auto-captured uncaught exceptions / rejections (handled=false).
 *  Other context keys must be primitive (string/number/boolean); nested
 *  objects and arrays are dropped silently to match the wire shape. */
export function captureError(
  track: TrackFn,
  error: Error | unknown,
  context?: { handled?: boolean } & Record<string, EventPropertyValue>,
): void {
  const err: Error = error instanceof Error ? error : new Error(String(error ?? "Unknown error"));

  const message = (err.message ?? "Unknown error").slice(0, 1024);
  const type = (err.name ?? "Error").slice(0, 64);
  const stack = (err.stack ?? "").slice(0, 16384);
  const handled = context?.handled !== false;

  const count = errorMessageCounts.get(message) ?? 0;
  if (count >= ERROR_MESSAGE_LIMIT) return;
  errorMessageCounts.set(message, count + 1);

  const properties: EventProperties = {
    "error.message": message,
    "error.type": type,
    "error.stack": stack,
    "error.handled": handled,
  };
  if (context) {
    for (const [k, v] of Object.entries(context)) {
      if (k === "handled") continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        properties[k] = v;
      }
    }
  }

  track("$error", properties);
}

/** Install window-level listeners for uncaught errors and unhandled promise
 *  rejections. Each fires `captureError()` with handled=false. Returns an
 *  unsubscribe function for tests / hot-reload scenarios. */
export function installErrorCapture(track: TrackFn): () => void {
  const onError = (e: ErrorEvent) => {
    // ErrorEvent.error may be null for cross-origin scripts (CORS-blocked);
    // synthesize from message + filename so we still get something useful.
    const real = e.error instanceof Error ? e.error : null;
    const message = real?.message ?? e.message ?? "Unknown error";
    const stack =
      real?.stack ?? `at ${e.filename ?? "<anonymous>"}:${e.lineno ?? 0}:${e.colno ?? 0}`;
    const type = real?.name ?? "Error";
    captureError(track, new SyntheticError(message, type, stack), { handled: false });
  };

  const onRejection = (e: PromiseRejectionEvent) => {
    const reason: unknown = e.reason;
    const real = reason instanceof Error ? reason : null;
    const message =
      real?.message ?? (typeof reason === "string" ? reason : safeStringify(reason));
    const stack = real?.stack ?? "";
    const type = real?.name ?? "UnhandledRejection";
    captureError(track, new SyntheticError(message, type, stack), { handled: false });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

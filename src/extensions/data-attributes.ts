/**
 * HTML data-attribute click tracking. Opt-in via the main bundle:
 *
 *   init("proj_xxx", { extensions: { dataAttributes: true } })
 *
 * Or import directly for advanced use:
 *
 *   import { installDataAttributes } from "@clamp-sh/analytics/extensions/data-attributes"
 */

import type { EventProperties, Money, TrackFn } from "../types.js";

// Matches "29.00 USD", "1234 EUR", case-insensitive on the code.
const MONEY_ATTR_RE = /^\s*(-?\d+(?:\.\d+)?)\s+([A-Za-z]{3})\s*$/;

function parseMoneyAttr(value: string): Money | null {
  const m = value.match(MONEY_ATTR_RE);
  if (!m) return null;
  const amount = parseFloat(m[1]);
  if (!Number.isFinite(amount)) return null;
  return { amount, currency: m[2].toUpperCase() };
}

/**
 * Auto-tracks clicks on elements with `data-clamp-event="name"`.
 * Any `data-clamp-*` attributes become properties (e.g. `data-clamp-plan="pro"`
 * becomes `{ plan: "pro" }`).
 *
 * Money values are supported via `data-clamp-money-<key>="<amount> <currency>"`.
 * Example: `data-clamp-money-total="29.00 USD"` becomes
 * `{ total: { amount: 29, currency: "USD" } }`. Malformed money values
 * are silently skipped.
 */
export function installDataAttributes(track: TrackFn): () => void {
  const handler = (e: MouseEvent) => {
    const el = (e.target as HTMLElement | null)?.closest?.("[data-clamp-event]");
    if (!el) return;

    const name = el.getAttribute("data-clamp-event");
    if (!name) return;

    const props: EventProperties = {};
    for (const attr of el.attributes) {
      if (!attr.name.startsWith("data-clamp-")) continue;
      if (attr.name === "data-clamp-event") continue;
      const key = attr.name.slice("data-clamp-".length).replace(/-/g, "_");

      // Money shorthand: data-clamp-money-<key>="<amount> <currency>"
      if (key.startsWith("money_")) {
        const moneyKey = key.slice("money_".length);
        const parsed = parseMoneyAttr(attr.value);
        if (parsed && moneyKey) props[moneyKey] = parsed;
        continue;
      }

      props[key] = attr.value;
    }

    track(name, props);
  };

  document.addEventListener("click", handler, { capture: true });
  return () => document.removeEventListener("click", handler, { capture: true });
}

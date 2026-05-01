/**
 * Outbound-link click tracking. Opt-in via the main bundle:
 *
 *   init("proj_xxx", { extensions: { outboundLinks: true } })
 *
 * Or import directly for advanced use:
 *
 *   import { installOutboundLinks } from "@clamp-sh/analytics/extensions/outbound-links"
 */

import type { TrackFn } from "../types.js";

/**
 * Auto-tracks clicks on anchors that point to a different hostname.
 * Fires `outbound_click` with `url`, `host`, and `pathname` properties.
 */
export function installOutboundLinks(track: TrackFn): () => void {
  const handler = (e: MouseEvent) => {
    const a = (e.target as HTMLElement | null)?.closest?.("a");
    if (!a) return;

    const href = a.getAttribute("href");
    if (!href) return;

    try {
      const url = new URL(href, location.href);
      if (url.hostname === location.hostname) return;
      if (!/^https?:$/.test(url.protocol)) return; // skip mailto:, tel:, javascript:

      track("outbound_click", {
        url: url.href,
        host: url.hostname,
        pathname: url.pathname,
      });
    } catch {
      // malformed URL, skip
    }
  };

  document.addEventListener("click", handler, { capture: true });
  return () => document.removeEventListener("click", handler, { capture: true });
}

/**
 * Section-view tracking. Opt-in via the main bundle:
 *
 *   init("proj_xxx", { extensions: { sectionViews: true } })
 *   // or with a custom intersection threshold:
 *   init("proj_xxx", { extensions: { sectionViews: { threshold: 0.6 } } })
 *
 * Or import directly for advanced use:
 *
 *   import { installSectionViews } from "@clamp-sh/analytics/extensions/section-views"
 */

import type { TrackFn } from "../types.js";

/**
 * Auto-fires a `section_viewed` event the first time an element with
 * `data-clamp-section="<name>"` becomes visible in the viewport. Fires
 * once per session per section name (subsequent intersections are
 * ignored). Watches for sections added later via SPA navigation.
 *
 * Useful for measuring which sections of a long page actually get seen,
 * vs. which sit below the fold for most visitors.
 */
export function installSectionViews(track: TrackFn, threshold = 0.4): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {};

  const seen = new Set<string>();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const name = (entry.target as HTMLElement).getAttribute("data-clamp-section");
        if (!name || seen.has(name)) continue;
        seen.add(name);
        track("section_viewed", { section: name, pathname: location.pathname });
        observer.unobserve(entry.target);
      }
    },
    { threshold },
  );

  // Observe sections present at install time.
  document.querySelectorAll("[data-clamp-section]").forEach((el) => observer.observe(el));

  // Watch for sections added later (SPA navigations, lazy-mounted content).
  const mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches?.("[data-clamp-section]")) observer.observe(node);
        node.querySelectorAll?.("[data-clamp-section]").forEach((el) => observer.observe(el));
      });
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    mutationObserver.disconnect();
  };
}

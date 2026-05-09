/**
 * 404-page detection. Opt-in via the main bundle:
 *
 *   init("proj_xxx", { extensions: { notFound: true } })
 *   // or with a custom title pattern:
 *   init("proj_xxx", { extensions: { notFound: { pattern: /^404|missing/i } } })
 *
 * Or import directly for advanced use:
 *
 *   import { install404 } from "@clamp-sh/analytics/extensions/not-found"
 */

import type { TrackFn } from "../types.js";

const DEFAULT_NOT_FOUND_PATTERN = /^(404|page not found|not found)/i;

/**
 * Detects likely 404 pages by matching document.title against a pattern.
 * When matched, sends a second pageview-like event with `name: "404"`
 * so it surfaces in a separate bucket without inflating pageview counts.
 */
export function install404(track: TrackFn, pattern?: RegExp): () => void {
  const re = pattern ?? DEFAULT_NOT_FOUND_PATTERN;

  const check = () => {
    if (re.test(document.title)) {
      track("404", {
        pathname: location.pathname,
        title: document.title.slice(0, 200),
      });
    }
  };

  // Run on initial load and after SPA navigations. We piggyback on a
  // short delay so frameworks have time to update the title.
  const scheduled = () => setTimeout(check, 150);
  scheduled();

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args) => {
    origPush(...args);
    scheduled();
  };
  history.replaceState = (...args) => {
    origReplace(...args);
    scheduled();
  };
  window.addEventListener("popstate", scheduled);

  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener("popstate", scheduled);
  };
}

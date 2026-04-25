# @clamp-sh/analytics

## 0.8.0

### Minor Changes

- [`a67686f`](https://github.com/clamp-sh/clamp/commit/a67686f08e1dd738ff83e4d1f4976815f9857873) Thanks [@sbj-o](https://github.com/sbj-o)! - Add `sectionViews` extension that fires a `section_viewed` event the first time an element with `data-clamp-section="<name>"` becomes visible in the viewport. Fires once per session per section. Useful for measuring which sections of a long page actually get seen by visitors, vs. which sit below the fold. Configurable visibility threshold (defaults to 0.4 — 40% of the section in view).

## 0.7.0

### Minor Changes

- [`92102ba`](https://github.com/clamp-sh/clamp/commit/92102ba2721bcf4f84b0ac4f0bb1d39cd5a20c0e) Thanks [@sbj-o](https://github.com/sbj-o)! - Add `excludePaths` option to `init()` and `<Analytics>` for skipping auto-pageviews on specified pathname prefixes. Matches are case-insensitive and apply to both initial load and SPA navigations. Explicit `track()` calls are unaffected. Useful for signed-in product surfaces (e.g. `/dashboard`, `/admin`) whose pageviews would otherwise pollute a marketing funnel.

## 0.6.1

### Patch Changes

- [`9c06f3b`](https://github.com/clamp-sh/clamp/commit/9c06f3b30cd38d19085d883ac7367f26e5f47363) Thanks [@sbj-o](https://github.com/sbj-o)! - Loud console warning when `init()` is called with a missing or malformed project id. Tracking is now refused instead of silently sending every beacon to `/e/batch` and getting a 400 back. Common cause: an env var like `NEXT_PUBLIC_CLAMP_PROJECT_ID` being unset at build time.

## 0.6.0

### Minor Changes

- [`c460054`](https://github.com/clamp-sh/clamp/commit/c460054aab73cc82d8d786435142d41e2a0bf767) Thanks [@sbj-o](https://github.com/sbj-o)! - Revenue tracking and session-level analytics.

  **SDK** — Event properties now accept a `Money` value (`{ amount, currency }`). Attach revenue to any event and query it by source, country, campaign, or device. Public type aliases `Money`, `CurrencyCode`, `EventPropertyValue`, `EventProperties` are exported for typed event maps. The `dataAttributes` extension recognises `data-clamp-money-<key>="29.00 USD"` for markup-driven revenue tracking.

  **MCP** — Three new tools: `revenue.sum` (revenue split by currency, optionally grouped by any traffic dimension), `sessions.paths` (aggregate entry → exit paths with pages and duration per session), and `pages.engagement` (per-page engagement seconds and bounce rate). Tool descriptions tightened to eliminate overlap between `traffic.breakdown` and the specialized breakdown tools.

## 0.5.0

### Minor Changes

- [`6dde3c9`](https://github.com/clamp-sh/clamp/commit/6dde3c99a72983c84ea65e48a8a65de5c1f4b11f) Thanks [@sbj-o](https://github.com/sbj-o)! - Added five opt-in auto-tracking extensions: `outboundLinks`, `downloads`, `notFound`, `dataAttributes`, and `webVitals`. Enable any combination via `init("proj_xxx", { extensions: { ... } })`. Each extension is lazy-loaded in its own chunk so the base bundle stays small. `webVitals` uses the official `web-vitals` library as an optional peer dependency.

## 0.4.0

### Minor Changes

- [`cd62eef`](https://github.com/clamp-sh/clamp/commit/cd62eef4af225ea8ad72ac1f2be1ef01b3dc2725) Thanks [@sbj-o](https://github.com/sbj-o)! - Added `debug` option to `init()` and the `<Analytics>` component. When enabled, logs every tracked event, pageview, flush, and session rotation to the browser console.

## 0.3.1

### Patch Changes

- [`5fae53b`](https://github.com/clamp-sh/clamp/commit/5fae53bf27792cef8d971c2600907cbf9a14f8c2) Thanks [@sbj-o](https://github.com/sbj-o)! - Skip tracking on localhost, 127.0.0.1, and [::1] to avoid polluting production data with development traffic.

## 0.3.0

### Minor Changes

- [`cac4ec3`](https://github.com/clamp-sh/clamp/commit/cac4ec30cbfa7ffbf28454a4364fca7a741c92d2) Thanks [@sbj-o](https://github.com/sbj-o)! - Engagement tracking, session rotation, pageview dedup, and bfcache support.

  - SDK sends a `pageview_end` event via `sendBeacon` when a page is left, carrying `engagement_seconds` (time the tab was visible). The API uses this for accurate average session duration. `pageview_end` events are excluded from your monthly event quota.
  - Sessions rotate after 30 minutes of the tab being hidden, matching industry-standard idle timeout.
  - Duplicate pageview fires within 500ms on the same path are suppressed, fixing double-counts from Next.js pushState+replaceState and React Strict Mode.
  - Restoring a page from the browser back-forward cache (bfcache) now correctly counts as a new pageview.

## 0.2.0

### Minor Changes

- [`e11896c`](https://github.com/clamp-sh/clamp/commit/e11896c80441e0394501e8d20ba5b5146e5ec60d) Thanks [@sbj-o](https://github.com/sbj-o)! - Add IIFE bundle at `dist/cdn.global.js` for CDN/script-tag usage. Load via `<script src="https://cdn.jsdelivr.net/npm/@clamp-sh/analytics@0.2.0/dist/cdn.global.js"></script>` and call `clamp.init("proj_xxx")`.

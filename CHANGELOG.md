# @clamp-sh/analytics

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

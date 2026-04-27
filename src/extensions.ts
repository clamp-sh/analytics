/**
 * Optional SDK extensions. Each extension is opt-in via
 * `init("proj_xxx", { extensions: { ... } })` and tree-shakeable.
 *
 * Extensions that could add meaningful bundle weight (web-vitals) are
 * dynamic-imported so they only land in the bundle when enabled.
 */

import type { EventProperties, Money } from "./types.js";

type TrackFn = (name: string, properties?: EventProperties) => void;

// Matches "29.00 USD", "1234 EUR", case-insensitive on the code.
const MONEY_ATTR_RE = /^\s*(-?\d+(?:\.\d+)?)\s+([A-Za-z]{3})\s*$/;

function parseMoneyAttr(value: string): Money | null {
  const m = value.match(MONEY_ATTR_RE);
  if (!m) return null;
  const amount = parseFloat(m[1]);
  if (!Number.isFinite(amount)) return null;
  return { amount, currency: m[2].toUpperCase() };
}

// ── Outbound links ──────────────────────────────────────────────────

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

// ── File downloads ──────────────────────────────────────────────────

const DEFAULT_DOWNLOAD_EXTENSIONS = [
  "pdf", "zip", "dmg", "exe", "msi", "apk", "ipa",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv",
  "mp3", "mp4", "wav", "mov", "avi",
  "jpg", "jpeg", "png", "gif", "svg", "webp",
  "tar", "gz", "rar", "7z",
];

/**
 * Auto-tracks clicks on links that point to known downloadable files.
 * Fires `download` with `url`, `filename`, and `extension`.
 */
export function installDownloads(track: TrackFn, extensions?: string[]): () => void {
  const exts = new Set((extensions ?? DEFAULT_DOWNLOAD_EXTENSIONS).map((e) => e.toLowerCase().replace(/^\./, "")));

  const handler = (e: MouseEvent) => {
    const a = (e.target as HTMLElement | null)?.closest?.("a");
    if (!a) return;

    const href = a.getAttribute("href");
    if (!href) return;

    try {
      const url = new URL(href, location.href);
      const match = url.pathname.match(/\.([a-z0-9]+)$/i);
      if (!match) return;

      const ext = match[1].toLowerCase();
      if (!exts.has(ext)) return;

      const filename = url.pathname.split("/").pop() ?? "";

      track("download", {
        url: url.href,
        filename,
        extension: ext,
      });
    } catch {
      // malformed URL, skip
    }
  };

  document.addEventListener("click", handler, { capture: true });
  return () => document.removeEventListener("click", handler, { capture: true });
}

// ── 404 detection ───────────────────────────────────────────────────

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

// ── Data-attribute tracking ─────────────────────────────────────────

/**
 * Auto-tracks clicks on elements with `data-clamp-event="name"`.
 * Any `data-clamp-*` attributes become properties (e.g. `data-clamp-plan="pro"`
 * becomes `{ plan: "pro" }`).
 *
 * Money values are supported via `data-clamp-money-<key>="<amount> <currency>"`.
 * Example: `data-clamp-money-total="29.00 USD"` becomes
 * `{ total: { amount: 29, currency: "USD" } }`. Malformed money values
 * are silently skipped.
 *
 * Requires a Pro plan since it emits custom events.
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

// ── Section views ──────────────────────────────────────────────────

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

// ── Web Vitals (lazy-loaded) ────────────────────────────────────────

/**
 * Captures Core Web Vitals (LCP, CLS, INP, FCP, TTFB) via the web-vitals
 * library. Dynamic-imported so it only lands in the bundle when enabled.
 *
 * Sampled at 100% by default to ensure small sites get signal. Sites with
 * heavy traffic can lower `sampleRate` (0 to 1).
 */
export async function installWebVitals(
  track: TrackFn,
  sampleRate = 1,
): Promise<void> {
  if (Math.random() > sampleRate) return;

  try {
    // @ts-expect-error — optional peer dependency, resolved at runtime
    const wv = await import("web-vitals");

    const send = (metric: { name: string; value: number; rating: string; id: string }) => {
      track("web_vital", {
        metric: metric.name,
        value: String(Math.round(metric.value * 100) / 100),
        rating: metric.rating,
        id: metric.id,
        pathname: location.pathname,
      });
    };

    wv.onLCP?.(send);
    wv.onCLS?.(send);
    wv.onINP?.(send);
    wv.onFCP?.(send);
    wv.onTTFB?.(send);
  } catch {
    // web-vitals not installed, silently skip. Users opted in but didn't
    // add the peer dep. Log in debug mode would be nice but track() is
    // the only handle we have here.
  }
}

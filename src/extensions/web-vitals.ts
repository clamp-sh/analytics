/**
 * Core Web Vitals capture. Opt-in via the main bundle:
 *
 *   init("proj_xxx", { extensions: { webVitals: true } })
 *   // or with a sample rate:
 *   init("proj_xxx", { extensions: { webVitals: { sampleRate: 0.1 } } })
 *
 * Or import directly for advanced use:
 *
 *   import { installWebVitals } from "@clamp-sh/analytics/extensions/web-vitals"
 *
 * Requires `web-vitals` as a peer dependency.
 */

import type { TrackFn } from "../types.js";

/**
 * Captures Core Web Vitals (LCP, CLS, INP, FCP, TTFB) via the web-vitals
 * library. The library itself is dynamic-imported so projects that opt in
 * but haven't installed it silently skip rather than break the bundle.
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
    // add the peer dep.
  }
}

/**
 * File-download click tracking. Opt-in via the main bundle:
 *
 *   init("proj_xxx", { extensions: { downloads: true } })
 *   // or with a custom extension list:
 *   init("proj_xxx", { extensions: { downloads: { extensions: ["pdf", "zip"] } } })
 *
 * Or import directly for advanced use:
 *
 *   import { installDownloads } from "@clamp-sh/analytics/extensions/downloads"
 */

import type { TrackFn } from "../types.js";

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

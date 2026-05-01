"use client";

import { useEffect, useRef } from "react";
import { init, type Extensions } from "./index.js";

export interface AnalyticsProps {
  projectId: string;
  endpoint?: string;
  debug?: boolean;
  extensions?: Extensions;
  /** Pathname prefixes to skip auto-pageview tracking on. See `InitOptions.excludePaths`. */
  excludePaths?: string[];
}

/**
 * Drop-in React component. Add to your root layout to start tracking.
 * Calls init() in useEffect, renders nothing.
 *
 * ```tsx
 * import { Analytics } from "@clamp-sh/analytics/react"
 *
 * <Analytics
 *   projectId="proj_xxx"
 *   extensions={{ outboundLinks: true, downloads: true, webVitals: true }}
 * />
 * ```
 */
export function Analytics({ projectId, endpoint, debug, extensions, excludePaths }: AnalyticsProps) {
  // Stash the latest extensions in a ref so changes don't re-trigger init.
  // The component should mount once per app, so re-init on prop change for
  // primitives only.
  const extRef = useRef(extensions);
  extRef.current = extensions;
  const excludeRef = useRef(excludePaths);
  excludeRef.current = excludePaths;

  useEffect(() => {
    init(projectId, {
      endpoint,
      debug,
      extensions: extRef.current,
      excludePaths: excludeRef.current,
    });
  }, [projectId, endpoint, debug]);

  return null;
}

"use client";

import { useEffect } from "react";
import { init } from "./index.js";

export interface AnalyticsProps {
  projectId: string;
  endpoint?: string;
  debug?: boolean;
}

/**
 * Drop-in React component. Add to your root layout to start tracking.
 * Calls init() in useEffect, renders nothing.
 *
 * ```tsx
 * import { Analytics } from "@clamp-sh/analytics/react"
 * <Analytics projectId="proj_xxx" />
 * ```
 */
export function Analytics({ projectId, endpoint, debug }: AnalyticsProps) {
  useEffect(() => {
    init(projectId, { endpoint, debug });
  }, [projectId, endpoint, debug]);

  return null;
}

/**
 * Route code → display name helper (member app).
 *
 * Phase 100: labels switched from English to Spanish. The dictionary moved to
 * `src/constants/route-labels.ts` to match the SPEC-mandated location and to
 * support the new `games` entry. This file remains as a thin re-export so the
 * ~9 existing `getRouteName()` call sites continue working.
 */
import { ROUTE_LABELS, getRouteLabel } from 'src/constants/route-labels'

/** @deprecated Use ROUTE_LABELS from 'src/constants/route-labels' directly. */
export const ROUTE_NAMES = ROUTE_LABELS

/**
 * Get the Spanish display label for a route code. Kept for backward compatibility
 * with the pre-Phase-100 `getRouteName` API. New code should call `getRouteLabel`
 * from 'src/constants/route-labels' directly.
 */
export function getRouteName(code: string): string {
  return getRouteLabel(code)
}

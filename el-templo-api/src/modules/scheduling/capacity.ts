/**
 * Effective per-slot capacity resolution (Phase 155, D-06/D-07, HOR-03).
 *
 * Single source of truth for "the cap of a slot = activity cap ?? branch cap".
 * Previously this rule was duplicated across BookingService (reserve/waitlist),
 * SchedulingService.getSlotDetail and getWeeklyGrid (WR-02) — a drift risk if
 * the rule ever changes (e.g. min(activity, branch) or an aggregate ceiling,
 * both listed as future phases). Callers now share this helper:
 *
 * - `resolveEffectiveCapacity(activityCap, branchCap)` — pure resolution, used
 *   by batched paths (weekly grid) that already have both caps in hand.
 * - `getEffectiveCapacity(db, branchId, activityId)` — query + resolve, used by
 *   single-slot paths (booking checks, slot detail).
 *
 * The check stays PER SLOT: each simultaneous class has its own cap; the branch
 * cap is a per-class default, not a building ceiling.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";

/**
 * Final defensive fallback when neither the activity nor the branch yields a
 * cap. `branches.maxCapacity` is NOT NULL (default 22), so this only guards
 * against a missing branch row.
 */
export const DEFAULT_SLOT_CAPACITY = 22;

/** Pure resolution: activity cap wins, else branch cap, else the default. */
export function resolveEffectiveCapacity(
  activityCapacity: number | null | undefined,
  branchCapacity: number | null | undefined,
): number {
  return activityCapacity ?? branchCapacity ?? DEFAULT_SLOT_CAPACITY;
}

/**
 * Query the effective per-slot capacity for a (branch, activity) pair.
 * NULL on the activity inherits the branch cap.
 */
export async function getEffectiveCapacity(
  db: MySql2Database<typeof schema>,
  branchId: number,
  activityId: number,
): Promise<number> {
  const [row] = await db
    .select({
      branchCapacity: schema.branches.maxCapacity,
      activityCapacity: schema.activities.maxCapacity,
    })
    .from(schema.branches)
    .leftJoin(schema.activities, eq(schema.activities.id, activityId))
    .where(eq(schema.branches.id, branchId));

  return resolveEffectiveCapacity(row?.activityCapacity, row?.branchCapacity);
}

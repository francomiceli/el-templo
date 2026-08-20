/**
 * Tecnica Session Generator
 *
 * Phase 159 (SEM-02/SEM-04, D-08/D-09/D-10/D-11): generates "dia de tecnica"
 * sessions with 5 blocks: INITIUM (warmup), TECNICA_I, TECNICA_II (both on
 * the SAME route, D-08), TECNICA_II_ALT (phase 178 — alternative variant of
 * TECNICA_II, same pool/format, distinct route/exercises via a
 * role-inclusive hash), STRETCHING (shared mobility close, identical to
 * combos-generator's STRETCHING block).
 *
 * Reuses `assembleFixedStructureSession` (the shared trunk defined in
 * combos-generator.ts, Task 1) — the only difference vs. combos is how the
 * role/alt blocks resolve their route (ONE shared route for TECNICA_I/II
 * instead of two separate pools) and which format gets forced (a
 * quality/skill format instead of 'Combos').
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type { DaySession, ExerciseLevel, LevelGroup, FormatInstance } from "./types";
import {
  resolveRoutePool,
  resolveDistinctRoutePool,
} from "./pipeline/semana-nueva-pipeline";
import { queryFormatByName } from "./fallback/format-fallback";
import { GOAL_PLAN_ROUTE_MAP } from "../goal-plans/constants";
import { assembleFixedStructureSession } from "./combos-generator";

/**
 * Route pool for TECNICA_I/TECNICA_II.
 *
 * There is no curated "skill routes" list in the repo distinct from the
 * goal-plans route map (research Hallazgo 5/D-P6 Pattern 2), so — per the
 * plan's documented fallback — this uses the UNION of tren_superior +
 * tren_inferior (deduped): technique days can land on any strength route,
 * unlike combos which splits superior/inferior across its two blocks.
 * Editable by the coach after generation (D-08).
 */
export const TECNICA_ROUTE_POOL: readonly string[] = [
  ...new Set([
    ...GOAL_PLAN_ROUTE_MAP.tren_superior,
    ...GOAL_PLAN_ROUTE_MAP.tren_inferior,
  ]),
];

/** D-09: default quality/skill format for TECNICA_I/II, editable by the coach. */
const TECNICA_DEFAULT_FORMAT_NAME = "For Quality";

/**
 * Generate a complete Tecnica session for a given week, day, and member
 * level (D-10: one call per level; the caller loops over the 6 levels).
 *
 * @param db - Database connection
 * @param week - Week number
 * @param day - Day name (e.g., 'jueves')
 * @param levelGroup - Aggregated level group (alfa_delta | sigma | omega)
 * @param memberLevel - Member's individual level (all 6 supported, D-10)
 * @returns Complete DaySession with sessionMode='tecnica'
 */
export async function generateTecnicaSession(
  db: MySql2Database<typeof schema>,
  week: number,
  day: string,
  levelGroup: LevelGroup,
  memberLevel: ExerciseLevel,
): Promise<DaySession> {
  const qualityFormat = await queryFormatByName(db, TECNICA_DEFAULT_FORMAT_NAME);
  if (!qualityFormat) {
    throw new Error(
      `Format '${TECNICA_DEFAULT_FORMAT_NAME}' not found in formats table`,
    );
  }
  const forcedFormat: FormatInstance = {
    formatId: qualityFormat.formatId,
    name: qualityFormat.name,
  };

  // D-08: hashInput EXCLUDES the role so TECNICA_I and TECNICA_II resolve to
  // the SAME route (unlike combos, which includes the role to land on
  // different pools/indices).
  const sharedRoute = resolveRoutePool(TECNICA_ROUTE_POOL, `${week}-${day}`);

  // Phase 178 (T-178-03): TECNICA_II_ALT is the ONE exception that DOES
  // include the role in its hashInput — the opposite of I/II above — so it
  // lands on a different route than `sharedRoute` (and therefore different
  // exercises). `resolveDistinctRoutePool` shifts to the next pool index on
  // the rare hash collision.
  const sharedRouteAlt = resolveDistinctRoutePool(
    TECNICA_ROUTE_POOL,
    `${week}-${day}-TECNICA_II_ALT`,
    sharedRoute,
  );

  return assembleFixedStructureSession(
    db,
    week,
    day,
    levelGroup,
    memberLevel,
    "tecnica",
    [
      { role: "TECNICA_I", route: sharedRoute },
      { role: "TECNICA_II", route: sharedRoute },
    ],
    forcedFormat,
    { role: "TECNICA_II_ALT", route: sharedRouteAlt },
  );
}

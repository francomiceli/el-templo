/**
 * Full-Body Circuit Selection
 *
 * Selects the exercises for the "Circuito cooperativo" full-body block that
 * closes the combos day (replacing the STRETCHING close of phase 159's D-11).
 * Automates what the coaches were doing by hand in production W21-W26: they
 * converted the generated final block via route_update -> FB + format_change
 * -> "Circuito cooperativo" and swapped in a push/legs/core mix.
 *
 * Selection: one exercise per movement group — PUSH, LOWER, CORE-or-PULL —
 * from the whole catalog (route FB has no exercises of its own; it means "no
 * route filter", same as the exercise swap), capped by the member level's
 * difficulty (LEVEL_DIFFICULTY_MAP). Per-level on purpose: in the manual
 * blocks each level had its own version. The hash input does NOT include the
 * level, so levels sharing a difficulty cap (kairos = alfa) get identical
 * picks, and the selection stays deterministic per (week, day).
 *
 * Cooperative prescription (taken from the manual blocks, uniform across all
 * of them): CON -> 100 shared reps, ISO -> 200 shared seconds, rest 60.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../../../db/schema";
import type { ExercisePrescription } from "../../types";
import { LEVEL_DIFFICULTY_MAP } from "../../../shared/training-constants";
import { simpleHash } from "./deterministic-hash";
import {
  queryFullBodyCircuitPool,
  type FullBodyPoolRow,
} from "./mobility-selection";

/** One pick per movement group; CORE is scarce so PULL backs it up. */
export const FULL_BODY_MOVEMENT_GROUPS: readonly (readonly string[])[] = [
  ["PUSH"],
  ["LOWER"],
  ["CORE", "PULL"],
];

// Cooperative (team-shared) numbers observed in every manual FB block.
const COOPERATIVE_DEFAULTS = {
  CON_REPS: 100,
  ISO_SECONDS: 200,
  REST: 60,
};

/**
 * Pure selection over an already-fetched pool — split out so the pick logic
 * is unit-testable without a DB.
 */
export function pickFullBodyCircuitExercises(
  pool: readonly FullBodyPoolRow[],
  week: number,
  day: string,
  memberLevel: string,
): FullBodyPoolRow[] {
  const maxDifficulty = LEVEL_DIFFICULTY_MAP[memberLevel] ?? 6;
  const eligible = pool.filter((ex) => ex.dificultadLineal <= maxDifficulty);

  const picked: FullBodyPoolRow[] = [];
  for (const patterns of FULL_BODY_MOVEMENT_GROUPS) {
    const groupPool = eligible
      .filter((ex) => patterns.includes(ex.pattern))
      // Deterministic base order: DB row order is not guaranteed to be stable.
      .sort((a, b) => a.id - b.id);
    if (groupPool.length === 0) continue;

    for (let i = 0; i < groupPool.length; i++) {
      const idx =
        simpleHash(`${week}-${day}-FULLBODY-${patterns[0]}-${i}`) %
        groupPool.length;
      const candidate = groupPool[idx];
      if (!picked.some((p) => p.id === candidate.id)) {
        picked.push(candidate);
        break;
      }
    }
  }
  return picked;
}

/**
 * Select the combos-day closing block's full-body circuit exercises for one
 * member level.
 */
export async function selectFullBodyCircuitExercises(
  db: MySql2Database<typeof schema>,
  week: number,
  day: string,
  memberLevel: string,
): Promise<ExercisePrescription[]> {
  const pool = await queryFullBodyCircuitPool(db);
  const picked = pickFullBodyCircuitExercises(pool, week, day, memberLevel);

  return picked.map((selected) => {
    const isISO = selected.effort?.toUpperCase() === "ISO";
    return {
      exerciseId: selected.id,
      name: selected.name,
      contraction: isISO ? "ISO" : "CON",
      reps: isISO ? 0 : COOPERATIVE_DEFAULTS.CON_REPS,
      seconds: isISO ? COOPERATIVE_DEFAULTS.ISO_SECONDS : 0,
      rest: COOPERATIVE_DEFAULTS.REST,
      dificultadLineal: selected.dificultadLineal,
    };
  });
}

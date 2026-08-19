/**
 * Stretching Block Selection
 *
 * Phase 159 (SEM-06, D-12/D-13): selects ~4 mobility exercises for the
 * STRETCHING block that closes both combos and tecnica days.
 *
 * D-12: reuses the pool/query of `mobility-selection.ts` (pattern='MOVILIDAD').
 * D-13: the generator picks ~4 exercises (style INITIUM's fixed 4), coach edits.
 *
 * Pitfall 1 (anti — mandatory): the STRETCHING block is generated once PER
 * LEVEL (6 levels per day) and must be IDENTICAL across all of them for the
 * same (week, day). The sibling ROM mobility selector picks randomly from
 * the pool, which would make each level diverge. This selector is a PURE
 * function of `(week, day)` instead — it deliberately does NOT accept a
 * member-level parameter, and never relies on any non-deterministic source
 * of randomness. Ordering the pool by `id` first is what makes the
 * hash-based pick stable across process restarts (array order from the DB
 * is not guaranteed).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../../../db/schema";
import type { ExercisePrescription } from "../../types";
import { queryMobilityPool } from "./mobility-selection";
import { simpleHash } from "./deterministic-hash";

// Same defaults as mobility-selection.ts (examples.txt analysis):
// ISO exercises: 20 seconds: CON exercises: 10 reps.
const MOBILITY_DEFAULTS = {
  ISO_SECONDS: 20,
  CON_REPS: 10,
};

/** D-13: the generator picks ~4 exercises for STRETCHING; the coach edits. */
const STRETCHING_EXERCISE_COUNT = 4;

/**
 * Select the STRETCHING block's mobility exercises.
 *
 * Pure function of (week, day) — no member-level parameter (Pitfall 1), no
 * non-deterministic randomness. Picks up to STRETCHING_EXERCISE_COUNT from the pool
 * of ALL 'MOVILIDAD' exercises (D-12, same pool as ROM's mobility selection),
 * ordered by `id` ascending and indexed via simpleHash for reproducibility.
 */
export async function selectStretchingExercises(
  db: MySql2Database<typeof schema>,
  week: number,
  day: string,
): Promise<ExercisePrescription[]> {
  // D-12: reuse the shared MOVILIDAD pool (single tenant-audited access to the
  // `exercises` table lives in mobility-selection.ts). We ignore the extra
  // `mobilityRelated` column the shared query returns.
  const allMobility = await queryMobilityPool(db);

  if (allMobility.length === 0) return [];

  // Deterministic base order: DB row order is not guaranteed to be stable.
  const ordered = [...allMobility].sort((a, b) => a.id - b.id);

  const picked: typeof ordered = [];
  for (
    let i = 0;
    picked.length < STRETCHING_EXERCISE_COUNT && picked.length < ordered.length;
    i++
  ) {
    const idx = simpleHash(`${week}-${day}-STRETCHING-${i}`) % ordered.length;
    const candidate = ordered[idx];
    if (!picked.some((p) => p.id === candidate.id)) {
      picked.push(candidate);
    }
  }

  // exerciseType stays "main" (implicit) on purpose: everywhere else in the
  // system "mobility" means THE single bonus mobility add-on of a normal
  // block (singular, Phase 17), and every renderer (admin editor, public
  // endpoint, PDF, TV) filters on that semantic. Tagging the whole block as
  // "mobility" made it render empty in all of them (UAT 2026-08-18).
  return picked.map((selected) => {
    const isISO = selected.effort?.toUpperCase() === "ISO";
    return {
      exerciseId: selected.id,
      name: selected.name,
      contraction: isISO ? "ISO" : "CON",
      reps: isISO ? 0 : MOBILITY_DEFAULTS.CON_REPS,
      seconds: isISO ? MOBILITY_DEFAULTS.ISO_SECONDS : 0,
      rest: 0,
    };
  });
}

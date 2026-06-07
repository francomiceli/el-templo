/**
 * exercises / backbone-scope — Phase 133 Plan 04 (R1-FILTER).
 *
 * SINGLE Drizzle source of truth for the backbone node predicate (the "embudo"
 * that decides which exercises are nodes of the skill tree). Until this phase
 * the predicate lived copied VERBATIM in tree-editor/service.ts and
 * tree-progress/service.ts (plus twice as raw SQL in
 * rebuild-progression-graph.ts) — 5 textual occurrences kept in sync by hand.
 *
 * THE FUNNEL (every condition must hold for a row to be a backbone node):
 *   1. canonical_exercise_id IS NULL   — canonical only (soft-merged dupes out)
 *   2. effort IN ('CON','EXC','ISO')   — real contraction axes only (D-04)
 *   3. habilidad IS NULL               — Habilidad variants are parallel,
 *                                        off-backbone
 *   4. milestone_exercise_id IS NULL   — hitos (or unclassified) only; a
 *                                        VARIANTE hangs off its milestone and
 *                                        leaves the backbone (R1-FILTER, 133)
 *   5. routes.excluded_from_tree = 0   — movilidad/games never enter the tree
 *
 * MANUAL MIRROR: the raw-SQL reads in `rebuild-progression-graph.ts`
 * (readBackboneNodes + readManualEdgePartitions) must stay mirrored with this
 * helper BY HAND — they cannot import Drizzle column objects into sql``
 * fragments without losing the literal aliases the CLI report relies on. A
 * node-set consistency test in test/exercises/rebuild-progression-graph.test.ts
 * guards the mirror (T-133-30): if you change the conditions here, change them
 * there too or the test goes red.
 *
 * USAGE: spread inside `and(...)` on a query that INNER-JOINs `routes` on
 * `exercises.route = routes.code` (condition 4 references routes.*):
 *
 *   .where(and(...backboneNodeConditions()))
 */

import { eq, isNull, inArray, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

/** The three real contraction-axis effort values that form a partition (D-04). */
export const VALID_EFFORTS = ["CON", "EXC", "ISO"] as const;

/**
 * The backbone node predicate as an array of Drizzle conditions, for spreading
 * into `and(...)`. Requires the query to join `routes` (see module docblock).
 */
export function backboneNodeConditions(): SQL[] {
  return [
    isNull(schema.exercises.canonicalExerciseId),
    inArray(schema.exercises.effort, [...VALID_EFFORTS]),
    isNull(schema.exercises.habilidad),
    isNull(schema.exercises.milestoneExerciseId),
    eq(schema.routes.excludedFromTree, false),
  ];
}

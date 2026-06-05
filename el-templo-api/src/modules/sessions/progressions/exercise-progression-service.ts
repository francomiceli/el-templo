/**
 * Exercise Progression Service — Phase 126 (v5.1 Nuevo Sistema de Entrenamiento)
 *
 * Runtime adjacency primitive over the skill-tree DAG. `getNeighbor` resolves the
 * "one step easier/harder" exercise within the SAME sub-family and the SAME effort
 * (contraction), ordered by `dificultad_lineal`. Consumed by Phase 131 (in-session
 * más fácil / más difícil buttons).
 *
 * Design decisions encoded here:
 *  - D-04: the effort (contraction) is FIXED. An EXC target never returns a CON/ISO
 *    neighbor — there is no contraction substitution (unlike the fallback ladder).
 *  - D-05: at the end of a chain `getNeighbor` returns `null` and never widens or
 *    crosses effort. dl ties are broken deterministically by `id` so the neighbor
 *    is stable across calls.
 *  - D-06: reuses the `exercise-fallback.ts` Drizzle query idiom (effort eq + dl
 *    bound) and `ExerciseCandidate` return shape rather than reimplementing the
 *    fallback machinery.
 *
 * Exercises with NULL `subfamily_id` are not in the graph and resolve no neighbor.
 */

import { eq, and, gt, lt } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../../db/schema";
import type { ExerciseCandidate } from "../fallback/exercise-fallback";
import type { Contraction } from "../types";

type DbInstance = MySql2Database<typeof schema>;

/** Direction of the adjacency lookup along the dificultad_lineal axis. */
export type NeighborDirection = "up" | "down";

export class ExerciseProgressionService {
  constructor(
    private readonly db: DbInstance,
    private readonly log?: FastifyBaseLogger,
  ) {}

  /**
   * Resolve the dl-adjacent exercise of the SAME effort within the SAME
   * sub-family.
   *
   * - `up`:   the candidate with the smallest dl strictly greater than the
   *           target's dl (next harder). Ties broken by smallest id (D-05).
   * - `down`: the candidate with the largest dl strictly less than the target's
   *           dl (next easier). Ties broken by smallest id (D-05).
   *
   * Returns `null` when the target is missing, the target has NULL subfamily_id
   * (not in the graph), or there is no candidate in the requested direction (end
   * of chain). Never crosses effort and never widens (D-04/D-05).
   */
  async getNeighbor(
    exerciseId: number,
    direction: NeighborDirection,
  ): Promise<ExerciseCandidate | null> {
    // Step 1: load the target row. Excluded from the graph if missing or if it
    // has no sub-family.
    const [target] = await this.db
      .select({
        id: schema.exercises.id,
        subfamilyId: schema.exercises.subfamilyId,
        effort: schema.exercises.effort,
        dificultadLineal: schema.exercises.dificultadLineal,
      })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, exerciseId));

    if (!target || target.subfamilyId === null) {
      this.log?.debug(
        { exerciseId, direction, reason: !target ? "missing" : "no-subfamily" },
        "getNeighbor: target excluded from graph",
      );
      return null;
    }

    // Step 2: query candidates in (sub-family × effort) with the directional dl
    // bound. effort is FIXED (D-04) — never substitute the contraction. Reuses the
    // exercise-fallback.ts query idiom (same effort eq + dl bound shape, D-06).
    const dlBound =
      direction === "up"
        ? gt(schema.exercises.dificultadLineal, target.dificultadLineal)
        : lt(schema.exercises.dificultadLineal, target.dificultadLineal);

    const candidates = await this.db
      .select({
        id: schema.exercises.id,
        name: schema.exercises.exercise,
        dificultadLineal: schema.exercises.dificultadLineal,
        effort: schema.exercises.effort,
        position: schema.exercises.position,
      })
      .from(schema.exercises)
      .where(
        and(
          eq(schema.exercises.subfamilyId, target.subfamilyId),
          eq(schema.exercises.effort, target.effort),
          dlBound,
        ),
      );

    // Step 3: pick the dl-closest candidate, breaking ties deterministically by id
    // (mirrors the exercise-fallback.ts selectClosest stable-sort idiom, D-05). For
    // `up` the closest is the smallest dl above the target; for `down` it is the
    // largest dl below the target. We sort by dl distance from the target, then id.
    if (candidates.length === 0) {
      // End of chain — explicit terminal null. Do NOT widen or cross effort (D-05).
      return null;
    }

    const targetDl = target.dificultadLineal;
    const [chosen] = [...candidates].sort((a, b) => {
      const aDist = Math.abs(a.dificultadLineal - targetDl);
      const bDist = Math.abs(b.dificultadLineal - targetDl);
      if (aDist !== bDist) return aDist - bDist;
      return a.id - b.id;
    });

    return {
      id: chosen.id,
      name: chosen.name,
      dificultadLineal: chosen.dificultadLineal,
      // effort is fixed to the target's contraction (D-04), so the neighbor
      // carries the same contraction. The graph only contains EXC/ISO/CON rows.
      contraction: chosen.effort as Contraction,
      position: chosen.position,
    };
  }
}

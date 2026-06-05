/**
 * Exercise Progression Service — Phase 126 (v5.1 Nuevo Sistema de Entrenamiento)
 *
 * Runtime adjacency primitive over the skill-tree DAG. `getNeighbor` resolves the
 * "one step easier/harder" exercise by walking the PERSISTED `exercise_progressions`
 * graph (NOT by re-deriving order from the `exercises` catalog). Consumed by Phase
 * 131 (in-session más fácil / más difícil buttons).
 *
 * Design decisions encoded here:
 *  - D-03: the primitive is an ADJACENCY LOOKUP over `exercise_progressions`. The
 *    persisted edge table is the single source of truth, so `manual` edges authored
 *    by profes in phase 128 are honored transparently and the primitive can never
 *    disagree with the backbone constructor on a dl tie (they read the same edges).
 *    An auto/manual edge `from=A → to=B` means B is exactly one step HARDER than A
 *    (the backbone is ordered ascending by dl), so:
 *      - `up`   (harder) = the `to_exercise_id` of the edge whose `from = target`.
 *      - `down` (easier) = the `from_exercise_id` of the edge whose `to = target`.
 *  - D-04: the effort (contraction) is FIXED. An EXC target never returns a CON/ISO
 *    neighbor — we restrict to edges whose neighbor exercise has the SAME effort as
 *    the target, and never cross effort automatically.
 *  - D-05: no matching edge → `null` (end of chain / off-graph). Effort is never
 *    widened or crossed. When more than one candidate edge exists in a direction
 *    (possible once 128 adds manual cross-edges; the auto backbone has at most one),
 *    we pick deterministically: closest by dl, then smallest id.
 *  - D-06: reuses the `ExerciseCandidate` return shape rather than reimplementing it.
 *
 * Graph membership is defined by the PERSISTED edges, not a catalog column: the
 * rebuild (Fase 4) only emits edges for backbone nodes (route not excluded, effort
 * a real contraction, `habilidad IS NULL`), so an off-graph exercise (excluded
 * route / Habilidad variant) simply has no incident edges and resolves no neighbor.
 * Empty/invalid-effort rows (`effort` is a free varchar(10); the catalog holds
 * `effort=''` rows) are off-graph and resolve no neighbor — the `Contraction` cast
 * is never applied to a non-contraction value (WR-03).
 */

import { eq, and, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../../db/schema";
import type { ExerciseCandidate } from "../fallback/exercise-fallback";
import type { Contraction } from "../types";

type DbInstance = MySql2Database<typeof schema>;

/** Direction of the adjacency lookup along the dificultad_lineal axis. */
export type NeighborDirection = "up" | "down";

/** The only effort values that are valid contractions (D-04). */
const CONTRACTIONS = new Set<Contraction>(["CON", "EXC", "ISO"]);

/**
 * Narrow a free-varchar `effort` to the `Contraction` union, or `null` when it is
 * empty/invalid. The catalog demonstrably holds `effort=''` rows
 * (exercise-fallback.ts filters `effort = ''`), so a blind `as Contraction` cast
 * would be a type-lie (WR-03, CLAUDE.md "no any / define proper interfaces").
 */
function asContraction(effort: string): Contraction | null {
  return CONTRACTIONS.has(effort as Contraction)
    ? (effort as Contraction)
    : null;
}

export class ExerciseProgressionService {
  constructor(
    private readonly db: DbInstance,
    private readonly log?: FastifyBaseLogger,
  ) {}

  /**
   * Resolve the dl-adjacent exercise of the SAME effort by walking the persisted
   * `exercise_progressions` graph (D-03).
   *
   * - `up`:   the `to_exercise_id` of an edge whose `from_exercise_id = target`
   *           (next harder).
   * - `down`: the `from_exercise_id` of an edge whose `to_exercise_id = target`
   *           (next easier).
   *
   * Restricts to edges whose neighbor exercise has the SAME effort as the target
   * (D-04 — contraction is fixed, never crossed). When several candidate edges
   * exist in a direction (possible once phase 128 authors manual cross-edges; the
   * auto backbone has at most one), picks deterministically: closest by dl, then
   * smallest id (D-05).
   *
   * Returns `null` when the target is missing, the target has NULL subfamily_id or
   * a non-contraction effort (not in the graph), there is no matching edge (end of
   * chain), or the resolved neighbor row is missing / has NULL subfamily_id / a
   * non-contraction effort. Never crosses effort and never widens (D-04/D-05).
   */
  async getNeighbor(
    exerciseId: number,
    direction: NeighborDirection,
  ): Promise<ExerciseCandidate | null> {
    // Step 1: load the target row. Excluded from the graph if missing or if its
    // effort is not a real contraction (off-graph). Off-graph nodes (excluded
    // route / Habilidad) carry no incident edges, so the edge walk below is the
    // real membership gate.
    const [target] = await this.db
      .select({
        id: schema.exercises.id,
        effort: schema.exercises.effort,
        dificultadLineal: schema.exercises.dificultadLineal,
      })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, exerciseId));

    if (!target) {
      this.log?.debug(
        { exerciseId, direction, reason: "missing" },
        "getNeighbor: target excluded from graph",
      );
      return null;
    }

    const targetEffort = asContraction(target.effort);
    if (!targetEffort) {
      this.log?.debug(
        { exerciseId, direction, effort: target.effort },
        "getNeighbor: target has no valid contraction — off-graph",
      );
      return null;
    }

    // Step 2: ADJACENCY LOOKUP over the persisted edge table (D-03). An edge
    // from=A → to=B means B is one step HARDER than A, so `up` follows edges
    // whose from = target (neighbor = to), and `down` follows edges whose to =
    // target (neighbor = from). This reads `auto` AND `manual` edges, so profe
    // overrides from phase 128 are honored transparently.
    const edges =
      direction === "up"
        ? await this.db
            .select({
              neighborId: schema.exerciseProgressions.toExerciseId,
            })
            .from(schema.exerciseProgressions)
            .where(eq(schema.exerciseProgressions.fromExerciseId, target.id))
        : await this.db
            .select({
              neighborId: schema.exerciseProgressions.fromExerciseId,
            })
            .from(schema.exerciseProgressions)
            .where(eq(schema.exerciseProgressions.toExerciseId, target.id));

    if (edges.length === 0) {
      // End of chain / off-graph — explicit terminal null (D-05). Never widen.
      return null;
    }

    // Step 3: fetch the candidate neighbor rows. Restrict to the SAME effort as
    // the target (D-04 — never cross contraction). An edge could in principle
    // point at a row whose effort differs (a manual cross-effort edge a profe
    // authored in 128); those are excluded here so the in-session adjustment
    // never silently changes the prescription's contraction.
    const neighborIds = edges.map((e) => e.neighborId);
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
          inArray(schema.exercises.id, neighborIds),
          eq(schema.exercises.effort, targetEffort),
        ),
      );

    // Drop any candidate whose effort is not a real contraction (defensive — the
    // effort eq above already constrains to targetEffort, which is a valid
    // Contraction, but this keeps the cast honest, WR-03).
    const valid = candidates.filter((c) => asContraction(c.effort) !== null);

    if (valid.length === 0) {
      this.log?.debug(
        { exerciseId, direction },
        "getNeighbor: edges present but no same-effort in-graph neighbor",
      );
      return null;
    }

    // Step 4: deterministic pick when more than one candidate edge exists in this
    // direction (auto backbone has exactly one; 128 manual cross-edges can add
    // more). Closest by dl to the target, then smallest id (D-05). For the
    // auto-only case this is a no-op (single candidate).
    const targetDl = target.dificultadLineal;
    const [chosen] = [...valid].sort((a, b) => {
      const aDist = Math.abs(a.dificultadLineal - targetDl);
      const bDist = Math.abs(b.dificultadLineal - targetDl);
      if (aDist !== bDist) return aDist - bDist;
      return a.id - b.id;
    });

    const chosenContraction = asContraction(chosen.effort);
    if (!chosenContraction) {
      // Unreachable given the eq(effort, targetEffort) filter, but we never emit
      // an invalid Contraction into the ExerciseCandidate (WR-03).
      return null;
    }

    return {
      id: chosen.id,
      name: chosen.name,
      dificultadLineal: chosen.dificultadLineal,
      contraction: chosenContraction,
      position: chosen.position,
    };
  }
}

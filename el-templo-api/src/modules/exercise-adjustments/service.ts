/**
 * ExerciseAdjustmentService — Phase 131 Plan 01 (ADJUST-01/02/03).
 *
 * Backend for the in-session difficulty adjustment. When a member taps
 * "más difícil ↑" / "más fácil ↓" in the player, the service:
 *   1. Resolves the neighbor exercise via the Phase 126 adjacency primitive
 *      `ExerciseProgressionService.getNeighbor(exerciseId, direction)` —
 *      `up` = harder, `down` = easier. The primitive fixes the contraction and
 *      never crosses effort; at the end of the chain it returns `null` (D-03).
 *   2. Maps the direction to the recorded outcome (D-02): `up` → `dominado`
 *      (the member dominated and steps up), `down` → `bajado` (it was too hard).
 *   3. On a resolved neighbor, persists ONE `exercise_adjustments` row for the
 *      ORIGIN exercise and returns the neighbor. On a chain-end / off-graph tap
 *      (`getNeighbor` → null) it is a graceful no-op: NO row is written and the
 *      caller is told there is no neighbor.
 *
 * The service writes ONLY `exercise_adjustments`. It NEVER touches `users.level`
 * or any SPOM / subscription / planning data (D-06) — the adjustment swaps the
 * block's exercise identity only; level and SPOM remain the coach's criterion.
 */

import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { ExerciseProgressionService } from "../sessions/progressions/exercise-progression-service";
import type { NeighborDirection } from "../sessions/progressions/exercise-progression-service";
import type { ExerciseCandidate } from "../sessions/fallback/exercise-fallback";

type DbInstance = MySql2Database<typeof schema>;

/** Outcome recorded for the origin exercise (D-02). */
export type AdjustmentStatus = "dominado" | "bajado";

/** Session context the adjustment is logged against. */
export interface AdjustmentContext {
  readonly dayId: string;
  readonly date: string;
}

/**
 * Result of an adjustment request.
 *  - `neighbor` is the resolved exercise to swap in (or `null` at chain end).
 *  - `message` is non-null only on the no-op (chain end) path.
 */
export interface AdjustmentResult {
  readonly neighbor: ExerciseCandidate | null;
  readonly message: string | null;
}

const NO_NEIGHBOR_MESSAGE =
  "Ya estás en el extremo de la cadena para este ejercicio.";

/** Map the tap direction to the outcome recorded for the origin (D-02). */
function statusForDirection(direction: NeighborDirection): AdjustmentStatus {
  return direction === "up" ? "dominado" : "bajado";
}

export class ExerciseAdjustmentService {
  private readonly progression: ExerciseProgressionService;

  constructor(
    private readonly db: DbInstance,
    private readonly log?: FastifyBaseLogger,
  ) {
    // Reuse the Phase 126 primitive — do NOT reimplement adjacency (D-03).
    this.progression = new ExerciseProgressionService(db, log);
  }

  /**
   * Record an in-session difficulty adjustment for `memberId` on the ORIGIN
   * exercise `exerciseId`, resolving and returning the neighbor in `direction`.
   *
   * `memberId` is supplied by the caller from `request.user.userId` ONLY — the
   * service never derives it from request input (member-scope, D-04).
   *
   * Returns `{ neighbor, message: null }` when a neighbor exists (a row is
   * persisted), or `{ neighbor: null, message }` at chain end / off-graph (no
   * row is written — the swap did not happen).
   */
  async adjust(
    memberId: number,
    exerciseId: number,
    direction: NeighborDirection,
    ctx: AdjustmentContext,
  ): Promise<AdjustmentResult> {
    const neighbor = await this.progression.getNeighbor(exerciseId, direction);

    if (neighbor === null) {
      // Chain end / off-graph (invalid or missing exercise) → graceful no-op.
      // Never cross effort, never persist a swap that did not happen (D-03).
      this.log?.debug(
        { memberId, exerciseId, direction },
        "exercise-adjustment: no neighbor — no-op",
      );
      return { neighbor: null, message: NO_NEIGHBOR_MESSAGE };
    }

    const status = statusForDirection(direction);

    try {
      await this.db.insert(schema.exerciseAdjustments).values({
        memberId,
        exerciseId,
        toExerciseId: neighbor.id,
        status,
        dayId: ctx.dayId,
        date: ctx.date,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown error";
      this.log?.error(
        { memberId, exerciseId, direction, err: message },
        "exercise-adjustment: failed to persist record",
      );
      throw err;
    }

    this.log?.info(
      { memberId, exerciseId, toExerciseId: neighbor.id, status },
      "exercise-adjustment: recorded",
    );

    return { neighbor, message: null };
  }
}

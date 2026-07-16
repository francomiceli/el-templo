/**
 * ExerciseAdjustmentCoachService — Phase 131 Plan 02 (ADJUST-04, D-05).
 *
 * Staff-facing read of a member's in-session difficulty adjustment log.
 * This is the privileged counterpart to Plan 01's strictly member-scoped POST:
 * the staff LOOKS UP a given member (memberId is a route param, NOT the token
 * user). Access is gated at the route level by ALL_STAFF_ROLES — a member can
 * NEVER reach it (T-131-05). This service performs NO authorization itself; the
 * route owns the role gate (mirrors the tree-editor module split).
 *
 * Read-only: the service only SELECTs the member's exercise_adjustments rows,
 * joined to exercises for human-readable origin + served-neighbor names. It
 * never writes anything (no level/SPOM mutation — D-06).
 */

import type { MySql2Database } from "drizzle-orm/mysql2";
import { eq, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import * as schema from "../../db/schema";

type DbInstance = MySql2Database<typeof schema>;

/** One coach-visible adjustment record (newest first). */
export interface MemberAdjustmentRow {
  readonly id: number;
  readonly exerciseId: number;
  readonly exerciseName: string;
  readonly toExerciseId: number | null;
  readonly toExerciseName: string | null;
  readonly status: "dominado" | "bajado";
  readonly dayId: string;
  readonly date: string;
  readonly createdAt: string;
}

export class ExerciseAdjustmentCoachService {
  constructor(private readonly db: DbInstance) {}

  /**
   * List a member's dominado/bajado records, newest first. `memberId` is a
   * staff lookup target (route param) — the route's ALL_STAFF_ROLES gate is what
   * makes this legitimate (Plan 01's member-scope does NOT apply here, D-05).
   *
   * The origin exercise (`exercise_id`) and the served neighbor
   * (`to_exercise_id`, nullable) are each LEFT-joined to `exercises` so renamed
   * or soft-merged exercises still surface a name; a missing join yields null.
   */
  async listMemberAdjustments(
    memberId: number,
  ): Promise<MemberAdjustmentRow[]> {
    const origin = alias(schema.exercises, "origin_exercise");
    const neighbor = alias(schema.exercises, "neighbor_exercise");

    const rows = await this.db
      .select({
        id: schema.exerciseAdjustments.id,
        exerciseId: schema.exerciseAdjustments.exerciseId,
        exerciseName: origin.exercise,
        toExerciseId: schema.exerciseAdjustments.toExerciseId,
        toExerciseName: neighbor.exercise,
        status: schema.exerciseAdjustments.status,
        dayId: schema.exerciseAdjustments.dayId,
        date: schema.exerciseAdjustments.date,
        createdAt: schema.exerciseAdjustments.createdAt,
      })
      .from(schema.exerciseAdjustments)
      .leftJoin(origin, eq(schema.exerciseAdjustments.exerciseId, origin.id))
      .leftJoin(
        neighbor,
        eq(schema.exerciseAdjustments.toExerciseId, neighbor.id),
      )
      .where(eq(schema.exerciseAdjustments.memberId, memberId))
      .orderBy(
        desc(schema.exerciseAdjustments.createdAt),
        desc(schema.exerciseAdjustments.id),
      );

    return rows.map((r) => ({
      id: r.id,
      exerciseId: r.exerciseId,
      // Defensive: origin is a NOT-NULL FK so the join always resolves, but
      // fall back to a placeholder rather than leak null to the UI.
      exerciseName: r.exerciseName ?? `#${r.exerciseId}`,
      toExerciseId: r.toExerciseId,
      toExerciseName: r.toExerciseName,
      status: r.status,
      dayId: r.dayId,
      date: r.date,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

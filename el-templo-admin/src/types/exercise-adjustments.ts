/**
 * Coach-facing types for a member's in-session difficulty adjustment log
 * (Phase 131 Plan 02, ADJUST-04). Mirrors the API
 * `MemberAdjustmentRow` returned by GET /admin/exercise-adjustments/:memberId.
 */

/** Outcome recorded for the origin exercise (D-02). */
export type AdjustmentStatus = 'dominado' | 'bajado';

/** One coach-visible dominado/bajado record (newest first from the API). */
export interface MemberAdjustment {
  id: number;
  /** The ORIGIN tree node the member tapped. */
  exerciseId: number;
  exerciseName: string;
  /** The served neighbor (nullable defensively). */
  toExerciseId: number | null;
  toExerciseName: string | null;
  status: AdjustmentStatus;
  /** Session reference, e.g. "W1-lunes-sigma". */
  dayId: string;
  /** YYYY-MM-DD session date. */
  date: string;
  /** ISO-8601 timestamp the record was created. */
  createdAt: string;
}

// Module: exercise-adjustments — Phase 131 Plan 01 (ADJUST-03, D-01)
import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { exercises } from "./exercises";

/**
 * Outcome of an in-session difficulty adjustment (D-02).
 *
 * The member tap is the explicit capture event in the player:
 *  - `dominado`: the member tapped "más difícil ↑" — they DOMINATED the current
 *    exercise and step up to the harder neighbor.
 *  - `bajado`: the member tapped "más fácil ↓" — the current exercise was too
 *    hard, so they step down to the easier neighbor.
 *
 * ENUM-DRIFT LESSON (125/126/129/130): the first arg `"status"` MUST equal the
 * `status` column name in the `CREATE TABLE` of migration 0142, and the values
 * here MUST match the ENUM in that migration exactly.
 */
export const exerciseAdjustmentStatus = mysqlEnum("status", [
  "dominado",
  "bajado",
]);

/**
 * Exercise adjustments — the per-member, per-node log of in-session difficulty
 * adjustments (ADJUST-03, D-01).
 *
 * Each row records that a member tapped más difícil/más fácil on a specific tree
 * node (`exercise_id`, the ORIGIN exercise) during a session, persisting the
 * outcome as `dominado|bajado`. This record is DISTINCT from the whole-session
 * "completado" + RPE in `completed_sessions.rpe`: it is a finer-grained, per-node
 * signal that the in-session adjustment (ADJUST-02) and the tree % enrichment
 * (ADJUST-04, Plan 02) rest on.
 *
 * `to_exercise_id` is the resolved neighbor that was served (D-05 discretion —
 * useful for the Plan 02 coach view); it is NULL only defensively and is set on
 * every persisted row, since a row is written ONLY when a neighbor was resolved
 * (chain-end taps are a graceful no-op and write NO row).
 *
 * Append-style log (NO unique constraint): re-taps create new rows. The tree %
 * (Plan 02) reads the latest-per-node state (D-04/D-05).
 *
 * The adjustment NEVER changes the member's level or SPOM (D-06) — this table is
 * the only thing the service writes.
 */
export const exerciseAdjustments = mysqlTable(
  "exercise_adjustments",
  {
    id: int("id").primaryKey().autoincrement(),
    memberId: int("member_id")
      .notNull()
      .references(() => users.id),
    // The ORIGIN node — the exercise the member dominated / bajó.
    exerciseId: int("exercise_id")
      .notNull()
      .references(() => exercises.id),
    // The resolved neighbor served (nullable defensively; written on every row).
    toExerciseId: int("to_exercise_id").references(() => exercises.id),
    status: exerciseAdjustmentStatus.notNull(),
    // Session reference, same shape as completed_sessions.day_id.
    dayId: varchar("day_id", { length: 50 }).notNull(),
    date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("exercise_adjustments_member_idx").on(table.memberId),
    index("exercise_adjustments_exercise_idx").on(table.exerciseId),
  ],
);

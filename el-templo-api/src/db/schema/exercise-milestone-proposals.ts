// Module: exercise-milestone-proposals — phase 133 (v5.1 Calidad del Árbol, R1)
import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { exercises } from "./exercises";

/**
 * Status of a milestone proposal.
 *
 * Values are accepted/rejected (same convention as exercise_dimension_proposals,
 * phase 125 D-01). A proposal starts `pending`; a profe in the review screen
 * either accepts it — which writes the truth column
 * `exercises.milestone_exercise_id` transactionally — or rejects it, which
 * touches nothing on `exercises`.
 */
export const exerciseMilestoneProposalStatus = mysqlEnum("status", [
  "pending",
  "accepted",
  "rejected",
]);

/**
 * Exercise milestone proposals — the reviewable first pass of the
 * hito/variante classification (R1, phase 133) over the exercise catalog.
 *
 * Proposals live in THIS separate table, never on `exercises`. The heuristic
 * bootstrap inserts only `pending` rows here; the truth column
 * `exercises.milestone_exercise_id` stays clean and auditable until a profe
 * accepts. The backbone (tree editor / Mi Árbol) reads only the CONFIRMED
 * truth column on `exercises`, never `pending` proposals — keeping proposals
 * in their own table enforces that boundary. Nothing changes in the backbone
 * until a profe accepts: the NULL default alters no node-set.
 *
 * Semántica de proposed_milestone_exercise_id:
 *   - NULL     -> el ejercicio se propone como HITO (queda en el backbone)
 *   - NOT NULL -> el ejercicio se propone como VARIANTE colgando del hito
 *                 apuntado (sale del backbone al aceptarse)
 *
 * `exercise_id` FK uses ON DELETE CASCADE (contrast with the truth column's
 * SET NULL): a proposal carries no historical weight and is meaningless
 * without its exercise. A UNIQUE on `exercise_id` enforces "at most one live
 * proposal per exercise", backing the bootstrap's NOT-EXISTS guard at the DB
 * level so the script is idempotent/resumable.
 *
 * `proposed_milestone_exercise_id` FK uses ON DELETE SET NULL: if the
 * proposed milestone disappears, the proposal degrades to "proposed as hito"
 * instead of dangling.
 */
export const exerciseMilestoneProposals = mysqlTable(
  "exercise_milestone_proposals",
  {
    id: int("id").primaryKey().autoincrement(),
    exerciseId: int("exercise_id")
      .references(() => exercises.id, { onDelete: "cascade" })
      .notNull(),
    /** Hito propuesto. NULL = propuesto como HITO (backbone). */
    proposedMilestoneExerciseId: int(
      "proposed_milestone_exercise_id",
    ).references(() => exercises.id, { onDelete: "set null" }),
    /** Token de movimiento detectado por la heurística. NULL = sin movimiento detectado. */
    movementToken: varchar("movement_token", { length: 100 }),
    /** Escalón (rank) usado para agrupar dentro del movimiento. */
    stepRank: int("step_rank"),
    status: exerciseMilestoneProposalStatus.default("pending").notNull(),
    engine: varchar("engine", { length: 30 }).notNull(),
    confidence: int("confidence"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("exercise_milestone_proposals_exercise_uq").on(
      table.exerciseId,
    ),
    index("exercise_milestone_proposals_status_idx").on(table.status),
  ],
);

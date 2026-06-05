// Module: exercise-dimension-proposals — phase 125 (v5.1 Nuevo Sistema de Entrenamiento)
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
 * Status of a dimension proposal (D-01).
 *
 * Values are accepted/rejected (NOT approved/denied — per phase 125 CONTEXT
 * D-01). A proposal starts `pending`; a profe in the review screen (Plan 02)
 * either accepts it — which writes the phase-124 truth columns on `exercises`
 * (subfamily_id / leverage / route, route_pending=0) — or rejects it, which
 * touches nothing on `exercises`.
 */
export const exerciseProposalStatus = mysqlEnum("status", [
  "pending",
  "accepted",
  "rejected",
]);

/**
 * Exercise dimension proposals — the reviewable first pass of the 3-dimension
 * decomposition (gesto/sub-familia, palanca/leverage, ruta) over the ~1.493-row
 * exercise catalog (TREE-02, D-01).
 *
 * Proposals live in THIS separate table, never on `exercises`. The heuristic
 * bootstrap (`bootstrap-dimensions.ts`, Plan 01) inserts only `pending` rows
 * here; the truth columns on `exercises` stay clean and auditable until a profe
 * accepts (Plan 02). The DAG graph (126) reads only CONFIRMED dimensions on
 * `exercises`, never `pending` proposals — keeping proposals in their own table
 * enforces that boundary.
 *
 * Proposed-column widths mirror the phase-124 truth columns so the accept flow
 * (Plan 02) never truncates:
 *   - proposed_subfamily  150  -> exercise_subfamilies.name (150)
 *   - proposed_leverage    50  -> exercises.leverage (50), nullable (D-03)
 *   - proposed_route       20  -> exercises.route (20), only for route_pending (D-03)
 *
 * `exercise_id` FK uses ON DELETE CASCADE (contrast with the 124 truth columns'
 * SET NULL): a proposal carries no historical weight and is meaningless without
 * its exercise. A UNIQUE on `exercise_id` enforces "at most one live proposal
 * per exercise", backing the bootstrap's NOT-EXISTS guard at the DB level so the
 * script is idempotent/resumable (D-06).
 */
export const exerciseDimensionProposals = mysqlTable(
  "exercise_dimension_proposals",
  {
    id: int("id").primaryKey().autoincrement(),
    exerciseId: int("exercise_id")
      .references(() => exercises.id, { onDelete: "cascade" })
      .notNull(),
    proposedSubfamily: varchar("proposed_subfamily", { length: 150 }),
    proposedLeverage: varchar("proposed_leverage", { length: 50 }),
    proposedRoute: varchar("proposed_route", { length: 20 }),
    status: exerciseProposalStatus.default("pending").notNull(),
    engine: varchar("engine", { length: 30 }),
    confidence: int("confidence"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("exercise_dimension_proposals_exercise_uq").on(
      table.exerciseId,
    ),
    index("exercise_dimension_proposals_status_idx").on(table.status),
    index("exercise_dimension_proposals_route_idx").on(table.proposedRoute),
  ],
);

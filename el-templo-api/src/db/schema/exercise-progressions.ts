// Module: exercise-progressions — phase 126 (v5.1 Nuevo Sistema de Entrenamiento)
import {
  mysqlTable,
  int,
  mysqlEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { exercises } from "./exercises";

/**
 * Source of a progression edge (D-03).
 *
 * Values are `auto` (SPOM-derived backbone, regenerated wholesale every time the
 * graph constructor of Plan 02 runs) and `manual` (profe overrides authored in
 * phase 128). The regenerate step in Plan 02 DELETEs and re-inserts ONLY
 * `source='auto'` edges, never touching `manual` ones — this enum is what makes
 * that scoped, non-destructive regeneration possible.
 */
export const exerciseProgressionSource = mysqlEnum("source", [
  "auto",
  "manual",
]);

/**
 * Exercise progressions — the directed edges of the v5.1 skill tree (DAG).
 *
 * Each row is one edge `from_exercise_id -> to_exercise_id`, the persistence
 * layer for the progression graph (TREE-04, D-03). The `auto` backbone is
 * derived deterministically from the confirmed 3-dimension decomposition on
 * `exercises` (consecutive-by-dificultad_lineal within a `subfamily × effort`
 * partition); `manual` edges are profe overrides added in phase 128.
 *
 * Both FKs use ON DELETE CASCADE because an edge is meaningless without both of
 * its endpoints — if either exercise is deleted, its incident edges must go with
 * it. The UNIQUE on `(from_exercise_id, to_exercise_id)` backs the regenerate /
 * dedupe in Plan 02 (re-running the constructor must converge to the same auto
 * edge set with no duplicates).
 */
export const exerciseProgressions = mysqlTable(
  "exercise_progressions",
  {
    id: int("id").primaryKey().autoincrement(),
    fromExerciseId: int("from_exercise_id")
      .references(() => exercises.id, { onDelete: "cascade" })
      .notNull(),
    toExerciseId: int("to_exercise_id")
      .references(() => exercises.id, { onDelete: "cascade" })
      .notNull(),
    source: exerciseProgressionSource.default("auto").notNull(),
  },
  (table) => [
    uniqueIndex("exercise_progressions_edge_uq").on(
      table.fromExerciseId,
      table.toExerciseId,
    ),
    index("exercise_progressions_from_idx").on(table.fromExerciseId),
    index("exercise_progressions_to_idx").on(table.toExerciseId),
    index("exercise_progressions_source_idx").on(table.source),
  ],
);

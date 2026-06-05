import {
  mysqlTable,
  int,
  varchar,
  boolean,
  mysqlEnum,
  index,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { exerciseSubfamilies } from "./exercise-subfamilies";

export const exerciseLevelEnum = mysqlEnum("exercise_level", [
  "alfa",
  "delta",
  "sigma",
  "omega",
  "spartan",
]);

export const exercises = mysqlTable(
  "exercises",
  {
    id: int("id").primaryKey().autoincrement(),
    pattern: varchar("pattern", { length: 100 }).notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    categorySecondary: varchar("category_secondary", { length: 100 }),
    exercise: varchar("exercise", { length: 150 }).notNull(),
    exercise2: varchar("exercise_2", { length: 150 }),
    position: varchar("position", { length: 100 }),
    effort: varchar("effort", { length: 10 }).notNull(),
    level: exerciseLevelEnum,
    codeNumber: int("code_number"),
    difficulty: int("difficulty").notNull().default(1),
    /** Linear difficulty scale 1-12: Alfa 1-3, Delta 4-6, Sigma 7-8, Omega 9-10, Spartan 11-12 */
    dificultadLineal: int("dificultad_lineal").notNull().default(1),
    route: varchar("route", { length: 20 }).notNull(),
    /**
     * Sub-familia (gesto) FK — nullable in 124 (D-01/D-10: catalog may be
     * empty/minimal until the bootstrap of 125 populates it).
     */
    subfamilyId: int("subfamily_id").references(() => exerciseSubfamilies.id, {
      onDelete: "set null",
    }),
    /**
     * Palanca/posición — nullable, per-family vocabulary (D-03/D-05). NOT a
     * global enum: forcing one would leave N/A across most of the catalog.
     */
    leverage: varchar("leverage", { length: 50 }),
    /**
     * Canonical pointer for soft-merge of exact dupes (D-07). Self-FK, no
     * deletes: exercises.id is referenced by session_prescriptions and
     * program_content_blocks, so dupes point at their canonical instead of
     * being removed. Written by the saneo of Plan 02.
     */
    canonicalExerciseId: int("canonical_exercise_id").references(
      (): AnyMySqlColumn => exercises.id,
      { onDelete: "set null" },
    ),
    /**
     * "Pendiente de ruta" marker for the saneo detection (D-08). Default
     * false; the saneo of Plan 02 flips it for exercises with empty/placeholder
     * route. Real route assignment is proposed by the LLM (125) + confirmed by
     * coaches (128).
     */
    routePending: boolean("route_pending").notNull().default(false),
    mobilityRelated: varchar("mobility_related", { length: 100 }),
    equipment: varchar("equipment", { length: 20 }).$type<
      "barras" | "anillas" | "paralelas" | "cajon" | "ninguno"
    >(),
    videoUrl: varchar("video_url", { length: 500 }),
  },
  (table) => [
    index("exercises_route_effort_level_diff_idx").on(
      table.route,
      table.effort,
      table.level,
      table.difficulty,
    ),
    index("exercises_level_idx").on(table.level),
    index("exercises_dificultad_lineal_idx").on(table.dificultadLineal),
    index("exercises_subfamily_idx").on(table.subfamilyId),
    index("exercises_canonical_idx").on(table.canonicalExerciseId),
  ],
);

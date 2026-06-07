import {
  mysqlTable,
  int,
  varchar,
  boolean,
  mysqlEnum,
  index,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";

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
     * Progresión por ruta (rework): rank del escalón dentro de la partición
     * (ruta × contracción), ordenado fácil→difícil. NULL para rutas "linear"
     * (piernas, que ordenan por dificultad_lineal) y para ejercicios sin escalón
     * resuelto (pending). Lo puebla el bootstrap (classify) y lo corrige el profe.
     */
    progressionStep: int("progression_step"),
    /**
     * Habilidad — variante paralela opcional (mismo nivel, otra herramienta/forma:
     * agarre supino, anillas, una pierna, etc.). NULL = variante default / en el
     * backbone. Un ejercicio con habilidad != NULL queda FUERA de la cadena lineal.
     */
    habilidad: varchar("habilidad", { length: 100 }),
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
     * Eje hito/variante (R1, phase 133). NULL = hito o sin clasificar →
     * entra al backbone del árbol. NOT NULL = variante colgando del hito
     * apuntado → fuera del backbone. Truth escrito SOLO por el accept
     * transaccional del profe (proposal accept), NUNCA por la heurística —
     * las propuestas viven en exercise_milestone_proposals. Self-FK con
     * ON DELETE SET NULL: si el hito se borra, la variante vuelve a ser
     * hito (nunca queda una referencia colgante).
     */
    milestoneExerciseId: int("milestone_exercise_id").references(
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
    index("exercises_route_step_idx").on(table.route, table.progressionStep),
    index("exercises_canonical_idx").on(table.canonicalExerciseId),
    index("exercises_milestone_idx").on(table.milestoneExerciseId),
  ],
);

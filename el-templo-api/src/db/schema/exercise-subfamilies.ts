// Module: exercise-subfamilies — phase 124 (v5.1 Nuevo Sistema de Entrenamiento)
import { mysqlTable, int, varchar, index } from "drizzle-orm/mysql-core";

/**
 * Exercise sub-family catalog (gesto) — first-class node of the skill tree (D-01).
 *
 * Phase 124. One of the 3 orthogonal difficulty dimensions (gesto/palanca/
 * contracción). The sub-family is modeled as its own catalog table (not a
 * varchar on exercises) because the tree editor (128) reorders/groups/splits
 * them and the DAG graph (126) uses each row as a node. `exercises` references
 * a sub-family by nullable FK (`subfamily_id`).
 *
 * In phase 124 this catalog may be empty/minimal (D-10): this phase creates the
 * STRUCTURE; population is the LLM bootstrap (125) + coach normalization (128).
 *
 * `route` mirrors `exercises.route` width (varchar 20) so the FK/lookup domains
 * align across the family/área axis.
 */
export const exerciseSubfamilies = mysqlTable(
  "exercise_subfamilies",
  {
    id: int("id").primaryKey().autoincrement(),
    route: varchar("route", { length: 20 }).notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    sortOrder: int("sort_order").default(0).notNull(),
  },
  (table) => [index("exercise_subfamilies_route_idx").on(table.route)],
);

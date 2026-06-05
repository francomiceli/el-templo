import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  boolean,
} from "drizzle-orm/mysql-core";

export const routes = mysqlTable("routes", {
  id: int("id").primaryKey().autoincrement(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  displayName: varchar("display_name", { length: 100 }),
  /**
   * Excluida del árbol de fuerza (rework progresión-por-ruta): movilidad
   * (SPAGAT/BRIDGE/PIKE/HS/AF/HR) y games. Editable por el profe. El motor del DAG
   * y el árbol del miembro filtran por este flag.
   */
  excludedFromTree: boolean("excluded_from_tree").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  boolean,
} from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const routes = mysqlTable("routes", {
  id: int("id").primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
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

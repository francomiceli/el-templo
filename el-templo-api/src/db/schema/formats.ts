import {
  mysqlTable,
  int,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const formats = mysqlTable(
  "formats",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    // Fase 168 (CON-01): el nombre dejó de ser único global — la unique vive en
    // el callback de tabla como uq_formats_tenant_name (tenant_id, name).
    name: varchar("name", { length: 100 }).notNull(),
    type: varchar("type", { length: 50 }),
    description: varchar("description", { length: 255 }),
  },
  (table) => [
    index("formats_name_idx").on(table.name),
    // Fase 168 (CON-01): unicidad POR TENANT — el nombre del formato es único
    // dentro del gimnasio. No hace falta índice secundario de D-05: el lookup por
    // el valor pelado ya lo cubre formats_name_idx, que existe desde la 0001.
    // Índice byte-for-byte con la migración 0196.
    uniqueIndex("uq_formats_tenant_name").on(table.tenantId, table.name),
  ],
);

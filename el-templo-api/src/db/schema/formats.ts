import { mysqlTable, int, varchar, index } from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const formats = mysqlTable(
  "formats",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    type: varchar("type", { length: 50 }),
    description: varchar("description", { length: 255 }),
  },
  (table) => [index("formats_name_idx").on(table.name)],
);

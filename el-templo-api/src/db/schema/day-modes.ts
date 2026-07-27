import { mysqlTable, int, varchar, uniqueIndex } from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const dayModes = mysqlTable(
  "day_modes",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    dayOfWeek: int("day_of_week").notNull(), // 1=Mon, 2=Tue, ..., 6=Sat
    sessionMode: varchar("session_mode", { length: 10 })
      .default("regular")
      .notNull(),
  },
  (table) => [
    // Fase 168 (CON-01): unicidad POR TENANT — un modo por día de la semana POR
    // gimnasio. Sin índice secundario (D-06): day_modes tiene seis filas. Índice
    // byte-for-byte con la migración 0196.
    uniqueIndex("uq_day_modes_tenant_day_of_week").on(
      table.tenantId,
      table.dayOfWeek,
    ),
  ],
);

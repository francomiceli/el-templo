// Module: holidays
import {
  mysqlTable,
  int,
  varchar,
  date,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const holidays = mysqlTable(
  "holidays",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    country: varchar("country", { length: 2 }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Fase 168 (CON-01): unicidad POR TENANT — el feriado sigue siendo uno por
    // país y fecha, pero dentro del gimnasio. El nombre viejo empezaba con idx_
    // aunque era unique igual (0035_scheduling.sql); el nuevo lo dice. Sin índice
    // secundario (D-06). Índice byte-for-byte con la migración 0196.
    uniqueIndex("uq_holidays_tenant_country_date").on(
      table.tenantId,
      table.country,
      table.date,
    ),
  ],
);

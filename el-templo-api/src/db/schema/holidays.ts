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
    uniqueIndex("idx_holidays_country_date").on(table.country, table.date),
  ],
);

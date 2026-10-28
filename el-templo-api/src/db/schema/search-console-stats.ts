// Módulo: marketing — estadísticas de Google Search Console (fase 195, plan 09,
// D-21.2). Las llena el job semanal `jobs/marketing-google.ts`: un renglón por
// (página, consulta) del período [hoy - 9 días, hoy - 3 días]. Re-correr el
// mismo período no duplica: se borran las filas del tenant con ese
// `period_start`/`period_end` y se reinsertan en una transacción (no hay unique
// porque página + consulta no caben juntas en el límite de largo de un índice).
//
// Nace tenancy-native y STRICT en `src/db/tenant-tables.ts`
// (TENANT_STRICT_MODULES["marketing"]).
//
// El índice real de la base lleva un prefijo de 191 caracteres sobre `page`
// (Drizzle no expresa prefijos): ver la migración 0274.
import {
  mysqlTable,
  int,
  varchar,
  date,
  decimal,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const searchConsoleStats = mysqlTable(
  "search_console_stats",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    /** URL completa de la página tal como la informa Search Console. */
    page: varchar("page", { length: 500 }).notNull(),
    query: varchar("query", { length: 500 }),
    clicks: int("clicks").notNull(),
    impressions: int("impressions").notNull(),
    /** Fracción 0..1 (0.1234 = 12,34%). */
    ctr: decimal("ctr", { precision: 6, scale: 4, mode: "string" }).notNull(),
    /** Posición media (1 = primer resultado). */
    position: decimal("position", {
      precision: 6,
      scale: 2,
      mode: "string",
    }).notNull(),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_search_console_stats_tenant_period").on(
      table.tenantId,
      table.periodEnd,
      table.page,
    ),
  ],
);

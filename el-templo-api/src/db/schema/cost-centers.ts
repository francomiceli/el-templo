// Module: finance — phase 147 (centros de costo de egresos)
import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";

// Phase 147 (EGR-01) — catálogo de centros de costo por país. Cada egreso
// (kind='expense') se clasifica obligatoriamente en uno de estos rubros para
// reportar gasto más adelante (el reporte agrupado y el ABM desde UI quedan
// DIFERIDOS). Seedeado en AR (Alquiler Constitución / Librería / Viáticos
// profes / Varios — "Varios" es el escape obligatorio).
//
// `country` se modela como varchar(2) (NO enum), igual que branches.country —
// para no introducir un enum nuevo (decisión 7 del CONTEXT). El nombre de
// columna debe coincidir byte-for-byte con la migración 0161.
export const costCenters = mysqlTable(
  "cost_centers",
  {
    id: int("id").primaryKey().autoincrement(),
    name: varchar("name", { length: 100 }).notNull(),
    country: varchar("country", { length: 2 }).default("AR").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_cost_centers_country_active").on(table.country, table.isActive),
  ],
);

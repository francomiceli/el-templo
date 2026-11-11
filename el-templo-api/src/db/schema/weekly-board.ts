// Module: weekly-board — Tablero semanal de gerencia (fase 206, migración 0319).
//
// Dos tablas gym-owned que nacen strict (módulo `weekly-board`):
//   - weekly_board_snapshots: la foto congelada por semana y sede.
//   - weekly_board_leads: los leads que se cargan a mano por sede y semana.
import {
  mysqlTable,
  int,
  bigint,
  varchar,
  date,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { branches } from "./branches";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

/**
 * Foto semanal: una fila por (tenant, semana, sede).
 *
 * - Una fila por sede ACTIVA del tenant al cierre, física Y virtual. Las
 *   virtuales alimentan la columna informativa Online (D-25). Se guardan ceros
 *   explícitos para distinguir "0" de "sin foto".
 * - Guarda conteos CRUDOS (no porcentajes): los porcentajes se recalculan desde
 *   los conteos, sin promediar promedios (D-26).
 * - Dos sellos independientes (D-09, D-10): el bloque principal (caja, deuda,
 *   alumnos, vencen la semana que viene) se congela el lunes 00:05 AR
 *   (`main_closed_at`); el bloque tardío (embudo + renovaciones) se congela el
 *   viernes 00:05 AR, con 4 días de margen (`late_closed_at`).
 * - Los leads NO viven acá (D-24): están en `weekly_board_leads`.
 */
export const weeklyBoardSnapshots = mysqlTable(
  "weekly_board_snapshots",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 206: tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    // Lunes de la semana (fecha de Argentina), YYYY-MM-DD.
    weekStart: date("week_start", { mode: "string" }).notNull(),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),

    // Bloque principal (se congela el lunes 00:05 AR).
    cobrado: bigint("cobrado", { mode: "number" }),
    deudaCobrable: bigint("deuda_cobrable", { mode: "number" }),
    deudaMas10: bigint("deuda_mas_10", { mode: "number" }),
    deudaIncobrable: bigint("deuda_incobrable", { mode: "number" }),
    activos: int("activos"),
    vencenSemanaSiguiente: int("vencen_semana_siguiente"),
    mainClosedAt: timestamp("main_closed_at"),

    // Bloque tardío (se congela el viernes 00:05 AR).
    reservas: int("reservas"),
    reservasOcurridas: int("reservas_ocurridas"),
    asistieron: int("asistieron"),
    compraron: int("compraron"),
    compraronOcurridas: int("compraron_ocurridas"),
    compraronAsistieron: int("compraron_asistieron"),
    vencimientos: int("vencimientos"),
    renovaron: int("renovaron"),
    noRenueva: int("no_renueva"),
    volvioTarde: int("volvio_tarde"),
    sinContactar: int("sin_contactar"),
    lateClosedAt: timestamp("late_closed_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_weekly_board_snapshots_tenant_week_branch").on(
      table.tenantId,
      table.weekStart,
      table.branchId,
    ),
  ],
);

/**
 * Leads cargados a mano por sede y semana (D-04). Editables en la semana en
 * curso y en la anterior (D-24). No se copian a la foto.
 */
export const weeklyBoardLeads = mysqlTable(
  "weekly_board_leads",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 206: tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    leads: int("leads").notNull(),
    updatedBy: int("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_weekly_board_leads_tenant_branch_week").on(
      table.tenantId,
      table.branchId,
      table.weekStart,
    ),
  ],
);

export type WeeklyBoardSnapshotRow = typeof weeklyBoardSnapshots.$inferSelect;
export type WeeklyBoardLeadRow = typeof weeklyBoardLeads.$inferSelect;

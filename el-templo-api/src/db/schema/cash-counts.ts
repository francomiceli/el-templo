// Module: finance — Arqueos de caja (cierre de caja del profe, feedback
// caja/cobros 2026-09-08, brief de Nacho + decisión de Franco: opción A).
import {
  mysqlTable,
  int,
  decimal,
  text,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { cashRegisters } from "./cash-registers";
import { staffShifts } from "./staff-shifts";
import { tenantIdColumn } from "./tenant-column";

/**
 * Un arqueo es una OBSERVACIÓN: alguien contó la plata de una caja de
 * efectivo y el sistema guarda cuánto esperaba y cuánto había. NO toca el
 * ledger (`financial_transactions`): una diferencia queda registrada con su
 * nota y la decide gestión (ajuste manual si corresponde). Por eso las cifras
 * esperadas se guardan como SNAPSHOT (fondo, firme, pendiente): el saldo de la
 * caja sigue moviéndose después del conteo y el arqueo tiene que seguir
 * leyéndose como estaba en ese momento.
 *
 * "Esperado en el cajón" = fondo de cambio + saldo firme + cobros pendientes
 * de validación (la plata de un cobro del profe está en el cajón aunque
 * gestión no lo haya validado todavía). No hay turno mañana/tarde: cada arqueo
 * cubre lo cobrado desde el arqueo anterior de esa caja, y si nadie cerró antes
 * el siguiente lo incluye todo.
 */
export const cashCounts = mysqlTable(
  "cash_counts",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    cashRegisterId: int("cash_register_id")
      .notNull()
      .references(() => cashRegisters.id),
    countedBy: int("counted_by")
      .notNull()
      .references(() => users.id),
    // Jornada (Mi jornada) en la que se hizo el conteo, si se hizo al
    // check-out. NULL para un conteo suelto.
    staffShiftId: int("staff_shift_id").references(() => staffShifts.id),
    countedAt: timestamp("counted_at").defaultNow().notNull(),
    // Importes DECIMAL(14,2) en pesos/euros (fase 207, DI-01), no centavos enteros.
    changeFund: decimal("change_fund", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    firmeAmount: decimal("firme_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    pendienteAmount: decimal("pendiente_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    expectedAmount: decimal("expected_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    countedAmount: decimal("counted_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    /** counted − expected. Negativo = falta plata. */
    difference: decimal("difference", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    /** Cobros en efectivo cargados desde el arqueo anterior (informativo). */
    paymentsCount: int("payments_count").default(0).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_cash_counts_tenant_register_at").on(
      table.tenantId,
      table.cashRegisterId,
      table.countedAt,
    ),
  ],
);

export const cashCountsRelations = relations(cashCounts, ({ one }) => ({
  cashRegister: one(cashRegisters, {
    fields: [cashCounts.cashRegisterId],
    references: [cashRegisters.id],
  }),
  counter: one(users, {
    fields: [cashCounts.countedBy],
    references: [users.id],
  }),
}));

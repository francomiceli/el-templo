// Module: finance — gestión de deudas (brief-fran-reporte-deudas)
//
// Capa de GESTIÓN sobre una deuda del reporte "Por deuda": promesa de pago,
// observaciones de cobranza y estado operativo. Cuelga 1:1 de la fila de
// `balances` (la identidad única de una deuda) vía balance_id UNIQUE.
//
// La tabla `balances` es un cache del ledger y NO se toca (su único mutator
// es BalanceService.applyDelta) — por eso los campos de gestión viven acá.
// Una deuda sin gestión simplemente no tiene fila (LEFT JOIN + COALESCE
// status='activa' en el reporte).
//
// status:
// - 'activa'     default. Deuda vigente en gestión.
// - 'cobrada'    se pagó. Se setea AUTOMÁTICAMENTE cuando applyDelta lleva el
//                balance a <= 0 (y vuelve a 'activa' si un void lo re-abre).
// - 'incobrable' baja manual del total cobrable (fantasmas). El registro se
//                conserva — nunca se borra (trazabilidad si la persona vuelve).
//
// `notes` es el campo único de observaciones (fallback elegido en el brief
// §2.2): una línea por actualización, lo pisan las administrativas a mano.
import {
  mysqlTable,
  int,
  date,
  text,
  timestamp,
  mysqlEnum,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { balances } from "./balances";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

export const debtManagementStatusEnum = mysqlEnum("status", [
  "activa",
  "cobrada",
  "incobrable",
]);

export const debtManagement = mysqlTable(
  "debt_management",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    balanceId: int("balance_id")
      .references(() => balances.id)
      .notNull(),
    status: debtManagementStatusEnum.default("activa").notNull(),
    promisedPaymentDate: date("promised_payment_date", { mode: "string" }),
    notes: text("notes"),
    updatedBy: int("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("uniq_debt_management_balance").on(table.balanceId)],
);

export const debtManagementRelations = relations(debtManagement, ({ one }) => ({
  balance: one(balances, {
    fields: [debtManagement.balanceId],
    references: [balances.id],
  }),
  updatedByUser: one(users, {
    fields: [debtManagement.updatedBy],
    references: [users.id],
  }),
}));

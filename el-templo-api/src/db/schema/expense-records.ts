// Module: finance — Egresos (fase 209): gasto, reparto y pagos.
import {
  mysqlTable,
  int,
  varchar,
  char,
  text,
  date,
  decimal,
  json,
  mysqlEnum,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { branches } from "./branches";
import { cashRegisters } from "./cash-registers";
import { costCenters } from "./cost-centers";
import { financialTransactions } from "./financial-transactions";
import { tenantIdColumn } from "./tenant-column";

/**
 * Fase 209 (Egresos), migración 0331. Tres tablas gym-owned que nacen strict
 * (módulo `finance`): tenant_id NOT NULL DEFAULT 1 + FK, y todo UNIQUE empieza
 * por `tenantId`.
 *
 * - `expense_records`: el GASTO que carga administración (concepto, rubro,
 *   mes de imputación, importe). OJO con el vocabulario (DI-01): "expense
 *   record" es el gasto; `kind = 'expense'` en `financial_transactions` es la
 *   SALIDA DE PLATA de un pago. Un gasto puede tener varios pagos y cada pago
 *   crea su propia fila del ledger.
 * - `expense_allocations`: el reparto del gasto entre sedes. `branch_id` NULL
 *   significa Casa Matriz (no es una sede). La suma del reparto es exactamente
 *   el importe del gasto y eso lo valida el service (no hay unique por sede
 *   porque un NULL repetido no la atraparía).
 * - `expense_payments`: cada pago, con su cuenta de origen, el importe en la
 *   moneda de la cuenta y cuánto cancela del gasto (`applied_amount`, en la
 *   moneda del gasto).
 *
 * La plata va en ENTEROS (D-23): todo importe es `int`. El único decimal es
 * `fx_rate` (tipo de cambio cargado a mano), informativo: nunca se suma ni se
 * compara. En SQL crudo un DECIMAL llega como string, hay que envolverlo con
 * `Number()`.
 *
 * Los nombres físicos de columna, índices y uniques son byte-for-byte los de la
 * migración 0331.
 */

export const EXPENSE_AMOUNT_STATUSES = ["estimado", "confirmado"] as const;
export type ExpenseAmountStatus = (typeof EXPENSE_AMOUNT_STATUSES)[number];

/** Link de comprobante de un gasto (solo URLs, sin archivos). */
export interface ExpenseReceiptLink {
  label: string;
  url: string;
}

export const expenseRecords = mysqlTable(
  "expense_records",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    country: varchar("country", { length: 2 }).notNull(),
    concept: varchar("concept", { length: 200 }).notNull(),
    beneficiary: varchar("beneficiary", { length: 200 }),
    costCenterId: int("cost_center_id")
      .notNull()
      .references(() => costCenters.id),
    /** Mes de imputación `AAAA-MM`: separado de la fecha de pago. */
    imputationMonth: char("imputation_month", { length: 7 }).notNull(),
    amount: int("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    amountStatus: mysqlEnum("amount_status", [
      "estimado",
      "confirmado",
    ]).notNull(),
    /** Cotización de referencia (informativa). Obligatoria en AR con USD. */
    fxRate: decimal("fx_rate", { precision: 12, scale: 4, mode: "number" }),
    receiptLinks: json("receipt_links").$type<ExpenseReceiptLink[]>(),
    notes: text("notes"),
    idempotencyKey: varchar("idempotency_key", { length: 64 }),
    createdBy: int("created_by")
      .notNull()
      .references(() => users.id),
    voidedAt: timestamp("voided_at"),
    voidedBy: int("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_expense_records_tenant_idempotency").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    index("idx_expense_records_tenant_country_month").on(
      table.tenantId,
      table.country,
      table.imputationMonth,
    ),
    index("idx_expense_records_tenant_cost_center").on(
      table.tenantId,
      table.costCenterId,
    ),
  ],
);

export const expenseAllocations = mysqlTable(
  "expense_allocations",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    expenseRecordId: int("expense_record_id")
      .notNull()
      .references(() => expenseRecords.id, { onDelete: "cascade" }),
    /** NULL = Casa Matriz (destino de reparto que no es una sede). */
    branchId: int("branch_id").references(() => branches.id),
    amount: int("amount").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_expense_allocations_tenant_record").on(
      table.tenantId,
      table.expenseRecordId,
    ),
    index("idx_expense_allocations_tenant_branch").on(
      table.tenantId,
      table.branchId,
    ),
  ],
);

export const expensePayments = mysqlTable(
  "expense_payments",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    expenseRecordId: int("expense_record_id")
      .notNull()
      .references(() => expenseRecords.id),
    /** Fila `kind = 'expense'` del ledger que representa la salida de plata. */
    transactionId: int("transaction_id")
      .notNull()
      .references(() => financialTransactions.id),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    cashRegisterId: int("cash_register_id")
      .notNull()
      .references(() => cashRegisters.id),
    paymentMethod: varchar("payment_method", { length: 20 }).notNull(),
    /** Importe en la moneda de la cuenta de origen. */
    amount: int("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    /** Cuánto cancela del gasto, en la moneda del gasto. */
    appliedAmount: int("applied_amount").notNull(),
    fxRate: decimal("fx_rate", { precision: 12, scale: 4, mode: "number" }),
    /** Lo que salió expresado en pesos (entero, calculado una vez al guardar). */
    amountArs: int("amount_ars"),
    reference: varchar("reference", { length: 100 }),
    notes: text("notes"),
    idempotencyKey: varchar("idempotency_key", { length: 64 }),
    createdBy: int("created_by")
      .notNull()
      .references(() => users.id),
    voidedAt: timestamp("voided_at"),
    voidedBy: int("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_expense_payments_tenant_idempotency").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    uniqueIndex("uq_expense_payments_tenant_transaction").on(
      table.tenantId,
      table.transactionId,
    ),
    index("idx_expense_payments_tenant_record").on(
      table.tenantId,
      table.expenseRecordId,
    ),
    index("idx_expense_payments_tenant_paid_on").on(
      table.tenantId,
      table.paidOn,
    ),
    index("idx_expense_payments_tenant_register").on(
      table.tenantId,
      table.cashRegisterId,
    ),
  ],
);

export const expenseRecordsRelations = relations(
  expenseRecords,
  ({ one, many }) => ({
    costCenter: one(costCenters, {
      fields: [expenseRecords.costCenterId],
      references: [costCenters.id],
    }),
    creator: one(users, {
      fields: [expenseRecords.createdBy],
      references: [users.id],
      relationName: "expenseRecordCreator",
    }),
    allocations: many(expenseAllocations),
    payments: many(expensePayments),
  }),
);

export const expenseAllocationsRelations = relations(
  expenseAllocations,
  ({ one }) => ({
    record: one(expenseRecords, {
      fields: [expenseAllocations.expenseRecordId],
      references: [expenseRecords.id],
    }),
    branch: one(branches, {
      fields: [expenseAllocations.branchId],
      references: [branches.id],
    }),
  }),
);

export const expensePaymentsRelations = relations(
  expensePayments,
  ({ one }) => ({
    record: one(expenseRecords, {
      fields: [expensePayments.expenseRecordId],
      references: [expenseRecords.id],
    }),
    cashRegister: one(cashRegisters, {
      fields: [expensePayments.cashRegisterId],
      references: [cashRegisters.id],
    }),
    transaction: one(financialTransactions, {
      fields: [expensePayments.transactionId],
      references: [financialTransactions.id],
    }),
  }),
);

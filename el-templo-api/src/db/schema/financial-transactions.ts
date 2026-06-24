// Module: finance — phase 105
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  date,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { branches } from "./branches";
import { cashRegisters } from "./cash-registers";
import { transactionLinks } from "./transaction-links";

// D-05: enums declared inline on the column. TS literals are inferred from
// $inferSelect downstream (see modules/finance/types.ts). Single source of truth.
export const financialTransactions = mysqlTable(
  "financial_transactions",
  {
    id: int("id").primaryKey().autoincrement(),
    memberId: int("member_id")
      .references(() => users.id)
      .notNull(),
    kind: mysqlEnum("kind", [
      "plan_charge",
      "debt_settlement",
      "refund",
      "adjustment",
      "advance_payment",
    ]).notNull(),
    direction: mysqlEnum("direction", ["inflow", "outflow"]).notNull(),
    amount: int("amount").notNull(),
    currency: varchar("currency", { length: 3 }).default("ARS").notNull(),
    paymentMethod: mysqlEnum("payment_method", [
      "cash",
      "transfer",
      "card",
      "aura_credit",
      "internal",
    ]).notNull(),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    // Phase 138: caja a la que fue la plata (D-04). NULLABLE — NULL para
    // aura_credit/internal (no es plata firme de caja) e históricos sin
    // backfillear. branchId (dónde se cobró) NO mapea 1:1 con cash_register_id
    // (adónde fue la plata): p.ej. una transferencia cobrada en Jujuy cae en
    // la caja banco de la moneda, no en la caja de Jujuy.
    cashRegisterId: int("cash_register_id").references(() => cashRegisters.id),
    recordedBy: int("recorded_by")
      .references(() => users.id)
      .notNull(),
    voidedAt: timestamp("voided_at"),
    voidedBy: int("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
    // Phase 137: validation state machine, ORTHOGONAL to the soft-void axis
    // above. ANULADO stays as voidedAt IS NOT NULL; this enum is a separate
    // axis. Order MUST match migration 0153 byte-for-byte (enum drift = CI
    // "Unknown column" that tsc cannot detect). DEFAULT 'validado' backfills
    // all existing rows so the 6 v5.0 metrics keep identical numbers (VAL-05).
    validationStatus: mysqlEnum("validation_status", [
      "pendiente",
      "observado",
      "corregido",
      "validado",
    ])
      .default("validado")
      .notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_financial_tx_member_id").on(table.memberId),
    index("idx_financial_tx_transaction_date").on(table.transactionDate),
    index("idx_financial_tx_branch_date").on(
      table.branchId,
      table.transactionDate,
    ),
    index("idx_financial_tx_kind_voided").on(table.kind, table.voidedAt),
    // Phase 137: firm-money read path (validation_status='validado' AND voided_at IS NULL).
    index("idx_financial_tx_validation_voided").on(
      table.validationStatus,
      table.voidedAt,
    ),
    // Phase 138: backs the per-caja SUM with the cutoff range in getBalance
    // (cash_register_id = X AND transaction_date >= cutoff_date).
    index("idx_financial_tx_cash_register").on(
      table.cashRegisterId,
      table.transactionDate,
    ),
  ],
);

export const financialTransactionsRelations = relations(
  financialTransactions,
  ({ one, many }) => ({
    member: one(users, {
      fields: [financialTransactions.memberId],
      references: [users.id],
      relationName: "financialTxMember",
    }),
    recorder: one(users, {
      fields: [financialTransactions.recordedBy],
      references: [users.id],
      relationName: "financialTxRecorder",
    }),
    voider: one(users, {
      fields: [financialTransactions.voidedBy],
      references: [users.id],
      relationName: "financialTxVoider",
    }),
    branch: one(branches, {
      fields: [financialTransactions.branchId],
      references: [branches.id],
    }),
    cashRegister: one(cashRegisters, {
      fields: [financialTransactions.cashRegisterId],
      references: [cashRegisters.id],
    }),
    links: many(transactionLinks),
  }),
);

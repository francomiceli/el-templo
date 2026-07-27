// Module: finance — phase 105
// Phase 112 D-13: target_kind enum extended with 'enrollment' so admin
// add-on charges can link a financial_transaction to a program_enrollments
// row directly (preserves Phase 105-04 D-01 canonical revenue filter by
// reusing kind='plan_charge').
import {
  mysqlTable,
  int,
  timestamp,
  mysqlEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { financialTransactions } from "./financial-transactions";
import { tenantIdColumn } from "./tenant-column";

// Pivot table linking a financial_transaction to N concept rows (subscription,
// debt_balance, transaction). target_id intentionally has NO `.references(...)`
// — heterogeneous FK target by `target_kind` is enforced at the service layer
// per SPEC §7.
export const transactionLinks = mysqlTable(
  "transaction_links",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    transactionId: int("transaction_id")
      .references(() => financialTransactions.id)
      .notNull(),
    targetKind: mysqlEnum("target_kind", [
      "subscription",
      "debt_balance",
      "transaction",
      "enrollment",
    ]).notNull(),
    targetId: int("target_id").notNull(),
    allocatedAmount: int("allocated_amount").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uniq_tx_target").on(
      table.transactionId,
      table.targetKind,
      table.targetId,
    ),
    index("idx_tx_links_target").on(table.targetKind, table.targetId),
  ],
);

export const transactionLinksRelations = relations(
  transactionLinks,
  ({ one }) => ({
    transaction: one(financialTransactions, {
      fields: [transactionLinks.transactionId],
      references: [financialTransactions.id],
    }),
  }),
);

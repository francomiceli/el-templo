// Module: finance — phase 105
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

// Pivot table linking a financial_transaction to N concept rows (subscription,
// debt_balance, transaction). target_id intentionally has NO `.references(...)`
// — heterogeneous FK target by `target_kind` is enforced at the service layer
// per SPEC §7.
export const transactionLinks = mysqlTable(
  "transaction_links",
  {
    id: int("id").primaryKey().autoincrement(),
    transactionId: int("transaction_id")
      .references(() => financialTransactions.id)
      .notNull(),
    targetKind: mysqlEnum("target_kind", [
      "subscription",
      "debt_balance",
      "transaction",
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

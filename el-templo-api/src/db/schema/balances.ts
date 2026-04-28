// Module: finance — phase 105
import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// Cache table mirrored from financial_transactions + transaction_links.
// Maintained atomically inside the same DB transaction as the ledger
// inserts (BalanceService.applyDelta). UNIQUE on (member_id, target_kind,
// target_id, currency) per SPEC §3.
//
// D-08: `amount` is signed. Positive = member owes; negative = saldo a
// favor; zero = saldado. Rows with amount=0 are kept (D-07) for audit and
// to simplify void reversal.
export const balances = mysqlTable(
  "balances",
  {
    id: int("id").primaryKey().autoincrement(),
    memberId: int("member_id")
      .references(() => users.id)
      .notNull(),
    targetKind: mysqlEnum("target_kind", [
      "subscription",
      "debt_balance",
    ]).notNull(),
    targetId: int("target_id").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    amount: int("amount").notNull(),
    lastRecomputedAt: timestamp("last_recomputed_at")
      .defaultNow()
      .onUpdateNow()
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uniq_balance_target").on(
      table.memberId,
      table.targetKind,
      table.targetId,
      table.currency,
    ),
    index("idx_balances_member").on(table.memberId),
    index("idx_balances_amount_member").on(table.amount, table.memberId),
  ],
);

export const balancesRelations = relations(balances, ({ one }) => ({
  member: one(users, {
    fields: [balances.memberId],
    references: [users.id],
  }),
}));

// Module: debts (Phase 101)
import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

/**
 * Debts table (Phase 101).
 *
 * Note: "One active (non-cancelled) debt per user" is enforced at the
 * service layer. MySQL does not support partial unique indexes, so we
 * cannot use a DB-level constraint that only applies to rows where
 * is_cancelled = FALSE. The `idx_debts_user_active` composite index
 * supports the efficient lookup the service performs on every upsert.
 *
 * Soft-cancel semantics: when admin destilda the "Deudor" toggle, the
 * service sets is_cancelled = TRUE and cancelled_at = NOW(). Never
 * DELETE FROM debts — history is preserved for a future accounting phase.
 */
export const debts = mysqlTable(
  "debts",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    amount: int("amount").notNull(),
    currency: varchar("currency", { length: 3 }).default("ARS").notNull(),
    note: text("note"),
    isCancelled: boolean("is_cancelled").default(false).notNull(),
    cancelledAt: timestamp("cancelled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_debts_user_id").on(table.userId),
    index("idx_debts_user_active").on(table.userId, table.isCancelled),
  ],
);

export const debtsRelations = relations(debts, ({ one }) => ({
  user: one(users, {
    fields: [debts.userId],
    references: [users.id],
  }),
}));

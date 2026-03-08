// Module: aura
import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const sourceTypeEnum = mysqlEnum("source_type", [
  "training_completion",
  "attendance",
  "streak_bonus",
  "referral",
  "subscription_discount",
  "manual_adjustment",
  "challenge",
  "social",
]);

export const auraTransactions = mysqlTable(
  "aura_transactions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    sourceType: sourceTypeEnum.notNull(),
    amount: int("amount").notNull(),
    referenceType: varchar("reference_type", { length: 50 }),
    referenceId: int("reference_id"),
    description: varchar("description", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("unique_user_source_ref").on(
      table.userId,
      table.sourceType,
      table.referenceType,
      table.referenceId,
    ),
  ],
);

export const auraTransactionsRelations = relations(
  auraTransactions,
  ({ one }) => ({
    user: one(users, {
      fields: [auraTransactions.userId],
      references: [users.id],
    }),
  }),
);

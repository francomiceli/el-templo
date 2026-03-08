// Module: aura
import { mysqlTable, int, timestamp } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const auraBalances = mysqlTable("aura_balances", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id")
    .references(() => users.id)
    .notNull()
    .unique(),
  balance: int("balance").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const auraBalancesRelations = relations(auraBalances, ({ one }) => ({
  user: one(users, {
    fields: [auraBalances.userId],
    references: [users.id],
  }),
}));

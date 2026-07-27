// Module: aura
import { mysqlTable, int, timestamp } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

export const auraBalances = mysqlTable("aura_balances", {
  id: int("id").primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
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

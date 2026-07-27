import { mysqlTable, int, timestamp, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

/**
 * Login tracking table for behavioral segmentation.
 * Records each /auth/me call as a lightweight login event.
 * Used to detect Digital Warrior (high app usage, low attendance)
 * and Ghost (no activity at all) segments.
 */
export const memberLogins = mysqlTable(
  "member_logins",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    loggedInAt: timestamp("logged_in_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_member_logins_user_date").on(table.userId, table.loggedInAt),
  ],
);

export const memberLoginsRelations = relations(memberLogins, ({ one }) => ({
  user: one(users, {
    fields: [memberLogins.userId],
    references: [users.id],
  }),
}));

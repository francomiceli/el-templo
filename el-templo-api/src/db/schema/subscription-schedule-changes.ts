// Module: subscription-schedule-changes
import {
  mysqlTable,
  int,
  json,
  text,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { subscriptions } from "./subscriptions";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

/**
 * Audit trail for fixed-plan schedule changes.
 * One row per admin-driven change to a subscription's fixed turnos.
 */
export const subscriptionScheduleChanges = mysqlTable(
  "subscription_schedule_changes",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    subscriptionId: int("subscription_id")
      .references(() => subscriptions.id)
      .notNull(),
    actorId: int("actor_id")
      .references(() => users.id)
      .notNull(),
    oldScheduleIds: json("old_schedule_ids").$type<number[]>().notNull(),
    newScheduleIds: json("new_schedule_ids").$type<number[]>().notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_sub_schedule_changes_sub_id").on(table.subscriptionId),
  ],
);

export const subscriptionScheduleChangesRelations = relations(
  subscriptionScheduleChanges,
  ({ one }) => ({
    subscription: one(subscriptions, {
      fields: [subscriptionScheduleChanges.subscriptionId],
      references: [subscriptions.id],
    }),
    actor: one(users, {
      fields: [subscriptionScheduleChanges.actorId],
      references: [users.id],
    }),
  }),
);

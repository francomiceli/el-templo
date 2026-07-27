// Module: subscription-schedules
import {
  mysqlTable,
  int,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { subscriptions } from "./subscriptions";
import { schedules } from "./schedules";
import { tenantIdColumn } from "./tenant-column";

/**
 * Junction table linking subscriptions to specific schedule slots.
 * Used by fixed-mode plans to define which class slots the member is assigned to.
 */
export const subscriptionSchedules = mysqlTable(
  "subscription_schedules",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    subscriptionId: int("subscription_id")
      .references(() => subscriptions.id)
      .notNull(),
    scheduleId: int("schedule_id")
      .references(() => schedules.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_sub_schedule").on(table.subscriptionId, table.scheduleId),
    index("idx_subscription_schedules_sub_id").on(table.subscriptionId),
  ],
);

export const subscriptionSchedulesRelations = relations(
  subscriptionSchedules,
  ({ one }) => ({
    subscription: one(subscriptions, {
      fields: [subscriptionSchedules.subscriptionId],
      references: [subscriptions.id],
    }),
    schedule: one(schedules, {
      fields: [subscriptionSchedules.scheduleId],
      references: [schedules.id],
    }),
  }),
);

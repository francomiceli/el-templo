// Module: schedules
import {
  mysqlTable,
  int,
  varchar,
  tinyint,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { branches } from "./branches";
import { activities } from "./activities";
import { bookings } from "./bookings";

export const schedules = mysqlTable(
  "schedules",
  {
    id: int("id").primaryKey().autoincrement(),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    activityId: int("activity_id")
      .references(() => activities.id)
      .notNull(),
    dayOfWeek: tinyint("day_of_week").notNull(), // 1=Monday..6=Saturday (ISO)
    startTime: varchar("start_time", { length: 5 }).notNull(), // HH:MM
    endTime: varchar("end_time", { length: 5 }).notNull(), // HH:MM
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_schedules_branch_day_time").on(
      table.branchId,
      table.dayOfWeek,
      table.startTime,
    ),
  ],
);

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  branch: one(branches, {
    fields: [schedules.branchId],
    references: [branches.id],
  }),
  activity: one(activities, {
    fields: [schedules.activityId],
    references: [activities.id],
  }),
  bookings: many(bookings),
}));

// Module: schedule-exceptions
import {
  mysqlTable,
  int,
  varchar,
  date,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { schedules } from "./schedules";

/**
 * Per-date cancellation of a recurring schedule slot.
 *
 * `schedules` rows are weekly templates with no date dimension — before this
 * table, the only cancellation primitive was deactivating the whole template
 * (all weeks). One row here = "this slot does NOT run on this specific date",
 * leaving every other week untouched.
 *
 * `created_at` doubles as the restore cutoff: bookings auto-cancelled by the
 * exception have cancelledAt >= created_at, so undoing the exception can
 * restore exactly those bookings without resurrecting member-initiated
 * cancellations from before it.
 */
export const scheduleExceptions = mysqlTable(
  "schedule_exceptions",
  {
    id: int("id").primaryKey().autoincrement(),
    scheduleId: int("schedule_id")
      .references(() => schedules.id)
      .notNull(),
    exceptionDate: date("exception_date", { mode: "string" }).notNull(),
    reason: varchar("reason", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_schedule_exceptions_schedule_date").on(
      table.scheduleId,
      table.exceptionDate,
    ),
  ],
);

export const scheduleExceptionsRelations = relations(
  scheduleExceptions,
  ({ one }) => ({
    schedule: one(schedules, {
      fields: [scheduleExceptions.scheduleId],
      references: [schedules.id],
    }),
  }),
);

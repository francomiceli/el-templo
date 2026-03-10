// Module: bookings
import {
  mysqlTable,
  int,
  date,
  timestamp,
  mysqlEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { schedules } from "./schedules";

export const bookingStatusEnum = mysqlEnum("booking_status", [
  "confirmed",
  "cancelled",
  "waitlist",
  "no_show",
]);

export const bookings = mysqlTable(
  "bookings",
  {
    id: int("id").primaryKey().autoincrement(),
    memberId: int("member_id")
      .references(() => users.id)
      .notNull(),
    scheduleId: int("schedule_id")
      .references(() => schedules.id)
      .notNull(),
    bookingDate: date("booking_date", { mode: "string" }).notNull(),
    status: bookingStatusEnum.default("confirmed").notNull(),
    waitlistPosition: int("waitlist_position"),
    bookedAt: timestamp("booked_at").defaultNow().notNull(),
    cancelledAt: timestamp("cancelled_at"),
  },
  (table) => [
    index("idx_bookings_schedule_date_status").on(
      table.scheduleId,
      table.bookingDate,
      table.status,
    ),
    index("idx_bookings_member_date").on(table.memberId, table.bookingDate),
    uniqueIndex("idx_bookings_member_schedule_date").on(
      table.memberId,
      table.scheduleId,
      table.bookingDate,
    ),
  ],
);

export const bookingsRelations = relations(bookings, ({ one }) => ({
  member: one(users, {
    fields: [bookings.memberId],
    references: [users.id],
  }),
  schedule: one(schedules, {
    fields: [bookings.scheduleId],
    references: [schedules.id],
  }),
}));

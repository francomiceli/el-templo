// Module: attendance
import {
  mysqlTable,
  int,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { branches } from "./branches";
import { schedules } from "./schedules";

export const attendanceStatusEnum = mysqlEnum("attendance_status", [
  "registrado",
  "confirmado",
]);

export const attendanceSourceEnum = mysqlEnum("attendance_source", [
  "qr",
  "manual",
]);

export const attendance = mysqlTable(
  "attendance",
  {
    id: int("id").primaryKey().autoincrement(),
    memberId: int("member_id")
      .references(() => users.id)
      .notNull(),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    scheduleId: int("schedule_id").references(() => schedules.id),
    checkedInAt: timestamp("checked_in_at").defaultNow().notNull(),
    confirmedAt: timestamp("confirmed_at"),
    status: attendanceStatusEnum.default("registrado").notNull(),
    source: attendanceSourceEnum.default("qr").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_attendance_member_checked_in").on(
      table.memberId,
      table.checkedInAt,
    ),
    index("idx_attendance_branch_checked_in").on(
      table.branchId,
      table.checkedInAt,
    ),
  ],
);

export const attendanceRelations = relations(attendance, ({ one }) => ({
  member: one(users, {
    fields: [attendance.memberId],
    references: [users.id],
  }),
  branch: one(branches, {
    fields: [attendance.branchId],
    references: [branches.id],
  }),
  schedule: one(schedules, {
    fields: [attendance.scheduleId],
    references: [schedules.id],
  }),
}));

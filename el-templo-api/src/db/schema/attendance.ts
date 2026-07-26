// Module: attendance
import {
  mysqlTable,
  int,
  date,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { branches } from "./branches";
import { schedules } from "./schedules";

export const attendanceStatusEnum = mysqlEnum("attendance_status", [
  "confirmado",
]);

// Integración Wellhub (2026-07, migración 0186): 'wellhub' = visita validada
// vía Access Control API (webhook checkin + POST /access/v1/validate). Estas
// visitas NO descuentan classesRemaining, NO otorgan AURA y NO registran
// completed_sessions. Append-last, byte-idéntico al ALTER de la 0186.
export const attendanceSourceEnum = mysqlEnum("attendance_source", [
  "qr",
  "manual",
  "wellhub",
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
    sessionDate: date("session_date", { mode: "string" }).notNull(),
    checkedInAt: timestamp("checked_in_at").defaultNow().notNull(),
    status: attendanceStatusEnum.default("confirmado").notNull(),
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
    index("idx_attendance_schedule_session_date").on(
      table.scheduleId,
      table.sessionDate,
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

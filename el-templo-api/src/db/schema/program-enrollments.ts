// Module: programs
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { programs } from "./micro-programs";

export const programEnrollmentStatusEnum = mysqlEnum("status", [
  "active",
  "completed",
  "expired",
  "cancelled",
]);

export const programEnrollments = mysqlTable(
  "program_enrollments",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    programId: int("program_id")
      .references(() => programs.id)
      .notNull(),
    status: programEnrollmentStatusEnum.default("active").notNull(),
    currentWeek: int("current_week").default(1).notNull(),
    sessionsCompletedThisWeek: int("sessions_completed_this_week")
      .default(0)
      .notNull(),
    weekUnlockedAt: timestamp("week_unlocked_at"),
    enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    expiredAt: timestamp("expired_at"),
    cancelledAt: timestamp("cancelled_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_enrollments_user_id").on(table.userId),
    index("idx_enrollments_program_id").on(table.programId),
    index("idx_enrollments_status").on(table.status),
  ],
);

export const programEnrollmentsRelations = relations(
  programEnrollments,
  ({ one }) => ({
    user: one(users, {
      fields: [programEnrollments.userId],
      references: [users.id],
    }),
    program: one(programs, {
      fields: [programEnrollments.programId],
      references: [programs.id],
    }),
  }),
);

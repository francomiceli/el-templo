// Module: class-coach-assignments
//
// Phase 143 (PROF-DATA): roster that assigns ONE coach per (branch, day, slot).
// This is the SINGLE source of attribution for post-class ratings (D-A1, D-Q1).
// The composite uniqueIndex enforces, at the DB engine level, at most one
// change-point per slot per week (D-A2).
//
// EFFECTIVE-DATED (Phase roster-effective-dated): a row is a CHANGE-POINT, not a
// per-week snapshot. `weekStartDate` is the Monday of the ISO week from which
// that coach takes effect, and each (branch, day, slot) inherits the coach of
// the most recent change-point whose week is <= the week being read. So a slot
// keeps its coach forward in time until a later change-point supersedes it, and
// a single row represents "this coach from here on". Invariant maintained by the
// write path: no two consecutive change-points (by week, per slot) share a
// coach. Change-points are only ever added from the current week onward — past
// rows are immutable so historical attribution stays frozen (rating rows also
// snapshot coachId at submit time, so history is doubly safe).
// `slot` is the turn derived from a schedule's startTime (< "12:00" = morning).
import {
  mysqlTable,
  int,
  tinyint,
  date,
  timestamp,
  mysqlEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { branches } from "./branches";

export const classCoachSlotEnum = mysqlEnum("slot", ["morning", "afternoon"]);

export const classCoachAssignments = mysqlTable(
  "class_coach_assignments",
  {
    id: int("id").primaryKey().autoincrement(),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    weekStartDate: date("week_start_date", { mode: "string" }).notNull(), // Monday of the ISO week
    dayOfWeek: tinyint("day_of_week").notNull(), // 1=Monday..6=Saturday (ISO)
    slot: classCoachSlotEnum.notNull(), // morning when startTime < "12:00", else afternoon (D-A1)
    coachId: int("coach_id")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("class_coach_assignment_unique").on(
      table.branchId,
      table.weekStartDate,
      table.dayOfWeek,
      table.slot,
    ),
    index("idx_class_coach_assignments_coach").on(table.coachId),
  ],
);

export const classCoachAssignmentsRelations = relations(
  classCoachAssignments,
  ({ one }) => ({
    branch: one(branches, {
      fields: [classCoachAssignments.branchId],
      references: [branches.id],
    }),
    coach: one(users, {
      fields: [classCoachAssignments.coachId],
      references: [users.id],
    }),
  }),
);

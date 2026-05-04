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
import { subscriptions } from "./subscriptions";

export const programEnrollmentStatusEnum = mysqlEnum("status", [
  "active",
  "completed",
  "expired",
  "cancelled",
  "paused",
]);

/**
 * Phase 112 D-01: classification of how this enrollment was created.
 *  - plan_linked: derived from the user's subscription plan via
 *    subscription_plans.linked_program_id (one program per plan).
 *  - plan_bundle: derived from a subscription plan with grants_all_programs=true
 *    (the "Todos los Programas" bundle introduced in phase 104).
 *  - admin_addon: assigned manually by an admin via the add-on endpoint
 *    (POST /api/admin/users/:userId/program-addons). May carry pricePaid.
 */
export const programEnrollmentSourceEnum = mysqlEnum("source", [
  "plan_linked",
  "plan_bundle",
  "admin_addon",
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
    // Phase 112 add-on columns. `source` is NOT NULL post-migration — every
    // existing row is backfilled by 0111_program_enrollments_addon_columns.sql
    // before the column flips to NOT NULL. No DB-level default: callers MUST
    // pass an explicit source so the classification is deterministic.
    source: programEnrollmentSourceEnum.notNull(),
    pricePaid: int("price_paid"),
    assignedBy: int("assigned_by").references(() => users.id),
    subscriptionId: int("subscription_id").references(() => subscriptions.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_enrollments_user_id").on(table.userId),
    index("idx_enrollments_program_id").on(table.programId),
    index("idx_enrollments_status").on(table.status),
    index("idx_enrollments_subscription_id").on(table.subscriptionId),
    index("idx_enrollments_source").on(table.source),
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

// Module: subscriptions (multi-program access per plan, PLAN-03 / D-06)
import { mysqlTable, int, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { subscriptionPlans } from "./subscription-plans";
import { programs } from "./micro-programs";

/**
 * Join table: a subscription plan grants access to an explicit list of
 * programs (D-06). `grants_all_programs` keeps priority — when true the plan
 * unlocks every active program and this list is ignored; when false the list
 * here IS the access set (empty = none, current behavior).
 *
 * The composite UNIQUE prevents duplicate (plan, program) pairs; per-column
 * indexes back the two lookup directions (all programs of a plan / all plans
 * of a program). FKs default to RESTRICT — a plan/program in use cannot be
 * hard-deleted out from under a live grant.
 */
export const planPrograms = mysqlTable(
  "plan_programs",
  {
    id: int("id").primaryKey().autoincrement(),
    subscriptionPlanId: int("subscription_plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    programId: int("program_id")
      .notNull()
      .references(() => programs.id),
  },
  (table) => [
    uniqueIndex("plan_program_unique").on(
      table.subscriptionPlanId,
      table.programId,
    ),
    index("idx_plan_programs_plan_id").on(table.subscriptionPlanId),
    index("idx_plan_programs_program_id").on(table.programId),
  ],
);

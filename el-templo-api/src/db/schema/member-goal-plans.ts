import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/mysql-core";
import { users } from "./users";

export const memberGoalPlans = mysqlTable(
  "member_goal_plans",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    goalPlanType: varchar("goal_plan_type", { length: 30 }).notNull(),
    semana20: int("semana_20").notNull().default(1),
    semana40: int("semana_40").notNull().default(1),
    semana60: int("semana_60").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => [
    index("member_goal_plans_user_active_idx").on(table.userId, table.isActive),
  ],
);

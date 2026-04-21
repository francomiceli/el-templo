import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  json,
  text,
  index,
  mysqlEnum,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { branches } from "./branches";

export const completedSessions = mysqlTable(
  "completed_sessions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    dayId: varchar("day_id", { length: 50 }).notNull(), // W1-lunes-sigma or J-empuje-W1-lunes-sigma
    // Level the session was played at (parsed from day_id suffix). May differ
    // from the user's current users.level when a member trains at a level
    // they selected in the header dropdown.
    levelAtCompletion: mysqlEnum("level_at_completion", [
      "alfa",
      "delta",
      "sigma",
      "omega",
      "spartan",
    ]).notNull(),
    date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
    branchId: int("branch_id")
      .notNull()
      .references(() => branches.id),
    startedAt: timestamp("started_at").notNull(),
    completedAt: timestamp("completed_at").notNull(),
    rpe: int("rpe"), // 1-10, nullable (optional)
    notes: text("notes"), // Optional free text
    blocksCompleted: json("blocks_completed").notNull(), // Array of block role strings
    exercisesCompleted: json("exercises_completed"), // Nullable - { "NUCLEUS": [123, 456], ... } maps block role to prescription IDs

    // Goal plan support: null = general Entrenamiento, non-null = goal plan type code
    goalPlanType: varchar("goal_plan_type", { length: 30 }),
    // Duration played in minutes; null for general sessions
    duration: int("duration"),
  },
  (table) => [
    index("completed_sessions_user_idx").on(table.userId),
    index("completed_sessions_date_idx").on(table.date),
    index("completed_sessions_branch_idx").on(table.branchId),
  ],
);

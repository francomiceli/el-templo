import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  json,
  index,
  boolean,
} from "drizzle-orm/mysql-core";
import { users } from "./users";

export const sessions = mysqlTable(
  "sessions",
  {
    id: int("id").primaryKey().autoincrement(),
    dayId: varchar("day_id", { length: 50 }).notNull().unique(), // W1-lunes-sigma or J-empuje-W1-lunes-sigma
    week: int("week").notNull(),
    day: varchar("day", { length: 20 }).notNull(), // lunes, martes, etc
    levelGroup: varchar("level_group", { length: 20 }).notNull(), // alfa_delta, sigma, omega
    blockCount: int("block_count").notNull(),
    traceJson: json("trace_json"), // Full trace for debugging
    createdAt: timestamp("created_at").defaultNow(),

    // Goal plan support: null = general Entrenamiento, non-null = goal plan type code
    goalPlanType: varchar("goal_plan_type", { length: 30 }),

    // Session mode: 'regular' (default SPOM) or 'rom' (mobility-focused)
    sessionMode: varchar("session_mode", { length: 10 })
      .default("regular")
      .notNull(),

    // Admin workflow columns
    status: varchar("status", { length: 20 })
      .default("pending_review")
      .notNull(),
    approvedAt: timestamp("approved_at"),
    approvedBy: int("approved_by").references(() => users.id),
    approvedBySystem: boolean("approved_by_system").default(false),

    // Session editing: stores original algorithm output for revert capability
    algorithmSnapshot: json("algorithm_snapshot"),
  },
  (table) => [
    index("sessions_week_day_level_idx").on(
      table.week,
      table.day,
      table.levelGroup,
    ),
    index("sessions_status_idx").on(table.status),
  ],
);

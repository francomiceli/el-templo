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
import { tenantIdColumn } from "./tenant-column";

export const completedSessions = mysqlTable(
  "completed_sessions",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    dayId: varchar("day_id", { length: 50 }).notNull(), // W1-lunes-sigma or J-empuje-W1-lunes-sigma
    // Level the session was played at (parsed from day_id suffix). May differ
    // from the user's current users.level when a member trains at a level
    // they selected in the header dropdown.
    // Phase 129 (KAIROS-01): kept in lock-step with users.level (kairos first).
    // A kairos member's presencial check-in snapshots level='kairos' here, so
    // this enum must accept it. Widened additively by migration 0140; this
    // column has no DEFAULT (always set explicitly at insert).
    sessionLevel: mysqlEnum("session_level", [
      "kairos",
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

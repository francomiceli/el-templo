import { mysqlTable, int, varchar, json, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { sessions } from "./sessions";

export const sessionBlocks = mysqlTable(
  "session_blocks",
  {
    id: int("id").primaryKey().autoincrement(),
    sessionId: int("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    blockId: varchar("block_id", { length: 100 }).notNull(),
    role: varchar("role", { length: 20 }).notNull(), // INITIUM, NUCLEUS, etc
    route: varchar("route", { length: 20 }).notNull(),
    pattern: varchar("pattern", { length: 150 }).notNull(),
    intensity: int("intensity").notNull(),
    repsBudget: int("reps_budget").notNull(),
    formatId: int("format_id").notNull(),
    formatName: varchar("format_name", { length: 50 }).notNull(),
    exerciseCount: int("exercise_count").notNull(),
    sortOrder: int("sort_order").notNull(), // 0-4 for block ordering

    // Format-specific parameters (EMOM interval, AMRAP time cap, Complex rounds, etc.)
    formatParams: json("format_params"),

    // Optional custom title for INITIUM blocks (Phase 100 — games format).
    // When set and role=INITIUM, the PDF subtitle renders as just {customTitle}
    // instead of "INITIUM · {formatName}". Nullable — existing blocks unaffected.
    customTitle: varchar("custom_title", { length: 100 }),
  },
  (table) => [index("session_blocks_session_idx").on(table.sessionId)],
);

export const sessionBlocksRelations = relations(sessionBlocks, ({ one }) => ({
  session: one(sessions, {
    fields: [sessionBlocks.sessionId],
    references: [sessions.id],
  }),
}));

// Module: programs
import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { exercises } from "./exercises";

export const contentBlockTypeEnum = mysqlEnum("block_type", [
  "video",
  "text",
  "pdf",
  "exercise",
]);

export const microPrograms = mysqlTable("micro_programs", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  goalPlanType: varchar("goal_plan_type", { length: 30 }),
  price: int("price").notNull(),
  durationWeeks: int("duration_weeks").notNull(),
  sessionsPerWeekToAdvance: int("sessions_per_week_to_advance")
    .notNull()
    .default(3),
  auraWeeklyBonus: int("aura_weekly_bonus").default(15),
  auraCompletionBonus: int("aura_completion_bonus").default(100),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const microProgramContentBlocks = mysqlTable(
  "micro_program_content_blocks",
  {
    id: int("id").primaryKey().autoincrement(),
    programId: int("program_id")
      .references(() => microPrograms.id)
      .notNull(),
    weekNumber: int("week_number").notNull(),
    sortOrder: int("sort_order").notNull().default(0),
    blockType: contentBlockTypeEnum.notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    content: text("content"),
    videoUrl: varchar("video_url", { length: 500 }),
    exerciseId: int("exercise_id").references(() => exercises.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_content_blocks_program_week").on(
      table.programId,
      table.weekNumber,
    ),
  ],
);

export const microProgramsRelations = relations(microPrograms, ({ many }) => ({
  contentBlocks: many(microProgramContentBlocks),
}));

export const microProgramContentBlocksRelations = relations(
  microProgramContentBlocks,
  ({ one }) => ({
    program: one(microPrograms, {
      fields: [microProgramContentBlocks.programId],
      references: [microPrograms.id],
    }),
    exercise: one(exercises, {
      fields: [microProgramContentBlocks.exerciseId],
      references: [exercises.id],
    }),
  }),
);

import { mysqlTable, int, varchar } from 'drizzle-orm/mysql-core';

export const intensityRules = mysqlTable('intensity_rules', {
  id: int('id').primaryKey().autoincrement(),
  intensity: int('intensity').notNull().unique(),
  repsBudget: int('reps_budget').notNull(),
  difficulty: varchar('difficulty', { length: 20 }).notNull(),
  exerciseCountMin: int('exercise_count_min').notNull(),
  exerciseCountMax: int('exercise_count_max').notNull(),
});

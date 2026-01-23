import { mysqlTable, int, varchar, mysqlEnum, index } from 'drizzle-orm/mysql-core';

export const exerciseLevelEnum = mysqlEnum('exercise_level', ['alfa', 'delta', 'sigma', 'omega', 'spartan']);

export const exercises = mysqlTable('exercises', {
  id: int('id').primaryKey().autoincrement(),
  pattern: varchar('pattern', { length: 100 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  categorySecondary: varchar('category_secondary', { length: 100 }),
  exercise: varchar('exercise', { length: 150 }).notNull(),
  exercise2: varchar('exercise_2', { length: 150 }),
  position: varchar('position', { length: 100 }),
  effort: varchar('effort', { length: 10 }).notNull(),
  level: exerciseLevelEnum,
  codeNumber: int('code_number'),
  difficulty: int('difficulty').notNull().default(1),
  route: varchar('route', { length: 20 }).notNull(),
  mobilityRelated: varchar('mobility_related', { length: 100 }),
}, (table) => [
  index('exercises_route_effort_level_diff_idx').on(table.route, table.effort, table.level, table.difficulty),
  index('exercises_level_idx').on(table.level),
]);

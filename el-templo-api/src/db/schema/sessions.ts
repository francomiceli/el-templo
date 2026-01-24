import { mysqlTable, int, varchar, timestamp, json, index } from 'drizzle-orm/mysql-core';

export const sessions = mysqlTable('sessions', {
  id: int('id').primaryKey().autoincrement(),
  dayId: varchar('day_id', { length: 50 }).notNull().unique(), // W1-lunes-sigma
  week: int('week').notNull(),
  day: varchar('day', { length: 20 }).notNull(), // lunes, martes, etc
  levelGroup: varchar('level_group', { length: 20 }).notNull(), // alfa_delta, sigma, omega
  blockCount: int('block_count').notNull(),
  traceJson: json('trace_json'), // Full trace for debugging
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('sessions_week_day_level_idx').on(table.week, table.day, table.levelGroup),
]);

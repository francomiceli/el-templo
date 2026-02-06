import { mysqlTable, int, varchar, timestamp, json, index, boolean } from 'drizzle-orm/mysql-core';
import { users } from './users';

export const sessions = mysqlTable('sessions', {
  id: int('id').primaryKey().autoincrement(),
  dayId: varchar('day_id', { length: 50 }).notNull().unique(), // W1-lunes-sigma
  week: int('week').notNull(),
  day: varchar('day', { length: 20 }).notNull(), // lunes, martes, etc
  levelGroup: varchar('level_group', { length: 20 }).notNull(), // alfa_delta, sigma, omega
  blockCount: int('block_count').notNull(),
  traceJson: json('trace_json'), // Full trace for debugging
  createdAt: timestamp('created_at').defaultNow(),

  // Admin workflow columns
  status: varchar('status', { length: 20 }).default('pending_review').notNull(),
  approvedAt: timestamp('approved_at'),
  approvedBy: int('approved_by').references(() => users.id),
  approvedBySystem: boolean('approved_by_system').default(false),
}, (table) => [
  index('sessions_week_day_level_idx').on(table.week, table.day, table.levelGroup),
  index('sessions_status_idx').on(table.status),
]);

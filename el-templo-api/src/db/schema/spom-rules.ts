import { mysqlTable, int, varchar, index, uniqueIndex } from 'drizzle-orm/mysql-core';
import { routes } from './routes';

export const spomRules = mysqlTable('spom_rules', {
  id: int('id').primaryKey().autoincrement(),
  week: int('week').notNull(),
  routeId: int('route_id').notNull().references(() => routes.id),
  intensity: int('intensity').notNull(),
  wave: varchar('wave', { length: 50 }).notNull(),
  pattern: varchar('pattern', { length: 150 }).notNull(),
  pattern2: varchar('pattern_2', { length: 100 }),
  category: varchar('category', { length: 100 }).notNull(),
}, (table) => [
  uniqueIndex('spom_rules_week_route_idx').on(table.week, table.routeId),
  index('spom_rules_route_idx').on(table.routeId),
]);

import { mysqlTable, int, varchar, index, uniqueIndex } from 'drizzle-orm/mysql-core';
import { routes } from './routes';
import { tenantIdColumn } from './tenant-column';

export const spomRules = mysqlTable('spom_rules', {
  id: int('id').primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
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

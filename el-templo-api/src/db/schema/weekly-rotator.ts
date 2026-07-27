import { mysqlTable, int, mysqlEnum, index, uniqueIndex } from 'drizzle-orm/mysql-core';
import { routes } from './routes';
import { tenantIdColumn } from './tenant-column';

export const dayEnum = mysqlEnum('day', ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']);
export const levelGroupEnum = mysqlEnum('level_group', ['alfa_delta', 'sigma', 'omega']);

export const weeklyRotator = mysqlTable('weekly_rotator', {
  id: int('id').primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  week: int('week').notNull(),
  day: dayEnum.notNull(),
  levelGroup: levelGroupEnum.notNull(),
  nucleusRouteId: int('nucleus_route_id').notNull().references(() => routes.id),
  deuteros1RouteId: int('deuteros1_route_id').notNull().references(() => routes.id),
  deuteros2RouteId: int('deuteros2_route_id').references(() => routes.id),
  athlosRouteId: int('athlos_route_id').notNull().references(() => routes.id),
}, (table) => [
  uniqueIndex('weekly_rotator_week_day_level_idx').on(table.week, table.day, table.levelGroup),
  index('weekly_rotator_nucleus_idx').on(table.nucleusRouteId),
  index('weekly_rotator_deuteros1_idx').on(table.deuteros1RouteId),
  index('weekly_rotator_deuteros2_idx').on(table.deuteros2RouteId),
  index('weekly_rotator_athlos_idx').on(table.athlosRouteId),
]);

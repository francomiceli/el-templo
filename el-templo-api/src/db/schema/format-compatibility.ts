import { mysqlTable, int, mysqlEnum, uniqueIndex } from 'drizzle-orm/mysql-core';
import { formats } from './formats';
import { tenantIdColumn } from './tenant-column';

export const blockEnum = mysqlEnum('block', ['initium', 'nucleus', 'deuteros', 'athlos', 'epikos']);
export const compatibilityLevelEnum = mysqlEnum('compat_level', ['alfa', 'delta', 'sigma', 'omega']);

export const formatCompatibility = mysqlTable('format_compatibility', {
  id: int('id').primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  formatId: int('format_id').notNull().references(() => formats.id),
  block: blockEnum.notNull(),
  level: compatibilityLevelEnum.notNull(),
  intensity: int('intensity').notNull(),
  compatibility: int('compatibility').notNull(),
}, (table) => [
  uniqueIndex('format_compat_lookup_idx').on(table.formatId, table.block, table.level, table.intensity),
]);

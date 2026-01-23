import { mysqlTable, int, mysqlEnum, uniqueIndex } from 'drizzle-orm/mysql-core';
import { formats } from './formats';

export const blockEnum = mysqlEnum('block', ['nucleus', 'deuteros', 'plethora']);
export const compatibilityLevelEnum = mysqlEnum('compat_level', ['alfa', 'delta', 'sigma', 'omega']);

export const formatCompatibility = mysqlTable('format_compatibility', {
  id: int('id').primaryKey().autoincrement(),
  formatId: int('format_id').notNull().references(() => formats.id),
  block: blockEnum.notNull(),
  level: compatibilityLevelEnum.notNull(),
  intensity: int('intensity').notNull(),
  compatibility: int('compatibility').notNull(),
}, (table) => [
  uniqueIndex('format_compat_lookup_idx').on(table.formatId, table.block, table.level, table.intensity),
]);

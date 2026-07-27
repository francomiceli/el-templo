import { mysqlTable, int, index, uniqueIndex } from 'drizzle-orm/mysql-core';
import { tenantIdColumn } from './tenant-column';

export const contractionRules = mysqlTable('contraction_rules', {
  id: int('id').primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  intensity: int('intensity').notNull(),
  totalExercises: int('total_exercises').notNull(),
  concentrico: int('concentrico').notNull(),
  excentrico: int('excentrico').notNull(),
  isometrico: int('isometrico').notNull(),
}, (table) => [
  uniqueIndex('contraction_rules_intensity_total_idx').on(table.intensity, table.totalExercises),
]);

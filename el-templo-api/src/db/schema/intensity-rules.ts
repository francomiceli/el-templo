import { mysqlTable, int, varchar } from 'drizzle-orm/mysql-core';
import { tenantIdColumn } from './tenant-column';

export const intensityRules = mysqlTable('intensity_rules', {
  id: int('id').primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  intensity: int('intensity').notNull().unique(),
  repsBudget: int('reps_budget').notNull(),
  difficulty: varchar('difficulty', { length: 20 }).notNull(),
  exerciseCountMin: int('exercise_count_min').notNull(),
  exerciseCountMax: int('exercise_count_max').notNull(),
});

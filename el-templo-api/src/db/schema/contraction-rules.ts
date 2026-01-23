import { mysqlTable, int, index, uniqueIndex } from 'drizzle-orm/mysql-core';

export const contractionRules = mysqlTable('contraction_rules', {
  id: int('id').primaryKey().autoincrement(),
  intensity: int('intensity').notNull(),
  totalExercises: int('total_exercises').notNull(),
  concentrico: int('concentrico').notNull(),
  excentrico: int('excentrico').notNull(),
  isometrico: int('isometrico').notNull(),
}, (table) => [
  uniqueIndex('contraction_rules_intensity_total_idx').on(table.intensity, table.totalExercises),
]);

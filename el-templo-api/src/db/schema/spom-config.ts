import { mysqlTable, int, timestamp, check } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const spomConfig = mysqlTable('spom_config', {
  id: int('id').primaryKey().default(1),
  currentWeek: int('current_week').notNull().default(1),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (table) => [
  check('spom_config_single_row', sql`${table.id} = 1`),
]);

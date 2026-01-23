import { mysqlTable, int, varchar, timestamp } from 'drizzle-orm/mysql-core';

export const routes = mysqlTable('routes', {
  id: int('id').primaryKey().autoincrement(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

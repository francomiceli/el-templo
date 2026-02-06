import { mysqlTable, int, varchar, timestamp, index } from 'drizzle-orm/mysql-core';
import { sessions } from './sessions';
import { users } from './users';

export const sessionEditLogs = mysqlTable('session_edit_logs', {
  id: int('id').primaryKey().autoincrement(),
  sessionId: int('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  userId: int('user_id').notNull().references(() => users.id),
  action: varchar('action', { length: 50 }).notNull(),
  // action values: 'exercise_swap', 'prescription_edit', 'format_change',
  //   'exercise_add', 'exercise_remove', 'reset_to_algorithm'
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('session_edit_logs_session_idx').on(table.sessionId),
]);

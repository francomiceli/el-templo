import { mysqlTable, int, varchar, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';
import { users } from './users';
import { tenantIdColumn } from './tenant-column';

export const evaluationRequestStatus = mysqlEnum('evaluation_request_status', ['pending', 'approved', 'denied']);

export const evaluationRequests = mysqlTable('evaluation_requests', {
  id: int('id').primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  userId: int('user_id').notNull().references(() => users.id),
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  status: evaluationRequestStatus.default('pending').notNull(),
  averageRpeAtRequest: int('average_rpe_at_request'), // Snapshot at time of request
  processedAt: timestamp('processed_at'),
  processedBy: int('processed_by').references(() => users.id), // Coach who processed
  notes: varchar('notes', { length: 500 }), // Coach notes on decision
});

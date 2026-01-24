/**
 * Session Traces Schema
 *
 * Optional persistent storage for detailed trace data.
 * Useful for debugging production issues and analytics.
 *
 * The sessions table already stores trace_json for basic debugging.
 * This table provides additional indexing and summary columns
 * for querying traces by metrics.
 */

import { mysqlTable, int, timestamp, json, index } from 'drizzle-orm/mysql-core';
import { sessions } from './sessions';

export const sessionTraces = mysqlTable(
  'session_traces',
  {
    id: int('id').primaryKey().autoincrement(),
    sessionId: int('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    traceJson: json('trace_json').notNull(), // Full SessionTrace object
    eventCount: int('event_count').notNull(),
    warningCount: int('warning_count').notNull(),
    errorCount: int('error_count').notNull(),
    generationMs: int('generation_ms').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('session_traces_session_idx').on(table.sessionId)]
);

import { mysqlTable, int, varchar, json, timestamp, index } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { tenantIdColumn } from './tenant-column';

export const savedBlocks = mysqlTable('saved_blocks', {
  id: int('id').primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  name: varchar('name', { length: 150 }).notNull(),
  createdBy: int('created_by').notNull().references(() => users.id),
  sourceBlockId: int('source_block_id'), // nullable - original block may be deleted
  blockRole: varchar('block_role', { length: 20 }).notNull(),
  blockRoute: varchar('block_route', { length: 20 }).notNull(),
  formatName: varchar('format_name', { length: 50 }).notNull(),
  blockData: json('block_data').notNull(), // Full snapshot: exercises, prescriptions, format params
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('saved_blocks_created_by_idx').on(table.createdBy),
]);

export const savedBlocksRelations = relations(savedBlocks, ({ one }) => ({
  creator: one(users, {
    fields: [savedBlocks.createdBy],
    references: [users.id],
  }),
}));

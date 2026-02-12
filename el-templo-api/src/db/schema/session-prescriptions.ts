import { mysqlTable, int, varchar, index } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { sessionBlocks } from './session-blocks';

export const sessionPrescriptions = mysqlTable('session_prescriptions', {
  id: int('id').primaryKey().autoincrement(),
  blockId: int('block_id').notNull().references(() => sessionBlocks.id, { onDelete: 'cascade' }),
  exerciseId: int('exercise_id').notNull(),
  exerciseName: varchar('exercise_name', { length: 150 }).notNull(),
  contraction: varchar('contraction', { length: 10 }).notNull(), // CON, EXC, ISO
  reps: int('reps').notNull(),
  seconds: int('seconds').notNull(),
  rest: int('rest').notNull(),
  notes: varchar('notes', { length: 255 }),
  difficulty: int('difficulty'), // Linear difficulty 1-12 for display to users
  sortOrder: int('sort_order').notNull(), // ordering within block
  exerciseType: varchar('exercise_type', { length: 10 }).notNull().default('main'), // 'main' | 'mobility'
}, (table) => [
  index('session_prescriptions_block_idx').on(table.blockId),
  index('session_prescriptions_type_idx').on(table.exerciseType),
]);

export const sessionPrescriptionsRelations = relations(sessionPrescriptions, ({ one }) => ({
  block: one(sessionBlocks, {
    fields: [sessionPrescriptions.blockId],
    references: [sessionBlocks.id],
  }),
}));

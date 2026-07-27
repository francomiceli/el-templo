import {
  mysqlTable,
  int,
  varchar,
  boolean,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { sessionBlocks } from "./session-blocks";
import { tenantIdColumn } from "./tenant-column";

export const sessionPrescriptions = mysqlTable(
  "session_prescriptions",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    blockId: int("block_id")
      .notNull()
      .references(() => sessionBlocks.id, { onDelete: "cascade" }),
    // Mina M9 (doc 05 §6): `exercise_id` apunta a `exercises.id` pero NO tiene FK
    // real, asi que la consistencia de tenant sobre esa arista no la garantiza la
    // DB — la verifica `src/db/scripts/verify-tenant-backfill.ts` con un join manual.
    exerciseId: int("exercise_id").notNull(),
    exerciseName: varchar("exercise_name", { length: 150 }).notNull(),
    contraction: varchar("contraction", { length: 10 }).notNull(), // CON, EXC, ISO
    reps: int("reps").notNull(),
    repsMax: int("reps_max"), // Upper bound for rep ranges (AMRAP)
    seconds: int("seconds").notNull(),
    secondsMax: int("seconds_max"), // Upper bound for time ranges (AMRAP)
    increment: int("increment"), // Per-round increment (Death By)
    rest: int("rest").notNull(),
    notes: varchar("notes", { length: 255 }),
    difficulty: int("difficulty"), // Linear difficulty 1-12 for display to users
    sortOrder: int("sort_order").notNull(), // ordering within block
    exerciseType: varchar("exercise_type", { length: 10 })
      .notNull()
      .default("main"), // 'main' | 'mobility'
    weighted: boolean("weighted").notNull().default(false),
  },
  (table) => [
    index("session_prescriptions_block_idx").on(table.blockId),
    index("session_prescriptions_type_idx").on(table.exerciseType),
  ],
);

export const sessionPrescriptionsRelations = relations(
  sessionPrescriptions,
  ({ one }) => ({
    block: one(sessionBlocks, {
      fields: [sessionPrescriptions.blockId],
      references: [sessionBlocks.id],
    }),
  }),
);

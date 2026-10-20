// Module: sessions (fase 197, bloque libre)
import {
  mysqlTable,
  int,
  varchar,
  datetime,
  json,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

/**
 * `extra_blocks_completed` — bloques libres terminados (Fase 197 D-13).
 *
 * Tabla propia: el bloque libre NO escribe `completed_sessions`, así que no
 * toca racha, programa, RPE ni la sesión del día. Gym-owned (strict).
 *
 * - `sourceBlockId`: `session_blocks.block_id` de la aparición elegida.
 * - `localDate`: día en la zona horaria de la sede (YYYY-MM-DD).
 * - `startedAt` / `endedAt`: UTC. `durationSeconds` lo calcula el servidor.
 * - `exercisesCompleted`: ids de EJERCICIO (no de prescripción).
 * - Sin uniques: el socio puede hacer varios bloques libres por día. El tope de
 *   una AURA por día lo da `aura_transactions` (`extra_block_day`, D-12).
 */
export const extraBlocksCompleted = mysqlTable(
  "extra_blocks_completed",
  {
    id: int("id").primaryKey().autoincrement(),
    // Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    sourceBlockId: varchar("source_block_id", { length: 100 }).notNull(),
    sourceDayId: varchar("source_day_id", { length: 50 }).notNull(),
    blockRole: varchar("block_role", { length: 20 }).notNull(),
    localDate: varchar("local_date", { length: 10 }).notNull(),
    startedAt: datetime("started_at").notNull(),
    endedAt: datetime("ended_at").notNull(),
    durationSeconds: int("duration_seconds").notNull(),
    exercisesCompleted: json("exercises_completed").$type<number[]>().notNull(),
    auraAwarded: boolean("aura_awarded").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_extra_blocks_tenant_user_date").on(
      table.tenantId,
      table.userId,
      table.localDate,
    ),
  ],
);

export type ExtraBlockCompletedRow = typeof extraBlocksCompleted.$inferSelect;
export type NewExtraBlockCompleted = typeof extraBlocksCompleted.$inferInsert;

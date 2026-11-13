// Módulo: recategorización multisucursal (histórico de eventos).
//
// `branch_reassignments` registra UN evento por cada cambio real de sede que
// hace el cron `jobs/reassign-multibranch.ts` (mensual, día 1 04:00 AR). Antes
// de esta tabla el job pisaba `users.branch_id` sin dejar rastro, así que el
// reporte no podía mostrar a quién se movió ni de dónde a dónde.
//
// - `source='cron'`: lo escribe el job, en la MISMA transacción que el UPDATE
//   de `users.branch_id`.
// - `source='backfill'`: lo reconstruyó la migración 0334 desde `users`
//   (branch_source='auto' + día 1 07:00 UTC). Solo se conoce el ÚLTIMO cambio
//   automático de cada alumno, y la sede de origen se infiere del último cobro
//   (puede ser NULL = "sin dato").
//
// Nace tenancy-native (tenant_id desde el arranque) y STRICT en
// `src/db/tenant-tables.ts` (TENANT_STRICT_MODULES["branch-reassignments"]).
import {
  mysqlTable,
  int,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { branches } from "./branches";
import { tenantIdColumn } from "./tenant-column";

export const branchReassignmentSourceEnum = mysqlEnum("source", [
  "cron",
  "backfill",
]);

export const branchReassignments = mysqlTable(
  "branch_reassignments",
  {
    id: int("id").primaryKey().autoincrement(),
    // Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    memberId: int("member_id")
      .references(() => users.id)
      .notNull(),
    // NULL = sede de origen desconocida (backfill sin cobro previo útil).
    fromBranchId: int("from_branch_id").references(() => branches.id),
    toBranchId: int("to_branch_id")
      .references(() => branches.id)
      .notNull(),
    // Asistencias en la sede destino / totales dentro de la ventana de 30 días
    // previa al evento (mismo cómputo que el job).
    toBranchAttendances: int("to_branch_attendances").notNull(),
    totalAttendances: int("total_attendances").notNull(),
    source: branchReassignmentSourceEnum.notNull(),
    reassignedAt: timestamp("reassigned_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_branch_reassignments_tenant_at").on(
      table.tenantId,
      table.reassignedAt,
    ),
    index("idx_branch_reassignments_member").on(table.memberId),
  ],
);

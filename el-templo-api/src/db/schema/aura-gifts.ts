// Module: aura (fase 215, regalar Aura)
//
// Tabla gym-owned que nace strict (módulo `aura-gifts`): una fila por regalo.
import {
  mysqlTable,
  int,
  varchar,
  date,
  timestamp,
  mysqlEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { branches } from "./branches";
import { schedules } from "./schedules";
import { tenantIdColumn } from "./tenant-column";

/** Quién da el regalo: un alumno o un profe. */
export type AuraGiftGiverKind = "alumno" | "profe";

/** Motivo que elige quien regala (D-16). */
export type AuraGiftReason = "tecnica" | "constancia" | "energia" | "ayudo";

/** Quién o qué anuló el regalo: el staff, o el deshacer una asistencia. */
export type AuraGiftVoidCause = "staff" | "asistencia";

/**
 * `aura_gifts` — regalos de Aura entre personas de una misma clase.
 *
 * - D-02: un regalo de alumno por asistencia de quien da
 *   (`uq_aura_gifts_tenant_giver_attendance`, los NULL del profe no chocan).
 * - D-03: el profe regala una vez por día a cada persona
 *   (`uq_aura_gifts_tenant_coach_day`, los NULL del alumno no chocan).
 * - D-09: el cupo se deriva de las asistencias, sin tabla de cupo. Un regalo
 *   anulado NO devuelve el cupo porque el UNIQUE sigue ocupado.
 * - D-20: `amount` guarda lo dado al momento, para que anular revierta
 *   exactamente eso.
 *
 * El ledger de Aura acredita cada regalo con `reference_type = 'aura_gift'` y
 * `reference_id = aura_gifts.id` (la anulación con `aura_gift_void`). Sin FK a
 * `attendance`: las asistencias se borran al deshacer un check-in y los regalos
 * se anulan antes.
 *
 * `giver_kind`, `reason` y `void_cause` son varchar (validados por el servicio y
 * el JSON schema) para no caer en la trampa del nombre físico de `mysqlEnum`.
 * `status` es enum y su columna física se llama `aura_gift_status`.
 */
export const auraGifts = mysqlTable(
  "aura_gifts",
  {
    id: int("id").primaryKey().autoincrement(),
    // Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    giverUserId: int("giver_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    receiverUserId: int("receiver_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    giverKind: varchar("giver_kind", { length: 10 })
      .$type<AuraGiftGiverKind>()
      .notNull(),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    scheduleId: int("schedule_id").references(() => schedules.id, {
      onDelete: "set null",
    }),
    // Fecha local de la clase.
    sessionDate: date("session_date", { mode: "string" }).notNull(),
    // Solo alumno.
    giverAttendanceId: int("giver_attendance_id"),
    receiverAttendanceId: int("receiver_attendance_id").notNull(),
    // Solo profe: igual a `session_date`.
    coachGiftDate: date("coach_gift_date", { mode: "string" }),
    reason: varchar("reason", { length: 20 }).$type<AuraGiftReason>().notNull(),
    amount: int("amount").notNull(),
    status: mysqlEnum("aura_gift_status", ["vigente", "anulado"])
      .default("vigente")
      .notNull(),
    voidedByUserId: int("voided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    voidedAt: timestamp("voided_at"),
    voidCause: varchar("void_cause", {
      length: 20,
    }).$type<AuraGiftVoidCause>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_aura_gifts_tenant_giver_attendance").on(
      table.tenantId,
      table.giverAttendanceId,
    ),
    uniqueIndex("uq_aura_gifts_tenant_coach_day").on(
      table.tenantId,
      table.giverUserId,
      table.receiverUserId,
      table.coachGiftDate,
    ),
    index("idx_aura_gifts_tenant_receiver_created").on(
      table.tenantId,
      table.receiverUserId,
      table.createdAt,
    ),
    index("idx_aura_gifts_tenant_giver_date").on(
      table.tenantId,
      table.giverUserId,
      table.sessionDate,
    ),
    index("idx_aura_gifts_tenant_branch_date").on(
      table.tenantId,
      table.branchId,
      table.sessionDate,
    ),
    index("idx_aura_gifts_tenant_receiver_attendance").on(
      table.tenantId,
      table.receiverAttendanceId,
    ),
  ],
);

export type AuraGiftStatus = (typeof auraGifts.status.enumValues)[number];
export type AuraGiftRow = typeof auraGifts.$inferSelect;
export type NewAuraGiftRow = typeof auraGifts.$inferInsert;

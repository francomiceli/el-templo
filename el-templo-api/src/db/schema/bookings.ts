// Module: bookings
import {
  mysqlTable,
  int,
  date,
  timestamp,
  mysqlEnum,
  boolean,
  varchar,
  tinyint,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./users";
import { schedules } from "./schedules";
import { tenantIdColumn } from "./tenant-column";

export const bookingStatusEnum = mysqlEnum("booking_status", [
  "reservado",
  "qr_escaneado",
  "confirmado",
  "cancelado",
  "lista_espera",
  "no_show",
]);

/**
 * Estados "vivos" de una reserva: ocupan el turno del alumno. Mig 0360: el
 * índice único (alumno, horario, día) aplica solo a estos (columna generada
 * `active_slot`, cuyo CASE repite esta lista a mano: mantenerlas iguales).
 */
export const ACTIVE_SLOT_BOOKING_STATUSES = [
  "reservado",
  "qr_escaneado",
  "confirmado",
  "lista_espera",
] as const;

export const bookings = mysqlTable(
  "bookings",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    memberId: int("member_id")
      .references(() => users.id)
      .notNull(),
    scheduleId: int("schedule_id")
      .references(() => schedules.id)
      .notNull(),
    bookingDate: date("booking_date", { mode: "string" }).notNull(),
    status: bookingStatusEnum.default("reservado").notNull(),
    waitlistPosition: int("waitlist_position"),
    bookedAt: timestamp("booked_at").defaultNow().notNull(),
    cancelledAt: timestamp("cancelled_at"),
    isTrial: boolean("is_trial").notNull().default(false),
    // D-02: booking origin — 'self_service' | 'admin' | NULL (legacy = admin).
    // Drives funnel attribution (D-18). Nullable; existing rows stay NULL.
    source: varchar("source", { length: 16 }),
    // Mig 0360 (caso María Eugenia Rossi, 2026-11-25): 1 si la reserva está viva,
    // NULL si no. Solo existe para el índice único de abajo: así la regla "una
    // reserva por alumno, horario y día" vale solo para las vivas y las
    // canceladas/no_show quedan como historial (antes se BORRABAN para liberar
    // el turno). Columna generada: nunca se escribe.
    activeSlot: tinyint("active_slot").generatedAlwaysAs(
      sql`CASE WHEN booking_status IN ('reservado', 'qr_escaneado', 'confirmado', 'lista_espera') THEN 1 ELSE NULL END`,
      { mode: "virtual" },
    ),
  },
  (table) => [
    index("idx_bookings_schedule_date_status").on(
      table.scheduleId,
      table.bookingDate,
      table.status,
    ),
    index("idx_bookings_member_date").on(table.memberId, table.bookingDate),
    // Serves the trials dialog query (trials-service.listTrials):
    // WHERE is_trial = 1 AND booking_date = ? AND status <> 'cancelado'.
    // Leads with is_trial (trials are a small fraction of bookings) so the
    // seek is tight; booking_date equality next; status last for the
    // <> 'cancelado' filter. Without this the query full-scanned bookings
    // and timed out (>10s) in prod as the table grew.
    index("idx_bookings_trial_date_status").on(
      table.isTrial,
      table.bookingDate,
      table.status,
    ),
    // Mig 0360: el único incluye `activeSlot` (NULL para canceladas/no_show y
    // MySQL admite múltiples NULL) → solo choca una segunda reserva VIVA.
    uniqueIndex("idx_bookings_member_schedule_date_active").on(
      table.memberId,
      table.scheduleId,
      table.bookingDate,
      table.activeSlot,
    ),
  ],
);

export const bookingsRelations = relations(bookings, ({ one }) => ({
  member: one(users, {
    fields: [bookings.memberId],
    references: [users.id],
  }),
  schedule: one(schedules, {
    fields: [bookings.scheduleId],
    references: [schedules.id],
  }),
}));

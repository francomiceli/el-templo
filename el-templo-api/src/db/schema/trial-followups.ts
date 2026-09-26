// Módulo: cadencia de mensajes en Sesiones de Prueba (brief Nacho, 2026-09-26).
//
// `trial_followups` guarda lo MANUAL de UNA sesión de prueba (un booking
// `is_trial=1`): qué mensaje de la cadencia (M1/M2/M3) se marcó como enviado,
// quién y cuándo, si la persona respondió, el motivo cuando se marca Perdida a
// mano, y el vínculo con la sesión de la que viene (reagenda). Mismo espíritu
// que `renewal_followups` (2026-09-24): el estado DERIVADO de la sesión
// (Agendada/Asistió/No asistió/Reagendada/Ganada/Perdida) NUNCA se persiste acá
// — sale de `bookings`/`attendance`/`users.lead_status` en cada lectura (ver
// `modules/reports/trial-cadence.ts` y `ReportsService.getTrialSessionsReport`).
//
// Nace tenancy-native (tenant_id desde el arranque) y STRICT en
// `src/db/tenant-tables.ts` (TENANT_STRICT_MODULES["trial-followups"]) — mismo
// criterio que `renewals`/`communications`: módulo nuevo, sin deuda previa que
// tolerar.
import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { bookings } from "./bookings";
import { tenantIdColumn } from "./tenant-column";

/**
 * SPEC "DECISIONES DE FRANCO" §"Reagenda": `m2Kind` distingue la rama de M2/M3
 * — 'venta' (Asistió → M2a/M3a) vs 'reagenda' (No asistió → M2b/M3b). Se
 * guarda al marcar M2 (brief §4.2: "Cada fila muestra el último mensaje
 * enviado... con m2_kind").
 */
export const trialFollowupM2KindEnum = mysqlEnum("m2_kind", [
  "venta",
  "reagenda",
]);

/**
 * Motivos de Perdida manual (brief §9, opcional-pero-barato → incluido).
 * Append-last si se agrega uno nuevo — nunca reordenar los existentes.
 */
export const trialFollowupLostReasonEnum = mysqlEnum("lost_reason", [
  "no_responde",
  "precio",
  "horario",
  "distancia",
  "otro",
]);

export const trialFollowups = mysqlTable(
  "trial_followups",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    bookingId: int("booking_id")
      .references(() => bookings.id)
      .notNull(),
    m1SentAt: timestamp("m1_sent_at"),
    m1SentBy: int("m1_sent_by").references(() => users.id),
    m2Kind: trialFollowupM2KindEnum,
    m2SentAt: timestamp("m2_sent_at"),
    m2SentBy: int("m2_sent_by").references(() => users.id),
    m3SentAt: timestamp("m3_sent_at"),
    m3SentBy: int("m3_sent_by").references(() => users.id),
    respondedAt: timestamp("responded_at"),
    respondedBy: int("responded_by").references(() => users.id),
    lostReason: trialFollowupLostReasonEnum,
    lostNote: varchar("lost_note", { length: 500 }),
    /**
     * SPEC §"Reagenda": booking VIEJO del que viene esta sesión (NULL en la
     * sesión original de la cadena). Se escribe en la MISMA tx que
     * `rescheduleTrial` crea/reactiva el booking nuevo — ver
     * `trials-service.ts`.
     */
    rescheduledFromBookingId: int("rescheduled_from_booking_id").references(
      () => bookings.id,
    ),
    updatedBy: int("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_trial_followups_tenant_booking").on(
      table.tenantId,
      table.bookingId,
    ),
    // Sirve la búsqueda "¿esta booking tiene un hijo de reagenda?" (SPEC
    // §"Reporte": la sesión cancelada-por-reagenda se muestra como
    // "Reagendada" cuando otra fila la referencia acá).
    index("idx_trial_followups_tenant_rescheduled_from").on(
      table.tenantId,
      table.rescheduledFromBookingId,
    ),
  ],
);

export const trialFollowupsRelations = relations(trialFollowups, ({ one }) => ({
  booking: one(bookings, {
    fields: [trialFollowups.bookingId],
    references: [bookings.id],
  }),
}));

// Módulo: marketing — outbox de Meta Conversions API (fase 195, plan 08, D-19).
//
// Un job (`jobs/marketing-meta.ts`, cada 10 minutos) DERIVA los eventos del
// estado de la base (registro, reserva de prueba, primer pago) sin hooks en
// los caminos de pago, los inserta acá con un `event_id` determinista
// (`reg-<userId>`, `trial-<bookingId>`, `purchase-<subscriptionId>`) y los manda
// por lotes. La unique (tenant_id, event_id) es la idempotencia.
//
// `status`: 'pending' | 'sent' | 'failed' | 'skipped_es' (D-25) | 'skipped_ios'
// y 'skipped_no_origin' (D-24) | 'skipped_window' (ventana de Meta). Cada
// exclusión queda registrada para poder auditar por qué un evento no viajó.
//
// Nace tenancy-native y STRICT en `src/db/tenant-tables.ts`
// (TENANT_STRICT_MODULES["marketing"]).
import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

export const metaCapiEvents = mysqlTable(
  "meta_capi_events",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    /** Determinista: `reg-<userId>` | `trial-<bookingId>` | `purchase-<subscriptionId>`. */
    eventId: varchar("event_id", { length: 64 }).notNull(),
    /** 'CompleteRegistration' | 'Schedule' | 'Purchase'. */
    eventName: varchar("event_name", { length: 40 }).notNull(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'registration' | 'trial_booking' | 'subscription'. */
    entityType: varchar("entity_type", { length: 20 }).notNull(),
    entityId: int("entity_id").notNull(),
    /** 'website' | 'system_generated' | 'physical_store'. */
    actionSource: varchar("action_source", { length: 20 }).notNull(),
    eventTime: timestamp("event_time").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    attempts: int("attempts").notNull().default(0),
    /** Mensaje de error de Meta, recortado y SIN el token. */
    lastError: varchar("last_error", { length: 500 }),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_meta_capi_events_tenant_event").on(
      table.tenantId,
      table.eventId,
    ),
    index("idx_meta_capi_events_tenant_status").on(
      table.tenantId,
      table.status,
    ),
  ],
);

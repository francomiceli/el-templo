// Module: notifications (fase 215, bandeja de avisos)
//
// Tabla gym-owned que nace strict (módulo `notifications`): la bandeja de cada
// persona, una fila por aviso.
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

/**
 * `member_notifications` — bandeja de avisos de cada persona (D-17, D-18).
 *
 * No se reusa `pending_notifications` porque esa cola se purga a las 24 h. La
 * bandeja guarda una copia del título, el cuerpo y el destino de cada aviso;
 * retención de 90 días. Se marca leída al tocar el aviso o con "marcar todo"
 * (`readAt`).
 *
 * - `shownAt`: momento desde el que el aviso se ve (el envío, o la hora
 *   programada para quien no tiene push). La lista y el contador filtran
 *   `shown_at <= NOW()`.
 * - `pendingNotificationId`: id de la fila de la cola de la que salió. Sin FK a
 *   propósito (la cola se purga). El UNIQUE `(tenant_id, pending_notification_id)`
 *   evita duplicar el aviso si el barrido reintenta.
 * - `dedupeKey`: clave anti-duplicado de los avisos sin cola (quien no tiene
 *   push), armada por `inboxDedupeKey` (plan 12). El UNIQUE
 *   `(tenant_id, user_id, dedupe_key)` evita que un job que mira la cola para no
 *   repetirse (ej. recordatorio de clase) vuelva a pedirlo. NULL en las filas que
 *   vienen de la cola: MySQL permite varios NULL en un UNIQUE.
 * - `kind` / `refId`: categoría de la push (`aura_gift` u `otro`) y el id del
 *   regalo cuando `kind = 'aura_gift'`.
 * - `destinationType` es varchar (no enum) para no duplicar el enum de
 *   `pending_notifications`.
 */
export const memberNotifications = mysqlTable(
  "member_notifications",
  {
    id: int("id").primaryKey().autoincrement(),
    // Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    pendingNotificationId: int("pending_notification_id"),
    dedupeKey: varchar("dedupe_key", { length: 160 }),
    kind: varchar("kind", { length: 32 }).notNull(),
    refId: int("ref_id"),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    route: varchar("route", { length: 200 }),
    destinationType: varchar("destination_type", { length: 20 })
      .default("app_section")
      .notNull(),
    destinationSection: varchar("destination_section", { length: 40 }),
    whatsappText: varchar("whatsapp_text", { length: 300 }),
    shownAt: timestamp("shown_at").defaultNow().notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_member_notifications_tenant_pending").on(
      table.tenantId,
      table.pendingNotificationId,
    ),
    uniqueIndex("uq_member_notifications_tenant_user_dedupe").on(
      table.tenantId,
      table.userId,
      table.dedupeKey,
    ),
    index("idx_member_notifications_tenant_user_shown").on(
      table.tenantId,
      table.userId,
      table.shownAt,
    ),
    index("idx_member_notifications_tenant_user_read").on(
      table.tenantId,
      table.userId,
      table.readAt,
    ),
    // Purga a 90 días (cross-tenant).
    index("idx_member_notifications_shown").on(table.shownAt),
  ],
);

export type MemberNotificationRow = typeof memberNotifications.$inferSelect;
export type NewMemberNotificationRow = typeof memberNotifications.$inferInsert;

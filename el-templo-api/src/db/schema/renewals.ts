// Module: renewals — pantalla operativa de seguimiento de renovaciones
// (2026-09-24, brief Nacho). Reemplaza el Excel semanal de vencimientos.
//
// Principio central (SPEC §"derivado vs. persistido"): Renovó / Volvió tarde /
// Pausada se DERIVAN en cada lectura desde `subscriptions` (ver
// `src/modules/renewals/service.ts`) — NUNCA se persisten. Estas dos tablas
// solo guardan lo manual: número de mensaje, "No renovó" + motivo + nota, y
// quién/cuándo. Un "No renovó" manual queda pisado por una renovación
// derivada (manualOverridden=true) — el registro manual nunca se borra.
//
// Cambio de alcance (2026-09-24, mismo día): se descartaron las plantillas de
// WhatsApp (`renewal_message_templates`) — el negocio no manda mensajes desde
// el admin, copian el teléfono a su CRM (Kommo), que ya usa plantillas
// aprobadas por Meta. El admin solo expone `phoneE164` (normalizado, ver
// `modules/shared/phone.ts` `normalizePhoneE164`) para ese copy/paste.
//
// Nace tenancy-native (tenant_id desde el arranque, mismo criterio que
// avisos/referral_partners/staff_shifts) y el módulo entero nace STRICT en
// `src/db/tenant-tables.ts` (TENANT_STRICT_MODULES.renewals).
import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
  tinyint,
  mysqlEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { subscriptions } from "./subscriptions";
import { tenantIdColumn } from "./tenant-column";

/**
 * Estado MANUAL persistido de una fila de seguimiento (SPEC §"Estado
 * derivado"). Solo dos valores — 'renovo' y 'volvio_tarde' NUNCA se
 * persisten, siempre se derivan de `subscriptions` en cada lectura.
 */
export const renewalManualStatusEnum = mysqlEnum("manual_status", [
  "en_proceso",
  "no_renovo",
]);

/**
 * Motivos de no renovación, configurables por tenant (SPEC §"Motivos de no
 * renovación" / brief §7). Seed inicial en la migración 0237: Lesión, Viaje,
 * Precio, Se muda, Cambió de gimnasio, Otro — para TODOS los tenants
 * existentes. Sin DELETE: se desactivan (`isActive`).
 */
export const renewalReasons = mysqlTable(
  "renewal_reasons",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    label: varchar("label", { length: 80 }).notNull(),
    sortOrder: int("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_renewal_reasons_tenant_label").on(
      table.tenantId,
      table.label,
    ),
  ],
);

/**
 * El followup MANUAL de una fila de renovación, uno por (tenant, sub que
 * vence). `messageCount` (0-4), `manualStatus`/`reasonId`/`reasonNote` (solo
 * cuando manualStatus='no_renovo', SPEC §"PATCH .../:subscriptionId") y
 * `updatedBy`/`updatedAt` para trazabilidad. El estado derivado (Renovó /
 * Volvió tarde / Pausada) NUNCA vive acá — sale de `subscriptions` en cada
 * lectura (ver `RenewalsService`).
 */
export const renewalFollowups = mysqlTable(
  "renewal_followups",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    subscriptionId: int("subscription_id")
      .references(() => subscriptions.id)
      .notNull(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    messageCount: tinyint("message_count").default(0).notNull(),
    lastMessageAt: timestamp("last_message_at"),
    manualStatus: renewalManualStatusEnum.default("en_proceso").notNull(),
    reasonId: int("reason_id").references(() => renewalReasons.id),
    reasonNote: varchar("reason_note", { length: 500 }),
    updatedBy: int("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_renewal_followups_tenant_subscription").on(
      table.tenantId,
      table.subscriptionId,
    ),
    index("idx_renewal_followups_tenant_user").on(
      table.tenantId,
      table.userId,
    ),
  ],
);

export const renewalFollowupsRelations = relations(
  renewalFollowups,
  ({ one }) => ({
    subscription: one(subscriptions, {
      fields: [renewalFollowups.subscriptionId],
      references: [subscriptions.id],
    }),
    user: one(users, {
      fields: [renewalFollowups.userId],
      references: [users.id],
    }),
    reason: one(renewalReasons, {
      fields: [renewalFollowups.reasonId],
      references: [renewalReasons.id],
    }),
  }),
);

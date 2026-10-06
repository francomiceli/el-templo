// Module: invitations — invitaciones de socios a sus conocidos (fase 194, D-04).
// Una fila por invitación ACTIVADA; NUNCA se borra (D-04): la anulación es
// `status='voided'` + `voided_at/voided_by/void_reason`. El cupo mensual, la
// ventana de 90 días, los estados de "Mis invitados" y la etapa del lead se
// derivan de esta tabla contando SOLO `status='active'`.
// Sin UNIQUE a propósito: un UNIQUE no compuesto obligaría a tocar el mapa de
// derivadas de `db:verify-uniques` (tenant-tables.ts). Índices simples.
import {
  mysqlTable,
  int,
  varchar,
  char,
  date,
  timestamp,
  mysqlEnum,
  index,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { branches } from "./branches";
import { subscriptions } from "./subscriptions";
import { tenantIdColumn } from "./tenant-column";

// Canal de la invitación (D-04). self_service = el socio invita desde su app.
// assisted = recepción/gestión/profe la carga a mano. mysqlEnum 1er-arg =
// nombre físico de la columna.
export const invitationChannelEnum = mysqlEnum("channel", [
  "self_service",
  "assisted",
]);

// Estado: active cuenta para cupo y ventana. voided = anulada (no cuenta).
export const invitationStatusEnum = mysqlEnum("status", ["active", "voided"]);

export const invitations = mysqlTable(
  "invitations",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload.
    tenantId: tenantIdColumn(),
    // Quién invita (socio invitador).
    inviterId: int("inviter_id")
      .references(() => users.id)
      .notNull(),
    // Quién fue invitado (usuario creado/reusado al activar).
    invitedUserId: int("invited_user_id")
      .references(() => users.id)
      .notNull(),
    channel: invitationChannelEnum.notNull(),
    status: invitationStatusEnum.notNull().default("active"),
    activatedAt: timestamp("activated_at").defaultNow().notNull(),
    // 'YYYY-MM' en la tz de la sede del invitador: mes de cupo consumido.
    quotaMonth: char("quota_month", { length: 7 }).notNull(),
    // Ventana de acceso de la invitación (plan is_trial, no es membresía, D-03).
    accessStartsOn: date("access_starts_on", { mode: "string" }).notNull(),
    accessExpiresOn: date("access_expires_on", { mode: "string" }).notNull(),
    subscriptionId: int("subscription_id").references(
      (): AnyMySqlColumn => subscriptions.id,
    ),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    // Snapshot de identidad del invitado al activar: últimos 10 dígitos del
    // teléfono y DNI, para detectar re-invitaciones aunque cambie el usuario.
    invitedPhoneLast10: varchar("invited_phone_last10", {
      length: 10,
    }).notNull(),
    invitedDni: varchar("invited_dni", { length: 20 }),
    // Conversión: el invitado compró una membresía real.
    convertedAt: timestamp("converted_at"),
    convertedSubscriptionId: int("converted_subscription_id").references(
      (): AnyMySqlColumn => subscriptions.id,
    ),
    // Staff que cargó la invitación asistida. NULL en self-service.
    createdBy: int("created_by").references((): AnyMySqlColumn => users.id, {
      onDelete: "set null",
    }),
    voidedAt: timestamp("voided_at"),
    voidedBy: int("voided_by").references((): AnyMySqlColumn => users.id, {
      onDelete: "set null",
    }),
    voidReason: varchar("void_reason", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_invitations_inviter_month").on(
      table.tenantId,
      table.inviterId,
      table.quotaMonth,
    ),
    index("idx_invitations_invited").on(
      table.tenantId,
      table.invitedUserId,
      table.activatedAt,
    ),
    index("idx_invitations_phone").on(table.tenantId, table.invitedPhoneLast10),
  ],
);

export const invitationsRelations = relations(invitations, ({ one }) => ({
  inviter: one(users, {
    fields: [invitations.inviterId],
    references: [users.id],
    relationName: "invitationInviter",
  }),
  invited: one(users, {
    fields: [invitations.invitedUserId],
    references: [users.id],
    relationName: "invitationInvited",
  }),
}));

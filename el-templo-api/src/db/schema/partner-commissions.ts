// Module: partner_commissions — registro auditable append-only de la comisión
// que cobra un partner por cada membresía confirmada (fase 179). Espejo de
// `referral-credits.ts` (idempotencia por cargo vía UNIQUE subscription_id,
// D-11), pero con ciclo de vida propio pending→settled/void: la liquidación es
// manual y batch por partner (D-16), y una revocación o anulación del pago
// generador dispara void automático de las comisiones pending (D-14) — las
// settled quedan intactas como histórico.
import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
  uniqueIndex,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { subscriptions } from "./subscriptions";
import { referralPartners } from "./referral-partners";
import { partnerReferrals } from "./partner-referrals";
import { tenantIdColumn } from "./tenant-column";

// Moneda de la comisión (D-13). Igual set de valores que
// referral-partners.ts:partnerCurrencyEnum, pero enum local propio: los
// builders de mysqlEnum son mutables (ver tenant-column.ts), así que cada
// tabla declara el suyo aunque los valores coincidan.
export const partnerCommissionCurrencyEnum = mysqlEnum("currency", [
  "ARS",
  "EUR",
]);

// Ciclo de vida de la comisión. pending = generada, aún no liquidada. settled
// = pagada al partner en una liquidación batch (D-16). void = anulada por
// revocación del vínculo o anulación del pago generador (D-14) — soft-void,
// ortogonal al módulo contable, mismo espíritu que otros pending|settled|void
// del repo.
export const partnerCommissionStatusEnum = mysqlEnum("status", [
  "pending",
  "settled",
  "void",
]);

export const partnerCommissions = mysqlTable(
  "partner_commissions",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    partnerId: int("partner_id")
      .references(() => referralPartners.id)
      .notNull(),
    partnerReferralId: int("partner_referral_id")
      .references(() => partnerReferrals.id)
      .notNull(),
    // El socio cuya membresía generó la comisión (denormalizado desde
    // partner_referrals.referred_id para queries directas del reporte de
    // conversiones sin JOIN extra).
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    // El cargo concreto que confirmó la membresía (qualifyFirstPayment,
    // pricePaid > 0, D-11/D-17).
    subscriptionId: int("subscription_id")
      .references(() => subscriptions.id)
      .notNull(),
    amount: int("amount").notNull(),
    currency: partnerCommissionCurrencyEnum.notNull(),
    status: partnerCommissionStatusEnum.notNull().default("pending"),
    settledAt: timestamp("settled_at"),
    // Admin (users.id) que ejecutó la liquidación batch. Self-ref conceptual a
    // users → AnyMySqlColumn callback, mismo patrón que createdBy en
    // referrals.ts. ON DELETE SET NULL.
    settledBy: int("settled_by").references((): AnyMySqlColumn => users.id, {
      onDelete: "set null",
    }),
    voidedAt: timestamp("voided_at"),
    voidReason: varchar("void_reason", { length: 200 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Idempotencia POR CARGO (D-11): un mismo cargo no puede generar dos
    // comisiones aunque el cobro se reintente. Clave = subscriptionId, calcada
    // de unique_referral_credit_sub. Derivada de FK scopeada (subscription_id
    // → subscriptions, que ancla en users) → va al allowlist de tenancy, NO
    // lleva tenant_id en la unique.
    uniqueIndex("unique_partner_commission_sub").on(table.subscriptionId),
  ],
);

export const partnerCommissionsRelations = relations(
  partnerCommissions,
  ({ one }) => ({
    partner: one(referralPartners, {
      fields: [partnerCommissions.partnerId],
      references: [referralPartners.id],
    }),
    partnerReferral: one(partnerReferrals, {
      fields: [partnerCommissions.partnerReferralId],
      references: [partnerReferrals.id],
    }),
    user: one(users, {
      fields: [partnerCommissions.userId],
      references: [users.id],
    }),
    subscription: one(subscriptions, {
      fields: [partnerCommissions.subscriptionId],
      references: [subscriptions.id],
    }),
    settledByUser: one(users, {
      fields: [partnerCommissions.settledBy],
      references: [users.id],
      relationName: "partnerCommissionSettledBy",
    }),
  }),
);

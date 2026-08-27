// Module: partner_referrals — vínculo socio↔partner (fase 179). Espejo de
// `referrals.ts` (referidos entre socios) pero para el origen "comercio
// partner": la regla dura de la fase es NO tocar `referrals` ni
// `computeReferralDiscountPercent`, así que este es un módulo con tablas
// propias. Exclusividad de origen (D-12): un socio tiene UN origen — referrer
// (referrals) XOR partner (esta tabla) — garantizada por UNIQUE(referred_id),
// no por lógica de aplicación.
import {
  mysqlTable,
  int,
  varchar,
  datetime,
  timestamp,
  mysqlEnum,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { subscriptions } from "./subscriptions";
import { referralPartners } from "./referral-partners";
import { tenantIdColumn } from "./tenant-column";

// Estado del vínculo. pending = atribuido, aún sin primer pago del referido.
// qualified = el referido pagó su 1er plan con pricePaid > 0 (mismo trigger
// qualifyFirstPayment que referrals). revoked = baja manual (D-14: dispara
// void automático de comisiones pending). mysqlEnum 1er-arg = nombre físico.
export const partnerReferralStatusEnum = mysqlEnum("status", [
  "pending",
  "qualified",
  "revoked",
]);

// Canal de atribución. self_service = el socio cargó el código en el registro
// (RegisterPage.vue, campo manual unificado D-02/D-03). assisted = asignación
// retroactiva desde la ficha del alumno (D-15).
export const partnerAttributionChannelEnum = mysqlEnum("attribution_channel", [
  "self_service",
  "assisted",
]);

// Tipo de beneficio SNAPSHOT al momento de vincular (independiente del enum
// de referral_partners: el partner puede cambiar su beneficio después sin
// reescribir la historia de vínculos ya creados).
export const partnerReferralBenefitTypeEnum = mysqlEnum("benefit_type", [
  "discount_percent",
  "free_pass",
]);

// Estado del beneficio (D-06/D-07). pending = aún no reservó/pagó. consumed =
// ya se aplicó (semana activada o descuento aplicado en un cobro). expired =
// venció a los 30 días del registro sin uso (el vínculo sigue vivo para
// atribución de comisión si paga después).
export const partnerBenefitStatusEnum = mysqlEnum("benefit_status", [
  "pending",
  "consumed",
  "expired",
]);

export const partnerReferrals = mysqlTable("partner_referrals", {
  id: int("id").primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  // Un partner trae muchos referidos — sin unique acá (a diferencia de
  // referredId más abajo).
  partnerId: int("partner_id")
    .references(() => referralPartners.id)
    .notNull(),
  // Quién fue referido por el partner. UNIQUE (D-12): exclusividad de origen —
  // un socio es referido por un referrer (referrals) XOR por un partner (esta
  // tabla), nunca ambos. El 2do reclamo falla en el constraint (409), no en
  // app logic.
  referredId: int("referred_id")
    .references(() => users.id)
    .notNull()
    .unique(),
  status: partnerReferralStatusEnum.notNull().default("pending"),
  attributionChannel: partnerAttributionChannelEnum.notNull(),
  // Snapshot del beneficio vigente en referral_partners al momento de vincular.
  benefitType: partnerReferralBenefitTypeEnum.notNull(),
  benefitValue: int("benefit_value").notNull(),
  benefitStatus: partnerBenefitStatusEnum.notNull().default("pending"),
  // Vencimiento del beneficio pendiente (D-07): created_at + 30 días,
  // materializado (no calculado) para que sea auditable y para que el cron/
  // reporte de "beneficios sin conversión" (D-08) no dependa de recalcular.
  benefitExpiresAt: datetime("benefit_expires_at").notNull(),
  benefitConsumedAt: timestamp("benefit_consumed_at"),
  // Snapshot de lo efectivamente aplicado en el cobro/reserva (D-09/D-10/D-18).
  // Nullable: NULL mientras el beneficio sigue pending o expired sin uso.
  appliedPercent: int("applied_percent"),
  appliedAmount: int("applied_amount"),
  appliedSubscriptionId: int("applied_subscription_id").references(
    () => subscriptions.id,
  ),
  // Motivo de la aplicación (o no-aplicación) del beneficio. Valores usados
  // por el resto de la fase: "aplicado", "perdio_vs_aura" (D-10/D-20: el
  // partner pierde contra AURA pero el beneficio se consume igual),
  // "semana_activada" (D-06: primera reserva dispara el plan de 7 días).
  appliedReason: varchar("applied_reason", { length: 120 }),
  qualifiedAt: timestamp("qualified_at"),
  // Admin (users.id) que creó el vínculo asistido (D-15, retroactivo). NULL en
  // self-service. Self-ref conceptual a users → AnyMySqlColumn callback, mismo
  // patrón que referrals.ts. ON DELETE SET NULL.
  createdBy: int("created_by").references((): AnyMySqlColumn => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const partnerReferralsRelations = relations(
  partnerReferrals,
  ({ one }) => ({
    partner: one(referralPartners, {
      fields: [partnerReferrals.partnerId],
      references: [referralPartners.id],
    }),
    referred: one(users, {
      fields: [partnerReferrals.referredId],
      references: [users.id],
      relationName: "partnerReferred",
    }),
    appliedSubscription: one(subscriptions, {
      fields: [partnerReferrals.appliedSubscriptionId],
      references: [subscriptions.id],
    }),
    createdByUser: one(users, {
      fields: [partnerReferrals.createdBy],
      references: [users.id],
      relationName: "partnerReferralCreatedBy",
    }),
  }),
);

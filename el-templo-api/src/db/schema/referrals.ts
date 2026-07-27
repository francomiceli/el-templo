// Module: referrals — vínculo de referido (milestone v5.5, fase 157).
// Fuente de verdad de "quién trajo a quién". Atribución por dos canales
// (self-service ?ref=CODE / asistido en el alta), cualificación al primer pago
// (D-01/D-20) y base para el cómputo del descuento simétrico (D-02).
import {
  mysqlTable,
  int,
  timestamp,
  mysqlEnum,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

// Estado del vínculo. pending = atribuido, aún sin primer pago del referido.
// qualified = el referido pagó su 1er plan con pricePaid > 0 (D-20). revoked =
// baja manual por fraude (D-10: la caída de cobertura NO revoca, solo suspende
// el descuento ese ciclo). mysqlEnum 1er-arg = nombre físico de la columna.
export const referralStatusEnum = mysqlEnum("status", [
  "pending",
  "qualified",
  "revoked",
]);

// Canal de atribución (D-08). self_service = el referido llegó con ?ref=CODE en
// el registro. assisted = recepción/gestión/profe cargó "¿Quién lo trajo?".
export const referralAttributionChannelEnum = mysqlEnum("attribution_channel", [
  "self_service",
  "assisted",
]);

// A/B test del copy de la card de referidos (v5.5 follow-up). Estampa qué
// variante de copy vio el REFERIDOR cuando se creó el vínculo (par='A'/impar='B',
// derivado de referrer_id). NULL para vínculos pre-experimento — el reporte solo
// agrega las variantes no-NULL. mysqlEnum 1er-arg = nombre físico de la columna.
export const referralCopyVariantEnum = mysqlEnum("copy_variant", ["A", "B"]);

export const referrals = mysqlTable("referrals", {
  id: int("id").primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  // Quién refirió. Un referidor puede traer muchos referidos (sin UNIQUE).
  referrerId: int("referrer_id")
    .references(() => users.id)
    .notNull(),
  // Quién fue referido. UNIQUE (D-14/REF-04): cada miembro tiene a lo sumo un
  // referidor — el 2do reclamo falla en el constraint, no en app logic.
  referredId: int("referred_id")
    .references(() => users.id)
    .notNull()
    .unique(),
  // pending → qualified al primer pago (D-01/D-21). Default pending.
  status: referralStatusEnum.notNull().default("pending"),
  attributionChannel: referralAttributionChannelEnum.notNull(),
  // Timestamp del flip a qualified (D-20). NULL mientras pending.
  qualifiedAt: timestamp("qualified_at"),
  // A/B copy test: variante que vio el referidor al crearse el vínculo. Nullable
  // (los vínculos previos al experimento quedan NULL). Se computa desde referrer_id.
  copyVariant: referralCopyVariantEnum,
  // Admin (users.id) que creó el vínculo asistido. NULL en self-service.
  // Self-ref conceptual a users → AnyMySqlColumn callback para evitar el error
  // de circular-init de TypeScript. ON DELETE SET NULL como createdBy en users.
  createdBy: int("created_by").references((): AnyMySqlColumn => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(users, {
    fields: [referrals.referrerId],
    references: [users.id],
    relationName: "referrer",
  }),
  referred: one(users, {
    fields: [referrals.referredId],
    references: [users.id],
    relationName: "referred",
  }),
}));

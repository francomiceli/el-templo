// Module: referral_partners — entidad de comercio/marca partner (fase 179).
// NO es un `users` row: un partner es un negocio externo (cafetería, tienda,
// marca) que promociona El Templo con un código impreso en tarjetas físicas
// (D-01/D-04). Cada partner define UN beneficio para quien llega con su código
// (descuento % en la primera cuota, o semana gratis) y una comisión fija
// one-time por cada membresía confirmada que genera (D-11). Tenancy-native
// desde el día uno (D-20): master ya tiene la infra 166-171 en producción.
import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
  mysqlEnum,
  uniqueIndex,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { branches } from "./branches";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

// Tipo de beneficio que recibe quien se registra con el código del partner.
// discount_percent = % off en la primera cuota (D-09, one-shot). free_pass =
// semana gratis de 7 días (D-05/D-19). mysqlEnum 1er-arg = nombre físico.
export const partnerBenefitTypeEnum = mysqlEnum("benefit_type", [
  "discount_percent",
  "free_pass",
]);

// Tipo de comisión que cobra el partner por cada membresía confirmada.
// fixed = monto fijo one-time (D-11, el único soportado en v1). none = partner
// promocional sin comisión (ej. marca que solo quiere visibilidad).
export const partnerCommissionTypeEnum = mysqlEnum("commission_type", [
  "none",
  "fixed",
]);

// Moneda de la comisión/beneficio del partner. AR + ES desde el arranque
// (D-13): el partner hereda país/moneda de su sede (branchId), pero la
// columna queda explícita acá para no depender de un JOIN en cada lectura.
export const partnerCurrencyEnum = mysqlEnum("currency", ["ARS", "EUR"]);

export const referralPartners = mysqlTable(
  "referral_partners",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    name: varchar("name", { length: 120 }).notNull(),
    // Código legible impreso en la tarjeta física (D-01), ej. "CAFEX". Se
    // guarda normalizado upper+trim por el service layer (plan 179-02). Unique
    // COMPUESTA con tenant_id (ver abajo): dos gimnasios pueden compartir código.
    code: varchar("code", { length: 24 }).notNull(),
    // De la sede se hereda país y moneda (D-13).
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    benefitType: partnerBenefitTypeEnum.notNull(),
    // Porcentaje 1-100 cuando benefitType='discount_percent'; 0 cuando
    // benefitType='free_pass' (el valor de la semana gratis vive en D-19, fijo).
    benefitValue: int("benefit_value").notNull(),
    commissionType: partnerCommissionTypeEnum.notNull().default("fixed"),
    // Monto fijo de la comisión (D-11). 0 cuando commissionType='none'.
    commissionValue: int("commission_value").notNull().default(0),
    currency: partnerCurrencyEnum.notNull(),
    contactName: varchar("contact_name", { length: 120 }),
    contactPhone: varchar("contact_phone", { length: 40 }),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    // Admin (users.id) que dio de alta el partner. Self-ref conceptual a users
    // → AnyMySqlColumn callback para evitar el error de circular-init de
    // TypeScript (mismo patrón que referrals.ts createdBy). ON DELETE SET NULL.
    createdBy: int("created_by").references((): AnyMySqlColumn => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    // Unicidad POR TENANT (D-20/CON-01): dos gimnasios distintos pueden tener
    // el mismo código de partner sin pisarse. `code` NO deriva de ninguna FK
    // scopeada (no es como referred_id → users), así que esta unique NO va al
    // allowlist de tenant-tables.ts — necesita tenant_id explícito.
    uniqueIndex("uq_referral_partners_tenant_code").on(
      table.tenantId,
      table.code,
    ),
  ],
);

export const referralPartnersRelations = relations(
  referralPartners,
  ({ one }) => ({
    branch: one(branches, {
      fields: [referralPartners.branchId],
      references: [branches.id],
    }),
    createdByUser: one(users, {
      fields: [referralPartners.createdBy],
      references: [users.id],
      relationName: "referralPartnerCreatedBy",
    }),
  }),
);

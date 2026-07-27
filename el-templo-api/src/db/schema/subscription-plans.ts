// Module: subscriptions
import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
  mysqlEnum,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { programs } from "./micro-programs";
import { tenantIdColumn } from "./tenant-column";

export const planTierEnum = mysqlEnum("plan_tier", [
  "flex",
  "foundation",
  "performance",
  "other",
]);

export const bookingModeEnum = mysqlEnum("booking_mode", ["fixed", "flexible"]);

export const planCategoryEnum = mysqlEnum("plan_category", [
  "presencial",
  "online_regular",
  "online_goal",
  "online_coach",
  "especial", // Fase 161 (PASE-01, D-12): pase "Actividades con Aura". Append-last, byte-for-byte con 0179.
]);

export const subscriptionPlans = mysqlTable(
  "subscription_plans",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description"),
    planTier: planTierEnum.notNull(),
    bookingMode: bookingModeEnum.notNull(),
    planCategory: planCategoryEnum.notNull(),
    linkedProgramId: int("linked_program_id").references(() => programs.id),
    priceRegular: int("price_regular").notNull(),
    priceZero: int("price_zero").notNull(),
    priceCreditCard: int("price_credit_card"),
    durationDays: int("duration_days").notNull(),
    classesPerWeek: int("classes_per_week"),
    // Fase 161 (PASE-01, D-03/D-04): budget mensual EXPLÍCITO del pase especial.
    // NULL para planes no-especiales -- su budget deriva de ceil(durationDays/7)*classesPerWeek.
    // Sin default ni notNull → filas existentes quedan NULL (cero cambio de comportamiento).
    monthlyClassBudget: int("monthly_class_budget"),
    // Fase 161 (D-01): discriminador Socio↔Externo del pase especial. true = pase Socio
    // (exige presencial activo al asignar/renovar), false = Externo. Default false → planes
    // no-especiales no lo usan (cero cambio de comportamiento).
    requiresPresencial: boolean("requires_presencial").default(false).notNull(),
    multiBranch: boolean("multi_branch").default(false).notNull(),
    isTrial: boolean("is_trial").default(false).notNull(),
    isGroup: boolean("is_group").default(false).notNull(),
    groupMaxMembers: int("group_max_members"),
    isActive: boolean("is_active").default(true).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    country: varchar("country", { length: 2 }).default("AR").notNull(),
    currency: varchar("currency", { length: 3 }).default("ARS").notNull(),
    grantsAllPrograms: boolean("grants_all_programs").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    // Fase 168 (CON-01): unicidad POR TENANT — el nombre del plan es único dentro
    // del gimnasio y del país, no del mundo. Índice byte-for-byte con la
    // migración 0196. Sin índice secundario (D-06): es un catálogo chico.
    //
    // Este índice EXISTÍA en MySQL desde la migración 0091 con el nombre
    // ux_subscription_plans_name_country y nunca se había declarado acá — drift
    // schema↔DB que hizo que el inventario del doc 05 anotara "name NO es
    // unique" y que la lista D-01 no incluyera esta conversión. Lo encontró el
    // verificador src/db/scripts/verify-tenant-uniques.ts. Al declararlo, el
    // drift queda cerrado: Drizzle ya no ve una unique fantasma.
    uniqueIndex("uq_subscription_plans_tenant_name_country").on(
      table.tenantId,
      table.name,
      table.country,
    ),
  ],
);

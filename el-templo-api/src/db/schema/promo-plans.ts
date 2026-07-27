// Module: subscriptions (promo campaigns)
import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
  datetime,
  mysqlEnum,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const promoTypeEnum = mysqlEnum("promo_type", [
  "auto",
  "admin_assignable",
]);

export const promoPlans = mysqlTable(
  "promo_plans",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    name: varchar("name", { length: 150 }).notNull(),
    // Fase 168 (CON-01): el código promo dejó de ser único global — la unique
    // vive en el callback de tabla como uq_promo_plans_tenant_promo_code.
    promoCode: varchar("promo_code", { length: 50 }).notNull(),
    planDurationDays: int("plan_duration_days").notNull().default(30),
    subscriptionPlanId: int("subscription_plan_id").notNull(),
    startDate: datetime("start_date").notNull(),
    expiryDate: datetime("expiry_date").notNull(),
    promoType: promoTypeEnum.notNull().default("auto"),
    country: varchar("country", { length: 2 }).default("AR").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    redemptionCount: int("redemption_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    // Fase 168 (CON-01): unicidad POR TENANT — dos gimnasios pueden tener el mismo
    // código promo sin pisarse. Sin índice secundario (D-06): promo_plans es un
    // catálogo chico. Índice byte-for-byte con la migración 0196.
    uniqueIndex("uq_promo_plans_tenant_promo_code").on(
      table.tenantId,
      table.promoCode,
    ),
  ],
);

// Módulo: marketing — gasto publicitario diario por campaña (fase 195, plan 08,
// D-20). Lo llena el job diario contra la Marketing API de Meta (Insights): los
// últimos 7 días se re-traen (Meta ajusta el gasto) y se hace upsert por la
// unique. La moneda se guarda TAL CUAL la informa la cuenta publicitaria: nunca
// se convierte (Pitfall 13). Insumo del costo por alumno pago de Reportes.
//
// Nace tenancy-native y STRICT en `src/db/tenant-tables.ts`
// (TENANT_STRICT_MODULES["marketing"]).
import {
  mysqlTable,
  int,
  varchar,
  char,
  date,
  decimal,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const adSpendDaily = mysqlTable(
  "ad_spend_daily",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    platform: varchar("platform", { length: 16 }).notNull().default("meta"),
    /** Id de la cuenta publicitaria SIN el prefijo `act_`. */
    accountId: varchar("account_id", { length: 40 }).notNull(),
    campaignId: varchar("campaign_id", { length: 40 }).notNull(),
    campaignName: varchar("campaign_name", { length: 255 }).notNull(),
    /** Día de la cuenta publicitaria (YYYY-MM-DD, su huso). */
    spendDate: date("spend_date", { mode: "string" }).notNull(),
    spend: decimal("spend", {
      precision: 14,
      scale: 2,
      mode: "string",
    }).notNull(),
    /** Moneda de la cuenta (ISO-4217), sin conversión. */
    currency: char("currency", { length: 3 }).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_ad_spend_daily_tenant_campaign_date").on(
      table.tenantId,
      table.platform,
      table.campaignId,
      table.spendDate,
    ),
    index("idx_ad_spend_daily_tenant_date").on(table.tenantId, table.spendDate),
  ],
);

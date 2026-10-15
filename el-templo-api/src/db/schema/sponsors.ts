// Module: sponsors — Fase 199 (Rediseño de Mi Templo + patrocinadores).
// D-17..D-19, D-25 de 199-CONTEXT.md. Patrocinador ≠ Partner (D-17): la marca
// DA beneficios a nuestros socios, no nos trae socios con comisión.
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  date,
  mysqlEnum,
  boolean,
  datetime,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { referralPartners } from "./referral-partners";
import { tenantIdColumn } from "./tenant-column";

// mysqlEnum 1er-arg = nombre físico de la columna (regla 6 del skill
// el-templo-db-migrations): tiene que coincidir byte a byte con la migración.
export const sponsorRedeemTypeEnum = mysqlEnum("redeem_type", [
  "code",
  "carnet",
]);

/**
 * `sponsor_brands` — catálogo de patrocinadores.
 *
 * Tabla de plataforma (TENANT_EXEMPT_TABLES): los patrocinadores son de la
 * plataforma, no del gimnasio (D-18). Por eso NO tiene `tenant_id`. Patrocinador
 * ≠ Partner (D-17).
 *
 * Nace inactiva (`isActive` false): activar pasa por el límite de D-24.
 * `benefit` se muestra a 30 px sin quiebre, por eso el tope corto de 16.
 */
export const sponsorBrands = mysqlTable(
  "sponsor_brands",
  {
    id: int("id").primaryKey().autoincrement(),
    name: varchar("name", { length: 60 }).notNull(),
    // Rubro, una línea.
    category: varchar("category", { length: 60 }).notNull(),
    logoUrl: varchar("logo_url", { length: 500 }),
    // Nombre de Material Icon para fallback de logo y marca de agua. NULL →
    // monograma.
    icon: varchar("icon", { length: 40 }),
    // Formato `#rrggbb`.
    bgColor: varchar("bg_color", { length: 7 }).notNull(),
    textColor: varchar("text_color", { length: 7 }).notNull(),
    benefit: varchar("benefit", { length: 16 }).notNull(),
    detail: varchar("detail", { length: 80 }).notNull(),
    conditions: text("conditions"),
    redeemType: sponsorRedeemTypeEnum.notNull(),
    redeemCode: varchar("redeem_code", { length: 40 }),
    countryAr: boolean("country_ar").notNull().default(false),
    countryEs: boolean("country_es").notNull().default(false),
    startsOn: date("starts_on", { mode: "string" }),
    endsOn: date("ends_on", { mode: "string" }),
    isActive: boolean("is_active").notNull().default(false),
    sortOrder: int("sort_order").notNull().default(0),
    partnerId: int("partner_id").references(() => referralPartners.id, {
      onDelete: "set null",
    }),
    createdBy: int("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_sponsor_brands_active_sort").on(table.isActive, table.sortOrder),
  ],
);

/**
 * `sponsor_views` — métricas por socio y marca (D-25). Una fila por
 * (socio, marca) con el `tenant_id` del socio (gym-owned). `firstSeenAt` = la
 * card estuvo activa en el carrusel, `tappedAt` = abrió el detalle,
 * `redeemAt` = copió el código o abrió el carnet. Cae en cascada al borrar la
 * marca o el socio.
 */
export const sponsorViews = mysqlTable(
  "sponsor_views",
  {
    id: int("id").primaryKey().autoincrement(),
    // Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    brandId: int("brand_id")
      .references(() => sponsorBrands.id, { onDelete: "cascade" })
      .notNull(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    firstSeenAt: datetime("first_seen_at").notNull(),
    tappedAt: datetime("tapped_at"),
    redeemAt: datetime("redeem_at"),
  },
  (table) => [
    // user_id PRIMERO: brand_id apunta a una tabla exenta (sponsor_brands), solo
    // user_id deriva el scope de tenant.
    uniqueIndex("uq_sponsor_views_user_brand").on(table.userId, table.brandId),
    index("idx_sponsor_views_brand").on(table.brandId),
  ],
);

export type SponsorBrandRow = typeof sponsorBrands.$inferSelect;
export type SponsorViewRow = typeof sponsorViews.$inferSelect;

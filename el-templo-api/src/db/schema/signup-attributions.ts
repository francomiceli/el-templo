// Módulo: marketing — atribución propia de altas (fase 195, plan 07, D-18).
//
// `signup_attributions` guarda de dónde vino cada alumno nuevo: UNA fila por
// usuario (UNIQUE por tenant). La llenan el registro autoservicio
// (`captured_via='register'`, web/Android/iOS) y el alta de Sesión de Prueba
// del admin (`captured_via='admin_trial'`, origen cargado a mano). Lo CRUDO
// (utm, promo, ref, referrer, landing, click ids) se guarda tal cual y el
// `channel` sale de `classifyChannel` (modules/marketing/channel.ts), una
// función pura que se puede re-ejecutar sobre lo guardado.
//
// `platform` lo declara el cliente: Meta CAPI (plan 195-08) excluye 'ios'
// (Apple ATT, D-24) y 'unknown'. `client_ip`/`user_agent` son PII temporal que
// solo CAPI necesita: se purgan (`pii_purged_at`) a más tardar a los 7 días.
//
// Nace tenancy-native y STRICT en `src/db/tenant-tables.ts`
// (TENANT_STRICT_MODULES["marketing"]).
import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { branches } from "./branches";
import { tenantIdColumn } from "./tenant-column";

export const signupAttributions = mysqlTable(
  "signup_attributions",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    branchId: int("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    channel: varchar("channel", { length: 32 }).notNull(),
    utmSource: varchar("utm_source", { length: 150 }),
    utmMedium: varchar("utm_medium", { length: 150 }),
    utmCampaign: varchar("utm_campaign", { length: 150 }),
    utmContent: varchar("utm_content", { length: 150 }),
    utmTerm: varchar("utm_term", { length: 150 }),
    promoCode: varchar("promo_code", { length: 50 }),
    refCode: varchar("ref_code", { length: 32 }),
    manualOrigin: varchar("manual_origin", { length: 32 }),
    referrerHost: varchar("referrer_host", { length: 255 }),
    landingPath: varchar("landing_path", { length: 500 }),
    fbclid: varchar("fbclid", { length: 255 }),
    fbc: varchar("fbc", { length: 300 }),
    fbp: varchar("fbp", { length: 100 }),
    gclid: varchar("gclid", { length: 255 }),
    /** 'web' | 'android' | 'ios' | 'admin' | 'unknown' (declarada por el cliente). */
    platform: varchar("platform", { length: 16 }).notNull(),
    /** 'register' | 'admin_trial'. */
    capturedVia: varchar("captured_via", { length: 16 }).notNull(),
    firstTouchAt: timestamp("first_touch_at"),
    clientIp: varchar("client_ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 512 }),
    piiPurgedAt: timestamp("pii_purged_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_signup_attributions_tenant_user").on(
      table.tenantId,
      table.userId,
    ),
    index("idx_signup_attributions_tenant_created").on(
      table.tenantId,
      table.createdAt,
    ),
    index("idx_signup_attributions_tenant_campaign").on(
      table.tenantId,
      table.utmCampaign,
    ),
  ],
);

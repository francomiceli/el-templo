// Module: tenants — raíz de la jerarquía multi-tenant (v6.0, FUND-01)
//
// `tenants` es la tabla raíz del modelo de aislamiento: toda tabla gym-owned
// cuelga (directa o transitivamente) de una fila de acá. El Templo es el
// tenant `id=1` — la fila la siembra la migración 0190 de forma idempotente y
// el backfill de las anclas (tanda B, migración 0191) escribe literalmente 1.
//
// status — palanca comercial del SaaS (README §5, validado 2026-07-02):
// - 'active'    operativo.
// - 'suspended' falta de pago u otra medida reversible. Los DATOS QUEDAN
//               INTACTOS: todo lo autenticado del tenant responde 403
//               (TENANT_SUSPENDED), pero no se borra ni se degrada nada.
// - 'archived'  baja lógica. NUNCA se hace DELETE físico de un tenant.
//
// El enforcement de `status` NO vive acá ni en un hook aparte: vive en la
// capa 1 (`attachScope`, ex `attachCountryScope`), en la MISMA query por
// request que ya resuelve el scope de país (D-02/D-03, diseño doc 03 §3).
// El tenant JAMÁS viaja en el JWT ni se acepta de payload/query — siempre se
// resuelve server-side a partir de `users.tenant_id`.
//
// `tenant_settings` espeja el KV de `system_settings`, pero scoped por tenant.
// Nace VACÍA (D-05): la coexistencia con `system_settings` es gradual, módulo
// a módulo; `system_settings` NO recibe `tenant_id` en todo el milestone.
//
// Sin campos de billing/plan comercial (README §5): se agregan cuando exista
// modelo comercial, no antes.
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ⚠️ El PRIMER argumento de `mysqlEnum` es el NOMBRE DE COLUMNA FÍSICA, no un
// nombre de tipo (trampa documentada en el skill el-templo-db-migrations,
// Hard Rule 6 — incidentes 0138/0139). El snippet del README §5 pasa
// `tenant_status` como primer argumento, lo que crearía una columna física con
// ESE nombre; la intención del diseño (README §5 notas, doc 03 §3,
// ROADMAP y CONTEXT de la fase) es `tenants.status`. Se adopta `status` y
// `0190_tenants_core.sql` lo espeja byte a byte (mismo nombre, mismos valores,
// mismo orden).
export const tenantStatusEnum = mysqlEnum("status", [
  "active",
  "suspended",
  "archived",
]);

export const tenants = mysqlTable("tenants", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  status: tenantStatusEnum.default("active").notNull(),
  // Defaults para las branches nuevas del tenant — NO son verdad absoluta:
  // cada branch conserva su country/timezone propios (modelo actual, no cambia).
  defaultCountry: varchar("default_country", { length: 2 })
    .default("AR")
    .notNull(),
  defaultCurrency: varchar("default_currency", { length: 3 })
    .default("ARS")
    .notNull(),
  defaultTimezone: varchar("default_timezone", { length: 50 })
    .default("America/Argentina/Buenos_Aires")
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// Config por-tenant: mismo KV que `system_settings`, scoped. Hogar natural
// también para feature-flags por tenant (mecanismo de módulos, doc 04).
export const tenantSettings = mysqlTable(
  "tenant_settings",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    settingKey: varchar("setting_key", { length: 100 }).notNull(),
    settingValue: text("setting_value").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_tenant_setting").on(t.tenantId, t.settingKey)],
);

// Fase 166 (D-05): reservados a nivel aplicación, no en DB. El `slug` es único
// global y sirve igual con sitio único, subdominio por tenant o dominio propio
// (README §5); estos valores quedan fuera del alcance de un tenant por si la
// decisión diferida de login/dominios termina en subdominios. Todavía no tiene
// consumidor de runtime — el alta de tenants es post-v6.0.
export const RESERVED_TENANT_SLUGS = [
  "admin",
  "api",
  "www",
  "app",
  "auth",
  "staging",
  "static",
  "assets",
  "cdn",
  "mail",
  "docs",
  "support",
  "dashboard",
] as const;

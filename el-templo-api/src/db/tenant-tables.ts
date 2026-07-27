// Módulo: tenant-tables — clasificación canónica "¿esta tabla lleva tenant_id?" (v6.0, COL-01)
//
// Esta es la fuente de verdad de qué tablas son gym-owned (llevan la columna
// `tenant_id` que declara `schema/tenant-column.ts`) y cuáles están exentas.
// Vive fuera de `schema/` a propósito: no es una tabla, es metadata del modelo.
//
// DE DÓNDE SALE LA LISTA
// ----------------------
// Del inventario cerrado `.docs/saas-multitenancy/05-inventario-tablas-2026-07-26.md`:
// 46 tablas CORE (§1) + 42 TEMPLO-MÓDULO (§2) = 88, menos `system_settings`
// (§1.7, no recibe columna), más las 2 anclas que la fase 166 ya migró
// (`users` y `branches`, migración 0191) = **87 gym-owned**. Las 4 restantes
// del schema quedan exentas, con motivo explícito abajo. 87 + 4 = 91 = el
// total de tablas del schema Drizzle, verificado por
// `test/db/tenant-tables.test.ts`.
//
// POR QUÉ IMPORTA MANTENERLA
// --------------------------
// Esta lista es el insumo directo de las fases siguientes del milestone:
//   - Fase 168 (CON-02): índices y uniques compuestas `(tenant_id, ...)`.
//   - Fase 169 (helpers de escritura): `tenantWhere` / `tenantValues`.
//   - Fase 170 (ISO): sentinel de pool mysql2 y lint en CI.
// Agregar una tabla nueva al schema OBLIGA a clasificarla acá. El test
// `test/db/tenant-tables.test.ts` es fail-closed: una tabla sin clasificar deja
// la suite en rojo, no pasa en silencio.
//
// Los nombres son los FÍSICOS de MySQL (los de `getTableName()`), no los de las
// constantes TypeScript.

/**
 * Tablas gym-owned: pertenecen a un gimnasio concreto y por lo tanto llevan
 * `tenant_id`. Incluye las 2 anclas ya migradas en la fase 166 (`users`,
 * `branches`) más las 85 de la tanda C (migraciones 0192-0195). Orden
 * alfabético para que el diff de un alta futura sea de una sola línea.
 */
export const GYM_OWNED_TABLES = [
  "academy_inquiries",
  "activities",
  "app_waitlist",
  "attendance",
  "audit_log",
  "aura_balances",
  "aura_config",
  "aura_transactions",
  "balances",
  "blog_post_tags",
  "blog_posts",
  "blog_tags",
  "bookings",
  "branches",
  "campaign_events",
  "campaign_sends",
  "campaign_unsubscribes",
  "campaigns",
  "cash_registers",
  "check_in_responses",
  "class_coach_assignments",
  "coach_ratings",
  "completed_sessions",
  "contraction_rules",
  "cost_centers",
  "day_modes",
  "debt_management",
  "device_tokens",
  "evaluation_requests",
  "exercise_adjustments",
  "exercise_dimension_proposals",
  "exercise_milestone_proposals",
  "exercise_progressions",
  "exercises",
  "financial_transactions",
  "format_compatibility",
  "formats",
  "franchise_applications",
  "gladius_inquiries",
  "gladius_products",
  "holidays",
  "improvement_proposals",
  "intensity_rules",
  "member_logins",
  "member_notes",
  "member_profiles",
  "notification_preferences",
  "notification_templates",
  "onboarding_analytics",
  "pending_notifications",
  "plan_programs",
  "program_content_blocks",
  "program_enrollments",
  "programs",
  "promo_plans",
  "referral_credits",
  "referral_cta_clicks",
  "referrals",
  "refresh_tokens",
  "routes",
  "saved_blocks",
  "schedule_exceptions",
  "schedules",
  "session_blocks",
  "session_edit_logs",
  "session_prescriptions",
  "session_traces",
  "sessions",
  "spom_config",
  "spom_rules",
  "subscription_plans",
  "subscription_schedule_changes",
  "subscription_schedules",
  "subscriptions",
  "transaction_links",
  "tv_class_state",
  "tv_devices",
  "tv_pairings",
  "user_branches",
  "user_sepa_details",
  "user_status_history",
  "users",
  "weekly_rotator",
  "wellhub_bookings",
  "wellhub_classes",
  "wellhub_events",
  "wellhub_slots",
] as const;

/**
 * Tablas EXENTAS de `tenant_id`, con el motivo de cada una. Son cuatro y no hay
 * una quinta por descuido: cualquier tabla que no esté acá ni en
 * `GYM_OWNED_TABLES` deja el test en rojo.
 *
 * - `tenants` — la raíz del modelo. No puede pertenecer a un tenant: ES el
 *   tenant.
 * - `tenant_settings` — config KV por tenant. Ya tiene su `tenant_id` como FK
 *   estructural de la fase 166 (parte de su unique `uq_tenant_setting`), no
 *   como columna denormalizada de aislamiento. Es plataforma, no gym-owned.
 * - `system_settings` — la mina M2 del diseño (doc 05 §1.7): config global
 *   heredada que se deprecia GRADUALMENTE hacia `tenant_settings`, módulo a
 *   módulo. No recibe `tenant_id` en todo v6.0 — agregárselo crearía dos
 *   fuentes de verdad para la misma clave durante la transición.
 * - `labs_inquiries` — leads del PROPIO SaaS (El Templo Labs), no de un
 *   gimnasio: es GLOBAL de plataforma (doc 05 §4).
 */
export const TENANT_EXEMPT_TABLES = [
  "tenants",
  "tenant_settings",
  "system_settings",
  "labs_inquiries",
] as const;

export type GymOwnedTable = (typeof GYM_OWNED_TABLES)[number];
export type TenantExemptTable = (typeof TENANT_EXEMPT_TABLES)[number];

const GYM_OWNED_SET: ReadonlySet<string> = new Set(GYM_OWNED_TABLES);

/**
 * `true` si la tabla física `name` lleva la columna `tenant_id`.
 *
 * Acepta `string` (no `GymOwnedTable`) a propósito: los consumidores de las
 * fases 168-170 clasifican nombres que salen de INFORMATION_SCHEMA, de
 * `getTableName()` o del AST del linter — todos `string` en tiempo de
 * compilación.
 */
export function isGymOwnedTable(name: string): boolean {
  return GYM_OWNED_SET.has(name);
}

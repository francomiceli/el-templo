// Módulo: tenant-tables — clasificación canónica "¿esta tabla lleva tenant_id?" (v6.0, COL-01)
//                          + "¿por qué esta unique sigue siendo global?" (v6.0, CON-01/CON-02)
//
// Esta es la fuente de verdad de qué tablas son gym-owned (llevan la columna
// `tenant_id` que declara `schema/tenant-column.ts`) y cuáles están exentas.
// Vive fuera de `schema/` a propósito: no es una tabla, es metadata del modelo.
//
// SEGUNDA RESPONSABILIDAD (fase 168, D-13/D-14)
// --------------------------------------------
// La fase 168 le suma un segundo eje de clasificación: no alcanza con saber qué
// TABLAS llevan `tenant_id`, hay que saber qué UNIQUES siguen siendo globales y
// POR QUÉ. Después de la migración 0196 quedan uniques de tablas gym-owned que
// no arrancan con `tenant_id`, y hay exactamente tres motivos legítimos:
//   1. `TENANT_GLOBAL_UNIQUES` — la lista M8 (doc 05 §6, aprobada 2026-07-26):
//      ids de plataforma externa y secretos random con lookup pre-scope, que
//      quedan globales PARA SIEMPRE y a propósito.
//   2. `TENANT_UNIQUE_ALLOWLIST` — uniques seguras por transitividad (su primer
//      campo es una FK a una tabla ya scopeada) o deuda consciente de módulos
//      Templo-only.
//   3. Ninguno: entonces es un bug de aislamiento y el verificador la reporta.
// El motivo es OBLIGATORIO por entrada (D-13): los dos registros son
// `Record<clave, motivo>` justamente para que no se pueda agregar una unique sin
// escribir por qué. Una allowlist sin motivos se vuelve una alfombra.
//
// El gate que consume estos registros es
// `src/db/scripts/verify-tenant-uniques.ts` (CLI + suite), fail-closed: una
// unique global nueva sin clasificar devuelve exit 1.
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
//   - Fase 170 (ISO): sentinel de pool mysql2 y lint en CI. Le suma un TERCER
//     registro, `TENANT_STRICT_MODULES` (CON-05/CON-06, D-05/D-06): qué módulos
//     ya están migrados al patrón de la 169 y por lo tanto pasan de "deuda
//     conocida" a "regresión". Sus dos consumidores son
//     `src/db/sentinel/install.ts` (throw en test/dev sobre esas tablas, silencio
//     sobre el resto) y `src/db/scripts/lint-tenant.ts` (gate de coherencia
//     strict/allowlist, D-15).
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

// ─────────────────────────────────────────────────────────────────────────────
// Fase 168 (CON-01 / CON-02) — clasificación de uniques
// ─────────────────────────────────────────────────────────────────────────────
//
// FORMATO DE LA CLAVE
// -------------------
// `"<tabla_física>.<nombre_físico_de_índice>"`, los dos tal como los devuelve
// INFORMATION_SCHEMA.STATISTICS — NO los nombres de las constantes TypeScript ni
// el nombre de la columna. Importa: cuando una unique se declara con `.unique()`
// inline, Drizzle genera el nombre `<tabla>_<columna>_unique`, pero varias
// uniques de este repo nacieron en una migración hand-written con OTRO nombre y
// el schema `.ts` nunca lo reflejó (`refresh_tokens` es el caso vivo: el schema
// dice `.unique()` y la migración 0125 la creó como
// `uq_refresh_tokens_token_hash`). La base es la verdad: estas claves se leen de
// `INFORMATION_SCHEMA`, no se deducen del schema.

/**
 * Lista **M8** — uniques de tablas gym-owned que quedan GLOBALES a propósito y
 * para siempre, con el motivo de cada una (doc 05 §6, aprobada completa el
 * 2026-07-26 — doc 06 §8-Q4). Son once y no hay una doceava por descuido.
 *
 * Dos racionales, y ninguno es "no llegamos a convertirla":
 *
 * - **Id de plataforma externa.** El valor lo emite un tercero (Wellhub/Gympass)
 *   y es único en SU universo. La unique global es justamente la que impide que
 *   dos tenants reclamen el mismo recurso externo: componerla por `tenant_id`
 *   permitiría que dos gimnasios se declaren dueños del mismo gym de Wellhub.
 * - **Secreto random con lookup pre-scope.** El token llega solo, sin sesión: el
 *   tenant se resuelve DESPUÉS de encontrar la fila. Componer por `tenant_id`
 *   sería circular (haría falta el tenant para buscar lo que da el tenant), y
 *   además la colisión entre dos valores random de 32+ bytes no existe en la
 *   práctica.
 *
 * Cada una de las once lleva además un comentario de una línea en su schema
 * file, que apunta acá (fase 168 plan 02). Si alguien "arregla" una de estas
 * convirtiéndola a compuesta, rompe login, push, el pairing del TV o la
 * integración con Wellhub.
 */
export const TENANT_GLOBAL_UNIQUES: Record<string, string> = {
  // ── Ids de plataforma externa ──────────────────────────────────────────────
  "users.users_gympass_id_unique":
    "Id de plataforma externa: `gympass_id` lo emite Gympass/Wellhub, no El Templo. Global impide que dos tenants reclamen al mismo usuario de Gympass, que es exactamente el contrato que queremos.",
  "branches.branches_wellhub_gym_id_unique":
    "Id de plataforma externa: `wellhub_gym_id` identifica una sede en el catálogo de Wellhub. Dos tenants no pueden mapear su sede al MISMO gym de Wellhub — la unique global es la que lo garantiza.",
  "wellhub_classes.idx_wellhub_classes_class_id":
    "Id externo: `wellhub_class_id` viene en el payload de Wellhub y es la clave de upsert del sync. Componerla por tenant duplicaría la misma clase de Wellhub en dos gimnasios.",
  "wellhub_slots.idx_wellhub_slots_slot_id":
    "Id externo: `wellhub_slot_id` es la identidad del cupo del lado de Wellhub y la clave de upsert del sync de slots.",
  "wellhub_bookings.idx_wellhub_bookings_number":
    "Id externo: `booking_number` lo asigna Wellhub a la reserva. Es la referencia con la que Wellhub pide cancelar o validar, y llega sin ningún scope de tenant.",
  "wellhub_events.idx_wellhub_events_event_id":
    "Id externo con función de idempotencia: `event_id` deduplica el webhook de Wellhub. El webhook se procesa ANTES de saber a qué tenant pertenece, así que el dedup tiene que ser global o no dedup nada.",

  // ── Secretos random con lookup pre-scope ───────────────────────────────────
  "refresh_tokens.uq_refresh_tokens_token_hash":
    "Secreto random con lookup pre-scope: el refresh llega con el token solo y el tenant sale de la fila encontrada, no al revés. OJO con el nombre: el schema declara `.unique()` inline (Drizzle lo llamaría `refresh_tokens_token_hash_unique`) pero la migración 0125 lo creó como `uq_refresh_tokens_token_hash` — el nombre físico manda.",
  "device_tokens.device_tokens_token_unique":
    "Token de push (FCM) con lookup pre-scope: el token lo emite Firebase y el upsert lo busca por valor pelado para reasignarlo cuando el mismo dispositivo cambia de socio.",
  "tv_devices.tv_devices_token_hash_unique":
    "Secreto random con lookup pre-scope: el TV se autentica con su token y de ahí sale la sede — y por lo tanto el tenant. Componerla sería circular.",
  "tv_pairings.tv_pairings_user_code_unique":
    "Pre-claim (mina M7): la fila de pairing nace ANTES de saber de quién es el televisor (`branch_id` nulo hasta el claim), así que el código que el staff tipea se resuelve sin ningún scope.",
  "tv_pairings.tv_pairings_device_code_hash_unique":
    "Pre-claim (mina M7): el device code lo poll-ea el televisor antes del claim, sin sesión ni tenant. Mismo motivo que `user_code`, sobre el hash del código de dispositivo.",
};

/**
 * Uniques de tablas gym-owned que NO arrancan con `tenant_id` y NO son M8, con
 * el motivo por el que igual son seguras (o por el que su riesgo está aceptado
 * a conciencia). Tres categorías, distinguidas en el texto de cada motivo:
 *
 * **(a) Derivada de FK scopeada.** La PRIMERA columna del índice es una FK a una
 * tabla que ya lleva `tenant_id`. Dos tenants no pueden compartir el valor de
 * esa FK, así que la unicidad ya es por tenant por transitividad. Convertirlas
 * sería ruido: agregaría una columna redundante a decenas de índices sin cambiar
 * ni un contrato. El motivo de cada entrada NOMBRA la FK y la tabla padre — un
 * "derivada de FK" genérico no permite auditar nada.
 *
 * **(b) Deuda consciente Templo-module.** Uniques de módulos que hoy solo usa el
 * tenant 1 (SPOM, blog/marketing, Gladius, Aura). Colisionarían si un tenant
 * distinto de 1 activara ese módulo — y ese es exactamente el momento en que se
 * resuelven, en la discusión del módulo (README §4.3). **NO es un olvido de la
 * fase 168:** está fuera del boundary de la fase por decisión explícita del
 * CONTEXT, y la conversión sin el módulo discutido sería adivinar el contrato.
 *
 * **(c) Token opaco random con lookup pre-scope.** Mismo racional que la segunda
 * mitad de M8, pero sobre una unique que no entró en aquella lista (M8 quedó
 * cerrada en once el 2026-07-26 y no se toca desde acá).
 *
 * Esta lista es fail-closed: si falta una entrada, el verificador la reporta
 * como discrepancia y devuelve exit 1. Nunca pasa en silencio.
 */
export const TENANT_UNIQUE_ALLOWLIST: Record<string, string> = {
  // ── (a) Derivadas de una FK ya scopeada ────────────────────────────────────
  "aura_balances.aura_balances_user_id_unique":
    "Derivada de FK scopeada: primer campo `user_id` → `users`, que lleva `tenant_id`. El saldo Aura es uno por socio y el socio ya es de un solo tenant.",
  "aura_transactions.unique_user_source_ref":
    "Derivada de FK scopeada: primer campo `user_id` → `users`. La idempotencia (source_type, reference_type, reference_id) se evalúa dentro del socio, y el socio es de un solo tenant.",
  "balances.uniq_balance_target":
    "Derivada de FK scopeada: primer campo `member_id` → `users`. El saldo por (target_kind, target_id, currency) es del socio, así que la unicidad ya está encerrada en su tenant.",
  "blog_post_tags.post_tag_unique":
    "Derivada de FK scopeada: primer campo `post_id` → `blog_posts`, tabla gym-owned con `tenant_id`. Es la tabla puente del blog: no puede unir un post de un tenant con un tag de otro sin violar su propia FK.",
  "bookings.idx_bookings_member_schedule_date":
    "Derivada de FK scopeada: primer campo `member_id` → `users`. Una reserva por socio, horario y día — el socio ancla el tenant.",
  "campaign_sends.uniq_campaign_user":
    "Derivada de FK scopeada: primer campo `campaign_id` → `campaigns`, que lleva `tenant_id`. Un envío por campaña y destinatario, dentro de la campaña de un solo gimnasio.",
  "check_in_responses.uq_check_in_daily":
    "Derivada de FK scopeada: primer campo `user_id` → `users`. Una respuesta de check-in por socio, tipo de pregunta y día.",
  "class_coach_assignments.class_coach_assignment_unique":
    "Derivada de FK scopeada: primer campo `branch_id` → `branches`, la otra ancla del modelo. La grilla de asignación de profes es por sede, y la sede es de un solo tenant.",
  "debt_management.uniq_debt_management_balance":
    "Derivada de FK scopeada: primer campo `balance_id` → `balances`, que a su vez ancla en `users`. Una gestión de deuda por saldo.",
  "exercise_dimension_proposals.exercise_dimension_proposals_exercise_uq":
    "Derivada de FK scopeada: primer campo `exercise_id` → `exercises`, tabla gym-owned. Una propuesta de dimensiones viva por ejercicio.",
  "exercise_milestone_proposals.exercise_milestone_proposals_exercise_uq":
    "Derivada de FK scopeada: primer campo `exercise_id` → `exercises`. Una propuesta de hitos viva por ejercicio.",
  "exercise_progressions.exercise_progressions_edge_uq":
    "Derivada de FK scopeada: primer campo `from_exercise_id` → `exercises`. Es una arista del DAG de progresiones y sus dos extremos son ejercicios del mismo tenant.",
  "format_compatibility.format_compat_lookup_idx":
    "Derivada de FK scopeada: primer campo `format_id` → `formats`, que desde la 0196 tiene su propia unique compuesta `uq_formats_tenant_name`. La matriz de compatibilidad vive dentro del formato.",
  "financial_transactions.uq_financial_tx_idempotency_key":
    "Token opaco random con lookup pre-scope: `idempotency_key` es un `crypto.randomUUID()` generado por el admin (fase 140, CARGA-02) y el re-read post ER_DUP_ENTRY (`findByIdempotencyKey`) lo busca por el valor pelado, sin scope. Es NULLABLE y MySQL no cuenta los NULL bajo una unique, así que solo dedupea las cargas de profe. La colisión entre dos UUIDv4 de tenants distintos no existe en la práctica.",
  "member_profiles.member_profiles_user_id_unique":
    "Derivada de FK scopeada: primer campo `user_id` → `users`. Un perfil por socio.",
  "notification_preferences.uq_notification_preferences_user_category":
    "Derivada de FK scopeada: primer campo `user_id` → `users`. Una preferencia por socio y categoría de notificación.",
  "plan_programs.plan_program_unique":
    "Derivada de FK scopeada: primer campo `subscription_plan_id` → `subscription_plans`, tabla gym-owned. Es el puente plan↔programa: no puede unir el plan de un tenant con el programa de otro sin violar sus FKs.",
  "referral_credits.unique_referral_credit_sub":
    "Derivada de FK scopeada: primer campo `subscription_id` → `subscriptions`, que ancla en `users`. Un crédito de referido por suscripción.",
  "referrals.referrals_referred_id_unique":
    "Derivada de FK scopeada: `referred_id` → `users`. Un socio es referido una sola vez, y el socio pertenece a un solo tenant.",
  "schedule_exceptions.idx_schedule_exceptions_schedule_date":
    "Derivada de FK scopeada: primer campo `schedule_id` → `schedules`, tabla gym-owned. Una excepción por horario y fecha.",
  "subscription_schedules.idx_sub_schedule":
    "Derivada de FK scopeada: primer campo `subscription_id` → `subscriptions`. Es el puente suscripción↔turno y ambos extremos son del mismo tenant por sus FKs.",
  "transaction_links.uniq_tx_target":
    "Derivada de FK scopeada: primer campo `transaction_id` → `financial_transactions`, tabla gym-owned. Un link por transacción y destino heterogéneo (target_kind, target_id).",
  "tv_class_state.uq_tv_class_state_branch":
    "Derivada de FK scopeada: `branch_id` → `branches`. Un estado de clase vivo por sede. Ojo: esta tabla SÍ es post-claim (a diferencia de `tv_pairings`), por eso no es M8.",
  "user_branches.user_branch_unique":
    "Derivada de FK scopeada: primer campo `user_id` → `users`. Es el puente socio↔sede del multi-sede y sus dos extremos son anclas del mismo tenant.",
  "user_sepa_details.user_sepa_details_user_id_unique":
    "Derivada de FK scopeada: `user_id` → `users`. Un mandato SEPA por socio (sedes de España).",
  "wellhub_classes.idx_wellhub_classes_branch_activity":
    "Derivada de FK scopeada: primer campo `branch_id` → `branches`. NO es M8: no lleva ningún id de Wellhub, es el índice de lookup local (sede, actividad) del mapeo.",
  "wellhub_slots.idx_wellhub_slots_schedule_date":
    "Derivada de FK scopeada: primer campo `schedule_id` → `schedules`. NO es M8: es el índice local (horario, fecha) del slot, no el id de Wellhub.",

  // ── (b) Deuda consciente Templo-module ─────────────────────────────────────
  "sessions.sessions_day_id_unique":
    "Deuda consciente Templo-module (mina M5, doc 05 §6): `day_id` es la identidad textual de la sesión SPOM (`W1-lunes-sigma`) y colisionaría si un segundo tenant corriera SPOM. Se resuelve SOLO cuando un tenant distinto de 1 active el módulo SPOM — NO es un olvido de la fase 168: el CONTEXT lo deja explícitamente fuera del boundary.",
  "aura_config.aura_config_aura_config_source_type_unique":
    "Deuda consciente Templo-module: config global del módulo Aura (12 filas, una por `source_type`). Se resuelve solo si un tenant distinto de 1 activa Aura, en la discusión de ese módulo (README §4.3). NO es un olvido de la fase 168. Ojo con el nombre de la columna: el `mysqlEnum` se llama `aura_config_source_type`, no `source_type`.",
  "routes.routes_code_unique":
    "Deuda consciente Templo-module: `code` es el código de ruta SPOM (sigma/omega/…). Catálogo Templo-only. Se resuelve solo si otro tenant activa SPOM — NO es un olvido de la fase 168.",
  "intensity_rules.intensity_rules_intensity_unique":
    "Deuda consciente Templo-module: catálogo de reglas de intensidad de SPOM, una fila por nivel. Templo-only hasta que otro tenant active SPOM. NO es un olvido de la fase 168.",
  "contraction_rules.contraction_rules_intensity_total_idx":
    "Deuda consciente Templo-module: catálogo de reglas de contracción de SPOM por (intensidad, total de ejercicios). Templo-only. NO es un olvido de la fase 168.",
  "spom_rules.spom_rules_week_route_idx":
    "Deuda consciente Templo-module: reglas de SPOM por (semana, ruta). El primer campo `week` es un entero, no una FK, así que NO hay transitividad — es deuda pura del módulo, resuelta cuando otro tenant lo active. NO es un olvido de la fase 168.",
  "weekly_rotator.weekly_rotator_week_day_level_idx":
    "Deuda consciente Templo-module: rotador semanal de SPOM por (semana, día, grupo de nivel). Primer campo `week`, entero, sin FK: deuda del módulo, no transitividad. NO es un olvido de la fase 168.",
  "blog_posts.slug":
    "Deuda consciente Templo-module: slug público del blog. El README §4.3 lo marca como decisión de la discusión del módulo de marketing (subdominio por tenant vs slug compuesto), no de esta fase. NO es un olvido de la fase 168. Ojo: el índice físico se llama `slug`, no `blog_posts_slug_unique`.",
  "blog_tags.slug":
    "Deuda consciente Templo-module: slug de tag del blog, misma discusión de módulo que `blog_posts.slug`. NO es un olvido de la fase 168. El índice físico también se llama `slug` a secas.",
  "gladius_products.slug":
    "Deuda consciente Templo-module: slug de producto de Gladius (tienda), módulo Templo-only. Se resuelve en la discusión de ese módulo. NO es un olvido de la fase 168. Índice físico `slug`.",
};

/**
 * Tablas FÍSICAS que existen en MySQL pero NO en el schema Drizzle, y que por lo
 * tanto no pueden estar ni en `GYM_OWNED_TABLES` ni en `TENANT_EXEMPT_TABLES`
 * (las dos listas de la fase 167 se cruzan contra el schema, y un nombre que no
 * exista ahí deja el test en rojo como "ghost").
 *
 * Son infraestructura del propio tooling, no datos de ningún gimnasio.
 *
 * - `_migrations` — tabla de tracking del runner propio
 *   (`src/db/run-migrations.ts`). Es la única fuente de verdad de qué
 *   migraciones se aplicaron, local y en producción.
 * - `__drizzle_migrations` — residuo del journal de `drizzle-kit`, que el repo
 *   NO usa (Hard Rule 1 del skill de migraciones: nunca `drizzle-kit migrate`).
 *   Existe de arrastre y está muerta.
 *
 * **Las tablas de backup creadas por migraciones NO van acá** (por ejemplo
 * `users_lead_backup_0183`, que vive en producción, o `users_lead_backup_0170`).
 * Son efímeras por definición, aparecen en unas bases y no en otras, y meterlas
 * en una lista versionada convertiría este archivo en un basurero que hay que
 * podar a mano cada vez que se borra un backup. El verificador las detecta por
 * el patrón de nombre y las reporta como **advertencia**, no como discrepancia:
 * no bloquean la fase y quedan visibles en el reporte.
 */
export const PLATFORM_PHYSICAL_TABLES = [
  "_migrations",
  "__drizzle_migrations",
] as const;

export type PlatformPhysicalTable = (typeof PLATFORM_PHYSICAL_TABLES)[number];

const PLATFORM_PHYSICAL_SET: ReadonlySet<string> = new Set(
  PLATFORM_PHYSICAL_TABLES,
);

/** Arma la clave canónica `"tabla.indice"` de los dos registros de uniques. */
function uniqueKey(table: string, indexName: string): string {
  return `${table}.${indexName}`;
}

/**
 * `true` si la unique `(table, indexName)` está en la lista M8: global a
 * propósito y para siempre.
 *
 * Acepta `string` por el mismo motivo que `isGymOwnedTable`: los consumidores
 * clasifican nombres que salen de INFORMATION_SCHEMA.
 */
export function isTenantGlobalUnique(
  table: string,
  indexName: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    TENANT_GLOBAL_UNIQUES,
    uniqueKey(table, indexName),
  );
}

/**
 * `true` si la unique está clasificada en CUALQUIERA de los dos registros (M8 o
 * allowlist). Es la pregunta que hace el verificador: una unique sin
 * `tenant_id` al frente y sin clasificar es una discrepancia.
 */
export function isAllowedGlobalUnique(
  table: string,
  indexName: string,
): boolean {
  const key = uniqueKey(table, indexName);
  return (
    Object.prototype.hasOwnProperty.call(TENANT_GLOBAL_UNIQUES, key) ||
    Object.prototype.hasOwnProperty.call(TENANT_UNIQUE_ALLOWLIST, key)
  );
}

/**
 * El motivo escrito de una unique global, o `undefined` si no está clasificada.
 * Lo usa el reporte del verificador para que un hallazgo se lea con su contexto
 * y no como un nombre suelto.
 */
export function tenantUniqueMotive(
  table: string,
  indexName: string,
): string | undefined {
  const key = uniqueKey(table, indexName);
  return TENANT_GLOBAL_UNIQUES[key] ?? TENANT_UNIQUE_ALLOWLIST[key];
}

/**
 * `true` si la tabla física es infraestructura del tooling (ver
 * `PLATFORM_PHYSICAL_TABLES`). No lleva `tenant_id` ni entra en el inventario
 * del schema Drizzle.
 */
export function isPlatformPhysicalTable(name: string): boolean {
  return PLATFORM_PHYSICAL_SET.has(name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 170 (CON-05 / CON-06) — módulos ya migrados al patrón de tenant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registro de los módulos YA MIGRADOS al patrón de tenant (D-05/D-06). Es la
 * fuente canónica ÚNICA que separa "deuda conocida" de "regresión", y la
 * consumen los dos vigilantes de la fase 170:
 * `src/db/sentinel/install.ts` y `src/db/scripts/lint-tenant.ts`.
 *
 * QUÉ SIGNIFICA "MÓDULO MIGRADO"
 * ------------------------------
 * Que TODAS sus escrituras y TODAS sus lecturas sobre tablas gym-owned pasan
 * por `tenantWhere` / `tenantValues` de `src/modules/shared/tenant.ts` (fase
 * 169). No "casi todas", no "las que encontramos": la afirmación es total, y es
 * lo que habilita el throw.
 *
 * QUÉ CAMBIA AL AGREGAR UNA ENTRADA
 * ---------------------------------
 * 1. El sentinel pasa a hacer **THROW en test/dev** sobre las tablas listadas
 *    acá cuando ve una query sin `tenant_id`. El resto de las tablas gym-owned
 *    queda **en silencio** en la corrida normal de tests (D-08): son deuda
 *    conocida, no regresión, y ensuciar el output de la suite con ellas taparía
 *    los errores reales. En prod/staging el sentinel nunca hace throw: loguea.
 * 2. **OBLIGA a vaciar las entradas de esas tablas en
 *    `el-templo-api/tenant-lint-allowlist.json`.** El lint deja el build ROJO si
 *    una tabla convive en este registro y en la allowlist (D-15): sería afirmar
 *    "este módulo ya está migrado" y "este módulo todavía tiene accesos sin
 *    scope perdonados" al mismo tiempo. Migrar el módulo y achicar la allowlist
 *    son el mismo acto, no dos tareas separables.
 *
 * FORMA
 * -----
 * La CLAVE es el nombre del módulo tal como lo nombra el ROADMAP del milestone
 * (`finance`, `members`, `subscriptions`, `scheduling`, `analytics`): una fase
 * de adopción = una entrada, y el diff de esa fase se lee de un vistazo. El
 * VALOR son nombres de tabla **FÍSICA**, tal cual figuran en
 * `GYM_OWNED_TABLES` — los de `getTableName()`, no los de las constantes
 * TypeScript. El sentinel aplana el registro internamente (`STRICT_SET`).
 *
 * ARRANCÓ VACÍA, Y QUIÉN ESCRIBIÓ LA PRIMERA ENTRADA
 * --------------------------------------------------
 * En la fase 170 no había ningún módulo migrado: la 170 construye los
 * vigilantes, no migra código. Que arrancara vacía es lo que hacía honesto al
 * sentinel — no había ni una tabla sobre la que el throw estuviera justificado.
 *
 * La PRIMERA entrada la escribe la **fase 172** (`finance`), y la escribe al
 * FINAL de la fase a propósito (D-03): primero se migraron TODOS los accesos a
 * sus 6 tablas —los de `src/modules/finance/` y los de analytics, reports,
 * subscriptions, members, coach y `scripts/backfill-historical-payments.ts`,
 * porque el alcance del throw es POR TABLA, no por directorio (D-01)— y recién
 * después se prendió el interruptor. Así la suite nunca quedó roja entre planes.
 *
 * `aura_balances` y `aura_transactions` NO están acá aunque suenen a finanzas:
 * las escribe gamification, y su throw llega con la adopción de ese módulo
 * (D-05). Una tabla entra a esta lista cuando su módulo dueño la migra entera,
 * no cuando su nombre encaja en un rubro.
 *
 * El gate de forma de `test/db/tenant-tables.test.ts` obliga a que sumar cada
 * entrada nueva sea una decisión de diseño visible en el diff, no un detalle de
 * implementación: exige las tablas exactas de los módulos ya declarados y cruza
 * la lista contra `tenant-lint-allowlist.json` (D-15).
 */
export const TENANT_STRICT_MODULES: Record<string, readonly string[]> = {
  finance: [
    "balances",
    "cash_registers",
    "cost_centers",
    "debt_management",
    "financial_transactions",
    "transaction_links",
  ],
};

const STRICT_SET: ReadonlySet<string> = new Set(
  Object.values(TENANT_STRICT_MODULES).flat(),
);

/**
 * `true` si la tabla física `name` pertenece a un módulo ya migrado y por lo
 * tanto el sentinel tiene que hacer throw sobre ella en test/dev.
 *
 * Acepta `string` (no `GymOwnedTable`) por el mismo motivo que
 * `isGymOwnedTable`: el consumidor es el sentinel, que clasifica nombres de
 * tabla extraídos del SQL en runtime — `string` en tiempo de compilación.
 */
export function isStrictTable(name: string): boolean {
  return STRICT_SET.has(name);
}

/**
 * El registro aplanado a un `Set` de nombres de tabla. Es el DEFAULT del
 * parámetro `strictTables` del sentinel (D-07): la lista es inyectable para que
 * el test del criterio 1 pueda pasarle una tabla real como strict y afirmar el
 * throw, sin declarar migrado en el código ningún módulo que no lo esté.
 */
export function strictTablesSet(): ReadonlySet<string> {
  return STRICT_SET;
}

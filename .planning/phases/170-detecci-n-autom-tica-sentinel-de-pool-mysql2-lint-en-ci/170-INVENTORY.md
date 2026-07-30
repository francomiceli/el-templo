# Fase 170 — Inventario del sentinel de tenancy (D-04 / D-08)

**Qué es esto:** la foto determinística de cuánto ruido produce hoy el sentinel de pool.
Es el criterio 2 del ROADMAP: antes de que empiece la adopción módulo a módulo (fase 172+),
hay que poder afirmar con evidencia que el sentinel está **silencioso** (cero throws) y que
lo que emite es **deuda real**, no falsos positivos.

**Veredicto corto:** 1.852 statements violadores distintos sobre 86 tablas gym-owned, cero
throws, cero falsos positivos del parser, y **un hallazgo**: el lint de CON-06 tiene un
punto ciego que el sentinel destapó (ver "Cruce con la allowlist del lint").

---

## Cómo se generó

| Dato                | Valor                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| Fecha               | 2026-07-28, 22:08:02Z → 22:31:26Z (UTC)                                  |
| Worktree            | `/home/franco/projects/et-170-sentinel`                                  |
| Rama                | `feat/170-sentinel-lint`                                                 |
| Commit              | `f8674af3`                                                               |
| Comando             | `SENTINEL_INVENTORY=1 pnpm exec vitest run --hookTimeout=900000`         |
| Resultado del suite | **231 archivos passed, 1 skipped (232) · 3006 tests passed · exit 0**    |
| Duración            | 1402,75 s (23 min)                                                       |
| Procesos de vitest  | 209 (cada archivo de test construye su propia app, o sea su propio pool) |

Correr el suite completo en local es la **excepción deliberada** a la regla del repo de que
los tests corren en CI y no en la máquina: el inventario ES el entregable de D-04 y sale
justamente de ejercitar el SQL real de los 232 archivos de test. No es un descuido.

### Dos cosas que hubo que resolver para que esta corrida sirviera

1. **`--hookTimeout=900000`.** La primera corrida (con el `pnpm test` pelado que pide el plan)
   se cayó: **208 archivos rojos** con `Table 'eltemplo_test_2.wellhub_bookings' doesn't exist`.
   Causa: el `beforeAll` de `test/setup.ts` provisiona la base del worker aplicando las ~196
   migraciones, y con 4 workers provisionando en paralelo contra el MySQL local eso pasa los
   **120 s de `hookTimeout`** de `vitest.config.ts` (el provisioning ya medía ~96 s con un
   worker solo — hallazgo 169-07). El hook se corta a mitad de camino y las bases quedan
   migradas hasta la **0153**. Se verificó que no es una migración rota: aplicadas en serie
   contra una base limpia, las ~196 pasan sin un solo error no tolerado. Es un límite del
   entorno local, **no** del código de la fase ni del sentinel; en CI el suite corre verde.
   El flag va por línea de comandos a propósito: **no se tocó `vitest.config.ts`**.
2. **Una sonda temporal de agregación, fuera del commit.** El handle del sentinel es **por
   pool**, y cada archivo de test construye su propia app: `report()` de un handle solo ve
   las violaciones de _esa_ app. Para poder sumar los 209 procesos se instrumentó
   `installSentinel` con un volcado a disco (una línea JSONL por statement violador nuevo, y
   un snapshot al `exit` del proceso), se corrió el suite, y **la instrumentación se revirtió
   sin commitear** — mismo idioma que el baseline one-shot de D-16 y que las demostraciones
   en vivo de los planes 02, 04, 05, 06 y 07. `src/db/sentinel/install.ts` queda byte a byte
   como lo dejó el plan 06.

> **Dato del volcado:** los 209 procesos escribieron sus statements distintos, pero solo **7**
> llegaron a escribir el snapshot del `exit` — vitest termina la mayoría de sus workers sin
> pasar por el handler. Por eso los números de "statements distintos" son completos y el
> total con repeticiones es un **piso**, no un total. Está marcado como tal abajo.

---

## Totales

| Métrica                                                        | Valor                                    |
| -------------------------------------------------------------- | ---------------------------------------- |
| **Statements violadores distintos** (fingerprints)             | **1.852**                                |
| **Tablas gym-owned distintas**                                 | **86** (de las 87 de `GYM_OWNED_TABLES`) |
| Registros de "statement nuevo" (statement × app que lo emitió) | 18.232                                   |
| Violaciones con repeticiones (piso, 30 handles de 209)         | ≥ 3.683                                  |
| Throws (`TenantSentinelError`) en toda la corrida              | **0**                                    |
| Tablas en `TENANT_STRICT_MODULES`                              | **0** (la lista arranca vacía, D-06)     |

**Cero throws con el suite entero corriendo en modo `throw`** es el resultado que la fase
buscaba: el sentinel ya está montado sobre todo el SQL de la aplicación y no rompe nada,
porque ningún módulo está migrado todavía. El día que la fase 172 agregue la primera entrada
a `TENANT_STRICT_MODULES`, esas violaciones dejan de ser silencio y pasan a ser rojo.

Por verbo (statements distintos): `select` 1.351 · `update` 253 · `delete` 212 · `insert` 35
· 1 statement que arranca con comentarios `--` (ver "Candidatos a falso positivo").

### ⚠ Los contadores son POR PROCESO y se resetean en cada restart de pm2

El contador in-memory del sentinel vive en el proceso. Cada `pm2 restart`, cada deploy y cada
crash lo pone en cero. **Un contador en cero NO significa "no hay violaciones"**: puede
significar "este proceso arrancó hace dos minutos". La métrica de esta fase es una señal de
orden de magnitud (D-02), no un sistema de métricas: para eso está el inventario de este
documento, que es determinístico y reproducible. Lo mismo vale para el resumen horario de
staging/prod: dice cuántas van _en este proceso_.

---

## Violaciones por tabla gym-owned

Ordenado por statements distintos. Las columnas:

- **stmts** — statements violadores distintos que mencionan la tabla (un join suma a cada tabla).
- **de la app** — de esos, cuántos NO son del arnés de tests (ver la sección siguiente).
- **statement representativo** — el primero de la app, truncado a 105 caracteres. El texto
  viene con placeholders `?`: **no hay datos de socios acá** (T-170-02).

| Tabla | stmts | de la app | Statement representativo (truncado) |
| ----- | ----- | --------- | ----------------------------------- |
| `users` | 484 | 484 | select id, email, password_hash, first_name, last_name, role, level, branch_id, gender, date_of_birth, de … |
| `branches` | 396 | 396 | select name, is_virtual, country from branches where branches.id = ? limit ? |
| `subscriptions` | 303 | 301 | select subscriptions.id from subscriptions inner join subscription_plans on subscriptions.plan_id = subsc … |
| `subscription_plans` | 199 | 198 | select id, tenant_id, name, description, plan_tier, booking_mode, plan_category, linked_program_id, price … |
| `financial_transactions` | 166 | 164 | select id, tenant_id, member_id, kind, direction, amount, currency, payment_method, transaction_date, eff … |
| `bookings` | 165 | 163 | UPDATE users u SET u.status = CASE WHEN EXISTS ( SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND … |
| `attendance` | 130 | 128 | select COUNT(*) from attendance inner join branches on branches.id = attendance.branch_id where (attendan … |
| `schedules` | 100 | 99 | select schedules.id, activities.name, activities.max_capacity, schedules.day_of_week, schedules.start_tim … |
| `balances` | 89 | 86 | select id, tenant_id, member_id, target_kind, target_id, currency, amount, last_recomputed_at, created_at … |
| `exercises` | 81 | 80 | select exercise_adjustments.id, exercise_adjustments.exercise_id, origin_exercise.exercise, exercise_adju … |
| `program_enrollments` | 70 | 69 | select id, program_id, source from program_enrollments where (program_enrollments.subscription_id = ? and … |
| `transaction_links` | 57 | 55 | select id, tenant_id, transaction_id, target_kind, target_id, allocated_amount, created_at from transacti … |
| `activities` | 52 | 51 | select schedules.id, activities.name, activities.max_capacity, schedules.day_of_week, schedules.start_tim … |
| `debt_management` | 52 | 51 | update debt_management set status = ? where (debt_management.balance_id = ? and debt_management.status =  … |
| `member_profiles` | 46 | 45 | select onboarding_completed_at from member_profiles where member_profiles.user_id = ? limit ? |
| `exercise_progressions` | 41 | 40 | select id, from_exercise_id, to_exercise_id, source from exercise_progressions where exercise_progression … |
| `cash_registers` | 39 | 39 | select id, currency from cash_registers where (cash_registers.type = ? and cash_registers.branch_id = ? a … |
| `check_in_responses` | 34 | 33 | select check_in_responses.question_type, check_in_responses.value, COUNT(*) from check_in_responses inner … |
| `sessions` | 33 | 32 | select id, day_id from sessions where (sessions.week = ? and sessions.day = ? and sessions.status = ? and … |
| `blog_posts` | 28 | 26 | select id, tenant_id, title, slug, excerpt, cover_image, body, status, created_at, updated_at, published_ … |
| `coach_ratings` | 26 | 25 | select id from coach_ratings where (coach_ratings.member_id = ? and coach_ratings.session_date = ? and co … |
| `programs` | 25 | 24 | select goal_plan_type from programs where programs.id = ? limit ? |
| `completed_sessions` | 22 | 21 | delete from completed_sessions where (completed_sessions.user_id = ? and completed_sessions.date = ? and  … |
| `improvement_proposals` | 20 | 19 | select COUNT(*) from improvement_proposals where (improvement_proposals.member_id = ? and improvement_pro … |
| `exercise_dimension_proposals` | 19 | 18 | SELECT e.id, e.exercise AS name, e.position AS position, e.route, e.effort, e.dificultad_lineal AS dificu … |
| `cost_centers` | 18 | 18 | select id from cost_centers where (cost_centers.name = ? and cost_centers.country = ?) limit ? |
| `exercise_milestone_proposals` | 18 | 17 | SELECT exercise_id AS exerciseId FROM exercise_milestone_proposals |
| `referrals` | 18 | 17 | select referrals.referrer_id, users.first_name from referrals inner join users on users.id = referrals.re … |
| `audit_log` | 17 | 15 | select id, tenant_id, actor_id, action, target_kind, target_id, payload_json, reason, created_at from aud … |
| `notification_templates` | 17 | 16 | select id, tenant_id, template_key, notification_category, title, body, title_female, body_female, route, … |
| `routes` | 17 | 16 | select id from routes where routes.code = ? |
| `session_blocks` | 17 | 16 | select id, session_id, role, route, intensity, format_name, format_params, custom_title, sort_order from  … |
| `franchise_applications` | 16 | 15 | delete from franchise_applications where franchise_applications.nombre = ? |
| `session_prescriptions` | 15 | 14 | select session_prescriptions.id, session_prescriptions.block_id, session_prescriptions.exercise_name, ses … |
| `blog_post_tags` | 14 | 12 | delete from blog_post_tags where blog_post_tags.tag_id = ? |
| `blog_tags` | 14 | 12 | select id, name, slug from blog_tags order by blog_tags.name |
| `subscription_schedules` | 14 | 12 | select schedule_id from subscription_schedules where subscription_schedules.subscription_id = ? |
| `tv_devices` | 14 | 13 | select token_hash from tv_devices |
| `user_status_history` | 14 | 13 | delete from user_status_history where user_status_history.user_id in (?, ?, ?) |
| `campaign_sends` | 12 | 11 | select COUNT(*) from campaign_sends where (campaign_sends.campaign_id = ? and campaign_sends.status = ?) |
| `pending_notifications` | 11 | 10 | select id, tenant_id, user_id, template_id, title, body, route, notification_status, scheduled_at, sent_a … |
| `promo_plans` | 11 | 10 | SELECT COUNT(*) AS n FROM promo_plans WHERE promo_code = ? |
| `aura_config` | 10 | 8 | select default_amount from aura_config where aura_config.aura_config_source_type = ? limit ? |
| `class_coach_assignments` | 10 | 9 | select coach_id from class_coach_assignments where ((class_coach_assignments.branch_id = ? and class_coac … |
| `schedule_exceptions` | 10 | 9 | select schedule_id, exception_date, reason from schedule_exceptions where (schedule_exceptions.schedule_i … |
| `wellhub_slots` | 10 | 9 | select wellhub_slots.id, wellhub_slots.wellhub_slot_id, wellhub_classes.wellhub_class_id, wellhub_slots.t … |
| `aura_transactions` | 9 | 7 | SELECT amount FROM aura_transactions WHERE user_id = ? AND source_type = 'referral' ORDER BY id DESC LIMI … |
| `holidays` | 9 | 8 | select id, country, date, name from holidays where (holidays.country = ? and holidays.date >= ? and holid … |
| `tv_pairings` | 9 | 8 | select device_code_hash from tv_pairings where tv_pairings.user_code = ? |
| `wellhub_bookings` | 9 | 8 | select id, status from wellhub_bookings where wellhub_bookings.booking_number = ? limit ? |
| `aura_balances` | 8 | 6 | INSERT INTO aura_balances (user_id, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = balance + ? |
| `exercise_adjustments` | 8 | 7 | select exercise_adjustments.id, exercise_adjustments.exercise_id, origin_exercise.exercise, exercise_adju … |
| `gladius_products` | 8 | 7 | select id, tenant_id, name, slug, description, photo, status, country, sort_order, created_at, updated_at … |
| `refresh_tokens` | 8 | 7 | update refresh_tokens set revoked_at = NOW() where (refresh_tokens.user_id = ? and refresh_tokens.revoked … |
| `campaigns` | 7 | 6 | update campaigns set sent_at = ? where campaigns.id = ? |
| `device_tokens` | 7 | 6 | select id from device_tokens where device_tokens.user_id = ? limit ? |
| `user_branches` | 7 | 6 | select branch_id from user_branches where user_branches.user_id = ? |
| `wellhub_events` | 7 | 6 | select id, status from wellhub_events where wellhub_events.event_id = ? limit ? |
| `campaign_unsubscribes` | 6 | 5 | SELECT COUNT(*) AS n FROM campaign_unsubscribes WHERE email = ? |
| `formats` | 6 | 5 | select name, description from formats |
| `member_notes` | 6 | 5 | select member_notes.id, member_notes.user_id, member_notes.author_id, users.first_name, users.last_name,  … |
| `plan_programs` | 6 | 6 | delete from plan_programs where plan_programs.subscription_plan_id = ? |
| `referral_credits` | 6 | 5 | SELECT percent, amount FROM referral_credits WHERE subscription_id = ? LIMIT 1 |
| `tv_class_state` | 6 | 5 | select class_date, screen, block_role, level, exercise_index, timer_status, timer_started_at, paused_at,  … |
| `wellhub_classes` | 6 | 5 | select wellhub_slots.id, wellhub_slots.wellhub_slot_id, wellhub_classes.wellhub_class_id, wellhub_slots.t … |
| `user_sepa_details` | 5 | 4 | select debtor_name, address, postal_code, city, country, nif, iban from user_sepa_details where user_sepa … |
| `academy_inquiries` | 4 | 3 | delete from academy_inquiries where academy_inquiries.email = ? |
| `app_waitlist` | 4 | 3 | delete from app_waitlist where app_waitlist.email = ? |
| `campaign_events` | 4 | 3 | select COUNT(DISTINCT campaign_events.send_id) from campaign_events inner join campaign_sends on campaign … |
| `day_modes` | 4 | 4 | delete from day_modes where day_modes.day_of_week = ? |
| `program_content_blocks` | 4 | 3 | select program_content_blocks.id, program_content_blocks.week_number, program_content_blocks.sort_order,  … |
| `referral_cta_clicks` | 4 | 3 | select id, tenant_id, user_id, variant, created_at from referral_cta_clicks where referral_cta_clicks.use … |
| `gladius_inquiries` | 3 | 2 | delete from gladius_inquiries where gladius_inquiries.email = ? |
| `notification_preferences` | 3 | 2 | select notification_category, enabled from notification_preferences where notification_preferences.user_i … |
| `evaluation_requests` | 2 | 1 | select id, requested_at from evaluation_requests where (evaluation_requests.user_id = ? and evaluation_re … |
| `format_compatibility` | 2 | 1 | select format_compatibility.format_id, format_compatibility.compatibility, formats.name from format_compa … |
| `member_logins` | 2 | 1 | select id, tenant_id, user_id, logged_in_at from member_logins where member_logins.user_id = ? |
| `saved_blocks` | 2 | 1 | select id, tenant_id, name, created_by, source_block_id, block_role, block_route, format_name, block_data … |
| `session_edit_logs` | 2 | 1 | select id, tenant_id, session_id, user_id, action, created_at from session_edit_logs where session_edit_l … |
| `spom_rules` | 2 | 1 | select pattern_2 from spom_rules where (spom_rules.week = ? and spom_rules.route_id = ?) |
| `subscription_schedule_changes` | 2 | 1 | select subscription_schedule_changes.id, subscription_schedule_changes.subscription_id, subscription_sche … |
| `contraction_rules` | 1 | 0 | DELETE FROM contraction_rules |
| `intensity_rules` | 1 | 0 | DELETE FROM intensity_rules |
| `onboarding_analytics` | 1 | 0 | DELETE FROM onboarding_analytics |
| `session_traces` | 1 | 0 | DELETE FROM session_traces |
| `weekly_rotator` | 1 | 0 | DELETE FROM weekly_rotator |

### Arnés de tests vs. código de la aplicación

De los 1.852 statements, **95 son `DELETE FROM <tabla>` sin `WHERE`**: es
`cleanAllTestData()` de `test/helpers.ts` limpiando entre tests. Tocan **80 de las 86 tablas**,
y son la razón de que el inventario del sentinel llegue a tablas que el lint no lista.

Son violaciones legítimas desde donde mira el sentinel (SQL sin `tenant_id` sobre tabla
gym-owned) pero **no son deuda del producto**: `test/` está fuera del alcance del lint por
D-16, y el día que existan fixtures 2-tenant (fase 171) esa limpieza va a tener que
tenantizarse igual. Quedan contadas aparte para que nadie las lea como código de negocio.

**Cinco tablas aparecen SOLO por el arnés** (0 statements de la app): `onboarding_analytics`,
`session_traces`, `intensity_rules`, `contraction_rules`, `weekly_rotator`. O sea: en toda la
corrida, la aplicación no las tocó nunca sin `tenant_id`.

---

## Exenciones que aparecen como violación (esperado, D-17)

D-17 dejó dos canales de exención: el **lint** razona sobre el fuente (comentario de bloque
anclado al call site por AST) y el **sentinel** razona sobre el SQL. Las exenciones de la
fase 169 **no viajan en el SQL**, así que aparecen en este inventario como violaciones
no-strict. **Eso es correcto y esperado**: son deuda real y ninguna tabla es strict todavía.
No son falsos positivos y no hay que "arreglarlas" tocando el sentinel.

Las **10** exenciones ancladas que hoy reconoce el lint (las 9 que dejó escritas la 169 más
`src/db/scripts/lint-tenant.ts`, que se anotó a sí mismo en el plan 05), y qué pasó con cada
una acá:

| #  | Exención (fuente)                          | Tipo       | ¿Aparece en el inventario?                                                                                      |
| -- | ------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------- |
| 1  | `src/db/seed.ts`                           | file-level | No — no corre por el pool de la app                                                                             |
| 2  | `src/db/seed-spom.ts`                      | file-level | No — ídem                                                                                                       |
| 3  | `src/db/run-migrations.ts`                 | file-level | No — conexión propia                                                                                            |
| 4  | `src/db/scripts/verify-tenant-uniques.ts`  | file-level | No — script standalone                                                                                          |
| 5  | `src/db/scripts/verify-tenant-backfill.ts` | file-level | No — script standalone                                                                                          |
| 6  | `src/db/scripts/lint-tenant.ts`            | file-level | No — no ejecuta una query                                                                                       |
| 7  | `scripts/wellhub-sandbox.ts`               | file-level | No — no toca la DB (postea al webhook)                                                                          |
| 8  | `src/modules/wellhub/service.ts:135`       | call site  | **Sí** — `select id, status from wellhub_events where event_id = ?`                                             |
| 9  | `src/jobs/notification-cron.ts:754`        | call site  | **Sí** — `INSERT IGNORE INTO notification_templates (…)`                                                        |
| 10 | `src/modules/tv/pairing.ts:145`            | call site  | No — el suite no ejercitó el INSERT pre-claim por ese camino (cero `insert into tv_pairings` en toda la corrida) |

Las 7 file-level no aparecen por una razón estructural, no por suerte: son scripts y
herramientas de plataforma que **no usan el pool de la aplicación** (el único que tiene el
sentinel instalado, congelado por el guard del plan 06). Las 2 de call site que sí corren en
el runtime aparecen exactamente como D-17 anticipó.

---

## Candidatos a falso positivo

**No apareció ningún falso positivo del parser.** Los tres patrones que a primera vista
podrían parecerlo, y por qué no lo son:

1. **155 statements que mencionan `tenant_id` y aun así son violación.** Todos son `SELECT`
   (verificado: 0 de los 155 es otra cosa). Es el recorte de la proyección de `analyzeSql`
   funcionando: Drizzle expande `db.select().from(tabla)` a **todas** las columnas, `tenant_id`
   incluida, así que un scan completo sin `where` llega al pool como
   `select id, tenant_id, … from users`. Buscar el literal en el string entero devolvería
   "cumple" para la fuga más grave que existe. El parser descarta todo lo anterior al primer
   `from` antes de buscar (mitigación de T-170-01) y por eso los marca — **correctamente**.
2. **1 statement que arranca con comentarios `--`.** Es el backfill de la migración
   "reactivate `cancelado` future bookings", ejecutado por un test de `test/migrations/` a
   través del pool de la app. Toca `bookings`, `subscription_schedules`, `subscriptions` y
   `schedules` sin `tenant_id`, y el parser lo clasifica bien (extrae las 4 tablas pese al
   prólogo de comentarios). No es un FP: es SQL de migración entrando por un camino que en
   producción no existe (allá las migraciones corren por `run-migrations.ts`, que tiene su
   propia conexión y su exención file-level).
3. **95 `DELETE FROM <tabla>` sin `WHERE` del arnés de tests.** Violación real desde la
   definición del sentinel, deuda de `test/` y no del producto. Contadas aparte arriba.

Ninguno de los tres pide un cambio en el parser ni en el skiplist. **Si en la ventana de
observación de staging aparece un patrón que sí sea FP, la resolución es arreglar el parser
o el skiplist — nunca "bajar el sentinel" ni "aceptar el ruido".**

---

## Cruce con la allowlist del lint (CON-06) — HALLAZGO, ✅ RESUELTO

> **Estado: RESUELTO en el commit `d8fa4986`** (`fix(170-08): el lint deja de ser ciego a los
> imports profundos de db/schema`), por decisión de Franco en el checkpoint del plan 08:
> arreglar el punto ciego **antes** de pushear la fase a staging. El resto de esta sección
> queda como está —el diagnóstico es el que justifica el fix— y el cierre está al final.

El sentinel (lente de runtime) y el lint (lente estática) tienen que ver aproximadamente la
misma deuda. No la veían:

| Lente                          | Tablas gym-owned con deuda |
| ------------------------------ | -------------------------- |
| Sentinel (esta corrida)        | **86**                     |
| Lint / `tenant-lint-allowlist` | **78**                     |

- **Solo el lint:** `spom_config` (1 tabla). Benigno: el lint ve el acceso en el fuente y la
  suite no lo ejercitó sin filtro. La lente estática es más amplia por diseño.
- **Solo el sentinel:** 9 tablas — `blog_posts`, `audit_log`, `franchise_applications`,
  `blog_post_tags`, `blog_tags`, `gladius_products`, `academy_inquiries`, `app_waitlist`,
  `gladius_inquiries`. **Estas NO son del arnés**: suman **95 statements de la aplicación**
  (26 de `blog_posts`, 15 de `audit_log`, 15 de `franchise_applications`, …) y el lint no
  tiene ni una entrada para ellas.

### Causa raíz

`isSchemaModule()` de `src/db/scripts/lint-tenant.ts` reconoce el barrel del schema
(`…/schema` y `…/schema/index`) pero **no los imports profundos** del estilo
`import { blogPosts } from "../../db/schema/blog-posts"`. Un archivo que importa así queda
con `SchemaBindings` vacío y **todos sus accesos son invisibles para el lint**: no aparecen
como violación, no entran a la allowlist, y —lo que importa— **un acceso NUEVO sin
`tenant_id` en ese archivo no pone el build en rojo**.

El mapa de identificadores no es el problema (`buildSchemaTableMap` sí mapea `blogPosts →
blog_posts`, verificado): el problema es la resolución del import.

**18 archivos del alcance importan en profundidad** (contados por AST). Los 13 de módulos y
jobs son estos; los otros 5 son los scripts de importación de `src/db/` (`import-turnos.ts`,
`import-members.ts`, `import-vigentes.ts`, `import-fecha-ingreso.ts`,
`fill-future-bookings.ts`), que usan la forma corta `./schema/<archivo>`:

| Archivo                              | Entradas hoy | Import |
| ------------------------------------ | ------------ | ------ |
| `src/modules/auth/routes.ts`         | 0            | **solo deep** (`users`, `branches`, `member-profiles`, `promo-plans`, `referrals`) |
| `src/modules/members/types.ts`       | 0            | solo deep (`users`) |
| `src/modules/onboarding/routes.ts`   | 0            | solo deep (`users`) |
| `src/modules/shared/audit-log.ts`    | 0            | solo deep (`audit-log`) |
| `src/modules/blog/service.ts`        | 0            | barrel + deep |
| `src/modules/gladius/service.ts`     | 0            | barrel + deep |
| `src/modules/franchise/service.ts`   | 0            | barrel + deep |
| `src/modules/academy/service.ts`     | 0            | barrel + deep |
| `src/modules/app-landing/service.ts` | 0            | barrel + deep |
| `src/modules/bar-challenge/service.ts` | 0          | barrel + deep |
| `src/jobs/mark-no-shows.ts`          | 2            | barrel + deep |
| `src/modules/members/routes.ts`      | 4            | barrel + deep |
| `src/modules/onboarding/service.ts`  | 2            | barrel + deep |

El peor es `src/modules/auth/routes.ts`: importa **solo** en profundidad, toca `users`,
`branches`, `member_profiles`, `promo_plans` y `referrals`, y es 100 % invisible para el
gate. Que esas tablas igual figuren en la allowlist (por otros archivos) **no protege este
archivo**: la unidad de la allowlist es el par `(archivo, tabla)` de D-13.

### Cómo se cerró (commit `d8fa4986`)

El arreglo —aceptar el import profundo en `isSchemaModule()`— **agranda la allowlist**, y
agrandarla es justo lo que el ratchet de D-14 declara build rojo. Por eso no se hizo de
oficio: es tocar el contrato de un gate recién shippeado, y D-16 dice que la lista se pobló
**one-shot** y sin regenerador. Se llevó al checkpoint del plan 08 y **Franco eligió
arreglarlo antes de pushear la fase a staging**.

| Métrica de la lente estática | Antes     | Después   |
| ---------------------------- | --------- | --------- |
| Entradas `(archivo, tabla)`  | 389       | **423**   |
| Accesos violadores           | 1.597     | **1.727** |
| Archivos con deuda           | 108       | **120**   |
| Tablas gym-owned con deuda   | 78        | **87**    |
| Entradas perdidas            | —         | **0**     |

Las 34 entradas nuevas se reparten sobre 17 archivos (7 `import-turnos.ts`, 5
`auth/routes.ts`, 3 `import-members.ts`, 3 `blog/service.ts`, …). **No son deuda nueva**: son
deuda que ya estaba y que el gate no veía. El re-baseline se hizo con un snippet descartable
en el scratchpad —fuera del repo, igual que el baseline original del plan 07— tocando
únicamente `entries` y `generated`.

Con el fix, las dos lentes coinciden: **87 tablas gym-owned con deuda en la estática, 86 en el
runtime** (la de menos es la que el suite no ejercitó sin filtro). Queda un `it` de regresión
en `test/tenancy/con-06-lint.test.ts` que se pone rojo si algún archivo con import profundo
vuelve a quedar en cero accesos, o si la lente estática baja de 87 tablas.

`pnpm lint:tenant` sale **0 con la allowlist nueva**. Contra `origin/staging` el gate D-14 se
saltea con su warning explícito (la allowlist no existe en esa base), que es exactamente el
caso previsto para el commit que la introduce.

---

## Ventana de observación en staging

**Veredicto de cierre: CERRADA CON LIMITACIÓN DECLARADA** (2026-07-30, decisión de Franco).

### Cómo se leyó

| Dato               | Valor                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| Fecha de lectura   | 2026-07-30                                                                  |
| Muestra observada  | ~14 h (último restart de pm2 ≈ 2026-07-29 21:41Z → último resumen 11:41:30Z) |
| Proceso            | `eltemplo-staging-api` — `status: online`, `unstable restarts: 0`           |
| Acceso             | SSH read-only al EC2, con OK explícito de Franco (Rule 0 del playbook)      |
| Comandos           | `pm2 describe` + `pm2 logs --lines 20000 --nostream` filtrado por sentinel  |

### Totales observados

| Métrica                              | Suite (2026-07-28) | Staging (14 h) |
| ------------------------------------ | ------------------ | -------------- |
| Fingerprints distintos               | 1.852              | **66**         |
| Tablas gym-owned tocadas             | 86 de 87           | **39**         |
| Violaciones con repeticiones         | ≥ 3.683 (piso)     | **2.731**      |
| `fingerprintsOmitidos`               | —                  | **0**          |
| Fallos internos del parser           | 0                  | **0**          |
| Hits en modo strict (`"strict":true`) | 0                  | **0**          |

### Respuestas a las tres preguntas

- **a. ¿Violaciones fuera del inventario del suite?** **No, a nivel de tabla.** Las 39 tablas
  gym-owned vistas en staging son subconjunto **estricto** de las 86 del inventario (`comm -13`
  da vacío). Los caminos de fondo que más riesgo tenían de no estar cubiertos por el suite —el
  cron de recategorización (`UPDATE users u SET u.status = CASE WHEN EXISTS …`), el worker de
  `pending_notifications`, `notification_templates`— ya estaban inventariados.
  **⚠ Limitación:** el cruce se hizo a nivel de **tabla**, no de fingerprint. El volcado crudo de
  los 1.852 statements salió de una sonda revertida sin commitear (ver "Cómo se generó"), así que
  cruzar 66 contra 1.852 exigiría re-correr el suite con la sonda (~23 min). No se hizo.
- **b. ¿Falsos positivos?** **Ninguno.** Cero fallos internos del parser en 2.731 inspecciones.
  Las formas que a primera vista lo parecen son los patrones ya documentados en "Candidatos a
  falso positivo": proyecciones que incluyen `tenant_id` sin filtrarlo (p. ej.
  `select id, tenant_id, … from day_modes` **sin `WHERE`** — scan completo, la fuga más grave que
  existe, marcada **correctamente**) y accesos por PK (`where refresh_tokens.id = ?`), que son
  violación legítima aunque de bajo riesgo. Ningún cambio pendiente en el parser ni en el skiplist.
- **c. ¿Volumen manejable?** **Sí, con margen.** 2.731 violaciones comprimidas en 66 `log.error`
  (ratio ≈ 41:1) y `fingerprintsOmitidos: 0` — el mapa de dedup de D-01 no se desbordó. El ruido
  no llegó a Sentry: el resumen sale por `log.info` (D-02 / T-170-13) y los `log.error` son 66 en
  14 h. Ningún camino de staging se rompió.

### ⚠ Limitación declarada (por qué "con limitación" y no "confirmada")

**Staging casi no se usó durante la ventana.** Los 66 fingerprints son el **3,6%** de los 1.852 del
suite, y `distinctFingerprints` todavía venía subiendo (63 → 63 → 66 en las últimas tres horas), o
sea que la muestra **no convergió**. Llamar a esto "confirmado con tráfico real del staff" sería
estirar el dato, y no se hace.

Lo que la ventana **sí** validó, y no depende del volumen de uso:

1. El sentinel corre 14 h en un proceso real sin un solo fallo interno del parser.
2. El dedup aguanta tráfico real — este era el riesgo concreto de D-01/D-02: que inundara los logs.
3. No rompió ningún camino (`online`, `unstable restarts: 0`, cero hits strict).

Se cierra igual porque **la ventana no puede fallar de forma cara**: el sentinel está en modo `log`
con `TENANT_STRICT_MODULES` vacía y está estructuralmente impedido de tirar una query (T-170-14).
Una forma no observada acá produce, como consecuencia completa, una línea más de `log.error`. El
gate de las fases 172-175 tampoco es esta ventana: es el suite completo en verde con el módulo en
strict, y en prod el modo sigue siendo `log` para siempre.

### 📌 Obligación derivada: lectura en producción a T+48 h del tren

**Prod es la ventana con dientes** y reemplaza lo que staging no pudo dar: mismo modo `log`, misma
lista strict vacía, pero con el 100% del tráfico real del staff. Queda agendado:

> **A las ~48 h de que el tren `170 + 171` llegue a `master`**, releer los logs del sentinel en el
> proceso de producción (`eltemplo-api`) con la misma batería de comandos read-only usada acá, y
> anotar el resultado en esta sección. Requiere OK de Franco para SSHear (Rule 0).

Las preguntas son las mismas tres. Si aparece una **tabla** gym-owned que no esté entre las 86 del
inventario, o un patrón que sí sea falso positivo del parser, es hallazgo y se arregla el parser o
el skiplist — **nunca** "bajar el sentinel" ni "aceptar el ruido".

**Resultado de la lectura en prod:** _(pendiente — agendada 2026-07-30)_

---

_Fase 170 — plan 08 (CON-05). Generado el 2026-07-28 desde `feat/170-sentinel-lint` @ `f8674af3`.
Ventana de observación cerrada el 2026-07-30 desde `feat/170-sentinel-lint` @ `a94745b1`._

# Fase 3 (prep) — Inventario completo de tablas para la migración `tenant_id`

> **Fecha:** 2026-07-26
> **Fuente analizada:** worktree `/home/franco/projects/et-promo-master`, rama
> `merge-master-wellhub-tv` @ `8ac9ba9f` (estado FUTURO de master: incluye los módulos
> **wellhub** y **tv** recién mergeados). Leídos los 73 archivos de
> `el-templo-api/src/db/schema/*.ts` (89 tablas).
> **Estado: BORRADOR AUTÓNOMO — pendiente de discusión con Nacho.** Regla del proyecto:
> las clasificaciones se PROPONEN, no se decretan (doc 02 es el precedente: todo se
> cerró caso por caso). Las tablas que ya existían al 2026-07-01 heredan la clasificación
> decidida en [`02-inventario-modulos.md`](./02-inventario-modulos.md); las [NUEVA]
> llevan propuesta + justificación de una línea.

## Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Total de tablas | **89** |
| Ya existentes al 2026-07-01 (fecha del doc 02) | **74** (el doc 02 decía "66" — ver Deltas) |
| Tablas [NUEVA] post-2026-07-01 | **15** |
| CORE (recibe `tenant_id`) | **46** |
| TEMPLO-MODULO (recibe `tenant_id`, scoping gobernado por módulo) | **42** |
| GLOBAL existentes hoy (sin `tenant_id`) | **0** (las GLOBAL son futuras: `tenants`, `tenant_settings`, catálogo genérico de ejercicios) |
| A-DISCUTIR | **1** (`labs_inquiries`) |
| [SIN-ANCLA] (ninguna cadena de FK deriva a un tenant) | **37** + 3 parciales |

Convenciones de las tablas de abajo:

- **Anclas:** columnas FK existentes y la cadena hasta `branches`/`users` (las dos anclas
  del README §4.1/§5). "directo" = FK inmediata a un ancla.
- **Uniques GLOBALES:** solo los uniques que HOY son globales y colisionarían con un
  tenant 2 → candidatos a compuesta `(tenant_id, …)` (README §4.3). Los uniques que ya
  incluyen una columna tenant-scoped (`user_id`, `branch_id`, `subscription_id`, …) son
  "safe" y se listan como *(safe)* solo cuando aportan contexto.
- Recordatorio de diseño: por la decisión de DENORMALIZAR (README §4), **TODAS** las
  CORE y TEMPLO-MODULO reciben la columna `tenant_id` — la cadena de FK solo importa
  para el **backfill** y para detectar huérfanas [SIN-ANCLA].

---

## 1. CORE — reciben `tenant_id` (46 tablas)

### 1.1 Anclas

| Tabla | Archivo | Anclas / cadena | Uniques globales → compuesta | Notas |
|---|---|---|---|---|
| `users` | users.ts | **ANCLA #2** — `tenant_id` directo. (branch_id → branches también existe) | `email`, `dni`, `referral_code`, `gympass_id` (todas UNIQUE) | `email`/`dni`/`referral_code` → `(tenant_id, …)`. `gympass_id` es id de plataforma Wellhub, único global por naturaleza → puede quedar global (discutir). Columnas Templo embebidas ya decididas en doc 02 §4.1 (level, level_override, bar_challenge_*, boarding_pass_used, current_program_enrollment_id → gobernadas por módulos). |
| `branches` | branches.ts | **ANCLA #1** — `tenant_id` directo | `code` UNIQUE → `(tenant_id, code)`; `wellhub_gym_id` UNIQUE | `wellhub_gym_id` es id de la plataforma Wellhub → propuesta: queda global (el webhook resuelve sede por ese id ANTES de conocer el tenant). |

### 1.2 Miembros, staff y acceso

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `user_branches` | user-branches.ts | user_id → users; branch_id → branches | — (`(user_id, branch_id)` safe) | Scope operativo coach/recepción. |
| `member_profiles` | member-profiles.ts | user_id → users (UNIQUE 1:1) | — | Doc 02 §3.3: NO partir la tabla; columnas de metodología (streak, avatar) gobernadas por módulos. |
| `member_notes` | member-notes.ts | user_id → users; author_id → users | — | |
| `member_logins` | member-logins.ts | user_id → users | — | Doc 02 §3.8: CORE (consumidor = segmentation). |
| `user_status_history` | user-status-history.ts | user_id → users | — | Append-only; alimenta funnel 118. |
| `refresh_tokens` | refresh-tokens.ts | user_id → users | `token_hash` UNIQUE | Propuesta: `token_hash` QUEDA global — es sha256 random (colisión imposible) y el lookup es pre-scope (autenticación). |
| `user_sepa_details` **[NUEVA]** | user-sepa-details.ts | user_id → users (UNIQUE 1:1) | — | 2026-07-09, mig 0171. **Propuesta CORE:** domiciliación bancaria es cobro genérico (feature por país, no metodología Templo). |
| `audit_log` | audit-log.ts | actor_id → users. ⚠️ `target_id` heterogéneo SIN FK (por diseño) | — | El backfill por target requiere resolver `target_kind` a nivel app. |

### 1.3 Scheduling y asistencia

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `activities` | activities.ts | **[SIN-ANCLA]** — ninguna FK | — | Catálogo gym-wide → `tenant_id` directo (README §4.1). Backfill manual (=1). |
| `schedules` | schedules.ts | branch_id → branches; activity_id → activities | — | |
| `schedule_exceptions` **[NUEVA]** | schedule-exceptions.ts | schedule_id → schedules → branches | — (`(schedule_id, exception_date)` safe) | 2026-07-10, migs 0174/0175. **Propuesta CORE:** primitiva de cancelación por fecha del scheduling core. |
| `bookings` | bookings.ts | member_id → users; schedule_id → schedules → branches | — (`(member_id, schedule_id, booking_date)` safe) | |
| `attendance` | attendance.ts | member_id → users; branch_id → branches; schedule_id → schedules | — | Enum `source` ya incluye 'wellhub'. |
| `holidays` | holidays.ts | **[SIN-ANCLA]** — solo `country` | `(country, date)` UNIQUE → `(tenant_id, country, date)` | Ya listada en README §4.3. Backfill manual (=1). |
| `class_coach_assignments` | class-coach-assignments.ts | branch_id → branches; coach_id → users | — (`(branch, week, day, slot)` safe: incluye branch) | |
| `coach_ratings` | coach-ratings.ts | coach_id/member_id → users; branch_id → branches; schedule_id → schedules | — | Doc 02: core-apagado (scope, no pertenencia). |

### 1.4 Subscripciones y planes

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `subscription_plans` | subscription-plans.ts | **[SIN-ANCLA]** — solo linked_program_id → programs (Templo, tampoco ancla) | — (name NO es unique) | Catálogo gym-wide → `tenant_id` directo. FK a `programs` es un acople core→Templo ya conocido (doc 02 §4.2, pricing/programs). |
| `subscriptions` | subscriptions.ts | user_id → users; branch_id → branches; plan_id → subscription_plans | — | Columnas referral_discount_* nuevas (fase 157) no cambian el anclaje. |
| `subscription_schedules` | subscription-schedules.ts | subscription_id → subscriptions → users; schedule_id → schedules | — (`(subscription_id, schedule_id)` safe) | |
| `subscription_schedule_changes` | subscription-schedule-changes.ts | subscription_id → subscriptions; actor_id → users | — | |
| `promo_plans` | promo-plans.ts | **[SIN-ANCLA]** — ⚠️ `subscription_plan_id` es int SIN `.references()` | `promo_code` UNIQUE → `(tenant_id, promo_code)` | Catálogo → `tenant_id` directo. La FK lógica sin constraint no sirve para backfill mecánico. |

### 1.5 Finanzas

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `financial_transactions` | financial-transactions.ts | `recorded_by` → users **NOT NULL** (ancla siempre presente); member_id/branch_id/cash_register_id/cost_center_id NULLABLES | `idempotency_key` UNIQUE (nullable) | Backfill por `recorded_by`. `idempotency_key` es opaca client-generated → propuesta: puede quedar global (colisión ~0), o compuesta por prolijidad. |
| `transaction_links` | transaction-links.ts | transaction_id → financial_transactions → users(recorded_by). ⚠️ target_id heterogéneo SIN FK | — (`(transaction_id, target_kind, target_id)` safe) | |
| `balances` | balances.ts | member_id → users | — (`(member, kind, target, currency)` safe) | |
| `debt_management` **[NUEVA]** | debt-management.ts | balance_id → balances → users; updated_by → users | — (`balance_id` UNIQUE safe) | 2026-07-15 (promesas/observaciones de cobranza). **Propuesta CORE:** gestión de deuda = superficie finance core (doc 02: cobros/deudas core vía roles). |
| `cash_registers` | cash-registers.ts | branch_id → branches **NULLABLE** — **[SIN-ANCLA] parcial**: cajas centrales/banco tienen branch_id NULL | — | Las filas branch-less NO derivan a tenant por FK → backfill directo (=1). Ver Minas §M4. |
| `cost_centers` | cost-centers.ts | **[SIN-ANCLA]** — solo `country` | `(name, country)` UNIQUE → `(tenant_id, name, country)` | Catálogo → `tenant_id` directo. |

### 1.6 Comunicación (motor core, contenido por-tenant — doc 02 §4.3)

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `campaigns` | campaigns.ts | created_by → users | — | Motor CORE (doc 02 §3.1); campañas concretas = contenido del tenant. |
| `campaign_sends` | campaigns.ts | campaign_id → campaigns; user_id → users | — (`(campaign_id, user_id)` safe) | |
| `campaign_events` | campaigns.ts | send_id → campaign_sends → users | — | |
| `campaign_unsubscribes` | campaigns.ts | user_id → users **NULLABLE** — **[SIN-ANCLA] parcial** (filas solo-email) | ⚠️ `email` UNIQUE → **`(tenant_id, email)` OBLIGATORIO** | **Mina terrestre §M3:** hoy la supresión es cross-sistema; con 2 tenants, un unsubscribe en el gym A bloquearía (o impediría registrar) el del gym B. |
| `device_tokens` | notifications.ts | user_id → users | `token` UNIQUE | Token FCM/APNs: único por dispositivo a nivel mundo → puede quedar global. Push = core dormido para tenants ≠ 1 (doc 02 §1). |
| `notification_templates` | notifications.ts | **[SIN-ANCLA]** — ninguna FK | `template_key` UNIQUE → `(tenant_id, template_key)` | Ya listada en README §4.3 (motor vs plantilla). |
| `notification_preferences` | notifications.ts | user_id → users | — (`(user_id, category)` safe) | |
| `pending_notifications` | notifications.ts | user_id → users; template_id → notification_templates | — | |

### 1.7 Config

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `system_settings` | system-settings.ts | **[SIN-ANCLA]** — KV global singleton | `setting_key` UNIQUE | **Ya decidido (README §5):** NO recibe tenant_id — se reemplaza GRADUALMENTE por `tenant_settings (tenant_id, setting_key)`; se deprecia cuando migre el último módulo. Mina §M2. |

### 1.8 Crecimiento y feedback [NUEVAS]

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `referrals` **[NUEVA]** | referrals.ts | referrer_id/referred_id → users; created_by → users | — (`referred_id` UNIQUE safe) | 2026-07-10, fase 157. **Propuesta CORE:** motor de referidos es adquisición genérica (mismo patrón que campaigns = motor core). ⚠️ el descuento se engancha al pricing → mismo destino que AURA/boarding-pass: hook de pricing (doc 02 §4.2). |
| `referral_credits` **[NUEVA]** | referral-credits.ts | user_id → users; subscription_id → subscriptions | — (`subscription_id` UNIQUE safe) | **Propuesta CORE** (auditoría del motor de referidos). |
| `referral_cta_clicks` **[NUEVA]** | referral-cta-clicks.ts | user_id → users | — | **Propuesta CORE** (analytics del motor; tabla A/B descartable si el experimento cierra). |
| `improvement_proposals` **[NUEVA]** | improvement-proposals.ts | member_id → users; branch_id → branches (denormalizada a propósito) | — | 2026-07-16, mig 0184. **Propuesta CORE:** buzón anónimo de sugerencias por sede = feedback genérico de cualquier gimnasio. |

### 1.9 Integración Wellhub [NUEVAS] — módulo de integración activable

> **Propuesta:** CORE como **módulo de integración** (feature-flag por tenant, no
> metodología Templo): Wellhub/Gympass es una integración que cualquier gimnasio
> LATAM/BR/ES querría. Alternativa defendible: tratarla con el mismo mecanismo de
> módulos que lo Templo. A discutir el *casillero*, no el tenant_id (lo recibe igual).

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `wellhub_classes` **[NUEVA]** | wellhub.ts | branch_id → branches; activity_id → activities | `wellhub_class_id` UNIQUE (+ `(branch, activity)` safe) | Ids de plataforma externa → pueden quedar globales (son únicos en Wellhub). |
| `wellhub_slots` **[NUEVA]** | wellhub.ts | wellhub_class_row_id → wellhub_classes → branches; schedule_id → schedules → branches | `wellhub_slot_id` UNIQUE (+ `(schedule, date)` safe) | Ídem: id externo global. |
| `wellhub_bookings` **[NUEVA]** | wellhub.ts | user_id → users; wellhub_slot_row_id → wellhub_slots → branches; booking_id → bookings (nullable) | `booking_number` UNIQUE | `booking_number` lo emite Wellhub → global por naturaleza. |
| `wellhub_events` **[NUEVA]** | wellhub.ts | **[SIN-ANCLA]** — log de webhooks sin ninguna FK | `event_id` UNIQUE | Mina §M6: tenant solo derivable parseando `payload` (gym.id → branches.wellhub_gym_id) o directo =1. `event_id` viene de la plataforma → global. |

---

## 2. TEMPLO-MODULO — reciben `tenant_id`, scoping gobernado por el mecanismo de módulos (42 tablas)

> Doc 02 §2: SPOM completo, gamificación AURA y marketing/marca quedaron Templo.
> Igual reciben `tenant_id` (denormalización universal); sus uniques globales se
> resuelven "en esa discusión, fuera del core MVP" (README §4.3) — acá quedan
> inventariados para que esa discusión no re-lea el schema.

### 2.1 Motor SPOM — reglas y catálogos (todas [SIN-ANCLA]: catálogos de LA metodología, una sola copia hoy)

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `routes` | routes.ts | **[SIN-ANCLA]** | `code` UNIQUE | |
| `spom_rules` | spom-rules.ts | **[SIN-ANCLA]** (route_id → routes, sin ancla) | `(week, route_id)` UNIQUE | |
| `intensity_rules` | intensity-rules.ts | **[SIN-ANCLA]** | `intensity` UNIQUE | |
| `contraction_rules` | contraction-rules.ts | **[SIN-ANCLA]** | `(intensity, total_exercises)` UNIQUE | |
| `weekly_rotator` | weekly-rotator.ts | **[SIN-ANCLA]** (4 FKs → routes) | `(week, day, level_group)` UNIQUE | |
| `formats` | formats.ts | **[SIN-ANCLA]** | `name` UNIQUE → `(tenant_id, name)` *si algún día se comparte* (README §4.3 lo lista condicional) | |
| `format_compatibility` | format-compatibility.ts | **[SIN-ANCLA]** (format_id → formats) | `(format_id, block, level, intensity)` UNIQUE (safe dentro del catálogo) | |
| `spom_config` | spom-config.ts | **[SIN-ANCLA]** | PK `id` default 1 | **⚠️ SINGLETON `CHECK (id = 1)`** — mina §M1. |
| `day_modes` | day-modes.ts | **[SIN-ANCLA]** | `day_of_week` UNIQUE → `(tenant_id, day_of_week)` (README §4.3) | Singleton-por-día global (6 filas para todo el sistema). |

### 2.2 Motor SPOM — árbol de ejercicios

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `exercises` | exercises.ts | **[SIN-ANCLA]** (solo self-FKs canonical/milestone) | — | ES el árbol SPOM (doc 02 §2, decidido): no se transforma. El catálogo genérico GLOBAL se construye NUEVO. |
| `exercise_dimension_proposals` | exercise-dimension-proposals.ts | **[SIN-ANCLA]** (exercise_id → exercises) | `exercise_id` UNIQUE (safe en catálogo) | |
| `exercise_milestone_proposals` | exercise-milestone-proposals.ts | **[SIN-ANCLA]** (exercise_id → exercises ×2) | `exercise_id` UNIQUE (safe) | |
| `exercise_progressions` | exercise-progressions.ts | **[SIN-ANCLA]** (from/to → exercises) | `(from, to)` UNIQUE (safe) | |
| `exercise_adjustments` | exercise-adjustments.ts | member_id → users ✓ | — | Única tabla del árbol CON ancla (log por-socio). |

### 2.3 Motor SPOM — sesiones

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `sessions` | sessions.ts | **[SIN-ANCLA]*** (approved_by → users NULLABLE; catálogo de sesiones, no dato de socio) | ⚠️ `day_id` UNIQUE → colisiona si 2 tenants corren SPOM (mina §M5) | |
| `session_blocks` | session-blocks.ts | **[SIN-ANCLA]** (session_id → sessions) | — | |
| `session_prescriptions` | session-prescriptions.ts | **[SIN-ANCLA]** (block_id → session_blocks; ⚠️ exercise_id SIN `.references()`) | — | |
| `session_traces` | session-traces.ts | **[SIN-ANCLA]** (session_id → sessions) | — | |
| `session_edit_logs` | session-edit-logs.ts | user_id → users ✓; session_id → sessions | — | |
| `completed_sessions` | completed-sessions.ts | user_id → users ✓; branch_id → branches ✓ | — | Log de entrenamiento del socio (dato per-member del módulo). |
| `saved_blocks` | saved-blocks.ts | created_by → users ✓ | — | |
| `evaluation_requests` | evaluation-requests.ts | user_id → users ✓; processed_by → users | — | |

### 2.4 Gamificación AURA

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `aura_balances` | aura-balances.ts | user_id → users (UNIQUE 1:1) | — | |
| `aura_transactions` | aura-transactions.ts | user_id → users | — (`(user, source, ref_type, ref_id)` safe) | |
| `aura_config` | aura-config.ts | **[SIN-ANCLA]** | `source_type` UNIQUE (README §4.3: se resuelve en la discusión del módulo) | Config global del módulo (12 filas). |

### 2.5 Wellness / onboarding (doc 02 §3.6/§3.7: Templo hoy)

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `check_in_responses` | check-in-responses.ts | user_id → users | — (`(user, question, date)` safe) | |
| `onboarding_analytics` | onboarding-analytics.ts | user_id → users | — | |

### 2.6 Programs (doc 02 §3.2: Templo hoy; noción SaaS va al motor genérico futuro)

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `programs` | micro-programs.ts | **[SIN-ANCLA]** | — | |
| `program_content_blocks` | micro-programs.ts | **[SIN-ANCLA]** (program_id → programs; exercise_id → exercises) | — | |
| `program_enrollments` | program-enrollments.ts | user_id → users ✓; subscription_id → subscriptions; assigned_by → users | — | |
| `plan_programs` **[NUEVA]** | plan-programs.ts | **[SIN-ANCLA]** (plan → subscription_plans, program → programs; ninguna es ancla) | — (`(plan, program)` safe) | 2026-07-04, PLAN-03. **Propuesta TEMPLO-MODULO:** join core-plan↔programa Templo; vive y muere con `programs`. Es además un acople core→Templo NUEVO post-doc-02 (hermano del linked_program_id). |

### 2.7 Marketing / marca El Templo (sitio) — todas [SIN-ANCLA] (leads/CMS del sitio público, sin FK a nada)

| Tabla | Archivo | Uniques globales | Notas |
|---|---|---|---|
| `blog_posts` | blog-posts.ts | `slug` UNIQUE | README §4.3: slugs se resuelven en la discusión del módulo. |
| `blog_tags` | blog-tags.ts | `slug` UNIQUE | |
| `blog_post_tags` | blog-tags.ts | — (`(post_id, tag_id)` safe) | ⚠️ post_id/tag_id SIN `.references()` — backfill mecánico no ve la cadena. |
| `academy_inquiries` | academy-inquiries.ts | — | Lead del sitio, sin ancla. |
| `app_waitlist` | app-waitlist.ts | — | |
| `franchise_applications` | franchise-applications.ts | — | Franquicias de la MARCA El Templo → Templo (≠ labs). |
| `gladius_products` | gladius-products.ts | `slug` UNIQUE | |
| `gladius_inquiries` | gladius-inquiries.ts | — | |

### 2.8 TV de sucursal [NUEVAS] — fase 164

> **Propuesta TEMPLO-MODULO:** la pantalla muestra la planificación SPOM viva (roles de
> bloque INITIUM/NUCLEUS, niveles griegos, timer por formato) → hoy es una superficie del
> motor SPOM. El sub-mecanismo device-code/pairing es motor genérico reutilizable
> (patrón futuro "pantallas del tenant"), pero no justifica partir el módulo hoy.

| Tabla | Archivo | Anclas / cadena | Uniques globales | Notas |
|---|---|---|---|---|
| `tv_devices` **[NUEVA]** | tv.ts | branch_id → branches ✓; paired_by → users | `token_hash` UNIQUE | Credencial sha256 random → puede quedar global (mismo criterio que refresh_tokens: lookup pre-scope). |
| `tv_pairings` **[NUEVA]** | tv.ts | branch_id → branches **NULLABLE hasta el claim** — **[SIN-ANCLA] parcial/pre-tenant**; claimed_by → users; device_id → tv_devices | ⚠️ `user_code` UNIQUE; `device_code_hash` UNIQUE | Mina §M7: el flujo device-code es inherentemente PRE-tenant (el TV no pertenece a nadie hasta que el staff reclama). `user_code` global es incluso necesario (el claim busca por código sin scope). |
| `tv_class_state` **[NUEVA]** | tv.ts | branch_id → branches ✓; updated_by → users | — (`branch_id` UNIQUE safe — singleton POR SEDE, bien diseñado) | Único singleton del repo hecho "a la manera multi-tenant-friendly". |

---

## 3. GLOBAL — sin `tenant_id` (0 existentes + futuras)

| Tabla | Estado | Notas |
|---|---|---|
| `tenants` | FUTURA (README §5, diseño validado) | La raíz del modelo. |
| `tenant_settings` | FUTURA (README §5) | KV por tenant; reemplazo gradual de `system_settings`. |
| Catálogo genérico de ejercicios | FUTURA (doc 02 §2, decidido) | Primer miembro confirmado del club GLOBAL. |

Hoy **ninguna tabla existente** califica limpiamente como GLOBAL. `system_settings` es
global-de-facto pero su destino ya está decidido (deprecación gradual, §1.7).

---

## 4. A-DISCUTIR — ✅ RESUELTO (2026-07-26)

| Tabla | Archivo | Anclas | Decisión | Justificación |
|---|---|---|---|---|
| `labs_inquiries` | labs-inquiries.ts | **[SIN-ANCLA]** | **✅ GLOBAL (plataforma)** — decidido 2026-07-26 | Leads del propio SaaS (El Templo Labs), del operador de la plataforma; jamás se expone a un tenant. Tabla casi vacía hoy → costo cero. Primera tabla GLOBAL existente del sistema. |

---

## 5. Deltas vs doc 02 (inventario 2026-07-01)

1. **Conteo base: 74 tablas ya existían al 2026-07-01, no "66".** Verificado por
   `git log --diff-filter=A` por archivo. La cifra del doc 02 probablemente subcontó los
   archivos multi-tabla (campaigns.ts define 4 tablas, notifications.ts 4, blog-tags.ts 2,
   micro-programs.ts 2, blog… = +8 exactos si se contó "1 archivo = 1 tabla" en esos casos).
   No cambia ninguna decisión — pero el manifiesto de tests de aislamiento (README §4.2
   capa 5) debe partir de **89**, no de 66.
2. **15 tablas [NUEVA] post-doc-02** (fecha de alta en git):
   `plan_programs` (07-04), `user_sepa_details` (07-09), `referrals` + `referral_credits` +
   `schedule_exceptions` (07-10), `referral_cta_clicks` (07-13), `debt_management` (07-15),
   `improvement_proposals` (07-16), `wellhub_classes/slots/bookings/events` (07-21),
   `tv_devices/pairings/class_state` (07-24). Propuestas: 8 CORE, 4 CORE-integración
   (wellhub), 4 TEMPLO-MODULO (plan_programs + tv_*). Ninguna GLOBAL.
3. **Acople core→Templo nuevo:** `plan_programs` une `subscription_plans` (core) con
   `programs` (Templo) — hermano estructural del `linked_program_id` que el doc 02 ya
   había marcado. La lista de acoples §4.2 del doc 02 debería sumarlo.
4. **Hook de pricing creció:** la cadena documentada `override → boarding pass → AURA`
   ahora es `override → boarding pass → AURA → referral` (columnas
   `referral_discount_percent/amount` en subscriptions + `referral_credits`). El diseño de
   hooks de pricing (doc 02 §4.2) tiene un 4º cliente.
5. **Wellhub tocó tablas core existentes:** `branches.wellhub_gym_id` (UNIQUE),
   `users.gympass_id` (UNIQUE), `users.status` +'wellhub', `attendance.source` +'wellhub'.
   El "matiz por módulo" ya no es solo columnas Templo en users: hay columnas de
   *integración* en las dos anclas.
6. **Uniques nuevas para la tabla de conversión §4.3 del README** (además de las ya
   listadas): `users.referral_code`, `cost_centers (name, country)`,
   `promo_plans.promo_code`, `campaign_unsubscribes.email`, `day_modes.day_of_week`
   (ya estaba), y el paquete de ids externos/credenciales que se propone DEJAR global
   (ver Minas §M8).

---

## 6. Minas terrestres

- **M1 — `spom_config` CHECK(id=1)** (spom-config.ts): singleton duro por constraint
  (`check('spom_config_single_row', id = 1)`, PK default 1) que guarda `current_week` de
  TODO el sistema. Mientras SPOM sea Templo-only (tenant 1) sobrevive; si un 2º tenant
  corriera SPOM alguna vez, este CHECK es incompatible con tenant_id por definición
  (habría que migrar a `(tenant_id)` UNIQUE, como hace `tv_class_state` con branch).
- **M2 — `system_settings`** KV global con `setting_key` UNIQUE: ya decidido reemplazo
  gradual por `tenant_settings`. Riesgo operativo: mientras coexistan, todo módulo nuevo
  que escriba una key en system_settings agranda la deuda de migración.
- **M3 — `campaign_unsubscribes.email` UNIQUE global — ✅ RESUELTA (2026-07-26): supresión
  POR TENANT** (unique compuesta `(tenant_id, email)` + filtro de envío scopeado; cada
  gimnasio maneja su lista, el opt-out es hacia un remitente concreto). Contexto original:
  Con 2 tenants: (a) la fila del tenant A IMPIDE insertar el unsubscribe del tenant B
  (violación de unique), y (b) si el filtro NOT EXISTS no se tenant-scopea, un
  unsubscribe en A suprime los mails de B → fuga de comportamiento cross-tenant sin leak
  de datos. Además admite filas con `user_id` NULL (solo email) → sin ancla derivable.
- **M4 — Filas legítimamente sin cadena a tenant (backfill directo obligatorio):**
  `cash_registers` con branch_id NULL (cajas central/banco por moneda),
  `financial_transactions` con member_id Y branch_id NULL (egresos/movimientos — aunque
  `recorded_by` NOT NULL las rescata), `campaign_unsubscribes` solo-email,
  `tv_pairings` pre-claim. El script de backfill por cadena de FK NO las cubre.
- **M5 — `sessions.day_id` UNIQUE global** (`W1-lunes-sigma`): el day_id es la identidad
  textual de la sesión SPOM y viaja denormalizado como varchar a `completed_sessions.day_id`
  y `exercise_adjustments.day_id` (SIN FK). Composición con tenant_id implica también
  revisar esos joins-por-string.
- **M6 — `wellhub_events` no tiene ninguna FK:** el tenant solo se deriva parseando el
  payload del webhook (gym.id → `branches.wellhub_gym_id`). Además el webhook AUTO-CREA
  users (status='wellhub') — un camino de escritura de users que nace fuera de un request
  con scope (cron/webhook): el diseño de `tenantValues` tiene que cubrir jobs sin request.
- **M7 — `tv_pairings` es pre-tenant por diseño:** branch_id NULL hasta que el staff
  reclama; `user_code` UNIQUE global es NECESARIO (el claim resuelve por código sin
  scope). Igual que M6, exige una exención anotada (`/* tenant-safe */`) en el sentinel.
- **M8 — Uniques que QUEDAN globales — ✅ APROBADA COMPLETA (2026-07-26)** (ids de
  plataforma externa o secretos random con lookup pre-scope): `users.gympass_id`,
  `branches.wellhub_gym_id`, `wellhub_classes.wellhub_class_id`,
  `wellhub_slots.wellhub_slot_id`, `wellhub_bookings.booking_number`,
  `wellhub_events.event_id`, `refresh_tokens.token_hash`, `device_tokens.token`,
  `tv_devices.token_hash`, `tv_pairings.user_code` / `device_code_hash`. Racional
  aprobado: las filas igual reciben `tenant_id`; grupo A (ids Wellhub) — el webhook
  descubre el tenant POR ese lookup y la unique global impide que 2 tenants reclamen el
  mismo recurso externo; grupo B (secretos) — componer por tenant es circular (el lookup
  es cómo se descubre quién sos) y la colisión es imposible (256 bits).
- **M9 — FKs lógicas sin constraint** (invisibles para el backfill mecánico por FK):
  `promo_plans.subscription_plan_id`, `blog_post_tags.post_id/tag_id`,
  `session_prescriptions.exercise_id`, y los `target_id` heterogéneos de
  `transaction_links` / `balances` / `audit_log` (por diseño, resueltos por `target_kind`
  en el service). El script de backfill necesita una tabla de mapeo manual para estas.
- **M10 — `users.branch_id` NOT NULL para TODOS los roles** exige que toda alta de user
  tenga una branch del MISMO tenant — el par de anclas (`users.tenant_id`,
  `branches.tenant_id`) puede divergir si un update cruza sedes; vale un CHECK a nivel
  app (o trigger) "branch.tenant_id = user.tenant_id" en `setMemberBranch()` y el cron de
  recategorización multisucursal (que reescribe branch_id automáticamente).

## Registro de cambios

- **2026-07-26** — Creación autónoma (lectura de los 73 schema files @ `8ac9ba9f`,
  rama merge-master-wellhub-tv). Pendiente: discusión con Nacho (casillero de wellhub,
  labs_inquiries, referrals-como-core, y la lista M8 de uniques que quedan globales).
- **2026-07-26 (misma sesión) — ✅ Las 4 pendientes RESUELTAS** (detalle en doc 06 §8):
  wellhub = CORE-integración con flag, pero **no se ofrece a otros gimnasios por ahora**
  (acuerdo puntual del Templo); `labs_inquiries` = GLOBAL plataforma; referrals = CORE
  confirmado (4º cliente del hook pricing); M8 aprobada completa; M3 = supresión por
  tenant. El inventario queda CERRADO como insumo del milestone de tenancy.

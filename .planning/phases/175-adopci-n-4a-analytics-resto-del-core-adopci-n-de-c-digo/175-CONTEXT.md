# Fase 175 — Adopción 4a: `analytics` + resto del core (adopción de CÓDIGO)

**Milestone:** v6.0 Tenancy. Parte del tren 173/174/174.1/175 (viajan JUNTAS a master, regla de Franco).
Relacionado: `174.1-.../deferred-items.md`, `173-.../deferred-items.md`, [[project_saas_multitenancy_fase174_1]].

## Alcance (qué SÍ y qué NO)

**SÍ (esta fase):** adopción de CÓDIGO del resto del core — que cada lectura/insert de tabla gym-owned de
`campaigns`, `notifications`, `referrals`, `wellhub`, `improvement-proposals`, `auth` filtre/estampe por tenant,
y el único fix real pendiente de `analytics`. Cada plan **remueve del `tenant-lint-allowlist.json` exactamente
las entradas de los accesos que scopeó** (D-14: migrar código y achicar la allowlist son EL MISMO acto; en 174
NO hacerlo puso el CI en rojo — `con-06-lint` exige `DISCREPANCIAS:0` en el mismo PR).

**NO (esta fase):**

- **NO encender `TENANT_STRICT_MODULES`** para estos módulos (el switch + la batería ISO son la fase **175.1**).
  Remover una entrada del allowlist NO enciende strict — solo mantiene el ledger del lint consistente.
- **NO** re-scopear `analytics` (ya lo hizo mecánicamente la 174.1) salvo el único gap real (`unique-members`).
- **NO** verificar los NÚMEROS de analytics (ADO-05) — eso requiere snapshots en staging = checkpoint humano.
- **NO** tocar entradas del allowlist de otros módulos (finance/members/subscriptions/scheduling ya strict).

## Método de ejecución (D-08 — NO es GSD estándar)

- **Código/tests se ejecutan y commitean en el worktree `/home/franco/projects/et-173`** (rama `feat/173-adopcion-members`,
  HEAD al arrancar `3f2f6d96`). El checkout principal `/home/franco/projects/el-templo` tiene código VIEJO — NO editarlo.
- Ejecutores **`gsd-executor` en `model: sonnet`**, encadenados **secuencial** (comparten worktree). El orquestador (opus)
  verifica tras CADA plan: worktree limpio + `pnpm exec tsc --noEmit` + `pnpm lint:tenant` (`DISCREPANCIAS:0`) +
  `pnpm exec vitest run --no-file-parallelism test/tenancy` (lección 174: correr test/tenancy tras cada plan que toque
  reads/inserts — su omisión puso el CI en rojo dos veces).
- **PLAN.md** se leen por path absoluto del checkout principal
  (`/home/franco/projects/el-templo/.planning/phases/175-.../175-0N-PLAN.md`). **Código** commitea en `feat/173-adopcion-members`.
  **SUMMARYs** los escribe el ejecutor al path absoluto (sin commitear); **los commitea el ORQUESTADOR** en la docs branch
  `docs/planning-untracked-2026-08` (`docs(175-0N): ...`). Los ejecutores NO commitean docs de `.planning` en `feat/173`.

## Reglas duras para ejecutores sonnet (aprendidas a golpes en 173/174/174.1)

1. **Tests SOLO en foreground, UNO a la vez, timeout tool 600000ms.** PROHIBIDO `run_in_background` para tests y PROHIBIDO
   loops `pgrep`/`pkill`/`sleep` de espera — se matchean a sí mismos (deadlock) y dejan vitest huérfano que corrompe la
   MySQL de test compartida (incidente 174.1: 300 falsos rojos).
2. **`tenant_id` SIEMPRE server-side** — jamás del payload ni del JWT. Se resuelve por `assertTenant(request.scope, label)`
   en el handler, o por el ancla de la fila (p.ej. `campaign_sends.tenant_id`, `users.tenant_id`).
3. **Tener `ctx` en la firma NO implica usarlo en cada JOIN/acceso** — al migrar un método revisar TODOS sus `.from()`,
   `.insert()`, JOINs y subqueries. En 174 aparecieron JOINs sin filtro dentro de métodos "cerrados".
4. **SQL crudo (`db.execute(sql\`...\`)`/mysql2)** es invisible a un grep de Drizzle — buscarlo aparte. El tag `tenant-safe`
   para el sentinel va **EMBEBIDO en el fragmento `sql`** (no como comentario TS, que el sentinel no ve — precedente 173-22/173-23).
5. **Inserts:** envolver `.values({...})` en `tenantValues(ctx, {...})` (estampa `tenant_id` DESPUÉS del spread, guard de
   mass-assignment). Sin él la fila nace con `DEFAULT 1` (El Templo).
6. **Allowlist:** al scopear un acceso, borrar su entrada de `tenant-lint-allowlist.json`; al convertir un acceso en exención
   `tenant-safe` embebida, también sale del allowlist (pasa a la cuenta de exenciones). Tras editar: `pnpm lint:tenant` debe dar
   `DISCREPANCIAS:0` local. NO tocar entradas de otros módulos.
7. **NO** usar `gsd-sdk state.*`/`roadmap.*` (STATE.md está STALE apuntando a fase 173/159 — el tracking real son los SUMMARYs).
8. **No ajustar expectativas de tests existentes** para que pasen — el comportamiento del tenant 1 (El Templo) NO cambia. Si un
   test existente se pone rojo, es señal (bug real o fixture que asumía no-scope), no ruido a silenciar.
9. Flake calendario >21:00 AR (ver `reference_test_arpu_dependiente_del_calendario`): una regresión con cero `TenantSentinelError`
   corrida tarde puede ser el almanaque, no el plan.

## Idiomas de tenancy (canónicos — NO rediseñar; ver `shared/tenant.ts` + `174-.../174-PATTERNS.md`)

- **Pattern A (lectura):** `and(tenantWhere(tabla, ctx), ...resto)` como PRIMER término del WHERE. Si la tabla entra por JOIN,
  el `tenantWhere` va en el `ON`, no en el WHERE externo.
- **Pattern B (insert):** `tenantValues(ctx, {...})`.
- **Pattern C (anchor guard):** `assertBranchDelGimnasio(ctx, branchId)` antes de persistir un FK a sede que viene del body.
- **Pattern D (guard provisional):** `isNotNull(tabla.tenantId)` — SOLO donde ya exista y no haya actor; en 175 varios se
  REEMPLAZAN por ctx real (es la deuda que esta fase salda).
- **Exención tenant-safe:** anotación EMBEBIDA en el `sql` para accesos genuinamente cross-tenant (crons de barrido, imports
  por-tenant) o pre-scope (lookup por hash opaco de token/eventId, uniques globales M8).

## Inventario de trabajo (barrido sobre et-173@3f2f6d96, 2026-08-14)

Allowlist total: 197. De estos 8 módulos: **48 entradas** (campaigns 8, notifications 5, referrals 5, wellhub 7,
improvement-proposals 2, auth 4, settings 0, analytics 17). Los detalles con `archivo:línea` van en cada PLAN. Resumen:

- **campaigns** (mayormente NO adoptado): `service.ts` create/listCampaigns/send(6-7 accesos ignoran ctx)/sendTest/loadSedes;
  `tracking-service.ts` completo (opens/clicks/**unsubscribe** + getSendEmail). **Severidad alta:** `send` opera sobre el `:id`
  de otro gimnasio. El unsubscribe por-tenant (M3) tiene complicación real: el token no lleva `tenantId` → resolver de `campaign_sends`.
- **notifications**: 4 sitios SQL crudo sin `tenant_id` (registerToken/updatePreference/seedTemplates); lookup de template por
  `templateKey` sin scope (**bug real post-168**: `(tenant_id, template_key)` compuesto → puede resolver plantilla de otro gimnasio);
  `GET/PUT /admin/templates` sin scope (**leak + tampering**); `resolveUseFemale` con guard `isNotNull` → ctx real; cron batch PK-scoped (anotar).
- **referrals** (bien adoptado, gaps puntuales): `getReferralOverview`/`computeReferralDiscountPercent` leen `referrals` sin
  `tenantWhere` pese a ctx; `generateReferralCode` guard `isNotNull` → ctx real; `recordReferralCredit`/`recordCtaClick` inserts sin
  `tenantValues`; `getAbTestResults` clickRows/referralRows sin su propia anotación embebida; **`deriveCoveredUntil`**
  (subscriptions/service.ts:~200-221) llamado sin ctx desde referrals:244,312 y jobs/notification-cron.ts:358 (=deuda `activeMemberExists`-adyacente).
- **wellhub** (muy adoptado): `attendance` sin scope en el checkin flow pese a ctx disponible (existingToday/recheck/insert);
  `wellhub_bookings`/`wellhub_classes`/`wellhub_slots` sin scope; `wellhub eventId` M8 sin su anotación; crons de `sync-service.ts` (anotar).
- **improvement-proposals** (casi nada): `submitProposal` INSERT sin `tenantValues` pese a ctx; count anti-spam sin `tenantWhere`;
  admin listing/export SIN ctx (solo filtra por país → **leak cross-tenant** entre gimnasios del mismo país).
- **auth** (muy avanzado): `promo_plans` lookup por `promoCode` sin scope pese a ctx (**bug real post-168**, `(tenant_id, promo_code)`);
  `referrals` INSERT en registro sin `tenantValues`; `refresh_tokens.issue` sin `tenantValues`; branch-resolution/refresh-by-hash → anotar.
- **settings**: `system_settings` NO tiene `tenant_id` (key-value global por diseño). **Nada que migrar** — solo confirmar la decisión.
- **analytics**: 21/22 endpoints ya con `assertTenant` + `tenantWhere` extensivo, 0 SQL crudo. **Un solo fix real:**
  `GET /attendance/unique-members` (routes.ts:~257) sin `assertTenant`; delega en `attendanceMetricsService.uniqueMembers` que cuenta
  `COUNT(DISTINCT attendance.member_id)` sin `tenantWhere`. Las 17 entradas restantes = `branches` joineado solo por `.country`
  (patrón derivado tolerado, como reports:1545/goal-plans:488) — NO re-tocar salvo que su entrada quede stale al scopear.

## Success Criteria de la fase (del ROADMAP)

1. `analytics` migrado, mismos números para tenant 1 (ADO-05) — **CÓDIGO cerrado acá (`unique-members`); VERIFICACIÓN de números = checkpoint humano en staging**.
2. campaigns/notifications/referrals/wellhub/feedback/auth completan el patrón; deudas de 173/174.1 saldadas (ADO-06).
3. Supresión de `unsubscribes` **por tenant** end-to-end (opt-out del tenant A no suprime envíos del tenant B) — cierra mina M3 (plan 175-02).
4. Sin cambio de números ni comportamiento para el tenant 1 (suite existente verde sin ajustar expectativas).

## Diferido (NO se ejecuta autónomamente — checkpoint humano)

- **Fix de seguridad `subscriptions.branch_id`** (deferred de 174.1-06): `assignPlan`/`changePlanNow`/`changePlanAfterCurrent`/
  `renewSubscription` persisten `input.branchId` crudo sin `assertBranchDelGimnasio` → tampering de FK a sede ajena. Toca 4 métodos
  de un archivo strict de ~6700 líneas con blast radius no verificable en un turno → plan dedicado bajo supervisión, NO en la cadena autónoma.
- **ADO-05 verificación de números** de analytics (churn/renovación/LTV/ticket/asistencia/funnel/altas-bajas): snapshots antes/después en staging.
- **17 tests rojos pre-existentes** en `test/subscriptions`+`test/members` (`recomputeUserStatus` no transiciona; `ageInDays` off-by-one) —
  PRE-EXISTENTES (rojos en la base, verdes en suite completa), NO son deuda de 175. Documentados en `174.1-.../deferred-items.md`.

## Plan set

- **175-01** — campaigns/service.ts (create/listCampaigns/send/sendTest/loadSedes) + allowlist.
- **175-02** — campaigns/tracking-service.ts + supresión de unsubscribes por-tenant (M3, resolver tenant de `campaign_sends`) + test e2e + allowlist.
- **175-03** — notifications (SQL crudo tenant_id, template-by-key, admin templates, resolveUseFemale, cron batch) + allowlist.
- **175-04** — referrals (overview/compute/generateCode/records/abtest) + deudas compartidas (`deriveCoveredUntil` + `active-member` ctx real) + allowlist.
- **175-05** — wellhub (attendance en checkin, wellhub_bookings/classes/slots, eventId, sync crons) + allowlist.
- **175-06** — improvement-proposals + auth (promo_plans/referrals insert/refresh_tokens) + fix analytics `unique-members` + confirmación settings + allowlist.

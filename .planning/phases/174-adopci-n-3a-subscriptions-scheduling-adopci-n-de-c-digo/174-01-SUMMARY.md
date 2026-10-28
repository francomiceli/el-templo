---
phase: 174-adopci-n-3a-subscriptions-scheduling-adopci-n-de-c-digo
plan: 01
subsystem: api
tags: [tenancy, multitenancy, subscriptions, drizzle, mysql]

# Dependency graph
requires:
  - phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
    provides: "tenantWhere/tenantValues/assertTenant (shared/tenant.ts), assertBranchDelGimnasio (shared/branch-consistency.ts), 16 métodos de subscriptions/service.ts ya con ctx"
provides:
  - "Métodos no-pricing/no-D07 de subscriptions/service.ts filtran por tenant en cada acceso (listPlans, createPlan, updatePlan, deactivatePlan, assertProgramsExist, persistPlanPrograms, changeFixedSchedules, editSubscriptionStartDate, pauseSubscription, resumeSubscription, getActivePausedSubscriptionRaw, compensateDays, _cancelSubscription, bulkMigratePlan, getClassUsageThisWeek, listScheduleChanges, listPromoPlans, createPromo, updatePromo, deactivatePromo)"
  - "booking-population.ts (populateBookings/clearFutureBookings/cancelBookingsInRange/countFutureBookings) recibe ctx y filtra sus 9 lecturas incl. holidays (D-02)"
  - "Los 4 handlers de member-routes.ts resuelven ctx via assertTenant"
  - "Marker :4756 DEUDA CON DUEÑO (bulkMigratePlan insert) saldado con tenantValues"
affects: [174-02, 174-06, 174.1]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern A/B/C/D de 174-PATTERNS.md aplicados sin variación"
    - "Helpers compartidos entre métodos FRONTERA (pricing/D-07) y métodos en-alcance quedan CRUDOS a propósito para no romper 'git diff no toca FRONTERA' — documentado explícitamente por método"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/booking-population.ts
    - el-templo-api/src/modules/subscriptions/member-routes.ts
    - el-templo-api/src/modules/subscriptions/routes.ts

key-decisions:
  - "getPlanById, getSubscriptionById, pickSubscriptionForActivity, getCoveredUntil/deriveCoveredUntil, mapPlanRow, getPlanProgramIds, resolveGoalPlanType, enrichWithScheduleIds/enrichManyWithScheduleIds, getSubscriptionScheduleIds/getScheduleSlotDetails, validateAnchorSet quedan CRUDOS: los llaman métodos de pricing (assignPlan/changePlan/changePlanNow/changePlanAfterCurrent/renewSubscription/getChangePlanPreview/getPricingPreview) explícitamente protegidos por la FRONTERA ('git diff no los toca'), y/o módulos fuera de alcance (scheduling/booking-service.ts, attendance/service.ts, referrals/service.ts, jobs/notification-cron.ts, jobs/mark-no-shows.ts). Threadear ctx ahí forzaría editar el cuerpo de esos métodos."
  - "routes.ts (admin) se tocó pese a no estar en files_modified del plan: 9 call sites (listPlans/createPlan/updatePlan/deactivatePlan/changeFixedSchedules/listPromoPlans/createPromo/updatePromo/deactivatePromo) son el ÚNICO consumidor de esos métodos, ya import assertTenant y usan el mismo idioma que los 9 handlers ya migrados en el mismo archivo — es plomería mecánica de la firma nueva, no una decisión arquitectónica."
  - "El INSERT crudo de bookings en booking-population.ts (mysql2 client directo, no db.insert()) recibe tenant_id como columna+placeholder explícito desde ctx.tenantId — SQL crudo es invisible al grep de .from()."
  - "clearFutureBookings/countFutureBookings se migraron igual aunque no tienen callers vivos hoy (verificado por grep en todo el módulo) — completitud de la firma pública sin riesgo."

patterns-established: []

requirements-completed: [ADO-03]

# Metrics
duration: ~55min
completed: 2026-08-09
---

# Phase 174 Plan 01: Adopción tenancy en subscriptions (lecturas + lifecycle no-pricing) Summary

**Migra ~25 métodos de `subscriptions/service.ts` + las 4 funciones de `booking-population.ts` + los 4 handlers de `member-routes.ts` a `tenantWhere`/`tenantValues`/`assertTenant`, dejando intacta —byte a byte— la cadena de pricing y el camino D-07 protegidos por la FRONTERA del plan.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-08-09
- **Tasks:** 3/3
- **Files modified:** 4 (service.ts, booking-population.ts, member-routes.ts, routes.ts)

## Accomplishments

- Todos los `.from()`/`.insert()`/`.update()`/`.delete()` directos de los métodos no-pricing/no-D07 de `service.ts` filtran por tenant (Pattern A/B), incluyendo los ya-ctx'd de la 173 que aún tenían queries propias crudas (`editSubscriptionStartDate`, `pauseSubscription`, `resumeSubscription`, `compensateDays`, `_cancelSubscription`, `bulkMigratePlan`, `getClassUsageThisWeek`, `listScheduleChanges`).
- El marker `:4756` ("DEUDA CON DUEÑO — FASE 174") en `bulkMigratePlan` quedó saldado: el INSERT a `subscriptions` usa `tenantValues(ctx, {...})`.
- `booking-population.ts` pasó de 100% crudo a ctx-threaded en sus 4 funciones exportadas, incluyendo el hallazgo D-02 de `holidays` (filtraba solo por country) y un INSERT crudo vía mysql2 client que no se detecta con grep de `.insert(schema.*)`.
- `member-routes.ts` llegó a 4/4 handlers con `assertTenant`, cerrando además 2 lecturas crudas directas en la ruta (no en el service) de `subscription_plans`/`programs` en `GET /me/subscription`.

## Task Commits

Cada task se commiteó atómicamente en `et-173` (branch `feat/173-adopcion-members`):

1. **Task 1: Migrar lecturas/inserts no-pricing de subscriptions/service.ts** - `79634209` (feat)
2. **Task 2: Threadear ctx y migrar booking-population.ts** - `85dbfc42` (feat)
3. **Task 3: assertTenant en los handlers de member-routes.ts** - `21962ead` (feat)

_Sin plan-metadata commit: los docs de `.planning/` los maneja el orquestador desde el checkout principal, no este worktree._

## Files Created/Modified

- `el-templo-api/src/modules/subscriptions/service.ts` - ~25 métodos migrados a Pattern A/B; getPlanById/getSubscriptionById/pickSubscriptionForActivity y helpers compartidos con FRONTERA quedan crudos (documentado inline)
- `el-templo-api/src/modules/subscriptions/booking-population.ts` - las 4 funciones exportadas reciben `ctx: TenantContext` primero; 9 lecturas + 1 insert crudo con tenancy
- `el-templo-api/src/modules/subscriptions/member-routes.ts` - 4/4 handlers con `assertTenant`; 2 lecturas directas en ruta migradas
- `el-templo-api/src/modules/subscriptions/routes.ts` - 9 call sites admin actualizados para pasar `ctx` a las firmas nuevas (companion necesario, ver Decisiones)

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen:

1. **"Shared crude core" identificado y documentado, no migrado.** El mapa de patrones (174-PATTERNS.md) asumía que "todo el resto" de lecturas no-pricing/no-D07 podía cerrarse en este plan, pero varios helpers PRIVADOS de `service.ts` (`getPlanById`, `getSubscriptionById`, `mapPlanRow`, `getPlanProgramIds`, `enrichWithScheduleIds`, `validateAnchorSet`, etc.) tienen call sites que caen DENTRO de `assignPlan`/`changePlan`/`changePlanNow`/`changePlanAfterCurrent`/`renewSubscription`/`getChangePlanPreview`/`getPricingPreview` — los 7 métodos que la FRONTERA prohíbe tocar textualmente ("git diff no los toca"). Darles `ctx` real habría forzado editar esos 7 métodos para pasarlo, violando la frontera. Se dejaron crudos con comentario explicando el porqué en cada uno; quedan como la superficie que 174-02 (dueño de pricing) puede cerrar cuando ya no haya conflicto de FRONTERA.
2. **`getCoveredUntil`/`deriveCoveredUntil` sin ctx**: es un standalone export consumido también por `referrals/service.ts` y `jobs/notification-cron.ts` (ninguno en alcance de 174-01). Mismo criterio.
3. **`pickSubscriptionForActivity` sin ctx**: consumido por `attendance/service.ts` y `scheduling/booking-service.ts` (174-03/04/05, no 174-01) y `jobs/mark-no-shows.ts`.
4. **routes.ts tocado pese a no figurar en `files_modified`**: la alternativa (dejar `listPlans`/`createPlan`/`updatePlan`/`deactivatePlan`/`changeFixedSchedules`/promo CRUD sin ctx) habría vaciado buena parte del Task 1. El archivo ya importa `assertTenant` y usa el mismo idioma en 9 handlers migrados en 172/173 — es threadear la firma nueva a su único call site, exactamente lo que el plan pide ("threadearlo desde su único call site en routes/member-routes"), no una decisión arquitectónica nueva.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `listScheduleChanges` sin `tenantWhere` propio sobre `subscription_schedule_changes`**

- **Found during:** Task 1
- **Issue:** El método ya tenía `ctx` y filtraba el `LEFT JOIN` a `users` correctamente (documentado en su propio docblock de la 173), pero el `.from(schema.subscriptionScheduleChanges)` raíz no llevaba `tenantWhere` — un `subscriptionId` de otro gimnasio devolvía su historial de cambios de turno.
- **Fix:** `and(tenantWhere(schema.subscriptionScheduleChanges, ctx), eq(subscriptionId, ...))`.
- **Files modified:** service.ts
- **Committed in:** `79634209`

**2. [Rule 1 - Bug] `_cancelSubscription` sin `tenantWhere` en 3 de sus 4 accesos directos a `subscriptions`**

- **Found during:** Task 1
- **Issue:** El guard de cobros activos (JOIN a `financial_transactions`/`transaction_links`) YA estaba migrado desde la 173, pero el lookup del sub por id (`subRow`), el UPDATE a `cancelled`, y el SELECT+UPDATE de sucesores `scheduled` seguían crudos.
- **Fix:** `tenantWhere(schema.subscriptions, ctx)` agregado a los 4 sitios.
- **Files modified:** service.ts
- **Committed in:** `79634209`

**3. [Rule 2 - Missing Critical] INSERT crudo de `bookings` en `populateBookings` sin `tenant_id`**

- **Found during:** Task 2
- **Issue:** El INSERT usa el cliente mysql2 crudo (bypass de `db.insert()` por stack-overflow en templates `sql\`\``anidados con lotes grandes) — invisible al grep de`.insert(schema.\*)`. Sin la columna, cada booking generado nace con el DEFAULT 1 de `tenant_id`.
- **Fix:** columna `tenant_id` + placeholder `ctx.tenantId` agregados al INSERT y al `ON DUPLICATE KEY UPDATE` (que no toca `tenant_id`, correcto: no se debe reasignar el gimnasio de una fila existente).
- **Files modified:** booking-population.ts
- **Committed in:** `85dbfc42`

---

**Total deviations:** 3 auto-fixed (2 bugs Rule 1, 1 missing-critical Rule 2)
**Impact on plan:** Los 3 son gaps reales de tenancy en código YA migrado en fases previas (173) o en el mismo archivo — correcciones de seguridad directamente en el spirit del plan, sin scope creep hacia pricing/D-07.

## Issues Encountered

- El comando de vitest (test/subscriptions + test/finance, 47 archivos / 599 tests) tardó ~500s y el wrapper de Bash lo movió a background automáticamente a los 120s (comportamiento del harness, no un `run_in_background` explícito). Se esperó la notificación del harness sin polling activo, cumpliendo la regla dura de la fase 173.
- Ninguna expectativa de test se tocó.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **174-02 (pricing con golden tests):** puede arrancar limpio — `assignPlan`, `changePlan`/`changePlanNow`/`changePlanAfterCurrent`, `renewSubscription`, `getChangePlanPreview`, `getPricingPreview` quedaron byte-idénticos (verificado con `git diff` acotado a los rangos de línea de esos métodos: cero hunks dentro). El "shared crude core" (`getPlanById`, `getSubscriptionById`, `mapPlanRow`, etc.) queda documentado como superficie que 174-02 puede cerrar una vez que la FRONTERA deje de aplicar sobre esos 7 métodos.
- **174-06 (D-07):** `autoExpireSubscriptions`, `getMemberSubscriptions`/`getMemberSubscriptionHistory`, `activateScheduledSub`, `autoExpireDueSubscriptions` intactos (fuera de este diff).
- **Bloqueante potencial para 174-02/174-06:** ambos planes van a necesitar tocar los mismos helpers privados que este plan dejó crudos a propósito (`getPlanById`/`getSubscriptionById` en particular) — al migrarlos ahí, revisar que no rompan los call sites ya-ctx'd de ESTE plan (`createPlan`/`updatePlan`/`deactivatePlan`/`bulkMigratePlan`/`changeFixedSchedules`/`compensateDays`/`getClassUsageThisWeek`/promo CRUD ya invocan `this.getPlanById(x)`/`this.getSubscriptionById(x)` SIN ctx — si esos métodos pasan a EXIGIR ctx, esos ~12 call sites necesitan actualizarse también).

---

_Phase: 174-adopci-n-3a-subscriptions-scheduling-adopci-n-de-c-digo_
_Completed: 2026-08-09_

## Self-Check: PASSED

- Archivos verificados en et-173 (existen): service.ts, booking-population.ts, member-routes.ts, routes.ts.
- Commits verificados en `git log --oneline --all` de et-173: `79634209`, `85dbfc42`, `21962ead`.
- `pnpm exec tsc --noEmit` en el-templo-api: 0 errores (corrido dos veces, antes y después del split de commits).
- `pnpm exec vitest run --no-file-parallelism test/subscriptions test/finance`: 47 archivos / 599 tests, todos verdes, sin ajustar ninguna expectativa.
- `git diff` de los 3 commits acotado a los rangos de línea originales de assignPlan/changePlan/changePlanNow/changePlanAfterCurrent/renewSubscription/getChangePlanPreview/getPricingPreview/autoExpireSubscriptions/getMemberSubscriptions/getMemberSubscriptionHistory/activateScheduledSub/autoExpireDueSubscriptions: cero hunks dentro de esos rangos (FRONTERA intacta).
- `git -C et-173 status`: sin archivos `.planning` staged ni modificados.

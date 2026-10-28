---
phase: 174-adopci-n-3a-subscriptions-scheduling-adopci-n-de-c-digo
plan: 02
subsystem: api
tags:
  [tenancy, multitenancy, subscriptions, pricing, drizzle, mysql, golden-tests]

# Dependency graph
requires:
  - phase: 174-01
    provides: "16→~25 métodos de subscriptions/service.ts migrados a tenantWhere/tenantValues; FRONTERA dejó intactos assignPlan/changePlan/changePlanNow/changePlanAfterCurrent/renewSubscription/getChangePlanPreview/getPricingPreview + helpers privados compartidos (getPlanById, getSubscriptionById, mapPlanRow, getPlanProgramIds, enrichWithScheduleIds, validateAnchorSet) dejados CRUDOS a propósito"
provides:
  - "Golden/characterization suite (pricing-golden.test.ts, 26 casos) que fija diff-cero para toda futura migración de la cadena de pricing"
  - "assignPlan, changePlanNow, changePlanAfterCurrent, renewSubscription, getChangePlanPreview, getPricingPreview scopeados por tenant (Pattern A/B) con aritmética byte-idéntica"
  - "getPlanById/getPlanProgramIds/mapPlanRow con ctx: TenantContext | null (Pattern D) — cierra el 'shared crude core' que 174-01 dejó documentado como pendiente"
  - "getSubscriptionById/enrichWithScheduleIds/getSubscriptionScheduleIds/validateAnchorSet con ctx: TenantContext requerido"
  - "2 bugs reales de tampering cross-tenant corregidos (Rule 1) en changePlanNow/changePlanAfterCurrent"
affects: [174-06, 174.1]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Golden/characterization test ANTES de migrar código replicado inline sin función central (D-06) — captura literales reales corriendo contra el código pre-migración, nunca calculados a mano"
    - "Pattern D (ctx: TenantContext | null) para helpers compartidos entre la cadena de pricing (ctx real) y un camino D-07 fuera de alcance (autoExpireSubscriptions → activateScheduledSub, ctx null)"

key-files:
  created:
    - el-templo-api/test/subscriptions/pricing-golden.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/member-routes.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts

key-decisions:
  - "pickSubscriptionForActivity y deriveCoveredUntil NO se tocaron pese a estar en la lista de 'helpers dejados crudos' de 174-01: se verificó con grep que NINGÚN método de pricing los llama (solo getMemberSubscriptions/getCoveredUntil, booking-service.ts, attendance/service.ts, referrals/service.ts, jobs/mark-no-shows.ts, jobs/notification-cron.ts — todos fuera de 174-02, varios explícitamente D-03/D-07). Threadear ctx ahí habría cruzado a módulos de otras fases sin necesidad real."
  - "resolveGoalPlanType (lee `programs`, llamado desde mapPlanRow) quedó crudo a propósito: `programs` no está en la lista de 7 tablas del alcance de Task 2 (subscriptions/subscriptionPlans/promoPlans/planPrograms/subscriptionSchedules/users/branches) — deuda pre-existente documentada, no nueva."
  - "Pattern D (ctx nullable) en getPlanById/getPlanProgramIds/mapPlanRow porque activateScheduledSub (D-07, 174-06) los llama con `ctx=null` cuando lo dispara autoExpireSubscriptions — forzar ctx no-nullable ahí habría exigido threadear ctx real por autoExpireSubscriptions, exactamente el trabajo reservado a 174-06."
  - "getSubscriptionById/enrichWithScheduleIds/getSubscriptionScheduleIds/validateAnchorSet SÍ llevan ctx requerido (no nullable): se verificó que TODOS sus call sites (13, 2, 2, 5 respectivamente) ya resuelven ctx real — ningún camino D-07 los toca."
  - "Se aplicó tenantWhere/tenantValues a TODO acceso crudo de las 7 tablas enumeradas dentro del CUERPO COMPLETO de los 6 métodos de pricing (no solo el 'bloque de cálculo' ~1468-1650 citado en el plan) — incluye validaciones tempranas (existingBundle, existingInSameGroup, memberBranch, existingScheduled) y updates de restauración en catch. Regla dura #5 del prompt ('cada .from()/JOIN filtra', sin excepción) y precedente ya establecido en pauseSubscription (misma-tx ids también llevan tenantWhere)."

patterns-established:
  - "Golden-first para cadenas de pricing/lógica replicada inline: captura de literales reales, migración, diff-cero — repetible para cualquier otra cadena sin función central en fases futuras."

requirements-completed: [ADO-03]

# Metrics
duration: ~2h40min
completed: 2026-08-09
---

# Phase 174 Plan 02: Adopción tenancy en la cadena de pricing (con golden diff-cero) Summary

**assignPlan/changePlanNow/changePlanAfterCurrent/renewSubscription/getChangePlanPreview/getPricingPreview migrados a tenantWhere/tenantValues con aritmética byte-idéntica, verificado por una suite golden de 26 casos que corrió GREEN antes y después SIN tocar un solo literal — y 2 bugs reales de tampering cross-tenant corregidos en el camino.**

## Performance

- **Duration:** ~2h40min
- **Completed:** 2026-08-09
- **Tasks:** 3/3
- **Files modified:** 5 (1 creado, 4 modificados)

## Accomplishments

- **Golden diff-cero confirmado explícitamente**: `pricing-golden.test.ts` (26 tests) corrió GREEN contra el código PRE-migración (Task 1, commit `25537d90`), y volvió a correr GREEN contra el código migrado (Task 3) **sin una sola edición** al archivo entre ambas corridas (`git log`/`git diff` sobre el archivo confirma un único commit). Los 26 literales `toBe(N)` son idénticos en ambas corridas.
- Los 3 DEUDA markers de pricing (`:3547` changePlanNow, `:4018` changePlanAfterCurrent, `:4482` renewSubscription — numeración del PLAN.md, desplazada en el archivo real por ediciones previas de 174-01) quedaron saldados con `tenantValues(ctx, {...})`, mismo idioma que el insert ya migrado de `assignPlan`.
- Cerrado el "shared crude core" que 174-01 documentó explícitamente como pendiente para este plan: `getPlanById`, `getPlanProgramIds`, `mapPlanRow` (Pattern D, ctx nullable) y `getSubscriptionById`, `enrichWithScheduleIds`, `getSubscriptionScheduleIds`, `validateAnchorSet` (ctx requerido) — ~40 call sites actualizados mecánicamente, todos ya tenían ctx real en su scope.
- 2 bugs reales de cross-tenant tampering encontrados y corregidos (ver Deviations): `changePlanNow` cancelaba la sub programada de un `userId` de OTRO gimnasio antes de validar tenencia; `changePlanAfterCurrent` leakeaba existencia de sub programada cross-tenant por el mismo patrón de orden.
- `computeReferralDiscountPercent` (D-03) y `pickSubscriptionForActivity`/`deriveCoveredUntil` (verificados sin callers en la cadena de pricing) quedaron explícitamente sin tocar, con la verificación documentada en key-decisions.

## Task Commits

Todos en `et-173` (branch `feat/173-adopcion-members`):

1. **Task 1: Golden de la cadena de pricing (GREEN pre-migración)** - `25537d90` (test)
2. **Task 2: Migrar reads/inserts de pricing (aritmética intacta)** - `b08f0bb7` (feat)
3. **Task 3: Re-correr golden + suite de pricing → diff CERO** - sin commit propio (verificación, cero cambios de código)

**Nota de orden:** el Task 2 se escribió primero por error de secuencia (falta de disciplina inicial); se detectó ANTES de commitear, se guardó como patch (`git diff > patch`), se revirtieron los archivos a pre-migración (`git checkout -- <files>`, uso sancionado para archivos propios sin commitear — no es el `git checkout -- .` prohibido), se corrió y commiteó el golden contra el código real pre-migración, y se reaplicó el patch (`git apply`) para el Task 2. El resultado final respeta el orden golden→migrar→verificar que exige el plan.

_Sin plan-metadata commit: los docs de `.planning/` los maneja el orquestador desde el checkout principal, no este worktree._

## Files Created/Modified

- `el-templo-api/test/subscriptions/pricing-golden.test.ts` (nuevo, 896 líneas) - 26 casos characterization: assignPlan (base/override/boardingPass/AURA×4 tiers/referral/triple), changePlanNow (base/boardingPass/referral — sin AURA, no soportado por el código), changePlanAfterCurrent (base/boardingPass/AURA/referral/combo), renewSubscription (base/AURA heredado/referral fresco/combo), getChangePlanPreview parity (base/referral), getPricingPreview parity (base/AURA/referral)
- `el-templo-api/src/modules/subscriptions/service.ts` - Pattern A/B en los 6 métodos de pricing + Pattern D/ctx-requerido en 7 helpers privados compartidos; 2 fixes de tampering
- `el-templo-api/src/modules/subscriptions/member-routes.ts` - `GET /me/especial-pass` y `GET /plans` pasan a capturar/forwardear `ctx` a `getPlanById` (ya exigía ctx tras este plan)
- `el-templo-api/src/modules/subscriptions/routes.ts` - `GET /plans/:planId` resuelve ctx vía `assertTenant` y lo pasa a `getPlanById`
- `el-templo-api/src/modules/scheduling/booking-service.ts` - 2 call sites de `getPlanById` (dentro de `reserve`/`getBonusUsage`, ambos ya con ctx) actualizados

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen:

1. **Alcance de Pattern A ampliado al cuerpo completo de los 6 métodos**, no solo al "bloque de cálculo" que cita el PLAN.md — incluye validaciones tempranas y updates de restauración en catch. Justificación: regla dura #5 del prompt del ejecutor ("cada `.from()`/JOIN filtra", sin excepción para accesos "ya implícitamente seguros" via anchor de userId) y precedente textual en `pauseSubscription` (ya migrado en 173), que envuelve incluso updates sobre ids resueltos vía lectura tenant-scoped en el mismo método.
2. **`pickSubscriptionForActivity`/`deriveCoveredUntil` NO tocados** — verificado con grep que ningún método de pricing los invoca; sus callers reales caen en módulos explícitamente fuera de alcance (D-03 referrals, D-07 crons, 174-03/04/05 ya ejecutados). Threadear ctx ahí habría sido scope creep hacia otras fases sin beneficio para la cadena de pricing.
3. **Pattern D vs ctx-requerido**: se decidió caso por caso verificando TODOS los call sites de cada helper (no asumiendo). 3 helpers (`getPlanById`, `getPlanProgramIds`, `mapPlanRow`) tienen un caller D-07 con ctx nullable (`activateScheduledSub`); 4 helpers no tienen ningún caller nullable y llevan ctx requerido.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/Tampering] `changePlanNow` cancelaba la sub programada de OTRO gimnasio antes de validar tenencia**

- **Found during:** Task 2
- **Issue:** El primer statement del método (`UPDATE subscriptions SET status='cancelled' WHERE userId=? AND status='scheduled'`) corría ANTES de `getMemberSubscription(ctx, userId)` — la primera validación tenant-scoped del método. Un `userId` de otro gimnasio (payload de admin comprometido/bug de otro endpoint) cancelaba su sub programada real aunque el resto del método terminara en 404. T-174-02-T del threat register lo cubre explícitamente ("inserts/updates de subscriptions sin tenantValues/tenantWhere").
- **Fix:** `tenantWhere(schema.subscriptions, ctx)` como primer término del WHERE.
- **Files modified:** service.ts
- **Verification:** `tsc --noEmit` limpio; suite de pricing (incl. golden) verde sin ajustar expectativas — el fix no cambia comportamiento single-tenant.
- **Committed in:** `b08f0bb7`

**2. [Rule 1 - Bug/Tampering] `changePlanAfterCurrent` leakeaba existencia de sub programada cross-tenant por el mismo patrón**

- **Found during:** Task 2
- **Issue:** El guard "ya existe una sub programada" (`SELECT ... WHERE userId=? AND status='scheduled'`) corría antes de `getMemberSubscription(ctx, userId)`, mismo orden que el bug 1. Aunque es solo lectura (no tampering de escritura), permitía a un caller cross-tenant distinguir 409 ("ya existe programada") de 400 ("no hay sub activa") para un `userId` ajeno — information disclosure (T-174-02-I).
- **Fix:** `tenantWhere(schema.subscriptions, ctx)` agregado al WHERE.
- **Files modified:** service.ts
- **Verification:** Igual que arriba.
- **Committed in:** `b08f0bb7`

**3. [Rule 1 - Bug] Lookup de sede virtual "Templo Online" en `renewSubscription` sin tenantWhere**

- **Found during:** Task 2
- **Issue:** El fallback de `renewBranchId` buscaba `branches WHERE name='Templo Online'` sin filtrar por tenant — con más de un gimnasio activo, cada uno con su propia sede virtual homónima, podía resolver la sede virtual de OTRO gimnasio.
- **Fix:** `tenantWhere(schema.branches, ctx)` agregado.
- **Files modified:** service.ts
- **Verification:** Igual que arriba (single-tenant hoy → sin cambio de comportamiento observable).
- **Committed in:** `b08f0bb7`

---

**Total deviations:** 3 auto-fixed (Rule 1 — bugs de tampering/leak/lookup cross-tenant, todos preexistentes en código ya no-crudo desde antes de este plan, expuestos recién ahora porque tenantWhere no envolvía el WHERE completo)
**Impact on plan:** Los 3 son correcciones de seguridad directamente en el spirit del plan (mitigación T-174-02-T/T-174-02-I del threat register). Sin cambios de comportamiento observable en single-tenant (el gate CI/local no tiene 2 tenants activos), verificado por diff-cero del golden. Sin scope creep.

## Issues Encountered

- **Orden de ejecución invertido inicialmente** (ya documentado arriba en Task Commits): se escribió la migración (Task 2) antes del golden (Task 1) por apurar el análisis de la cadena de pricing. Se corrigió ANTES de cualquier commit, usando `git diff > patch` + `git checkout -- <archivos propios>` (uso explícitamente sancionado, no el `git checkout -- .` prohibido) + `git apply` para reordenar sin perder trabajo. El resultado final cumple el orden golden→migrar→verificar exigido por el plan; documentado por transparencia.
- El comando de vitest de Task 3 (7 archivos, incl. `test/finance` completo) tardó ~230s; el wrapper de Bash lo corrió en foreground con timeout explícito de 600000ms (dentro del límite de la regla dura de tests-solo-foreground).
- Ninguna expectativa de test se tocó en ningún momento tras el commit del golden.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **174-06 (D-07):** puede arrancar limpio. `autoExpireSubscriptions`, `getMemberSubscriptions`/`getMemberSubscriptionHistory`, `activateScheduledSub`, `autoExpireDueSubscriptions` quedaron intactos — el único acoplamiento es que `activateScheduledSub` ahora llama a `getPlanById`/`getPlanProgramIds` con su propio `ctx: TenantContext | null` (ya lo hacía implícitamente vía Pattern D; 174-06 solo necesita threadear ctx real en su propio nivel, sin tocar la firma de estos helpers otra vez).
- **174.1 (cross-tenant price test / switch a strict):** la cadena de pricing ya filtra por tenant en cada acceso; el caso "segundo tenant paga su propio precio" queda listo para un test de aislamiento real cuando exista un segundo tenant con planes propios.
- `computeReferralDiscountPercent` (referrals/service.ts:206) sigue sin ctx — dueño 175, D-03. No es boquete de esta cadena: las escrituras de referral se validan en su propio módulo.

---

_Phase: 174-adopci-n-3a-subscriptions-scheduling-adopci-n-de-c-digo_
_Completed: 2026-08-09_

## Self-Check: PASSED

- Archivo verificado en et-173 (existe): `test/subscriptions/pricing-golden.test.ts`.
- Commits verificados en `git log --oneline --all` de et-173: `25537d90` (Task 1), `b08f0bb7` (Task 2).
- `git diff --stat` sobre `pricing-golden.test.ts` entre Task 1 y ahora: vacío (un único commit toca el archivo) — diff-cero confirmado por git, no solo por la corrida de tests.
- `pnpm exec tsc --noEmit`: 0 errores (corrido 3 veces: pre-revert, post-revert/pre-golden, post-reapply).
- `pnpm exec vitest run --no-file-parallelism test/subscriptions/pricing-golden.test.ts` contra código PRE-migración: 26/26 GREEN (Task 1, línea base).
- `pnpm exec vitest run --no-file-parallelism test/subscriptions/pricing-golden.test.ts test/subscriptions/charge-on-assign.test.ts test/subscriptions/change-plan.test.ts test/subscriptions/renewal.test.ts test/subscriptions/zero-price-gate.test.ts test/subscriptions/especial-pass.test.ts test/finance` contra código migrado: 27 archivos / 437 tests, todos GREEN (Task 3).
- `git -C et-173 status`: sin archivos `.planning` staged ni modificados.

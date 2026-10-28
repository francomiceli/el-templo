---
phase: 174-adopci-n-3a-subscriptions-scheduling-adopci-n-de-c-digo
plan: 06
subsystem: api
tags: [tenancy, drizzle, mysql, subscriptions, scheduling, attendance, cron]

# Dependency graph
requires:
  - phase: 174-01..05
    provides: subscriptions/scheduling/attendance ya migrados a Pattern A/B/C/D excepto el camino member-facing de autoExpireSubscriptions (D-07) y el cron autoExpireDueSubscriptions
provides:
  - ctx real threadeado por todo el camino member-facing de getMemberSubscriptions/getMemberSubscriptionHistory/autoExpireSubscriptions, incluida la cascada mecánica no listada (pickSubscriptionForActivity y sus 7 call sites en attendance/scheduling/jobs)
  - assertBranchDelGimnasio (Pattern C) alcanzable desde el camino member-facing en activateScheduledSub, no solo desde el cron activateDueScheduledSubs
  - excepción tenant-safe embebida en SQL para autoExpireDueSubscriptions (único hueco cross-tenant restante del camino D-07, ahora grepeable/formalizado)
  - program_enrollments (enrollAddon) con tenantValues(ctx, {...})
affects: [174.1-switch-a-strict, 175-referrals-programs-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ctx: TenantContext | null con ternario Pattern A/D, reservado para el ÚNICO caller genuinamente sin actor (cron cross-tenant o ctx opcional pre-existente), nunca como shortcut"
    - "tag tenant-safe embebido DENTRO del fragmento sql (no solo comentario TS) para que el sentinel runtime lo lea, además del comentario TS que exime al lint AST"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/modules/subscriptions/member-routes.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/jobs/mark-no-shows.ts
    - el-templo-api/src/jobs/auto-resume-pauses.ts
    - el-templo-api/src/modules/programs/enrollment-service.ts
    - el-templo-api/test/subscriptions/especial-pass-core.test.ts

key-decisions:
  - "getMemberSubscriptions quedó con ctx: TenantContext | null (no TenantContext estricto como pedía la interfaz del plan) porque pickSubscriptionForActivity lo envuelve y attendance/service.ts::removeCheckIn (deuda pre-existente de 174-05, ctx opcional) lo alimenta sin ctx en su único call site de routes.ts. Los 8 call sites documentados en el plan SIEMPRE pasan ctx real; el null solo lo produce ese único caller deferred."
  - "autoExpireSubscriptions también quedó ctx: TenantContext | null: real en el camino member-facing, null SOLO desde autoExpireDueSubscriptions (cron cross-tenant, la excepción tenant-safe de Task 2)."
  - "pickSubscriptionForActivity y sus 7 call sites reales (attendance/service.ts x4, scheduling/booking-service.ts x2, jobs/mark-no-shows.ts x1) NO estaban en el inventario de 8 call sites del plan, pero eran cascada mecánica obligatoria: al hacer getMemberSubscriptions no-nullable-de-facto en su path, el wrapper que TODOS esos módulos llaman también necesitaba ctx."

patterns-established:
  - "Al threadear ctx en un helper compartido, grepear TODO el árbol (incluidos módulos hermanos como attendance/ y jobs/) antes de asumir que el inventario de call sites del plan está completo."

requirements-completed: [ADO-03, ADO-04]

# Metrics
duration: ~75min
completed: 2026-08-11
---

# Phase 174 Plan 06: Cierre de deudas D-02/D-05/D-07 (subscriptions/scheduling) Summary

**ctx real threadeado por todo el camino member-facing de autoExpireSubscriptions/getMemberSubscriptions (incl. la cascada no listada de pickSubscriptionForActivity), guarda de ancla assertBranchDelGimnasio restaurada, UNA excepción tenant-safe embebida en SQL para el cron cross-tenant, y tenantValues en el insert de program_enrollments — golden de pricing en diff cero.**

## Performance

- **Duration:** ~75 min (incluye 2 investigaciones de infraestructura: DB de test stale y sentinel de commit)
- **Tasks:** 3/3 completadas
- **Files modified:** 9 (8 código + 1 test)

## Accomplishments

- `getMemberSubscriptions`, `getMemberSubscriptionHistory` y `autoExpireSubscriptions` reciben `ctx` real por el camino member-facing (Pattern A), retirando los guards `isNotNull` provisorios del lado con actor.
- La cascada mecánica NO listada explícitamente en el plan quedó cerrada: `pickSubscriptionForActivity` (wrapper de `getMemberSubscriptions`) y sus 7 call sites reales en `attendance/service.ts` (x4), `scheduling/booking-service.ts` (x2) y `jobs/mark-no-shows.ts` (x1) — sin esto `tsc` no cerraba.
- `activateScheduledSub` recibe `ctx` real desde `autoExpireSubscriptions` (antes siempre `null`), así que `assertBranchDelGimnasio` corre en la migración virtual→física de sede también por el camino member-facing, no solo desde el cron `activateDueScheduledSubs`.
- `autoExpireDueSubscriptions` (barrido cron genuinamente cross-tenant) queda con **UNA** excepción `tenant-safe` formalizada, con el tag EMBEBIDO dentro del fragmento `sql` del `where` (el canal que el sentinel lee en runtime), además del comentario TS que exime al lint.
- `programs/enrollment-service.ts::enrollAddon` envuelve su insert de `program_enrollments` en `tenantValues(ctx, {...})`.
- Golden de pricing (174-02) confirmado en **diff cero**: `pricing-golden.test.ts` — 26/26 tests con los MISMOS valores literales, sin tocar ninguna expectativa.

## Task Commits

1. **Task 1: Threadear ctx real por el camino member-facing + restaurar guarda de ancla** - `9d99034e` (feat)
2. **Task 2: Formalizar la excepción tenant-safe del cron + one-liner de program_enrollments** - `27c5f574` (feat)
3. **Task 3: Re-verificar el golden de pricing** - sin commit (solo re-corrida de un test file existente, sin cambios de código; verificado dentro de la corrida final)

## Files Created/Modified

- `el-templo-api/src/modules/subscriptions/service.ts` — ctx real en `getMemberSubscriptions`/`getMemberSubscriptionHistory`/`autoExpireSubscriptions`/`pickSubscriptionForActivity`; guarda de ancla restaurada en `activateScheduledSub` (ya alcanzable); excepción `tenant-safe` embebida en `autoExpireDueSubscriptions`; docblocks de deuda actualizados a "saldada".
- `el-templo-api/src/modules/subscriptions/routes.ts` — `assertTenant` + ctx en `GET /members/:userId/subscriptions` y `GET /members/:userId/subscription/history`.
- `el-templo-api/src/modules/subscriptions/member-routes.ts` — ctx real pasado a `getMemberSubscriptions` en `/me/especial-pass`.
- `el-templo-api/src/modules/scheduling/booking-service.ts` — ctx real en las 2 llamadas a `pickSubscriptionForActivity`/`getMemberSubscriptions` de `reserve`/`adminAddBooking`.
- `el-templo-api/src/modules/attendance/service.ts` — ctx real en 3 de los 4 call sites de `pickSubscriptionForActivity` (checkIn/forceCheckIn/coachCheckIn); `ctx ?? null` en `removeCheckIn` (ctx opcional pre-existente).
- `el-templo-api/src/jobs/mark-no-shows.ts` — ctx real (ya resuelto por tenant en el loop) pasado a `pickSubscriptionForActivity`.
- `el-templo-api/src/jobs/auto-resume-pauses.ts` — docblocks actualizados para reflejar la excepción tenant-safe formalizada.
- `el-templo-api/src/modules/programs/enrollment-service.ts` — `tenantValues(ctx, {...})` en el insert de `program_enrollments` de `enrollAddon`.
- `el-templo-api/test/subscriptions/especial-pass-core.test.ts` — fix: llamaba `pickSubscriptionForActivity` con la firma vieja (sin ctx); se agrega `TEMPLO_CTX` (mismo patrón que `charge-on-assign.test.ts`).

## Decisions Made

- **`getMemberSubscriptions`/`pickSubscriptionForActivity` quedaron `ctx: TenantContext | null`** en vez de `TenantContext` estricto (como pedía literalmente la interfaz del plan). Motivo: `pickSubscriptionForActivity` es un wrapper que `attendance/service.ts::removeCheckIn` también usa, y `removeCheckIn` tiene `ctx?: TenantContext` OPCIONAL desde 174-05 (deuda pre-existente documentada: su único caller en `attendance/routes.ts` — `DELETE /:attendanceId` — no resuelve `assertTenant`, dueño 174.1/175). Hacer `getMemberSubscriptions` estrictamente no-nullable hubiera roto ese caller o exigido tocar `attendance/routes.ts`, fuera del `files_modified` de este plan. Se aplicó el MISMO Pattern D ya establecido en este archivo para casos idénticos (`autoExpireSubscriptions`, `activateScheduledSub`, `getPlanById`, `getPlanProgramIds`): tipo nullable, pero los 8 call sites documentados en el plan SIEMPRE pasan ctx real — el `null` solo lo produce ese único caller deferred.
- **`autoExpireSubscriptions` también nullable**: real en el camino member-facing (Pattern A en sus 2 lecturas), `null` únicamente desde `autoExpireDueSubscriptions` (la excepción `tenant-safe` de Task 2, Pattern D en las mismas 2 lecturas).
- **Cascada no listada en el plan**: `pickSubscriptionForActivity` y sus 7 call sites reales (`attendance/service.ts` x4, `scheduling/booking-service.ts` x2, `jobs/mark-no-shows.ts` x1) no aparecían en el inventario de "~8 call sites" del plan porque ese inventario cubre `getMemberSubscriptions`/`getMemberSubscriptionHistory` DIRECTOS — pero `pickSubscriptionForActivity` los envuelve y llama a `getMemberSubscriptions` internamente, así que su propia firma también necesitaba `ctx` para que `tsc` cerrara. Se threadeó ctx real a los 7 (todos ya lo tenían resuelto en su método envolvente).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cascada mecánica de `pickSubscriptionForActivity` no listada en el plan**

- **Found during:** Task 1
- **Issue:** Al agregar `ctx` a `getMemberSubscriptions`, `pickSubscriptionForActivity` (que lo llama internamente) dejaba de compilar sin agregarle `ctx` también, y ESE método tiene 7 call sites reales fuera de `subscriptions/`/`scheduling/booking-service.ts` (los únicos módulos en `files_modified`): `attendance/service.ts` (checkIn, forceCheckIn, coachCheckIn, removeCheckIn) y `jobs/mark-no-shows.ts`.
- **Fix:** Se threadeó `ctx` real a los 7 call sites; los 6 con actor ya tenían `ctx` resuelto en su método envolvente, el 7mo (`removeCheckIn`) usa `ctx ?? null` porque su propio `ctx` es opcional (deuda 174-05).
- **Files modified:** `attendance/service.ts`, `jobs/mark-no-shows.ts` (no declarados en `files_modified` del plan, pero necesarios para que `tsc --noEmit` cierre).
- **Verification:** `tsc --noEmit` limpio; `vitest test/subscriptions test/scheduling test/finance test/programs` — 64/64 archivos, 849/849 tests verdes.
- **Committed in:** `9d99034e` (Task 1 commit)

**2. [Rule 1 - Bug] Test roto por firma vieja de `pickSubscriptionForActivity`**

- **Found during:** Task 1 (verificación de tsc/vitest — `test/**` no lo cubre tsc, pero vitest lo hubiera ejecutado con args desplazados, un bug silencioso real: `member.id` se hubiera bindeado a `ctx` y `true`/`false` a `userId`, dejando `isSpecialActivity` en `undefined`)
- **Issue:** `test/subscriptions/especial-pass-core.test.ts` llamaba `svc.pickSubscriptionForActivity(member.id, true)` sin `ctx` — `tsconfig.json` solo incluye `src/**/*`, así que este error NO lo atrapa `tsc --noEmit`; solo se detecta grepeando manualmente los call sites de test.
- **Fix:** Se agregó `TEMPLO_CTX = { tenantId: TENANT_TEMPLO }` (mismo patrón que `test/subscriptions/charge-on-assign.test.ts`) y se pasó como primer argumento en los 3 call sites del archivo.
- **Files modified:** `test/subscriptions/especial-pass-core.test.ts`.
- **Verification:** `vitest test/subscriptions/especial-pass-core.test.ts` — 4/4 tests verdes (antes hubiera fallado silenciosamente con `isSpecialActivity=undefined`).
- **Committed in:** `9d99034e` (Task 1 commit)

**3. [Infraestructura, no deviation de código] Base de datos de test `eltemplo_test_1` stale, migraciones 195-200 nunca aplicadas**

- **Found during:** primera corrida de verificación de Task 1
- **Issue:** El worker DB per-vitest (`eltemplo_test_1`) fue creado en una sesión anterior a las migraciones 0195-0200 (incluye `membership_kind`, `plan_programs.tenant_id`, etc.) y el `test/setup.ts` solo migra si la DB NO existe — quedó permanentemente atrás, causando 56/59 archivos rojos por `Unknown column`.
- **Fix:** Se dropeó la DB (`DROP DATABASE eltemplo_test_1`) y se dejó que `test/setup.ts` la reconstruyera desde cero en la siguiente corrida — todas las 200 migraciones aplicaron limpio.
- **Files modified:** ninguno (solo estado de MySQL local).
- **Verification:** re-corrida completa verde.

## Golden de pricing — diff cero confirmado

`test/subscriptions/pricing-golden.test.ts` — **26/26 tests pasan con los MISMOS valores literales** que capturó 174-02 (ningún `toBe(N)` se tocó). El threading de ctx a `getMemberSubscriptions` (que `assignPlan`/`renewSubscription` llaman para decidir `hasPresencial`) no movió ninguna cifra para El Templo — resultado esperado porque en single-tenant el filtro `tenantWhere` no cambia el conjunto de filas.

## Acceptance greps (evidencia)

```
$ grep -n "getMemberSubscriptions(" src/modules/subscriptions/*.ts src/modules/scheduling/booking-service.ts
member-routes.ts:188:      const subs = await subscriptionService.getMemberSubscriptions(
routes.ts:307:      const subscriptions = await subscriptionService.getMemberSubscriptions(
service.ts:1115:  async getMemberSubscriptions(
service.ts:1233:    const subs = await this.getMemberSubscriptions(ctx, userId);
service.ts:1581:      const memberSubs = await this.getMemberSubscriptions(ctx, userId);
service.ts:3055:      const all = await this.getMemberSubscriptions(ctx, userId);
service.ts:4533:      const memberSubs = await this.getMemberSubscriptions(ctx, userId);
booking-service.ts:142:        const allSubs = await this.subscriptionService.getMemberSubscriptions(
→ 0 call sites con solo userId (todos pasan ctx)

$ grep -n "assertBranchDelGimnasio(ctx" src/modules/subscriptions/service.ts
5566:          ? (await assertBranchDelGimnasio(ctx, scheduled.branchId, this.db)).id

$ grep -n "tenant-safe" src/modules/subscriptions/service.ts
2528:    /* tenant-safe: barrido cron genuinamente cross-tenant — ... */          (comentario TS, exime lint)
2534:          sql`/* tenant-safe: ... */ ${eq(...)}`,                            (EMBEBIDO en SQL, exime sentinel)
(+ 4 referencias en docblocks de deuda saldada)

$ grep -n "tenantValues(ctx" src/modules/programs/enrollment-service.ts
414:          tenantValues(ctx, {
```

## Verificación

- `pnpm exec tsc --noEmit` — limpio (corrido 6 veces a lo largo de la ejecución, siempre 0 errores).
- `vitest test/subscriptions test/scheduling test/finance` (Task 1) — **59/59 archivos, 795/795 tests verdes**.
- `vitest test/subscriptions test/programs` (Task 2) — **32/32 archivos, 330/330 tests verdes**.
- `vitest pricing-golden + charge-on-assign + change-plan + renewal + especial-pass` (Task 3) — **5/5 archivos, 80/80 tests verdes**, golden diff cero.
- `vitest test/subscriptions test/scheduling test/finance test/programs` (verificación final combinada) — **64/64 archivos, 849/849 tests verdes**.
- Ningún test ajustado en expectativas — solo se corrigió el CALL SITE roto de `especial-pass-core.test.ts` (bug real pre-existente a este plan, expuesto por el cambio de firma).

## Fence D-03/D-04 respetado

No se tocó: `getReferralOverview` (`referrals/service.ts:270`), interior de `computeReferralDiscountPercent` (`referrals/service.ts:206`), `activeMemberExists` (`shared/active-member.ts:27`), FK compuesta de `user_branches`.

## Known Stubs

Ninguno — plan de backend puro, no se tocó UI ni se introdujeron datos vacíos/placeholder.

## Threat Flags

Ninguno — toda la superficie tocada ya estaba cubierta por el threat model del plan (T-174-06-I/E/T/A).

## Deuda residual (para 174.1/175)

- **`removeCheckIn`/`isSpecialSchedule` con `ctx` opcional** (`attendance/service.ts`, deuda de 174-05, NO tocada por este plan): su único caller en `attendance/routes.ts` (`DELETE /:attendanceId`) no resuelve `assertTenant`. Threadear `ctx` real ahí (`attendance/routes.ts:164-172`) es lo que permitiría eventualmente hacer `getMemberSubscriptions`/`pickSubscriptionForActivity` estrictamente `ctx: TenantContext` (no nullable). Impacto hoy: ninguno (single-tenant); riesgo real solo cuando se active un segundo tenant.
- La excepción `tenant-safe` de `autoExpireDueSubscriptions` es del tipo "accept (documented)" en el threat model (T-174-06-A) — 174.1 puede ir strict sabiendo que este es el único hueco cross-tenant intencional del camino D-07.

## Next Phase Readiness

- Fase 174 (D-02/D-05/D-07) queda saldada: subscriptions/scheduling con `ctx` real en TODO el camino member-facing, guarda de ancla activa, y una única excepción cross-tenant formalizada y grepeable.
- 174.1 (switch a `TENANT_STRICT_MODULES`, allowlist en cero, batería ISO) puede arrancar sabiendo exactamente dónde está el único `ctx=null` intencional de subscriptions (`autoExpireDueSubscriptions`) y la única deuda de ctx opcional heredada (`removeCheckIn`).

---

_Phase: 174-adopci-n-3a-subscriptions-scheduling-adopci-n-de-c-digo_
_Plan: 06_
_Completed: 2026-08-11_

## Self-Check: PASSED

- Commit `9d99034e` (Task 1) — FOUND in `git log --oneline --all` (worktree et-173, branch feat/173-adopcion-members)
- Commit `27c5f574` (Task 2) — FOUND
- `el-templo-api/src/modules/subscriptions/service.ts` — FOUND
- `el-templo-api/src/modules/programs/enrollment-service.ts` — FOUND
- `el-templo-api/test/subscriptions/especial-pass-core.test.ts` — FOUND
- This SUMMARY.md — FOUND at declared path

---
phase: 118-analytics-estrat-gico-funnel-de-conversi-n-retenci-n-por-cic
plan: 02
subsystem: analytics
tags: [retention, cohorts, analytics, admin-only, multi-currency-na]
requires:
  - "analytics/scope.ts applyScope (Phase 117)"
  - "shared/active-member.ts activeMemberExists (Phase 117)"
  - "analytics/routes.ts requireAdminAnalytics guard (Phase 117)"
provides:
  - "RetentionService + GET /api/admin/analytics/retention"
  - "CONSECUTIVE_CYCLE_GAP_DAYS constant (30)"
  - "RetentionAnalytics/RetentionCohort/CycleDistribution types"
  - "retentionSchema (Fastify response/querystring)"
affects:
  - "el-templo-admin RetencionTab (future plan) consumes /retention"
tech-stack:
  added: []
  patterns:
    - "Domain-service shell (constructor DI) — new service, monolith untouched (D-09)"
    - "applyScope flavor B (conditional branch/plan joins via .$dynamic())"
    - "activeMemberExists as the canonical active predicate for distribution"
    - "Consecutive-cycle streak (30-day gap) computed in JS over ordered subs"
key-files:
  created:
    - "el-templo-api/src/modules/analytics/retention-service.ts"
    - "el-templo-api/test/analytics/retention.test.ts"
  modified:
    - "el-templo-api/src/modules/analytics/types.ts"
    - "el-templo-api/src/modules/analytics/schemas.ts"
    - "el-templo-api/src/modules/analytics/routes.ts"
decisions:
  - "D-04: CONSECUTIVE_CYCLE_GAP_DAYS=30 exported module constant (no env, no DB column)"
  - "D-05: gap >30d cuts the streak; reactivation never re-inflates the original cohort"
  - "D-06: cohort = month of first valid sub; cycle distribution over activeMemberExists"
  - "D-11: /retention is ADMIN_ROLES-only via requireAdminAnalytics; gestion 403"
  - "D-12: real-MySQL integration test (gap, cohort, distribution, scope, RBAC)"
metrics:
  duration: ~18min
  completed: 2026-05-26
  tasks: 2
  files: 5
---

# Phase 118 Plan 02: Retención por cohortes de ciclos Summary

RetentionService nuevo que expone `GET /api/admin/analytics/retention`: por cohorte (mes de la primera suscripción válida, D-06) calcula el % que alcanzó el ciclo 2, 3, 4..., donde un ciclo consecutivo cuenta solo si `next.startDate − prev.endDate ≤ 30 días` (`CONSECUTIVE_CYCLE_GAP_DAYS`, D-04); un gap mayor corta la racha y la reactivación no infla la cohorte original (D-05). Suma la distribución de ciclos completados (ciclo 1/2/3+) entre los activos actuales vía `activeMemberExists` (nunca `users.status`), filtrable por `plan_category` y scoped por sede/país. Endpoint admin-only.

## What Was Built

### Task 1 — RetentionService + tipos/schema (commit 75832224)

- `retention-service.ts` nuevo (D-09, NO toca `analytics/service.ts`). Constructor DI db+log, imports estándar (`applyScope`, `activeMemberExists`).
- `export const CONSECUTIVE_CYCLE_GAP_DAYS = 30` (D-04).
- `getRetention(filters)`: lee todas las subs en scope (opcionalmente filtradas por `plan_category`), agrupa por miembro ordenado por `startDate`, calcula la racha consecutiva (`streakLength`), asigna cohorte = mes de la primera sub válida, agrega % alcanzó ciclo N.
- `cycleDistribution` (privado): distribución de ciclos consecutivos actuales SOLO sobre activos (`activeMemberExists(subscriptions.userId)`); buckets 1/2/3+.
- Tipos `RetentionAnalytics`/`RetentionCohort`/`CycleDistribution`/`RetentionPlanCategory` + campo `planCategory` en `AnalyticsFilters`.
- `retentionSchema` con querystring (branchId/dateFrom/dateTo/planCategory enum) + response shape + 400/401/403/500.

### Task 2 — Endpoint + test (commit 1baba530)

- `GET /retention` registrado con `preHandler: [requireAdminAnalytics, requireBranchAccess({...optional})]` (D-11). `RetentionService` instanciado junto a los demás servicios.
- `retention.test.ts` real-MySQL, 14 tests verdes: gap 30d (consecutivo) vs 31d (corta), cohorte por mes de primera sub, dos miembros mismo mes → misma cohorte, reactivación no infla, distribución solo activos (inactivo con 3 ciclos históricos excluido), filtro plan_category (presencial/todas), scope branchId, ventanas inválidas (null end / end<start contadas y salteadas), RBAC (401 / 403 member / 403 gestion / 200 admin / cross-country AR↔ES).

## Deviations from Plan

None - plan executed exactly as written.

## Decisiones de implementación

- **Ventanas inválidas (T-118-05):** subs con `startDate`/`endDate` null o `end<start` se EXCLUYEN del cálculo de racha (no la rompen — se saltean) y se cuentan en `invalidWindowSubs` para que el frontend muestre un caveat. El gap se mide en días enteros vía `dayDiff` (UTC midnight, sin shift por DST/timezone).
- **`.$dynamic()`** para los joins condicionales (branches por country-scope, subscription_plans por plan_category) — preserva el tipo del query builder a través del límite condicional, equivalente al patrón flavor B de `applyScope` pero sobre un solo builder.
- **`maxCycle`** se calcula sobre todas las cohortes para que el eje X del frontend sepa cuántos puntos renderizar; `cycleRetention[0]` siempre es 100 (todo miembro completó el ciclo 1).
- **Distribución sobre activos** reusa `streakLength` con la misma lógica de gap, sobre las subs de cada miembro activo (predicado canónico en el WHERE de la query).

## Threat Surface

- `/retention` es ADMIN_ROLES-only (T-118-03 mitigado: gestion 403 verificado en test). Todas las queries pasan por `applyScope` (T-118-04: cross-country AR↔ES verificado). Guardas defensivas en ventanas inválidas (T-118-05). Sin dependencias nuevas (T-118-SC).

## Verification

- `pnpm test test/analytics/retention.test.ts` → 14/14 verde contra MySQL real.
- `pnpm exec tsc --noEmit` limpio (proyecto entero).
- `grep -c 'CONSECUTIVE_CYCLE_GAP_DAYS = 30'` = 1; `grep -c 'applyScope'` ≥ 1; `grep -c 'activeMemberExists'` = 4; sin referencias runtime a `users.status` (solo 2 comentarios).
- `git diff --stat src/modules/analytics/service.ts` vacío (monolito intacto).
- `requireAdminAnalytics` en routes.ts subió de 6 a 7 (nueva ruta guarded).

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/analytics/retention-service.ts
- FOUND: el-templo-api/test/analytics/retention.test.ts
- FOUND: commit 75832224 (Task 1)
- FOUND: commit 1baba530 (Task 2)

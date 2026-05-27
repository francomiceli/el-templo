---
phase: 118-analytics-estrat-gico-funnel-de-conversi-n-retenci-n-por-cic
plan: 04
subsystem: analytics
tags: [funnel, conversion, cohorts, analytics, admin-only, user-status-history]
requires:
  - "analytics/scope.ts applyScope (Phase 117)"
  - "analytics/routes.ts requireAdminAnalytics guard (Phase 117)"
  - "user_status_history hooks 'prueba'/'inactivo' (Plan 118-01) — habilitan la etapa prueba"
  - "user_status_history table (Phase 117 D-10)"
provides:
  - "FunnelService + GET /api/admin/analytics/funnel"
  - "FunnelAnalytics/FunnelCohort types"
  - "funnelSchema (Fastify response/querystring)"
affects:
  - "el-templo-admin FunnelTab (Plan 06) consume /funnel + muestra caveat de ramp-up (D-01)"
tech-stack:
  added: []
  patterns:
    - "Domain-service shell (constructor DI) — service nuevo, monolito intacto (D-09)"
    - "Cohorte = DATE_FORMAT(users.created_at, '%Y-%m') (D-03)"
    - "Etapa activo histórica aproximada con MIN(subscriptions.created_at) (D-01)"
    - "Medianas calculadas en JS (sort + elemento medio/promedio central), null-safe (T-118-12)"
    - "applyScope flavor B (.$dynamic() + innerJoin condicional sobre users.branchId)"
key-files:
  created:
    - "el-templo-api/src/modules/analytics/funnel-service.ts"
    - "el-templo-api/test/analytics/funnel.test.ts"
  modified:
    - "el-templo-api/src/modules/analytics/types.ts"
    - "el-templo-api/src/modules/analytics/schemas.ts"
    - "el-templo-api/src/modules/analytics/routes.ts"
decisions:
  - "D-01: etapa activo histórica aproximada con MIN(subscriptions.created_at); precisión prueba/activo forward-only; el backend devuelve la data y el frontend (Plan 06) muestra el caveat"
  - "D-03: cohorte = mes de users.created_at; % a prueba/activo + medianas freemium→prueba y prueba→activo por cohorte"
  - "D-11: /funnel ADMIN_ROLES-only vía requireAdminAnalytics; gestion 403"
  - "D-12: test de integración real-MySQL (cohortes, %, medianas, aproximación, scope, RBAC)"
metrics:
  duration: ~50min
  completed: 2026-05-26
  tasks: 2
  files: 5
---

# Phase 118 Plan 04: Funnel de conversión freemium→prueba→activo Summary

`FunnelService` nuevo que expone `GET /api/admin/analytics/funnel`: por cohorte (mes de `users.created_at`, D-03) calcula el tamaño, el % que pasó a `prueba` (transición a 'prueba' en `user_status_history`), el % que pasó a `activo` (transición a 'activo' en history O, como aproximación histórica D-01, `MIN(subscriptions.created_at)`), y las medianas de días `freemium→prueba` y `prueba→activo` calculadas SOLO sobre los usuarios que efectivamente pasaron por esas etapas. Guardas anti-NaN: cohorte sin convertidos → 0% y mediana `null` (T-118-12). Scoped por sede/país (`users.branchId`), endpoint admin-only (`requireAdminAnalytics`, D-11). El monolito `analytics/service.ts` quedó intacto (D-09).

## What Was Built

### Task 1 — FunnelService + tipos/schema (commit ad433084)

- `funnel-service.ts` nuevo (D-09, NO toca `analytics/service.ts`). Constructor DI db+log, imports estándar (`applyScope`).
- `getFunnel(filters)`:
  - **Usuarios en scope** vía `applyScope` sobre `users.branchId` (flavor B, `.$dynamic()` + innerJoin condicional a `branches` cuando hay país); cohorte = `DATE_FORMAT(users.created_at, '%Y-%m')` (D-03).
  - **prueba/activo** leídos de `user_status_history` con `MIN(changed_at)` por (usuario, estado destino), restringido a los usuarios en scope vía `IN (...)`.
  - **Aproximación de activo (D-01):** `MIN(subscriptions.created_at)` por usuario; el momento de activo = el más temprano entre la transición de history y la sub.
  - **Medianas en JS:** `freemium→prueba` = `prueba.changedAt − users.created_at` sobre los que pasaron a prueba; `prueba→activo` = `activo − prueba.changedAt` SOLO sobre los que pasaron por ambas etapas. `median([])` → `null`. `dayDiffMs` clampea a 0 (defensa anti-clock-skew con backfill).
- Tipos `FunnelAnalytics`/`FunnelCohort` (`cohortMonth`, `size`, `toPruebaPct`, `toActivoPct`, `medianDaysFreemiumToPrueba`, `medianDaysPruebaToActivo`) + `funnelSchema` (querystring `analyticsQuerystring` + response con medianas `["number","null"]` + 400/401/403/500).

### Task 2 — Endpoint + test real-MySQL (commit 4c373c53)

- `GET /funnel` registrado con `preHandler: [requireAdminAnalytics, requireBranchAccess({...optional})]` (D-11). `FunnelService` instanciado junto a los demás. `requireAdminAnalytics` subió de 10 a 11 rutas guardadas.
- `funnel.test.ts` real-MySQL, 14 tests verdes: cohorte por mes de created_at (mismos mes → misma cohorte; orden ascendente), % a prueba (2/4 → 50%), % a activo contando history + aproximación de sub (2/3 → 67%), cohorte sin transiciones → 0% sin NaN + medianas null, mediana freemium→prueba sólo sobre convertidos (median[10,20]=15), mediana prueba→activo sólo sobre los que pasaron por ambas etapas (excluye el que llegó a activo sólo por sub), aproximación de activo (usuario con sub sin transición cuenta como activo, 100%), scope cross-sede, RBAC (401 / 403 member / 403 gestion / 200 admin con %, cross-country AR↔ES).

## Deviations from Plan

None - plan executed exactly as written.

## Decisiones de implementación

- **`created_at` controlado en el test:** `registerUser` estampa `NOW()`, así que el helper `createMember` hace un `UPDATE users SET created_at` tras el alta para fijar la cohorte de forma determinista. Las subs y transiciones también se insertan con `createdAt`/`changedAt` explícitos.
- **Restricción por `IN (...)` en lugar de joins:** las lecturas de `user_status_history` y `subscriptions` se restringen a los `userIds` ya filtrados por scope, evitando re-aplicar el scope (y re-joinar `branches`) en cada query. Más simple y sin riesgo de fuga: si el usuario no entró en `userRows`, sus transiciones/subs nunca se consideran.
- **`MIN(changed_at)` por estado:** garantiza la PRIMERA transición a cada etapa (relevante si un usuario rebota prueba→inactivo→prueba). El momento de activo toma el mínimo entre la transición de history y la sub para no inflar la latencia.
- **Aproximación de activo independiente de prueba:** un usuario puede contar como activo aunque nunca registre una transición a prueba (data histórica, sólo tiene sub). En ese caso entra en `toActivoPct` pero NO en la mediana `prueba→activo` (no pasó por la etapa intermedia registrada).
- **Caveat de ramp-up (D-01):** documentado en el JSDoc del service y de los tipos; el backend devuelve la data aproximada y el frontend (Plan 06) renderiza el banner de caveat. La data confiable es forward-only desde 2026-05-26 (hooks del Plan 01).

## Threat Surface

- `/funnel` es ADMIN_ROLES-only (T-118-10 mitigado: gestion 403 verificado en test). Todas las queries pasan por `applyScope` sobre `users.branchId` (T-118-11: cross-country AR↔ES verificado). Guardas anti-NaN en medianas y % (T-118-12: cohorte sin convertidos → 0% y mediana null verificado). Data histórica aproximada con caveat documentado (T-118-13, frontend en Plan 06). Sin dependencias nuevas (T-118-SC).

## Verification

- `pnpm test test/analytics/funnel.test.ts` → 14/14 verde contra MySQL real.
- `pnpm exec tsc --noEmit` limpio (proyecto entero).
- `grep -c 'userStatusHistory' funnel-service.ts` = 8; `grep -c 'applyScope'` = 3; `grep -c 'subscriptions'` = 8.
- `git diff --stat src/modules/analytics/service.ts` vacío (monolito intacto).
- `requireAdminAnalytics` en routes.ts subió de 10 a 11; `/funnel` guarded confirmado.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/analytics/funnel-service.ts
- FOUND: el-templo-api/test/analytics/funnel.test.ts
- FOUND: commit ad433084 (Task 1)
- FOUND: commit 4c373c53 (Task 2)

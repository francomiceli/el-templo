---
phase: 118-analytics-estrat-gico-funnel-de-conversi-n-retenci-n-por-cic
plan: 03
subsystem: analytics
tags: [finance, accrual, arpu, multi-currency, admin-only]
requires:
  - "analytics/scope.ts applyScope (Phase 117)"
  - "shared/active-member.ts activeMemberExists (Phase 117)"
  - "analytics/routes.ts requireAdminAnalytics guard (Phase 117)"
  - "analytics/service.ts getRevenueTrend canonical cash filter (forma copiada, NO invocada)"
provides:
  - "AdvancedFinanceService + GET /api/admin/analytics/advanced-finance"
  - "AdvancedFinanceAnalytics type (cashTrend/accruedTrend/arpu/excludedInvalidWindow)"
  - "advancedFinanceSchema (Fastify response/querystring)"
affects:
  - "el-templo-admin FinanzasAvanzadasTab (future plan) consume /advanced-finance"
tech-stack:
  added: []
  patterns:
    - "Domain-service shell (constructor DI) — service nuevo, monolito intacto (D-09)"
    - "Caja: replica del filtro canonico de getRevenueTrend (flavor A, branches join siempre)"
    - "Devengado: prorrateo en JS sobre ventana efectiva [start, MIN(end, cancelledAt)]"
    - "ARPU: activeMemberExists como denominador (NUNCA users.status), guard div-by-zero"
key-files:
  created:
    - "el-templo-api/src/modules/analytics/advanced-finance-service.ts"
    - "el-templo-api/test/analytics/advanced-finance.test.ts"
  modified:
    - "el-templo-api/src/modules/analytics/types.ts"
    - "el-templo-api/src/modules/analytics/schemas.ts"
    - "el-templo-api/src/modules/analytics/routes.ts"
decisions:
  - "D-07: ventana efectiva = [startDate, MIN(endDate, cancelledAt)] cuando cancelledAt < endDate; cancelSubscription NO acorta end_date (confirmado en codigo)"
  - "D-07: subs con start/end null, end<start o duracion 0 EXCLUIDAS del devengado + contadas en excludedInvalidWindow; jamas se divide por 0"
  - "D-08: caja = filtro canonico (kind plan_charge/debt_settlement, inflow, voided_at NULL); ARS/EUR jamas sumadas"
  - "D-08: ARPU = devengado del mes / activos (activeMemberExists); mes con 0 activos -> ARPU 0 (documentado)"
  - "D-11: /advanced-finance ADMIN_ROLES-only via requireAdminAnalytics; gestion 403"
  - "D-12: test de integracion real-MySQL (caja, prorrateo, cancelacion, divide-by-zero, ARPU, moneda, RBAC)"
metrics:
  duration: ~12min
  completed: 2026-05-26
  tasks: 2
  files: 5
---

# Phase 118 Plan 03: Caja vs Devengado + ARPU por moneda Summary

`AdvancedFinanceService` nuevo que expone `GET /api/admin/analytics/advanced-finance` con tres series mensuales, todas separadas por moneda (ARS/EUR jamás sumadas): **caja** (base de efectivo, idéntica a `getRevenueTrend`), **devengado prorrateado** (`pricePaid` repartido mes a mes sobre la ventana efectiva de cada sub) y **ARPU** (`devengado del mes ÷ activos`, con `activeMemberExists` como denominador). Endpoint admin-only (`requireAdminAnalytics`, D-11). El monolito `analytics/service.ts` quedó intacto (D-09).

## What Was Built

### Task 1 — AdvancedFinanceService + tipos/schema (commit 4901cb0d)

- `advanced-finance-service.ts` nuevo (D-09, NO toca `analytics/service.ts`). Constructor DI db+log, imports estándar (`applyScope`, `activeMemberExists`).
- **`cashTrend` (CAJA, D-08):** replica el filtro canónico de `getRevenueTrend` (`kind IN ('plan_charge','debt_settlement')`, `direction='inflow'`, `voided_at IS NULL`) con join `users → branches`, `applyScope` sobre `users.branchId` (flavor A: branches siempre joineado), groupBy (month, currency) colapsado en `Map<month, {ARS, EUR}>`. NO invoca el método privado del monolito — la query está re-escrita.
- **`accruedTrend` (DEVENGADO prorrateado, D-07):** lee todas las subs en scope (`applyScope` sobre `subscriptions.branchId`, flavor B), calcula la **ventana efectiva** = `[startDate, MIN(endDate, cancelledAt)]` cuando `cancelledAt < endDate`, valida null/0/end<start ANTES de dividir (excluidas + contadas en `excludedInvalidWindow`), y para cada mes que toca la ventana acumula `pricePaid × (díasDentroDelMes / duracionTotal)`. Aritmética en JS (no SQL CASE) para portabilidad. Redondeo final por moneda.
- **`arpu` (D-08):** `devengado del mes ÷ activos`, donde `activos` = count de `activeMemberExists(users.id)` (NUNCA `users.status`), scoped. Guard contra div-by-zero: mes con 0 activos → ARPU 0.
- Tipo `AdvancedFinanceAnalytics { cashTrend, accruedTrend, arpu, excludedInvalidWindow }` + `advancedFinanceSchema` (querystring branchId/dateFrom/dateTo + response + 400/401/403/500, reusa `analyticsQuerystring`).

### Task 2 — Endpoint + test real-MySQL (commit ca35facd)

- `GET /advanced-finance` registrado con `preHandler: [requireAdminAnalytics, requireBranchAccess({...optional})]` (D-11). `AdvancedFinanceService` instanciado junto a los demás. `requireAdminAnalytics` subió de 8 a 9 rutas guardadas.
- `advanced-finance.test.ts` real-MySQL, 14 tests verdes: caja (filtro canónico; voided/refund/outflow excluidos), plan largo de 240 días (caja concentrada en marzo vs devengado repartido en >3 meses, suma ≈ pricePaid), sub cancelada con `cancelled_at < end_date` (devengado corta en febrero, marzo/abril en 0, Jan+Feb suman el total), `end_date` null excluida + `excludedInvalidWindow=1` sin NaN, ventana invertida excluida, ARS/EUR independientes en caja y devengado, ARPU con `activeMemberExists`, mes con 0 activos → ARPU 0, RBAC (401 / 403 member / 403 gestion / 200 owner / cross-country AR↔ES).

## Deviations from Plan

None - plan executed exactly as written.

## Decisiones de implementación

- **Ventana efectiva y cancelación (D-07, T-118-09):** `cancelSubscription` (subscriptions/service.ts ~1834) setea `status='cancelled'` + `cancelledAt` pero **NO acorta `end_date`** (confirmado leyendo el código). Por eso el devengado usa `MIN(endDate, cancelledAt)`: sin esto, una sub cancelada inflaría el devengado de meses futuros que nunca se prestaron. `cancelledAt` viene como `Date`/string desde Drizzle → se normaliza a `YYYY-MM-DD` antes de comparar.
- **Días inclusivos:** `duracionTotal = dayDiff(start, end) + 1` y `overlapDays = dayDiff(lo, hi) + 1` (ambos extremos inclusive). Por eso la suma del devengado puede diferir del `pricePaid` en unas pocas unidades por redondeo (tolerancia ≤12 en el test del plan de 240 días, ≤2 en ventanas de un mes).
- **ARPU denominador (D-08):** `activeMemberExists` es un predicado **point-in-time** ("activo ahora", `CURDATE()`). Se calcula un único count de activos y se usa como denominador para CADA mes del ARPU. Es la reutilización honesta del predicado canónico que el plan exige (NUNCA `users.status`): ARPU = devengado de cada mes relativo a la base activa actual. Documentado en el JSDoc del método y en el tipo.
- **Caja usa flavor A** (`branches` siempre joineado vía `users`) porque la query de caja ya necesita el join `users → financial_transactions.memberId` y el filtro de país va sobre `branches.country`. Devengado y conteo de activos usan flavor B (`.$dynamic()` + join condicional).
- **Test de ventana null-start:** `subscriptions.startDate` es `NOT NULL` en el schema, así que no se puede insertar `start=null` vía Drizzle. Los casos de ventana inválida cubren `endDate` null y `end<start` (que la columna sí permite). La guarda de `start===null` sigue presente en el servicio por defensa.

## Threat Surface

- `/advanced-finance` es ADMIN_ROLES-only (T-118-06 mitigado: gestion 403 verificado en test). Todas las queries pasan por `applyScope` (T-118-07: cross-country AR↔ES verificado; ARS/EUR nunca sumadas). Guardas null/0/end<start antes de dividir + ARPU con denominador 0 → 0 (T-118-08 mitigado). Ventana efectiva con `MIN(end, cancelledAt)` evita devengado inflado por cancelaciones (T-118-09). Sin dependencias nuevas (T-118-SC).

## Verification

- `pnpm test test/analytics/advanced-finance.test.ts` → 14/14 verde contra MySQL real.
- `pnpm exec tsc --noEmit` limpio (proyecto entero).
- `grep -c 'activeMemberExists'` = 4; `grep -c 'applyScope'` = 8; `grep -c 'cancelledAt'` = 8; sin referencias runtime a `users.status` (0 fuera de comentarios).
- `git diff --stat src/modules/analytics/service.ts` vacío (monolito intacto).
- `requireAdminAnalytics` en routes.ts subió de 8 a 9 (nueva ruta guarded); `/advanced-finance` guarded confirmado.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/analytics/advanced-finance-service.ts
- FOUND: el-templo-api/test/analytics/advanced-finance.test.ts
- FOUND: commit 4901cb0d (Task 1)
- FOUND: commit ca35facd (Task 2)

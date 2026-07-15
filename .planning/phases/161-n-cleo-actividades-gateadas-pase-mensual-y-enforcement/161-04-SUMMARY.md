---
phase: 161-n-cleo-actividades-gateadas-pase-mensual-y-enforcement
plan: 04
subsystem: analytics
tags: [analytics, membership-metrics, especial-pass, D-11]
requires:
  - planCategory 'especial' (161-01)
provides:
  - excludeEspecialSubs() (filtro de subs especiales por plan_id)
  - activeNonEspecialMemberExists() (predicado de miembro activo sin pase)
  - métricas de membresía que excluyen 'especial' (activos/altas/bajas/churn/renovación/LTV/ticket/retención/frecuencia)
affects:
  - el-templo-api/src/modules/analytics/*
  - el-templo-api/src/modules/shared/active-member.ts
tech-stack:
  added: []
  patterns:
    - Filtro de exclusión como subquery NO correlacionada por plan_id (aplica joinee o no subscriptionPlans)
    - Predicado sibling activeNonEspecialMemberExists (no se toca el activeMemberExists compartido)
    - ne(planCategory,'especial') directo en las queries que ya joinean subscriptionPlans
key-files:
  created:
    - el-templo-api/src/modules/analytics/especial-exclusion.ts
    - el-templo-api/test/analytics/especial-exclusion.test.ts
  modified:
    - el-templo-api/src/modules/shared/active-member.ts
    - el-templo-api/src/modules/analytics/member-flows-service.ts
    - el-templo-api/src/modules/analytics/churn-service.ts
    - el-templo-api/src/modules/analytics/renewal-service.ts
    - el-templo-api/src/modules/analytics/ltv-service.ts
    - el-templo-api/src/modules/analytics/ticket-service.ts
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-api/src/modules/analytics/retention-service.ts
    - el-templo-api/src/modules/analytics/frequency-service.ts
decisions:
  - "Dos mecanismos de exclusión según la query: ne(planCategory,'especial') donde ya hay join a subscriptionPlans; excludeEspecialSubs() (subquery por plan_id) donde no lo hay. Ambos filtran idéntico."
  - "NO se modifica el activeMemberExists compartido (lo usan members/reports/advanced-finance): se creó activeNonEspecialMemberExists solo para el KPI de membresía."
  - "Ticket: se excluye especial de linkedCharges Y del universo (NOT EXISTS por link) para que la contabilidad universe=matched+excludedNoLink no se rompa."
  - "Worklists operacionales (attention list, engagement at-risk) NO se tocan: no son métricas de negocio y el staff puede querer contactar a quien tiene pase."
metrics:
  duration: ~13min
  completed: 2026-07-15
requirements: [PASE-04]
---

# Phase 161 Plan 04: Exclusión del pase especial de las métricas de membresía (D-11) Summary

Las suscripciones `planCategory='especial'` (el pase de Actividades con Aura) dejan de inflar las métricas de membresía —miembros activos, altas/bajas, churn/no-renovación, renovación, LTV, ticket promedio, retención y frecuencia— mientras la plata del pase sigue intacta en caja/cobros/advanced-finance (ingreso real). Se auditaron todos los consumidores de `subscriptions`/`subscriptionPlans` en `analytics/` y se aplicó el filtro donde la query mide membresía.

## What Was Built

**Task 1 — Exclusión en los consumidores de membresía** (`f8490b54`):

Dos herramientas nuevas + su aplicación en 9 archivos:

- **`especial-exclusion.ts` → `excludeEspecialSubs()`**: subquery NO correlacionada `subscriptions.plan_id NOT IN (SELECT id FROM subscription_plans WHERE plan_category='especial')`. Aplica por igual a queries que joinean o no `subscriptionPlans` sin forzar un join extra (2 planes especiales → `NOT IN` trivial). Prefijo literal `subscriptions.plan_id` obligatorio (Drizzle des-califica columnas en fragmentos `sql`` crudos).
- **`activeNonEspecialMemberExists()`** (en `shared/active-member.ts`): copia de `activeMemberExists` + `AND s.plan_id NOT IN (especiales)`. NO reemplaza al `activeMemberExists` compartido (lo usan members/reports/advanced-finance, que NO se tocan). Un socio con presencial + pase satisface el EXISTS por su presencial; solo cae el externo-solo-pase.

Aplicación (todas las líneas verificadas con grep, ya habían corrido respecto de las del plan):

| Servicio     | Métrica                        | Mecanismo                                                   |
| ------------ | ------------------------------ | ----------------------------------------------------------- |
| member-flows | altas (streak + legacy), bajas | `excludeEspecialSubs()`                                     |
| member-flows | detalle de bajas (join plans)  | `ne(planCategory,'especial')`                               |
| churn        | official/window/monthly cohort | `excludeEspecialSubs()`                                     |
| churn        | breakdown por eje (join plans) | `ne(...)`                                                   |
| renewal      | official cohort                | `excludeEspecialSubs()`                                     |
| renewal      | breakdown por eje (join plans) | `ne(...)`                                                   |
| ltv          | cohorte de vidas (join plans)  | `ne(...)` + exclusión en el subselect `firstStart` (s_life) |
| ticket       | linkedCharges (join plans)     | `ne(...)`                                                   |
| ticket       | universo (sin join)            | `NOT EXISTS` por transaction_links→subscriptions→plan       |

**Task 2 — Tests de integración D-11** (`e25ba75f`):

`test/analytics/especial-exclusion.test.ts` (313 líneas, 3 casos, MySQL real, seed directo por DB para controlar `planCategory`/fechas):

1. **Miembros activos** (endpoint `GET /api/admin/analytics`): socio-presencial + socio-con-pase = 2; externo-solo-pase NO figura.
2. **Altas** (`MemberFlowsService.getMonthlyFlows`): un presencial que arranca hoy = 1 alta; el pase que arranca hoy NO suma.
3. **Ticket** (`TicketService.getTicket`): promedio 15000 (no 17500), `global.n === 1`, `excludedNoLink === 0` (universo consistente).

Resultado: `npx vitest run test/analytics/especial-exclusion.test.ts` → 3/3 verde.

## Auditoría de los consumidores (D-11 / must_have #3)

Grep exhaustivo de `subscriptions`/`subscriptionPlans` en `src/modules/analytics/`. Decisión por archivo:

| Archivo                                                  | ¿Mide membresía?                                                                                             | Acción                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| member-flows, churn, renewal, ltv, ticket                | Sí (los 5 confirmados)                                                                                       | **Excluido**                                                                                                          |
| `service.ts` (monolito)                                  | Sí — `countActiveMembers` (KPI miembros activos), `countNewMembers` (altas del trend), `getPlanDistribution` | **Excluido** (activeNonEspecialMemberExists + ne). Requerido por el test caso (1).                                    |
| `retention-service.ts`                                   | Sí — cohortes de ciclos + distribución + dropdown de planes                                                  | **Excluido** (excludeEspecialSubs en las dos queries de streak + ne en availablePlans)                                |
| `frequency-service.ts`                                   | Sí — población activa para frecuencia de asistencia                                                          | **Excluido** (ne en populationConditions)                                                                             |
| `engagement-service.ts`                                  | No (métrica) — lista operacional de en-riesgo (alerta/ausente) para contactar                                | **Sin cambio** — worklist, no métrica de negocio; el staff puede querer contactar a quien tiene pase.                 |
| `service.ts::getAttentionList`                           | No — worklist de vencimientos para recepción                                                                 | **Sin cambio** (operacional)                                                                                          |
| `service.ts::countChurnedMembers`/`computeRetentionRate` | Deprecados (fase 121 D-09, superseded por churn-service)                                                     | **Sin cambio** — legacy; solo alimentan el trend estimado del KPI (impacto marginal).                                 |
| `funnel-service.ts`, `trial-funnel-service.ts`           | Funnel de conversión de leads (no conteo de membresía)                                                       | **Sin cambio** — la conversión a un pase es un caso marginal; revisable en fase 162 si aparece la línea "Especiales". |
| `cohorts.ts`, `breakdowns.ts`, `expiry-cohort.ts`        | No tienen query propia de membresía (helpers/tipos; la exclusión la aplican los consumidores)                | **N/A**                                                                                                               |
| `attendance-metrics-service.ts`                          | No referencia subscriptionPlans                                                                              | **N/A**                                                                                                               |
| `advanced-finance-service.ts`, cobros, caja              | Ingresos — la plata del pase SÍ cuenta (D-11, Pitfall 5)                                                     | **NO se toca (por diseño)**                                                                                           |

## Verification

- `npx tsc --noEmit` verde tras cada tarea (proyecto completo).
- `npx vitest run test/analytics/especial-exclusion.test.ts` → 3/3 verde.
- Acceptance criteria Task 1: los 5 confirmados matchean `grep -l "especial"`; `advanced-finance-service.ts` tiene 0 matches (no se tocó).
- Suite de analytics existente: no-regresión — se corre en CI (regla del repo: no correr el suite completo local).

## Deviations from Plan

**[Rule 2 — Missing critical functionality] Exclusión en service.ts / retention / frequency más allá de los 5 confirmados.**

- **Encontrado en:** Task 1 (auditoría) + Task 2 (el test caso 1 exige que el endpoint "miembros activos" excluya al externo-solo-pase).
- **Motivo:** El KPI real de "miembros activos" vive en `service.ts::countActiveMembers` (vía `activeMemberExists`), NO en los 5 servicios listados en las interfaces del plan (que cubrían altas/bajas/churn/renovación/LTV/ticket). D-11 y el test de Task 2 exigen excluir especial de "miembros activos"; retención y frecuencia miden membresía y estaban en la lista de auditoría del must_have #3.
- **Fix:** `activeNonEspecialMemberExists` (sin tocar el predicado compartido) + `ne`/`excludeEspecialSubs()` en retention y frequency.
- **Commit:** `f8490b54`.

**[Nota TDD]** El plan marca Task 2 `tdd="true"` pero el orden del plan es impl (Task 1) → tests (Task 2), así que no hubo fase RED previa: el test entró directo en GREEN fijando D-11. Sin desviación de comportamiento.

## Known Stubs

Ninguno. Todos los filtros están wireados y ejercitados por el test. La **línea propia "Especiales"** en analíticas (contador socio/externo separado) es alcance de la fase 162 por diseño (D-11) — este plan entrega solo la exclusión backend.

## Self-Check: PASSED

- Archivos creados: `especial-exclusion.ts` FOUND, `especial-exclusion.test.ts` FOUND (313 líneas ≥ 50).
- Commits: `f8490b54`, `e25ba75f` FOUND en git log.
- Test: 3/3 verde contra MySQL real.
- tsc: proyecto completo verde.

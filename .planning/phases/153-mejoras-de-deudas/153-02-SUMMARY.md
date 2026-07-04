---
phase: 153-mejoras-de-deudas
plan: 02
subsystem: api
tags: [reports, deudas, vencidos, expired-members, renewal-leads, drizzle, rbac]

# Dependency graph
requires:
  - phase: 121-vencimiento-churn
    provides: predicado "vencido sin renovar" (overdue) en analytics/service.ts
  - phase: 117-analytics
    provides: activeMemberExists (helper canónico "socio activo" en shared/active-member.ts)
  - phase: 153-mejoras-de-deudas
    plan: 01
    provides: reports/outstanding-balances enriquecido; scaffolding de test de reports
provides:
  - "GET /api/admin/reports/expired-members — cohorte de vencidos 60d sin renovar (DEUDA-04)"
  - "getExpiredMembers(filters, scope) en ReportsService: ventana 60d + exclusión de dato sucio + dedup por miembro"
  - "ExpiredMemberRow/ExpiredMembersFilters/ExpiredMembersResult (sin monto, paginado)"
affects:
  [153-04 (tab "Vencidos" del admin consume este endpoint), DeudasPage.vue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Predicado overdue de analytics reusado con ventana parametrizada (60d, D-05) + guard de dato sucio end_date >= start_date"
    - "Dedup por miembro + paginación en JS (cohorte 60d pequeña) para que total cuente miembros distintos, no filas de sub"
    - "Endpoint nuevo dentro de reportsRoutes → hereda gratis el guard CAJA_ROLES del hook onRequest (coach 403 sin código nuevo)"

key-files:
  created:
    - el-templo-api/test/reports/expired-members.test.ts
  modified:
    - el-templo-api/src/modules/reports/types.ts
    - el-templo-api/src/modules/reports/schemas.ts
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/reports/routes.ts

key-decisions:
  - "El cohorte vive en modules/reports/ para heredar el guard CAJA_ROLES plugin-level (coach → 403, D-12) sin tocar el endpoint coach"
  - "Exclusión del dato sucio histórico vía end_date >= start_date (~4260 subs cancelled con ventana invertida) en vez de filtrar status='cancelled' — descarta la ventana inválida sin asumir un status"
  - "Dedup + paginación en JS: SQL COUNT(*) contaría filas de sub (un miembro puede tener varias subs vencidas en ventana); el total debe contar miembros distintos"

patterns-established:
  - "getExpiredMembers: negación de activeMemberExists (nunca users.status) como definición de 'no renovó'"
  - "expiredMembersSchema espeja outstandingBalancesSchema (querystring sin currency, fila sin amount/currency)"

requirements-completed: [DEUDA-04]

# Metrics
duration: ~7min
completed: 2026-07-04
---

# Phase 153 Plan 02: Cohorte de Vencidos (endpoint de datos) Summary

**Nuevo `GET /api/admin/reports/expired-members` que lista a los socios cuyo plan venció en los últimos 60 días sin renovar (DEUDA-04) — leads de renovación sin monto, deduplicados por miembro, scoped por rol, con 403 para coach/recepcion heredado del guard plugin-level de reports, sin migración.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-04T17:53:04Z
- **Completed:** 2026-07-04T17:59:29Z
- **Tasks:** 3
- **Files changed:** 5 (4 modificados, 1 creado)

## Accomplishments

- Contrato `ExpiredMemberRow`/`ExpiredMembersFilters`/`ExpiredMembersResult` (sin monto, D-06) + `expiredMembersSchema` espejando el molde paginado de OB.
- `getExpiredMembers` reusa el predicado overdue de analytics (fase 121) adaptado a ventana de 60 días (D-05), negando `activeMemberExists` (helper canónico, nunca `users.status`) para "no renovó", excluyendo el dato sucio histórico (`end_date >= start_date`), deduplicando por miembro (vencimiento más reciente) y ordenando por `daysOverdue` ASC.
- Ruta `GET /expired-members` dentro de `reportsRoutes`, copiando la estructura de `/outstanding-balances` (schema, `requireBranchAccess` optional, resolución owner-aware de country, `handleServiceError`); el 403 de coach/recepcion sale gratis del hook `onRequest` plugin-level (`CAJA_ROLES`), sin guard por ruta.
- Endpoint coach intacto (D-12): diff de `src/modules/coach/` vacío. Sin migración.
- Test de integración `expired-members.test.ts` con cobertura de ventana 60d, renovación, dato sucio, dedup, sin monto, RBAC 403, cross-country/scope, search y convivencia deuda+vencido (D-07).

## Task Commits

1. **Task 1: Contrato del cohorte de vencidos (types + schema)** - `5581ebf7` (feat)
2. **Task 2: getExpiredMembers (service) + ruta GET /expired-members** - `d3fb9053` (feat)
3. **Task 3: Tests de integración expired-members** - `d6bfc665` (test)

## Files Created/Modified

- `el-templo-api/src/modules/reports/types.ts` - trío `ExpiredMemberRow`/`ExpiredMembersFilters`/`ExpiredMembersResult` sin monto, con docstrings (DEUDA-04, D-05/D-06).
- `el-templo-api/src/modules/reports/schemas.ts` - `expiredMembersSchema` (querystring sin currency, fila con userId/memberName/memberPhone/planName/expiryDate/daysOverdue).
- `el-templo-api/src/modules/reports/service.ts` - import de `activeMemberExists` + método `getExpiredMembers` (predicado 60d + exclusión de dato sucio + dedup por miembro + scope owner-aware).
- `el-templo-api/src/modules/reports/routes.ts` - ruta `GET /expired-members` heredando el guard plugin-level; import de `expiredMembersSchema` y `ExpiredMembersFilters`.
- `el-templo-api/test/reports/expired-members.test.ts` - scaffolding tipo OB (seedFixtures/seedRolesAndPlans/dateOffset) + helpers `seedMemberWithSubscription`/`addSubscriptionForMember`/`seedExpiredMemberWithDebt` + 10 casos.

## Decisions Made

- **Ventana 60d parametrizada (D-05):** el predicado de analytics usa `INTERVAL 30 DAY` (worklist de churn corto); acá se adapta a `INTERVAL 60 DAY` — el resto del predicado (end_date < CURDATE, `NOT activeMemberExists`) se conserva verbatim.
- **Exclusión del dato sucio vía `end_date >= start_date`:** descarta las ~4260 subs cancelled con ventana invertida sin asumir un status, más robusto que `status != 'cancelled'` (una sub válida futura podría quedar cancelled).
- **Dedup + paginación en JS:** un miembro puede tener varias subs vencidas en la ventana; un `COUNT(*)` en SQL contaría filas, no miembros. Se traen todas las filas del cohorte (pequeño por diseño: 60d, un gym), se deduplica por `userId` conservando el menor `daysOverdue`, y se pagina sobre la lista deduplicada para que `total` cuente miembros distintos.
- **Sin `bucketTotals` en el result:** los vencidos no tienen monto (D-06), así que el shape paginado omite los totales por bucket que sí tiene OB.

## Deviations from Plan

### Adaptaciones (no bloqueantes)

**1. [Rule 3 - Blocking] Task 2 marcada `tdd="true"` ejecutada sin el ciclo RED/GREEN local**

- **Found during:** Task 2
- **Issue:** El plan marca Task 2 como TDD, pero la regla dura del proyecto (y de este prompt) prohíbe ejecutar el suite de vitest localmente — los tests corren en CI. El ciclo RED/GREEN requiere correr tests.
- **Fix:** Se implementó service + ruta con el gate local `pnpm exec tsc --noEmit` (verde), y la cobertura de tests se entregó en Task 3 (el task dedicado de tests). No hubo commits `test(...)`→`feat(...)` separados para el mismo feature; el feat de Task 2 precede al test de Task 3. Los tests validan el comportamiento del `<behavior>` en CI.
- **Files modified:** (ninguno adicional)
- **Commit:** N/A

## Issues Encountered

- Ninguno. `pnpm exec tsc --noEmit` quedó verde tras cada task; diff de `coach/` vacío.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- El tab "Vencidos" (plan 153-04) tiene su fuente de datos lista: `GET /api/admin/reports/expired-members` devuelve nombre, teléfono, plan vencido, fecha de vencimiento y días transcurridos, paginado y scoped, con 403 para coach.
- Los tests corren en CI (vitest) al pushear — no se ejecutaron localmente por preferencia del usuario; el gate local `tsc --noEmit` quedó verde.

## Self-Check: PASSED

All modified/created files present on disk; all 3 task commits (`5581ebf7`, `d3fb9053`, `d6bfc665`) present in git history.

---

_Phase: 153-mejoras-de-deudas_
_Completed: 2026-07-04_

---
phase: 153-mejoras-de-deudas
plan: 01
subsystem: api
tags:
  [
    reports,
    deudas,
    outstanding-balances,
    drizzle,
    financial-transactions,
    transaction-links,
    excel-export,
  ]

# Dependency graph
requires:
  - phase: 109-modelo-financiero
    provides: balances + transaction_links + financial_transactions, getOutstandingBalances + exportOutstandingBalances, deriveEffectiveDateAndLabelOB
  - phase: 145-mejoras-caja
    provides: financial_transactions.miscReason (enum sin_plan/otro) sobre advance_payment
provides:
  - "OutstandingBalanceRow enriquecido con reasonLabel/periodStart/periodEnd/registeredAt/notes (DEUDA-01/02/03)"
  - "Derivación única compartida (helper) entre el JSON de reports/outstanding-balances y el export Excel"
  - "Motivo derivado del origen: 'Cuota <plan>' para cuotas, 'Sin plan'/'Otro' para cobros sueltos, 'Saldo a regularizar' para huérfanos"
affects:
  [
    153-03 (tab Por deuda del admin consume estos campos),
    153-02 (Vencidos),
    DeudasReport.vue,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derived-table LEFT JOIN con GROUP BY + MIN(id) para resolver la transacción origen determinística sin multiplicar filas"
    - "Helper de derivación con inputs opcionales (superset) para que call sites viejos (bucketTotals) sigan compilando"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/reports/types.ts
    - el-templo-api/src/modules/reports/schemas.ts
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/reports/routes.ts
    - el-templo-api/test/reports/outstanding-balances.test.ts

key-decisions:
  - "Origen del cobro suelto = MIN(financial_transactions.id) vía derived table agrupada por targetId — determinístico y a prueba de multiplicación de filas"
  - "El join de tx_links se gatea con balances.targetKind='debt_balance' para evitar colisión de targetId entre subscription y debt_balance (mismo int, entidades distintas)"
  - "registeredAt = balances.createdAt (date portion) para TODAS las filas, distinto de effectiveDate (ciclo/devengo)"

patterns-established:
  - "buildDebtOriginTxSubquery(): subquery reutilizable compartida por getOutstandingBalances y exportOutstandingBalances (DRY)"
  - "El export Excel formatea período con formatPeriodDDMM (dd/mm–dd/mm o '—'); la derivación del dato vive en el service, el formato en la ruta"

requirements-completed: [DEUDA-01, DEUDA-02, DEUDA-03]

# Metrics
duration: ~12min
completed: 2026-07-04
---

# Phase 153 Plan 01: Enriquecimiento de datos de Deudas (motivo/período/fecha de registro) Summary

**GET /api/admin/reports/outstanding-balances ahora devuelve por fila el motivo derivado del origen (Cuota <plan> / Sin plan / Otro), el período del ciclo (start–end) y la fecha de registro (balances.createdAt), sin migración y con derivación única compartida entre el JSON y el export Excel.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-04T17:33:00Z (aprox)
- **Completed:** 2026-07-04T17:45:38Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Contrato `OutstandingBalanceRow` extendido con 5 campos derivados (reasonLabel, periodStart, periodEnd, registeredAt, notes) reflejados en el schema Fastify.
- `getOutstandingBalances` y `exportOutstandingBalances` enriquecidos vía un helper de derivación único (superset del `deriveEffectiveDateAndLabelOB` histórico) + una derived table `buildDebtOriginTxSubquery` compartida que resuelve la transacción origen del cobro suelto sin multiplicar filas.
- Export Excel de Deudas gana columnas "Motivo", "Período" (dd/mm–dd/mm) y "Fecha de registro".
- Endpoint coach intacto (D-12), sin migración (todo derivado de balances + subscriptions + transaction_links → financial_transactions).
- Cobertura de tests por cada origen de deuda (cuota / sin_plan / otro / huérfano) + período + fecha de registro.

## Task Commits

1. **Task 1: Extender el contrato de OutstandingBalanceRow (types + schema)** - `e874da9e` (feat)
2. **Task 2: Enriquecer getOutstandingBalances y exportOutstandingBalances (derivación compartida)** - `8c7e9cbd` (feat)
3. **Task 3: Tests de integración del motivo/período/fecha** - `630cac23` (test)

## Files Created/Modified

- `el-templo-api/src/modules/reports/types.ts` - 5 campos nuevos en `OutstandingBalanceRow` con docstrings (DEUDA-01/02/03, D-11).
- `el-templo-api/src/modules/reports/schemas.ts` - reflejo de los 5 campos en `outstandingBalancesSchema` (nullable donde corresponde).
- `el-templo-api/src/modules/reports/service.ts` - helper de derivación superset + `isoDatePortionOB` + `buildDebtOriginTxSubquery`; proyección/mapeo enriquecidos en `getOutstandingBalances` y `exportOutstandingBalances`.
- `el-templo-api/src/modules/reports/routes.ts` - columnas Motivo/Período/Fecha de registro en el Excel + helper `formatPeriodDDMM`.
- `el-templo-api/test/reports/outstanding-balances.test.ts` - `seedDebtBalanceWithOrigin`, `endDateOffsetDays` en `seedSubscriptionWithBalance`, y 5 casos nuevos (REASON-CUOTA / REASON-SIN-PLAN / REASON-OTRO / REASON-ORPHAN / REGISTERED-AT).

## Decisions Made

- **Transacción origen determinística vía MIN(id):** un `debt_balance` podría en teoría tener múltiples advance_payments linkeadas; se elige la más antigua (MIN autoincrement) con una derived table agrupada por targetId, garantizando una fila por balance y evitando multiplicación en el LEFT JOIN (además de mantener el COUNT correcto).
- **Gate del join en `balances.targetKind='debt_balance'`:** `target_id` es un int sin FK homogénea; una subscription id=5 y un debt_balance id=5 son entidades distintas con el mismo valor. El join se condiciona a que el balance sea `debt_balance` para no cruzar datos de subscription con tx_links de debt_balance.
- **Inputs opcionales en el helper:** `subscriptionEndDate/miscReason/transactionNotes` son opcionales para que los call sites de `bucketTotals` (que solo necesitan `effectiveDate`) sigan compilando sin proyectar columnas extra.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- La aserción de `registeredAt` en el test REGISTERED-AT se relajó de un `=== dateOffset(0)` estricto a un rango `[dateOffset(-1), dateOffset(1)]` para evitar flakiness en el borde del día UTC/local (createdAt se serializa en UTC vía toISOString; dateOffset usa medianoche local). El punto del caso (registeredAt ≠ effectiveDate, formato ISO) se mantiene.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- El contrato de datos del tab "Por deuda" (plan 153-03) está listo: la respuesta ya trae motivo/período/fecha de registro para renderizar como columnas + nota en tooltip.
- Los tests corren en CI (vitest) al pushear — no se ejecutaron localmente por preferencia del usuario; el gate local `tsc --noEmit` quedó verde.

## Self-Check: PASSED

All 5 modified files present on disk; all 3 task commits (`e874da9e`, `8c7e9cbd`, `630cac23`) present in git history.

---

_Phase: 153-mejoras-de-deudas_
_Completed: 2026-07-04_

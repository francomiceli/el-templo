---
phase: 146-caja-validaci-n-e-imputaci-n-fundacional
plan: 05
subsystem: api
tags: [finance, drizzle, mysql, arqueo, caja, cash-register, vitest]

# Dependency graph
requires:
  - phase: 146-02
    provides: validationStatus en financial_transactions + resolver de caja por medio de pago
provides:
  - "listMovEgresos reescrito como arqueo por caja: filtra por cash_register_id, trae TODOS los kinds imputados"
  - "validationStatus por fila en MovEgresoItem y en GET /movements-history (passthrough)"
  - "test de regresión ARQUEO-04 que congela el contrato de list() (Transacciones)"
affects: [146-06, caja, arqueo, saldos-por-caja]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Arqueo por caja: filtro primario cash_register_id en vez de kind IN(...); LEFT JOIN para que filas sin socio sobrevivan"
    - "Response passthrough (sin schema de fila) → campos nuevos del service shape fluyen sin re-tipar la route"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/test/finance/mov-egresos-history.test.ts

key-decisions:
  - "Task 2 (exponer validationStatus en schema/route) no requirió cambio de código: la respuesta es passthrough y la route devuelve listMovEgresos() directo. Sólo docs."
  - "list() (Transacciones) NO se tocó (ARQUEO-04); test congela su criterio (NULL-member expense aparece en arqueo pero NO en list())"
  - "conditions arranca vacío para owner global sin filtros → .where(and()) sin WHERE (correcto); non-owner sin país sigue forzando 1=0"

patterns-established:
  - "Arqueo por caja = filtro por cash_register_id, no por kind"

requirements-completed: [ARQUEO-01, ARQUEO-02, ARQUEO-04]

# Metrics
duration: 18min
completed: 2026-06-26
---

# Phase 146 Plan 05: Arqueo por caja (listMovEgresos) Summary

**listMovEgresos pasa de filtrar `kind IN (cash_transfer,expense,adjustment)` a ser el arqueo por caja: filtra por `cash_register_id` y trae TODOS los kinds imputados (incluidos plan_charge/debt_settlement/advance_payment/refund) con su `validationStatus`, sin tocar la vista comercial `list()`.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-26T02:35Z (aprox)
- **Completed:** 2026-06-26T02:55Z (aprox)
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `listMovEgresos` ya no descarta los cobros de socio: dada una caja devuelve todo lo imputado a ella (cobros + egresos + traspasos + ajustes), que es lo que necesita cuadrar contra "Saldos por caja".
- Cada fila trae `validationStatus` (pendiente/observado/corregido/validado); pendientes y validadas aparecen ambas (sin filtrar por estado) — listo para que la UI (plan 06) marque el estado.
- `GET /movements-history` y `/movements-history/export` heredan el arqueo por caja automáticamente (response passthrough).
- Test de regresión ARQUEO-04 que prueba que `list()` (pestaña Transacciones) mantiene su criterio: una expense NULL-member aparece en el arqueo pero NO en `GET /transactions`.

## Task Commits

1. **Task 1 (RED): tests fallidos de arqueo por caja** - `e60b8a77` (test)
2. **Task 1 (GREEN): listMovEgresos → arqueo por caja + validationStatus** - `d28ec18f` (feat)
3. **Task 2: documentar validationStatus en route/schema** - `e0132377` (docs)

**Plan metadata:** _(commit final docs)_

## Files Created/Modified

- `el-templo-api/src/modules/finance/transaction-service.ts` - `listMovEgresos`: quita `inArray(kind, ...)`, filtro primario `cash_register_id`, agrega `validationStatus` al `.select()` y al row mapping; doc actualizada. `list()` intacto.
- `el-templo-api/src/modules/finance/types.ts` - `MovEgresoItem` ahora incluye `validationStatus`; doc del arqueo por caja.
- `el-templo-api/src/modules/finance/routes.ts` - comentario de `/movements-history` actualizado al arqueo por caja.
- `el-templo-api/src/modules/finance/schemas.ts` - comentario de `movementsHistorySchema` actualizado.
- `el-templo-api/test/finance/mov-egresos-history.test.ts` - tests ARQUEO-01/02/04: todos los kinds por caja, validationStatus, list() intacto.

## Decisions Made

- **Task 2 sin cambio de código (sólo docs):** la respuesta de `/movements-history` es passthrough (sólo registra 401/403/500), y la route devuelve `listMovEgresos(filters)` directo sin mapeo. El `validationStatus` del service shape fluye solo; el test ARQUEO-02 lo confirma sobre el endpoint real.
- **`list()` no se tocó (ARQUEO-04):** función separada con INNER JOIN users/branches. El test inserta una expense NULL-member y verifica que aparece en el arqueo pero no en `GET /transactions`, mientras un plan_charge de socio sí sigue en list().
- **`conditions` puede quedar vacío** para owner sin filtros → `.where(and())` = sin WHERE (correcto). Non-owner sin país sigue forzando `1=0` (defensa en profundidad intacta).

(Registradas también en `.planning/AUTONOMOUS-DECISIONS-v5.3.md`, sección 146-05.)

## Deviations from Plan

None - plan executed exactly as written. Task 2 resultó ser docs-only porque la route/schema ya eran passthrough (anticipado por el plan: "confirmar que el mapeo de respuesta no lo descarta").

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend del arqueo por caja listo: el endpoint expone todos los kinds + `validationStatus` por fila.
- Plan 06 (UI) puede consumir `GET /movements-history?cashRegisterId=X` y marcar el estado de cada fila.
- Sin migraciones nuevas en este plan (usa `validationStatus` ya existente de 146-02).

## Self-Check: PASSED

- SUMMARY.md present.
- Commits e60b8a77 (test), d28ec18f (feat), e0132377 (docs) all in history.
- tsc green; 67/67 tests pass (mov-egresos-history + transactions-api).

---

_Phase: 146-caja-validaci-n-e-imputaci-n-fundacional_
_Completed: 2026-06-26_

---
phase: 146-caja-validaci-n-e-imputaci-n-fundacional
plan: 06
subsystem: admin
tags: [finance, caja, arqueo, vue, quasar, frontend]

# Dependency graph
requires:
  - phase: 146-05
    provides: listMovEgresos como arqueo por caja con validationStatus por fila (todos los kinds)
provides:
  - "Filtro Tipo de 'Movimientos de caja' suma 'Cobros' (plan_charge/debt_settlement/advance_payment/refund)"
  - "Columna 'Estado' + badge de validationStatus (pendiente/observado/corregido/validado) por fila y en detail dialog"
  - "FE MovEgresoItem sincronizado con el backend del plan 05 (validationStatus, memberId, kind ensanchado)"
affects: [caja, arqueo]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Filtro Tipo client-side con kind → tipo mapping; 'Cobros' agrupa los kinds de socio"
    - "Helper validationLabel/validationColor con fallback al valor crudo (campo tipado string, coherente con TransactionListItem)"

key-files:
  created: []
  modified:
    - el-templo-admin/src/components/caja/MovEgresosTab.vue
    - el-templo-admin/src/types/transaction.ts

key-decisions:
  - "FE MovEgresoItem actualizado al shape del plan 05 (kind string ensanchado, memberId, validationStatus) en vez de castear ad-hoc"
  - "validationStatus tipado string (no union) por coherencia con TransactionListItem; helper mapea por valor con fallback"
  - "corregido (4o estado del enum, no especificado en el plan) → grey-6 / 'Corregido'"
  - "refund cuenta como egreso: kindColor negative + signo '−'; cash_transfer queda sin signo (narrativa en Concepto)"

patterns-established:
  - "Arqueo por caja en UI: un solo filtro Tipo cubre cobros + egresos + traspasos + ajustes; estado marcado por fila"

requirements-completed: [ARQUEO-02, ARQUEO-03]

# Metrics
duration: 12min
completed: 2026-06-26
---

# Phase 146 Plan 06: Filtro Cobros + marca de estado en arqueo por caja Summary

**En "Movimientos de caja" (MovEgresosTab) el filtro Tipo suma la opción "Cobros" (plan_charge/debt_settlement/advance_payment/refund, los kinds de socio que ahora trae el backend del plan 05) y cada fila marca su `validationStatus` con un badge de estado (pendiente/observado/corregido/validado) en una columna nueva "Estado" y en el detail dialog — el arqueo por caja se vuelve operable desde la UI.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-06-26
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- `tipoOptions` suma `{ label: 'Cobros', value: 'cobros' }`; `filteredRows` mapea `tipo==='cobros'` a `COBRO_KINDS = [plan_charge, debt_settlement, advance_payment, refund]`.
- `KIND_LABELS` ampliado con etiquetas ES de los kinds de cobro ("Cobro de plan", "Pago de saldo", "Cobro suelto", "Reintegro"); `kindColor` los pinta positive (refund negative).
- Helpers `validationLabel` / `validationColor` (pendiente=warning, validado=positive, observado=info, corregido=grey-6); badge renderizado en la columna "Estado" y en el detail dialog.
- FE `MovEgresoItem` (`src/types/transaction.ts`) sincronizado con el backend del plan 05: `kind` string ensanchado, `memberId: number | null`, `validationStatus: string`.
- `isEgreso` incluye `refund` para el signo "−" rojo; `cash_transfer` queda sin signo.
- Sin tocar el filtro de caja/período ni la pestaña "Transacciones" (MovimientosTab).

## Deviations from Plan

None of the auto-fix rules triggered structural changes — plan executed as written. Decisiones de detalle (estado `corregido` no especificado, refund como egreso, type sync del FE) registradas en `.planning/AUTONOMOUS-DECISIONS-v5.3.md` (Fase 146/146-06).

## Verification

- **vue-tsc (admin):** 0 errores en los archivos tocados (MovEgresosTab.vue, types/transaction.ts). Los 23 errores del proyecto son pre-existentes en archivos no relacionados (AssignPlanDialog, BandejaPendientesTab, DeudasPage, HorariosPage, treemap, sessions, etc.).
- **Build:** no se corrió `pnpm build` completo (typecheck local cubre el contrato; per workflow del proyecto los tests/builds full corren en CI al pushear a staging). El cambio es type-clean y aislado.

## Self-Check: PASSED

- `el-templo-admin/src/components/caja/MovEgresosTab.vue` — FOUND
- `el-templo-admin/src/types/transaction.ts` — FOUND
- Commit `2c0414d5` — FOUND

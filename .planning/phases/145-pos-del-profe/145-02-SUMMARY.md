---
phase: 145-pos-del-profe
plan: 02
subsystem: payments
tags: [finance, cobro-suelto, pending-tray, bandeja, quasar, vue, pos, cobro-02]

# Dependency graph
requires:
  - phase: 145-pos-del-profe
    provides: "Columna misc_reason enum('sin_plan','otro') NULL en financial_transactions (145-01, migración 0159); cobro suelto persiste miscReason"
provides:
  - "miscReason expuesto en cada fila de listPendingTray (bandeja de Pendientes)"
  - "Chip 'Sin plan — asignar' navegable en BandejaPendientesTab.vue para filas con miscReason='sin_plan'"
affects: [146-imputacion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mirror manual del tipo PendingTrayItem API↔admin mantenido sincronizado al agregar campos"
    - "Acción contextual (chip navegable) dentro del slot de una celda existente en vez de columna nueva, para no ensanchar la grilla"

key-files:
  created:
    - .planning/phases/145-pos-del-profe/145-02-SUMMARY.md
  modified:
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-admin/src/types/transaction.ts
    - el-templo-api/test/finance/pending-tray.test.ts
    - el-templo-admin/src/components/caja/BandejaPendientesTab.vue

key-decisions:
  - "Chip dentro del slot #body-cell-socio (no columna nueva) reusando goToMember — preferencia explícita del plan."
  - "Visibilidad del chip condicionada a miscReason==='sin_plan' && memberId (guard contra navegación a /alumnos/null)."

patterns-established:
  - "Al agregar un campo a PendingTrayItem, espejar el tipo en el mirror manual del admin en el mismo commit."

requirements-completed: [COBRO-02]

# Metrics
duration: ~12min
completed: 2026-06-26
---

# Phase 145 Plan 02: Bandeja de Pendientes — chip "Sin plan — asignar" (COBRO-02)

**`listPendingTray` expone `miscReason` en cada fila y la bandeja muestra un chip "Sin plan — asignar" navegable (→ ficha del alumno) en los cobros sueltos con motivo `sin_plan`.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `PendingTrayItem` (API + mirror admin) declara `miscReason: 'sin_plan' | 'otro' | null`.
- `listPendingTray` agrega `miscReason: schema.financialTransactions.miscReason` al `.select({...})` de la query principal y `miscReason: r.miscReason` al `.map()` de cada fila. El count query no se tocó.
- Test de integración en `pending-tray.test.ts`: un cobro suelto (`advance_payment`, pendiente) con `misc_reason='sin_plan'` aparece con `miscReason:'sin_plan'`; una fila `plan_charge` trae `miscReason:null`. `seedTrayRow` extendido con `kind`/`miscReason` opcionales. Suite completa: 6/6 verde contra MySQL local.
- `BandejaPendientesTab.vue`: chip `q-chip` (dense, `warning`, ícono `person_add`, `sm`) dentro del slot `#body-cell-socio`, visible sólo cuando `row.miscReason==='sin_plan' && row.memberId`, que al click llama `goToMember(row.memberId)` → `/alumnos/:userId` (reusa la función existente, sin segundo `router.push`).

## Task Commits

1. **Task 1: Exponer miscReason en listPendingTray (+ tipos API/admin + test)** - `522f2f90` (feat)
2. **Task 2: Chip "Sin plan — asignar" navegable en la bandeja** - `7fa0782f` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/finance/types.ts` - `PendingTrayItem.miscReason: "sin_plan" | "otro" | null`.
- `el-templo-api/src/modules/finance/transaction-service.ts` - `miscReason` en el select y en el map de `listPendingTray`.
- `el-templo-admin/src/types/transaction.ts` - mirror `PendingTrayItem.miscReason: 'sin_plan' | 'otro' | null`.
- `el-templo-api/test/finance/pending-tray.test.ts` - `PendingTrayRow.miscReason`; `seedTrayRow` con `kind`/`miscReason`; test COBRO-02.
- `el-templo-admin/src/components/caja/BandejaPendientesTab.vue` - chip "Sin plan — asignar" en el slot del socio.

## Verification

- `cd el-templo-api && pnpm exec tsc --noEmit` → EXIT 0.
- `pnpm test test/finance/pending-tray.test.ts` → 6/6 passed (42.5s, MySQL local).
- `npx vue-tsc --noEmit` (admin): los archivos tocados no introducen errores nuevos. Único error en `BandejaPendientesTab.vue` es `onExportBandeja` (TS2339, línea 38), pre-existente y NO relacionado con este plan (ya documentado en 145-01).

## Decisions Made

- **Chip dentro del slot `#body-cell-socio`, no columna nueva** — preferencia explícita del plan; evita ensanchar una grilla ya densa. Reusa `goToMember`.
- **Visibilidad `miscReason==='sin_plan' && memberId`** — el guard de `memberId` evita un chip que navegaría a `/alumnos/null`.

Registradas en `.planning/AUTONOMOUS-DECISIONS-v5.3.md` (sección Fase 145 → 145-02).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `vue-tsc --noEmit` del admin reporta un error pre-existente en `BandejaPendientesTab.vue` (`onExportBandeja`, TS2339, línea 38) en código NO tocado por este plan. Fuera de scope (SCOPE BOUNDARY); ya estaba documentado en el SUMMARY de 145-01. El typecheck del API pasa entero.

## TDD Gate Compliance

Tasks `type="auto"` sin `tdd="true"`; no aplica el gate RED/GREEN. El test de integración de Task 1 se agregó junto al cambio de servicio.

## Self-Check: PASSED

- Archivos modificados verificados en disco.
- Commits `522f2f90` / `7fa0782f` presentes en el historial.

---

_Phase: 145-pos-del-profe_
_Completed: 2026-06-26_

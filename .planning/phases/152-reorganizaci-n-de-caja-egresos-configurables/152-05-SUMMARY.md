---
phase: 152-reorganizaci-n-de-caja-egresos-configurables
plan: 05
subsystem: admin-caja-ui
tags: [caja, validation, filter, drill-down, frontend-only, dry]
requires:
  - "152-03 (GET /transactions expone validationStatus/validatedAt/validatorName + filtro ?validationStatus=)"
  - "152-02 (reorganización de tabs de Caja: Movimientos portada + Historial de cobros)"
provides:
  - "DateRangeFilter.vue compartido (mes↔días) con contrato { dateFrom, dateTo } (D-03)"
  - "chip de estado validada/pendiente por fila en el Historial de cobros (CAJA-02)"
  - "filtro server-side todas/validadas/pendientes en el Historial de cobros (CAJA-03/D-04)"
  - "validador+fecha en el detalle con rama 'Validado al registrar' (CAJA-04/D-06)"
affects:
  - "el-templo-admin/src/components/caja/MovimientosTab.vue"
  - "el-templo-admin/src/components/caja/MovEgresosTab.vue"
tech-stack:
  added: []
  patterns:
    - "Control de fecha compartido v-model { dateFrom, dateTo } idéntico en modo mes y modo días (DRY)"
    - "Filtro por estado server-side (query param) por lista paginada, no client-side (D-04)"
    - "Rama D-06: validatorName === null distingue 'Validado al registrar' de 'Validado por X'"
key-files:
  created:
    - "el-templo-admin/src/utils/date-range.ts"
    - "el-templo-admin/src/components/caja/DateRangeFilter.vue"
    - "el-templo-admin/src/utils/validation-status.ts"
  modified:
    - "el-templo-admin/src/components/caja/MovEgresosTab.vue"
    - "el-templo-admin/src/components/caja/MovimientosTab.vue"
    - "el-templo-admin/src/types/transaction.ts"
    - "el-templo-admin/src/composables/useTransactionsApi.ts"
decisions:
  - "Extraído date-range.ts (monthToRange/currentMonthRange) + DateRangeValue: la lógica de mes estaba byte-duplicada en ambos tabs; el control compartido y ambos parents la consumen (DRY)"
  - "Extraído validation-status.ts (validationLabel/validationColor) desde MovEgresosTab e importado por ambos tabs (DRY, recomendado por el plan)"
  - "El filtro por estado NO agrega loads: onDateRangeChange/onFilterChange reusan el mismo reset-a-página-1 + reload"
  - "DateRangeFilter no emite en mount: los parents siembran el mes corriente con currentMonthRange() para que el load inicial sea idéntico al previo (mínimo riesgo de regresión)"
metrics:
  duration: ~12min
  completed: 2026-07-04
requirements: [CAJA-02, CAJA-03, CAJA-04]
---

# Phase 152 Plan 05: Historial de cobros — estado por fila, filtro y validador Summary

El Historial de cobros (`MovimientosTab`) consume el read path del validador de 152-03: cada fila muestra un chip validada/pendiente (CAJA-02), un filtro single-select todas/validadas/pendientes envía `validationStatus` server-side (CAJA-03/D-04, la tabla es paginada), y el detalle distingue el cobro validado por la bandeja (validador+fecha) del nacido validado ("Validado al registrar", CAJA-04/D-06). Se extrajo un control de fecha compartido `DateRangeFilter.vue` (mes default con toggle a rango por días, D-03) usado por ambos tabs, cerrando la duplicación byte-idéntica del bloque `selectedMonth`/`dateRange`.

## What Was Built

- **Task 1 — DateRangeFilter compartido + tipos del validador** (`948a1d5b`): nuevo `DateRangeFilter.vue` con `q-btn-toggle` Por mes / Por día; en modo mes replica el `dateRange` computed anterior (`type="month"`), en modo días expone dos `type="date"` (Desde/Hasta); ambos modos emiten el MISMO contrato `{ dateFrom, dateTo }` vía `update:modelValue` para que los loaders no cambien. La lógica de mes se extrajo a `utils/date-range.ts` (`monthToRange`/`currentMonthRange` + `DateRangeValue`) — estaba byte-duplicada en los dos tabs. `MovEgresosTab` reemplazó su bloque `selectedMonth`/`dateRange` por `<DateRangeFilter>` + `dateRange` ref + `onDateRangeChange`. `types/transaction.ts`: nuevo `ValidationStatus` (4 valores, espejo del backend) + `validationStatus`/`validatedAt`/`validatorName` en `TransactionListItem` + `validationStatus?: 'validado'|'pendiente'` en `TransactionListParams`.
- **Task 2 — chip + filtro + drill-down en MovimientosTab** (`2e0a7973`): `validationLabel`/`validationColor` extraídos a `utils/validation-status.ts` e importados por AMBOS tabs (DRY; `MovEgresosTab` perdió su copia inline). `MovimientosTab` ganó: columna/celda `#body-cell-estado` con `q-badge` (CAJA-02), `filters.estado` + `ESTADO_OPTIONS` single-select todas/validadas/pendientes que pasa `validationStatus` a `loadTransactions` (server-side, D-04), y `<DateRangeFilter>` reemplazando el input de mes (CAJA-03).
- **Task 3 — validador en el detalle** (`a9bfb6a7`): en el dialog de detalle, tras "Registrado por", dos ramas: si `validatorName` presente → "Validado por {validatorName}" + `formatDate(validatedAt)` (D-05); si nació validado (`validationStatus==='validado'` sin `validatorName`) → literal "Validado al registrar" + `recorderName` + `formatDate(createdAt)` (D-06). No se muestra el bloque si el estado no es validado.

## Verification

- `npx vue-tsc --noEmit` en el-templo-admin: sin errores en ninguno de los 7 archivos del plan (verificado por task). Los errores de tsc en otros archivos (test files sin `vitest`, charts, `session-pdf-builder`, etc.) son PREEXISTENTES y ajenos a este plan — mismos que 152-02 registró (SCOPE BOUNDARY).
- `grep -c "Validado al registrar" MovimientosTab.vue` == 1 (el comentario se reformuló para no duplicar el literal).
- Contrato `{ dateFrom, dateTo }` idéntico en modo mes y días; `loadTransactions`/`loadHistory` no cambiaron su firma.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking / DRY] Extracción de `utils/date-range.ts` (archivo extra)**

- **Found during:** Task 1
- **Issue:** El plan lista 5 archivos modificados pero el control compartido necesita que AMBOS parents siembren el mes corriente por su cuenta (no puedo importar una función del `<script setup>` del componente). Duplicar la lógica de mes en 3 lugares (componente + 2 tabs) contradice CLAUDE.md (DRY agresivo).
- **Fix:** Nuevo `src/utils/date-range.ts` con `monthToRange`/`currentMonthRange` + `DateRangeValue`, consumido por el componente y ambos tabs. Única fuente de la lógica de mes.
- **Files modified:** `el-templo-admin/src/utils/date-range.ts` (nuevo)
- **Commit:** `948a1d5b`

**2. [Discreción del plan] `MovEgresosTab.vue` tocado en Task 2**

- **Found during:** Task 2
- **Issue:** El plan recomienda extraer el mapa de estados a `validation-status.ts` e importarlo en "ambos tabs", pero lista solo `MovimientosTab.vue` en los files de Task 2.
- **Fix:** `MovEgresosTab` cambió su mapa inline por el import del util (swap de ~17 líneas por 1 import). Coherente con la intención del plan (DRY) y con `key_link` del plan.
- **Files modified:** `el-templo-admin/src/components/caja/MovEgresosTab.vue`
- **Commit:** `2e0a7973`

**3. [Nota] `useTransactionsApi.ts` — sin cambio de código funcional**

- **Found during:** Task 1
- **Issue:** El plan pide "agregar el param `validationStatus` al método de listado". `listTransactions` reenvía el objeto `params` tipado directo a axios, así que el param fluye por el tipo `TransactionListParams` (editado en `types.ts`) sin código nuevo.
- **Fix:** Se agregó `validationStatus` a `TransactionListParams` (capacidad real) + un JSDoc en `listTransactions` documentando el filtro. Sin lógica nueva en el composable (no era necesaria).
- **Files modified:** `el-templo-admin/src/composables/useTransactionsApi.ts`, `el-templo-admin/src/types/transaction.ts`
- **Commit:** `948a1d5b`

## Threat Model Compliance

- **T-152-12** (Tampering, filtro validationStatus desde la UI): mitigado — la UI solo ofrece todas/validadas/pendientes (`ESTADO_OPTIONS`); el valor lo valida el enum del querystring server-side (152-03).
- **T-152-13** (Info Disclosure, validatorName): aceptado — la Caja es admin/owner-only (149 D-04, 150 D-12); validatorName es staff.
- **T-152-SC** (installs): aceptado — este plan no instaló paquetes.

## Notes for Downstream Plans

- El `DateRangeFilter` (`{ dateFrom, dateTo }`, prop `monthLabel`) es reutilizable por cualquier otro tab/reporte que hoy tenga un `type="month"` inline.
- `validation-status.ts` es el punto único para labels/colores de estado; si un plan futuro agrega un 5º estado, se toca solo ahí.
- El detalle de MovEgresosTab NO recibió la rama del validador (su `MovEgresoItem` no trae `validatedAt`/`validatorName`); si se pide, replicar el patrón de Task 3 tras extender el backend `movements-history`.

## Self-Check: PASSED

- `el-templo-admin/src/utils/date-range.ts` — FOUND
- `el-templo-admin/src/components/caja/DateRangeFilter.vue` — FOUND
- `el-templo-admin/src/utils/validation-status.ts` — FOUND
- `el-templo-admin/src/components/caja/MovEgresosTab.vue` — FOUND
- `el-templo-admin/src/components/caja/MovimientosTab.vue` — FOUND
- `el-templo-admin/src/types/transaction.ts` — FOUND
- `el-templo-admin/src/composables/useTransactionsApi.ts` — FOUND
- Commits `948a1d5b` (T1), `2e0a7973` (T2), `a9bfb6a7` (T3) — FOUND
- `npx vue-tsc --noEmit` sin errores nuevos en los archivos del plan

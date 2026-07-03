---
phase: 150-cuentas-bancarias-flexibles
plan: 05
subsystem: finance
tags: [cash-registers, bank-accounts, admin-ui, vue, quasar, tab, withdrawal]
requires:
  - phase: 150-04
    provides: "CuentaBancariaFormDialog.vue reutilizable + 5 métodos API (list/create/update/close/reactivate)"
  - phase: 150-03
    provides: "5 endpoints HTTP del ABM bajo /api/admin/finance/cash-registers (guard admin/owner)"
  - phase: 150-01
    provides: "Migración 0163 (columnas bancarias + seed centro de costo 'Retiros')"
provides:
  - "Tab 'Cuentas' montado en CajaPage con listado ABM (activas + cerradas atenuadas)"
  - "Acciones por fila: editar / cerrar (warning saldo firme D-06) / reactivar / registrar retiro"
  - "Prefill de retiro en RegistrarMovEgresoDialog (centro 'Retiros' + caja preseleccionados, D-10)"
  - "cuentas agregado a CAJA_TABS / CAJA_TAB_NAMES"
affects:
  - "el-templo-admin fase 152 (reordena tabs de Caja + estado por fila)"
  - "el-templo-admin fase 151 (COBRO-04 asocia cuenta bancaria en el flujo de cobro)"
tech-stack:
  added: []
  patterns:
    - "Tab de listado patrón SaldosPorCajaTab (defineProps selectedCountry/isOwner, load con try/catch+notify, onMounted+watch+onUnmounted cleanup)"
    - "Prefill opcional de dialog vía props nullable (onShow tras cargar cajas+centros, preselección por name/id sin romper el uso sin prefill)"
key-files:
  created:
    - "el-templo-admin/src/components/caja/CuentasTab.vue"
  modified:
    - "el-templo-admin/src/pages/CajaPage.vue"
    - "el-templo-admin/src/constants/caja.ts"
    - "el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue"
key-decisions:
  - "Prefill de retiro por props nullable en RegistrarMovEgresoDialog — sin prefill el comportamiento es idéntico al previo (no rompe egresos normales)"
  - "Botón 'Registrar retiro' por fila del ABM (Claude's Discretion, D-10)"
  - "Orden del tab 'Cuentas' NO optimizado — fase 152 reordena los tabs de Caja (Claude's Discretion)"
patterns-established:
  - "Prefill opcional de dialog: props nullable resueltas en onShow tras cargar catálogos, preselección por name/id"
requirements-completed: [CTA-01, CTA-02, CTA-03]
duration: ~10min
completed: 2026-07-03
---

# Phase 150 Plan 05: Cuentas Bancarias Flexibles — Tab 'Cuentas' en Caja + retiro prellenado Summary

**Tab "Cuentas" montado en CajaPage con el ABM completo de cuentas bancarias flexibles (crear/editar/cerrar con warning de saldo firme/reactivar, cerradas atenuadas) y acción "Registrar retiro" por fila que preselecciona el centro 'Retiros' y la caja en RegistrarMovEgresoDialog.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-03
- **Tasks:** 2 auto + 1 checkpoint (human-verify, aprobado)
- **Files modified:** 4 (1 creado, 3 modificados)

## Accomplishments

- Cierra la superficie visual del ABM de cuentas bancarias flexibles: el owner administra cuentas desde Caja sin tocar la base (levanta CAJA-F1 de v5.3).
- CTA-01 (crear desde la UI), CTA-02 (cerrar/reactivar con baja lógica + warning de saldo firme D-06 y cerradas atenuadas D-07) y CTA-03 (retiro del dueño con centro 'Retiros' preseleccionado, D-10) completados dentro de Caja (D-11).
- Prefill genérico de `RegistrarMovEgresoDialog` reutilizable por futuras superficies (props nullable, no invasivo).

## Task Commits

1. **Task 1: Prefill de retiro en RegistrarMovEgresoDialog.vue** — `88849a50` (feat)
2. **Task 2: CuentasTab.vue (ABM) + wiring en CajaPage/constants** — `131f8a95` (feat)
3. **Task 3: Checkpoint human-verify (verificación visual del ABM y del retiro)** — APROBADO por el usuario ("approved")

## Files Created/Modified

- `el-templo-admin/src/components/caja/CuentasTab.vue` (creado, 263 líneas) — Listado ABM: llama `listBankAccounts()`, renderiza activas + cerradas (atenuadas D-07), acciones editar/cerrar/reactivar/"Registrar retiro" + "Nueva cuenta"; cierre con `row.balance !== 0` muestra el saldo FIRME (con moneda) y advertencia pero permite confirmar (D-06); no suma pendiente al firme (CAJA-03); monta `CuentaBancariaFormDialog` y `RegistrarMovEgresoDialog`; `onUnmounted(cleanup)`.
- `el-templo-admin/src/pages/CajaPage.vue` (modificado, +7) — `<q-tab>` "Cuentas" (icon `account_balance`) + `<q-tab-panel>` con `<CuentasTab :selected-country :is-owner>`, import en `<script setup>`.
- `el-templo-admin/src/constants/caja.ts` (modificado, +2) — `cuentas` agregado a `CAJA_TABS` y `CAJA_TAB_NAMES`.
- `el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue` (modificado, +22/-3) — Props opcionales `prefillTab?/prefillCajaId?/prefillCostCenterName?`; en `onShow` (tras cargar cajas+centros) preselecciona centro por name e ID de caja; sin prefill, comportamiento idéntico al previo.

## Decisions Made

- **Prefill por props nullable** en `RegistrarMovEgresoDialog`: resueltas en `onShow` tras cargar catálogos; sin props de prefill, el dialog de egresos normal no cambia (defaults preservados).
- **Botón "Registrar retiro" por fila** del ABM (Claude's Discretion, D-10).
- **Orden del tab "Cuentas" no optimizado** — la fase 152 reordena los tabs de Caja (Claude's Discretion).

## Deviations from Plan

None — plan executed exactly as written.

Los errores TS pre-existentes de `src/utils/pdf/*` (tipos de `@types/pdfmake`) son fuera de scope, no causados por este plan, y ya están registrados en `deferred-items.md`.

## Threat Model Compliance

- **T-150-13** (elevation — acceso al tab "Cuentas"): aceptado — el gating de nav es UX; la autorización real la imponen los endpoints admin/owner del plan 03. Verificado en UAT paso 8 (empleado no accede a Caja/Cuentas).
- **T-150-14** (repudiation — cierre con saldo≠0): mitigado — el `$q.dialog` de confirmación muestra el saldo FIRME y la advertencia antes de cerrar (D-06); la baja lógica conserva el historial.
- **T-150-15** (tampering — retiro preseleccionado): mitigado — el prefill solo preselecciona valores; el egreso pasa por `registerExpense`, que valida centro activo y caja en el backend (fases 137/139).

## Known Stubs

Ninguno. `CuentasTab.vue` está cableado a los 5 métodos reales del composable (endpoints del plan 03); el retiro monta el dialog de egresos real que impacta el saldo.

## Issues Encountered

None.

## Checkpoint (Task 3)

`checkpoint:human-verify` (gate=blocking) — verificación visual del ABM de cuentas y del retiro. El usuario respondió **"approved"**: creación sin campo Nombre, regla uno-de-dos (guardar deshabilitado sin CBU/CVU ni Alias), moneda deshabilitada en edición (D-04), cierre con warning de saldo firme + atenuado (D-06/D-07), reactivación, retiro prellenado con centro 'Retiros' + caja que impacta el saldo (CTA-03) y RBAC (empleado sin acceso) verificados.

## Next Phase Readiness

- Fase 150 (Cuentas bancarias flexibles) COMPLETA (5/5). Cuentas bancarias existentes disponibles para COBRO-04 (fase 151) y para el reorden de tabs + estado por fila (fase 152).
- Sin blockers.

## Self-Check: PASSED

- FOUND: el-templo-admin/src/components/caja/CuentasTab.vue
- FOUND: el-templo-admin/src/pages/CajaPage.vue (q-tab "Cuentas" + CuentasTab)
- FOUND: el-templo-admin/src/constants/caja.ts (cuentas en CAJA_TABS/CAJA_TAB_NAMES)
- FOUND: el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue (props prefill)
- FOUND commit: 88849a50 (Task 1)
- FOUND commit: 131f8a95 (Task 2)

---

_Phase: 150-cuentas-bancarias-flexibles_
_Completed: 2026-07-03_

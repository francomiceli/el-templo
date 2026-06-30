---
phase: 146-caja-validaci-n-e-imputaci-n-fundacional
plan: 04
subsystem: admin/caja
tags: [caja, validacion, imputacion, bandeja-pendientes, frontend]
requires:
  - "146-02: POST /transactions/:id/validate acepta cashRegisterId? + bloqueo server-side de sin_plan"
  - "useTransactionsApi.getCashRegisterBalances (REP-02) como fuente de cajas"
  - "145: chip 'Sin plan — asignar' (COBRO-02) ya presente en la bandeja"
provides:
  - "validateTransaction(id, cashRegisterId?) — el composable puede enviar la caja elegida"
  - "Selector de caja al validar en BandejaPendientesTab (CAJA-02/CAJA-03 lado UI)"
  - "Bloqueo del botón Validar para miscReason='sin_plan' (COBRO-05 lado UI)"
affects:
  - "el-templo-admin/src/components/caja/BandejaPendientesTab.vue"
  - "el-templo-admin/src/composables/useTransactionsApi.ts"
tech-stack:
  added: []
  patterns:
    - "q-dialog template propio (patrón Observar/Corregir/Anular) en vez de $q.dialog programático para hostear un q-select"
    - "Mensaje de error del backend surfaced vía transactionsApi.error.value (extractError ya lo volcó)"
key-files:
  created: []
  modified:
    - "el-templo-admin/src/composables/useTransactionsApi.ts"
    - "el-templo-admin/src/components/caja/BandejaPendientesTab.vue"
    - ".planning/AUTONOMOUS-DECISIONS-v5.3.md"
decisions:
  - "transfer/card → cuentas banco; cash → efectivo; otros → todas las cajas de la moneda (filtro guía; el server valida coherencia igual)"
  - "Doble barrera COBRO-05: botón :disable + guard temprano en onValidar"
  - "Error 400 del backend surfaced con transactionsApi.error.value (no err.message de axios)"
metrics:
  duration: ~15min
  completed: 2026-06-26
requirements: [CAJA-02, CAJA-03, COBRO-05]
---

# Phase 146 Plan 04: Selector de caja al validar + bloqueo del Validar para sin_plan (FE) Summary

FE de la bandeja de pendientes: al validar un cobro, gestión confirma o cambia la **caja imputada** (incluida la cuenta banco Galicia / Mercado Pago para transferencias) mediante un selector que envía `cashRegisterId` al endpoint de validación; y el botón **Validar** queda bloqueado para los cobros marcados `miscReason='sin_plan'`, redirigiendo al chip "Sin plan — asignar" (fase 145).

## Tasks Completed

### Task 1 — `validateTransaction(id, cashRegisterId?)` en el composable (`c04c9eae`)

- `useTransactionsApi.validateTransaction` ahora acepta un segundo arg opcional `cashRegisterId`.
- Se construye el body sólo con la clave cuando está definida (`if (cashRegisterId !== undefined)`) → retrocompat con el validar sin caja (omite la clave, el backend conserva la caja sugerida).
- Tipo de retorno y demás firmas del composable sin cambios.

### Task 2 — Selector de caja al validar + bloqueo del Validar (`f15acecc`)

- **Selector de caja (CAJA-02/CAJA-03):** se reemplazó el `$q.dialog` programático de `onValidar` por un `q-dialog` template propio con un `q-select`. `cajaOptions` (computed) filtra las cajas activas por la **moneda** de la fila (nunca cross-currency) y las acota por medio de pago: `transfer`/`card` → `type==='banco'` (Galicia / Mercado Pago); `cash` → `type==='efectivo'`; otros medios → todas las cajas de la moneda. La caja sugerida (`row.cashRegisterId`) arranca pre-seleccionada. El label del selector es "Cuenta banco" para transferencias, "Caja" en otros casos.
- Al confirmar, llama `validateTransaction(row.id, selectedCajaId)` y refresca la bandeja. Si el backend devuelve 400 (moneda incoherente / sin_plan), se muestra el mensaje del server con `$q.notify` negative (vía `transactionsApi.error.value`).
- **Bloqueo COBRO-05:** el botón Validar es `:disable` para `miscReason==='sin_plan'` con `q-tooltip` "Asigná un plan para imputar este cobro"; `onValidar` además tiene un guard temprano `if (row.miscReason === 'sin_plan') return`. El chip "Sin plan — asignar" sigue visible y navega a la ficha.
- `loadCashRegisters` (reusa `getCashRegisterBalances`) se carga en mount y al cambiar de país; si falla sólo loguea (no bloquea la bandeja).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `card` también mapea a cuentas banco**

- **Found during:** Task 2
- **Issue:** El plan sólo especificaba `transfer → banco`. Las tarjetas (`card`) también liquidan en cuenta banco; mostrar cajas de efectivo para un pago con tarjeta dejaría elegir una caja incoherente.
- **Fix:** El filtro de `cajaOptions` agrupa `transfer` y `card` → `type==='banco'`.
- **Files modified:** `el-templo-admin/src/components/caja/BandejaPendientesTab.vue`
- **Commit:** `f15acecc`
- Defensa en profundidad: el backend (plan 02) valida la coherencia igual con 400.

Todas las decisiones quedaron registradas en `.planning/AUTONOMOUS-DECISIONS-v5.3.md` (sección 146-04).

## Verification

- `cd el-templo-admin && pnpm build` — **verde** tras Task 1 y tras Task 2.
- No se corrieron tests locales (corren en CI al pushear a staging; esto es FE puro, sin rutas API nuevas).
- Threat model: T-146-12 (caja de moneda incorrecta) mitigado por el filtro `currency` del selector + 400 del backend; T-146-13 (validar sin_plan) mitigado por el botón `:disable` + guard + 400 del backend.

## Self-Check: PASSED

- `el-templo-admin/src/composables/useTransactionsApi.ts` — FOUND (modified)
- `el-templo-admin/src/components/caja/BandejaPendientesTab.vue` — FOUND (modified)
- Commit `c04c9eae` (Task 1) — FOUND
- Commit `f15acecc` (Task 2) — FOUND

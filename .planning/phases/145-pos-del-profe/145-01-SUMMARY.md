---
phase: 145-pos-del-profe
plan: 01
subsystem: payments
tags: [finance, coach-load, cobro-suelto, drizzle, mysql-enum, quasar, vue, pos]

# Dependency graph
requires:
  - phase: 140-carga-nica-que-propaga-cobro-suelto-rol-profe
    provides: coach-load plugin (POST /coach-load/misc, autocompletar con outstanding), CargarPagoPage.vue, useFinanceLoadApi
provides:
  - "Columna estructurada misc_reason enum('sin_plan','otro') NULL en financial_transactions (migración 0159)"
  - "POST /coach-load/misc valida y persiste miscReason (enum requerido) en misc_reason, NO en notes"
  - "Aviso de deuda (monto + plan) en la PoS visible en ambos modos (Pago de plan / Cobro suelto)"
  - "Dropdown Motivo (Sin plan activo / Otro) en el cobro suelto"
affects: [146-imputacion, 145-02-pendientes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Campo estructurado (columna propia) para el motivo del cobro suelto en vez de texto libre en notes"
    - "Cargar autocompletar en ambos modos de la PoS: renew pre-llena monto, misc sólo alimenta el banner de deuda"

key-files:
  created:
    - el-templo-api/src/db/migrations/0159_misc_reason.sql
  modified:
    - el-templo-api/src/db/schema/financial-transactions.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/coach-load-routes.ts
    - el-templo-api/test/finance/coach-load.test.ts
    - el-templo-admin/src/composables/useFinanceLoadApi.ts
    - el-templo-admin/src/pages/CargarPagoPage.vue

key-decisions:
  - "La moneda del cobro suelto ahora sigue al plan del socio (autocompletar.currency, fallback ARS) porque el autocompletar se carga también en misc para el banner; antes misc era siempre ARS. A confirmar con Franco."
  - "Default del dropdown Motivo = 'sin_plan' (caso operativo principal); ref nullable pero arranca/resetea a 'sin_plan'."
  - "Banner de deuda fuera de los bloques de modo (depende sólo de autocompletar.outstanding) para que aplique idéntico a renew y misc."

patterns-established:
  - "Motivo estructurado: enum cerrado validado server-side (additionalProperties:false) → columna dedicada, nunca dentro de notes"

requirements-completed: [POS-01, COBRO-01]

# Metrics
duration: ~20min
completed: 2026-06-26
---

# Phase 145 Plan 01: PoS del profe — aviso de deuda + Motivo del cobro suelto

**Columna estructurada `misc_reason` + endpoint /coach-load/misc validado por enum, con aviso de deuda en ambos modos de la PoS y dropdown Motivo (Sin plan activo / Otro) en el cobro suelto.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-26T01:14:00Z (aprox)
- **Completed:** 2026-06-26T01:35:00Z (aprox)
- **Tasks:** 3
- **Files modified:** 7 (+1 creado)

## Accomplishments

- Migración hand-written 0159 que agrega `misc_reason` enum('sin_plan','otro') NULL a `financial_transactions` (AFTER `notes`), aplicada local; columna espejada en el schema Drizzle sin enum drift.
- `miscReason` threadeado de punta a punta: `CreateTransactionInput` → insert de `create()` → `CoachMiscLoadBody`/`coachMiscLoadSchema` (enum requerido) → handler POST /misc → composable `miscCharge` → form de la PoS.
- POS-01: banner de deuda (monto formateado + nombre de plan) visible en Pago de plan Y Cobro suelto, basado en `autocompletar.outstanding`, sin recargar el buscador y sobreviviendo el cambio de modo.
- COBRO-01: dropdown Motivo obligatorio en el cobro suelto, persistido como columna estructurada (no en notes), validado server-side.
- 3 tests de integración nuevos (persistencia de miscReason; body sin motivo → 400; enum inválido → 400) + actualización de los 4 payloads misc existentes. Suite `coach-load.test.ts`: 23/23 verde.

## Task Commits

1. **Task 1: Migración 0159 + columna misc_reason en el schema Drizzle** - `cf379194` (feat)
2. **Task 2: Persistir miscReason en el backend (input + create + endpoint /misc + tests)** - `82c35645` (feat)
3. **Task 3: Aviso de deuda (ambos modos) + dropdown Motivo en la PoS** - `dfd8344b` (feat)

## Files Created/Modified

- `el-templo-api/src/db/migrations/0159_misc_reason.sql` - ADD COLUMN misc_reason enum('sin_plan','otro') NULL AFTER notes (hand-written, sin `;` en comentarios).
- `el-templo-api/src/db/schema/financial-transactions.ts` - mysqlEnum("misc_reason", ["sin_plan","otro"]) → propiedad miscReason, tras notes.
- `el-templo-api/src/modules/finance/types.ts` - CreateTransactionInput.miscReason?: "sin_plan" | "otro" | null.
- `el-templo-api/src/modules/finance/transaction-service.ts` - insert .values: miscReason: input.miscReason ?? null.
- `el-templo-api/src/modules/finance/coach-load-routes.ts` - CoachMiscLoadBody.miscReason; schema enum requerido; handler pasa request.body.miscReason a create().
- `el-templo-api/test/finance/coach-load.test.ts` - readTx incluye miscReason; payloads misc actualizados; 3 tests nuevos.
- `el-templo-admin/src/composables/useFinanceLoadApi.ts` - CoachMiscChargeInput.miscReason: 'sin_plan' | 'otro' (forwardeado).
- `el-templo-admin/src/pages/CargarPagoPage.vue` - banner de deuda en ambos modos; q-select Motivo; ref miscReason; canConfirm/resetChargeFields/onModeChange/loadAutocompletar/onConfirm ajustados.

## Decisions Made

- **Moneda del cobro suelto sigue al plan del socio.** Al cargar `autocompletar` también en misc (necesario para el banner POS-01), `currencySymbol` y el `currency` enviado en `miscCharge` reflejan `autocompletar.currency` (fallback ARS). Antes misc era siempre ARS porque `autocompletar` quedaba null. Más correcto (socio EUR cobra en EUR) y reusa el patrón de renew; socio sin plan → sigue ARS. Registrado en AUTONOMOUS-DECISIONS-v5.3.md, a confirmar con Franco.
- **Default Motivo = 'sin_plan'**, ref nullable por pedido del plan pero arranca/resetea a 'sin_plan'; canConfirm igual exige que esté seteado.
- **Banner fuera de los bloques de modo** (depende sólo de `autocompletar?.outstanding > 0`) para aplicar idéntico a ambos modos sin duplicar markup.

## Deviations from Plan

None - plan executed exactly as written. (La nota sobre la moneda del cobro suelto es una consecuencia esperada de cargar autocompletar en miso modo, explícitamente pedido por el plan en POS-01; se registró como decisión, no como desviación.)

## Issues Encountered

- `vue-tsc --noEmit` del admin reporta errores TS pre-existentes en archivos NO tocados por este plan (session-pdf-builder.ts, DeudasPage.vue, HorariosPage.vue, BandejaPendientesTab.vue, etc.). Fuera de scope (SCOPE BOUNDARY). Los archivos tocados (CargarPagoPage.vue, useFinanceLoadApi.ts) compilan limpio. El typecheck del API (`tsc --noEmit`) pasa entero.

## User Setup Required

None - no external service configuration required. La migración 0159 ya se aplicó en la DB local; en prod se aplica en el deploy del merge a master (regla de migraciones compartidas).

## Next Phase Readiness

- La columna `misc_reason` queda disponible para la fase 146 (imputación) y la bandeja de Pendientes (145-02), que consumen el motivo estructurado.
- Pendiente (no bloqueante): UAT visual del banner de deuda + dropdown Motivo en `/cargar`. Tests completos corren en CI al pushear staging (no se corrió el suite entero local por regla de MEMORY).

## TDD Gate Compliance

Task 3 es `tdd="false"` (UI). Tasks 1-2 son `type="auto"` sin `tdd="true"`, no aplica gate RED/GREEN. Los tests de integración de Task 2 se agregaron junto al feature (no como gate previo).

## Self-Check: PASSED

- Archivos creados/modificados verificados en disco (migración 0159, CargarPagoPage.vue, SUMMARY).
- Commits cf379194 / 82c35645 / dfd8344b presentes en el historial.

---

_Phase: 145-pos-del-profe_
_Completed: 2026-06-26_

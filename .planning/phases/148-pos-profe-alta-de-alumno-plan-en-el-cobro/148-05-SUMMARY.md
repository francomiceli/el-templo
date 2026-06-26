---
phase: 148-pos-profe-alta-de-alumno-plan-en-el-cobro
plan: 05
subsystem: frontend (admin — PoS coach "Cargar pago")
tags:
  [
    pos-profe,
    alta-alumno,
    cargar-pago,
    plan-grid,
    dedup-dni,
    fixed-schedule,
    idempotency,
  ]
requires:
  - "148-02: POST /admin/finance/coach-load/alta — body { userId XOR (firstName,lastName,dni), branchId, planId, zero?, paymentMethod, amountReceived?, scheduleIds?, idempotencyKey }; response { subscription, transaction, createdMemberId, createdNew } (201) / { transaction } (200 idempotente)"
  - "useMembersApi.searchMembers + checkDuplicates({dni}) + getBranches (existentes)"
  - "useSubscriptionsApi.getPlans(true, { branchId }) (existente)"
  - "FixedSchedulePicker.vue (reusado sin editar)"
provides:
  - "useFinanceLoadApi.altaConPlan + tipos CoachAltaInput/CoachAltaResponse"
  - "CargarPagoPage.vue 3er modo 'Alta + plan' (panel inline, A1 de UI-SPEC)"
affects:
  - "UAT visual al cierre de fase (148-HUMAN-UAT)"
tech-stack:
  added: []
  patterns:
    - "Panel inline como 3er modo del q-btn-toggle (NO dialog — A1) reusando typeahead/payment buttons/sticky Confirmar/idempotencia"
    - "Plan grid por tier copiado de AssignPlanDialog (plansByTier + tierColor/tierLabel)"
    - "Monto autocalc por watcher [selectedPlan, paymentMethod, zeroPrice] (card→priceCreditCard, else zero?priceZero:priceRegular), editable, parcial→banner deuda"
    - "Dedup DNI on-blur (≥7 díg) vía checkDuplicates; banner gold + 'Usar ese alumno' (server es la autoridad en Confirmar)"
    - "createdNewTicketIds (Set reasignado) para el chip 'Nuevo' que sobrevive al re-fetch de mis-cargas"
key-files:
  created: []
  modified:
    - el-templo-admin/src/composables/useFinanceLoadApi.ts
    - el-templo-admin/src/pages/CargarPagoPage.vue
decisions:
  - "El chip Sede se ubica encima del form card (UI-SPEC layout), solo en modo alta; default = authStore.user.branchId, fallback a la 1ª sede accesible si no está en getBranches()."
  - "El monto se re-deriva por watcher al cambiar plan/medio/Zero y queda editable; el monto parcial (< precio) muestra la deuda como precio−pagado, no el monto pagado."
  - "El chip 'Nuevo' se resuelve por id de transacción (createdNew + transaction.id de la respuesta) en un Set, así sobrevive al refreshMyLoads() en vez de prepend manual — dedupe natural ante replay 200."
  - "newStudentValid exige nombre+apellido+DNI(≥7) para el alta-nuevo (espejo del XOR server-side); el banner dedup es UX, la autoridad es el endpoint en Confirmar."
metrics:
  duration: ~22min
  completed: 2026-06-26
---

# Phase 148 Plan 05: Frontend PoS coach — modo "Alta + plan" Summary

**One-liner:** El 3er modo **"Alta + plan"** dentro de `CargarPagoPage.vue` (panel inline, A1) — el profe elige sede, crea/elige alumno (dedup DNI on-blur), selecciona plan por tier con toggle Zero, precio auto por medio de pago (parcial→deuda), turnos solo para planes fixed, y Confirma un alta atómica idempotente que aparece en "Mis cargas" con badge Pendiente + chip Nuevo; más el método `altaConPlan` del composable.

## What Was Built

### Task 1 — altaConPlan + tipos en useFinanceLoadApi — `c4aa61b0`

- `CoachAltaInput` (espejo de `CoachAltaBody` del endpoint 148-02): `userId?` XOR `{ firstName, lastName, dni }` + `branchId` + `planId` + `zero?` + `paymentMethod` + `amountReceived?` + `scheduleIds?` + `notes?` + `idempotencyKey`.
- `CoachAltaResponse`: `subscription?` + `transaction` + `createdMemberId?` + `createdNew?` (en el 200 idempotente solo viene `{ transaction }`).
- `altaConPlan(body)` idéntica en forma a `payPlan`: `loading`/`error`, `api.post('/admin/finance/coach-load/alta', body)`, `extractError(err, 'No se pudo cargar. Reintentá.')`, re-throw, `catch (err: unknown)`, exportada en el return. Sin `any`.

### Task 2 — Modo 'alta': tab, sede, typeahead + alumno nuevo + dedup DNI — `e6e89d6c`

- `type Mode += 'alta'` y 3ª opción `{ label: 'Alta + plan', value: 'alta' }` en el `q-btn-toggle`.
- Chip **Sede** (`q-select dense outlined`) encima del card, solo en alta; default `authStore.user.branchId`, opciones de `membersApi.getBranches()`, fallback a la 1ª sede si la del profe no está accesible.
- **"+ Nuevo alumno"** en `#no-option` del typeahead (solo alta) → revela el mini-form **Nombre/Apellido/DNI** (sin email/teléfono) y limpia el socio.
- **DNI on-blur (≥7 díg)** → `checkDuplicates({ dni })`; match no-borrado por `dni` ⇒ banner gold (`bg-warning text-dark`) "Ya existe un alumno con ese DNI: {nombre}…" + **"Usar ese alumno"** (colapsa el mini-form y selecciona el existente).
- `resetAltaFields` cableado en `onMemberSelected`/`onModeChange`/`resetForm` (UI-SPEC mode-switch).

### Task 3 — Plan grid + Zero + precio por medio + turnos fixed + Confirmar — `64ab3eb0`

- **Plan grid** por tier (`getPlans(true, { branchId: sucursalId })`) reusando `plansByTier` + `tierColor`/`tierLabel`; filas `q-py-md clickable v-ripple`, seleccionada `active-class="bg-primary text-white"`; **skeleton** mientras carga y estado vacío "No hay planes activos para esta sede.".
- **Toggle "Precio Zero"** (`q-toggle`, color positive) bajo la grilla.
- **Turnos:** `FixedSchedulePicker` (reusado) SOLO si `selectedPlan.bookingMode==='fixed'` (`:required-count="classesPerWeek"`, `:allow-partial="false"`, `:multi-branch` por flag, `:available-branches` no-virtuales); flexible muestra el caption "Este plan reserva semana a semana — no se eligen turnos ahora.".
- **Medio de pago** (botones reusados) + **Monto autocalc** vía `watch([selectedPlan, paymentMethod, zeroPrice])`: `card→priceCreditCard`, else `zero?priceZero:priceRegular`; editable; `< precio` → banner gold "El alumno quedará deudor por {precio−pagado}.".
- **canConfirm** alta: `(member OR nombre+apellido+DNI(≥7)) AND sede AND plan AND método AND monto>0 AND (fixed⇒scheduleIds.length===classesPerWeek)`.
- **Confirmar** reusa el `currentIdempotencyKey` del ciclo existente, arma el body XOR (userId | alumno nuevo) + `scheduleIds` solo en fixed, llama `altaConPlan`, notify positive "Alumno y plan cargados — pendiente de validación", `refreshMyLoads()` + `resetForm()`. El ticket aparece con badge **Pendiente** + chip **Nuevo** (vía `createdNewTicketIds` por id de transacción, sobrevive al re-fetch). Error → notify "No se pudo cargar. Reintentá." reusando la MISMA key (idempotente).

## Verification Results

- `pnpm exec eslint` verde sobre `useFinanceLoadApi.ts` y `CargarPagoPage.vue` (sin errores; lint-staged reformateó en el commit).
- `pnpm run build` (quasar build, gate de CI para el admin) → **Build succeeded** (exit 0).
- Greps: `altaConPlan` ==2 en el composable; `'alta'` ==6, `check-duplicates|checkDuplicates|Nuevo alumno` ==3, `FixedSchedulePicker|altaConPlan|Precio Zero` ==5 en la página.
- Contrato alineado al endpoint 148-02 (path `/admin/finance/coach-load/alta`, body XOR + branchId/planId/zero/scheduleIds, response `createdNew`/`createdMemberId`). Sin `any`; `catch (err: unknown)`; logging vía `createLogger` (CLAUDE.md).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El `v-else` de "Cobro suelto" capturaba también el modo alta**

- **Found during:** Task 3
- **Issue:** El bloque misc era `<template v-else>` (renew/else), así que en modo `alta` renderizaba los inputs de cobro suelto (Monto/Concepto/Motivo).
- **Fix:** Se cambió a `v-else-if="mode === 'misc'"` y se agregó el bloque `v-else-if="mode === 'alta' && hasAlumnoContext"`.
- **Files modified:** el-templo-admin/src/pages/CargarPagoPage.vue
- **Commit:** 64ab3eb0

**2. [Rule 2 - Missing critical functionality] El medio de pago exigía `selectedMember` y bloqueaba el alta-nuevo**

- **Found during:** Task 3
- **Issue:** El bloque de medio de pago era `v-if="selectedMember && showPaymentMethods"`; en un alta con alumno nuevo (sin socio seleccionado) nunca aparecían los botones de pago ni el monto.
- **Fix:** Computed `hasAlumnoContext = selectedMember != null || (alta && showNewStudentForm)`; el gate pasó a `hasAlumnoContext && showPaymentMethods`, y `canConfirm`/`onConfirm` dejaron de exigir `selectedMember` en modo alta.
- **Files modified:** el-templo-admin/src/pages/CargarPagoPage.vue
- **Commit:** 64ab3eb0

## Threat Model Compliance

- T-148-17 (dedup DNI solo client-side): el banner gold es UX; la autoridad es el endpoint 148-02 en Confirmar (`checkDuplicates` server-side). ✓
- T-148-18 (doble-tap de Confirmar): `:disable="!canConfirm || submitting"` + `currentIdempotencyKey` reusada en retry (endpoint idempotente). ✓
- T-148-19 (precio/validationStatus desde el cliente): el cliente sugiere monto/Zero; el server deriva el precio (card→credit_card) y el status `pendiente` por rol coach. ✓
- T-148-SC (npm/pip installs): sin dependencias nuevas — solo Quasar + componentes in-repo (`FixedSchedulePicker`, patrones de `AssignPlanDialog`/`CargarPagoPage`). ✓

## Known Stubs

None — el modo alta queda funcional end-to-end contra el endpoint real (148-02). La grilla se alimenta de `getPlans`, los turnos de `FixedSchedulePicker`, el alumno de `searchMembers`/`checkDuplicates`/`getBranches`. No hay datos hardcodeados ni placeholders.

## Notes for Downstream Plans

- **UAT visual (148-HUMAN-UAT):** verificar en el admin (1) chip Sede con la sede del profe; (2) "+ Nuevo alumno" abre el mini-form y el DNI existente dispara el banner gold con "Usar ese alumno"; (3) plan fixed pide turnos (badge n/m); (4) tarjeta recalcula el monto a priceCreditCard; (5) monto parcial muestra el banner deuda; (6) Confirmar crea la carga con notify pendiente y el ticket sale con chip "Nuevo".
- Pendiente del tren v5.2/v5.3: este frontend viaja con la migración 0162 (`created_member_id`) del backend 148; se despliega con el milestone, no antes.

## Self-Check: PASSED

- FOUND: el-templo-admin/src/composables/useFinanceLoadApi.ts
- FOUND: el-templo-admin/src/pages/CargarPagoPage.vue
- FOUND commit c4aa61b0, e6e89d6c, 64ab3eb0

---
phase: 107-cobro-al-asignar-plan
plan: 05
subsystem: admin-frontend-ui
tags: [frontend, admin, vue, assign-plan-dialog, cobro, charge, ui]
requires:
  - "AssignPlanInput.amountReceived?: number (Plan 107-04)"
  - "RenewSubscriptionInput.amountReceived?: number (Plan 107-04)"
provides:
  - "Bloque Cobro en step Confirmar de AssignPlanDialog (D-01)"
  - "Pre-fill de amountReceived = chargeBase al entrar al step Confirmar (D-02)"
  - "Banner amarillo bg-yellow-1 cuando cobro parcial (D-03)"
  - "Cap superior + disable robusto del boton Confirmar cuando amountReceived > chargeBase o < 0 (D-04)"
  - "Bloque deshabilitado con leyenda 'Plan gratuito - sin cobro' cuando chargeBase = 0 (D-06)"
  - "chargeBase = netAmount cuando mode=change + startMode=now (D-07)"
  - "Payload de executeConfirm extendido con amountReceived (chargeBase===0 ? undefined : amountReceived ?? undefined)"
affects:
  - el-templo-admin/src/components/AssignPlanDialog.vue
tech_stack:
  added: []
  patterns:
    - "Quasar q-card flat bordered + bg-yellow-1 reutilizando el patron del banner bg-red-1 'Cambio no permitido' (L270-296)"
    - "computed<number>() para chargeBase / pendingBalance ; computed<boolean>() para isPartialCharge / isCobroInvalid"
    - "watch dual-source [step, chargeBase] para pre-fill idempotente (no sobrescribe si admin tipeo)"
    - "Forwarding generico de input en useSubscriptionsApi.ts (sin desestructuracion -> el campo nuevo fluye sin cambios)"
key_files:
  created: []
  modified:
    - el-templo-admin/src/components/AssignPlanDialog.vue
  verified_only:
    - el-templo-admin/src/composables/useSubscriptionsApi.ts
decisions:
  - "El bloque Cobro vive dentro del step Confirmar, debajo del summary y arriba del campo Notas (D-01)."
  - "El q-input de monto y el q-select de payment method estan en una grid 2-col (q-col-gutter-md) dentro del q-card 'Cobro' (D-01/D-05)."
  - "El watch dedicado [step, chargeBase] pre-llena amountReceived UNA vez (mientras este null). Si el admin retrocede al step 2 y vuelve, su valor previo se preserva."
  - "Para chargeBase === 0 los inputs siguen visibles pero :disable=true; la leyenda 'Plan gratuito - sin cobro' va en un bloque bg-grey-2 ARRIBA del input (D-06)."
  - "El boton Confirmar combina la condicion existente (changePlan no permitido) con isCobroInvalid via OR. Cuando chargeBase === 0, isCobroInvalid devuelve false y NO bloquea Confirmar (admin puede asignar boarding pass sin tipear nada)."
  - "useSubscriptionsApi.ts NO se modifico — verify-only. assignPlan, changePlan y renewSubscription pasan el input completo via api.post(url, input) sin desestructuracion, por lo que el campo amountReceived (ya tipado en AssignPlanInput / RenewSubscriptionInput desde Plan 107-04) fluye automaticamente."
  - "Tipado explicito en el callback del watch ([newStep, base]: [number, number]) para evitar implicit any cuando el typecheck corre sin node_modules. CLAUDE.md prohibe `any`."
metrics:
  duration_seconds: 1320
  completed_date: 2026-04-28
  tasks_completed: 2
  tasks_total: 3
  files_changed: 1
  files_verified: 1
requirements_completed:
  - CHARGE-01
  - CHARGE-02
checkpoint_status: deferred-to-merge
---

# Phase 107 Plan 05: AssignPlanDialog Cobro Block Summary

Refactor de `AssignPlanDialog.vue` (~1079 LOC -> ~1206 LOC) que materializa la cara visible de Phase 107: el admin tipea cuanto recibio en el step Confirmar, el dialog calcula el saldo pendiente en vivo, y un banner amarillo marca cobro parcial. Cumple D-01..D-07 con cambios localizados en el componente, sin tocar el composable (forwarding generico) y sin tocar el step 2.

## Tasks Completed

| Task | Name                                                                       | Commit     | Files                                                |
| ---- | -------------------------------------------------------------------------- | ---------- | ---------------------------------------------------- |
| 1    | Refactor AssignPlanDialog.vue — bloque Cobro + banner + disabled + payload | `23d5cef4` | `el-templo-admin/src/components/AssignPlanDialog.vue` |
| 2    | Verify-only useSubscriptionsApi.ts forward generico                        | (no commit — verify-only, sin cambios) | `el-templo-admin/src/composables/useSubscriptionsApi.ts` |
| 3    | Smoke visual del bloque Cobro en staging admin                             | DEFERRED — checkpoint humano se ejecuta despues del merge del worktree (parallel_execution mode) | n/a |

## Implementation Details

### 1. Refs y computeds nuevos (AssignPlanDialog.vue script)

- **`amountReceived: Ref<number | null>`** — declarado debajo de `paymentMethodOptions` (~L640). Se inicializa `null` y se pre-llena con `chargeBase` al entrar al step Confirmar.
- **`chargeBase: ComputedRef<number>`** — `mode=change && startMode=now && changePlanPreviewData.netAmount != null` -> `netAmount` (D-07); resto -> `pricingDisplay.value.finalPrice ?? 0`.
- **`isPartialCharge: ComputedRef<boolean>`** — `chargeBase > 0 && amountReceived !== null && amountReceived < chargeBase`. Driver del banner amarillo (D-03).
- **`pendingBalance: ComputedRef<number>`** — `Math.max(0, chargeBase - (amountReceived ?? 0))`. Mostrado en el preview del saldo y dentro del banner (CHARGE-02).
- **`isCobroInvalid: ComputedRef<boolean>`** — false cuando `chargeBase === 0`; true cuando `amountReceived === null`, `< 0`, o `> chargeBase`. Cumple D-04 sin bloquear el plan gratuito (D-06).

### 2. Watches

- **Watch existente sobre `props.modelValue`**: se agrega `amountReceived.value = null` despues del reset de `assignForm` y `startMode.value = 'now'`. Garantiza estado limpio al reabrir el dialog.
- **Watch nuevo sobre `[step, chargeBase]`**: pre-llena `amountReceived = chargeBase` solo si `newStep === confirmStep.value && amountReceived === null` (idempotente). El callback esta tipado explicitamente como `[number, number]` para evitar implicit-any.

### 3. Eliminacion del q-select de paymentMethod del bloque suelto (step Confirmar)

El q-select original estaba en el step Confirmar pero como bloque suelto debajo del summary (L481-490 del archivo original). NO estaba en el step 2 — la nota del PLAN/CONTEXTO sobre "step 2" reflejaba un estado anterior; al releer el archivo se confirmo que el q-select ya estaba en el step Confirmar pero fuera de un bloque agrupador. El refactor lo MUEVE dentro del nuevo q-card "Cobro" (mismo step Confirmar), preservando el binding `v-model="assignForm.paymentMethod"` y `:options="paymentMethodOptions"`. El step 2 (Precio y Opciones) queda intacto.

### 4. Bloque Cobro en step Confirmar (template)

`q-card flat bordered class="q-mb-md"` con titulo "Cobro" en `text-subtitle1 text-weight-bold`. Layout:

1. Si `chargeBase === 0`: bloque `bg-grey-2 q-pa-md rounded-borders q-mb-md` con icono `info` y texto "Plan gratuito - sin cobro" (D-06). Renderiza ARRIBA de los inputs.
2. Grid 2-col (`row q-col-gutter-md`): `q-input` numerico "Monto recibido" (`prefix="$"`, `:max="chargeBase"`, `:min="0"`, `:disable="chargeBase === 0"`, hint en espanol) + `q-select` "Metodo de pago *" reusando `PAYMENT_METHOD_OPTIONS`, ambos deshabilitados cuando chargeBase=0.
3. Preview saldo (`v-if="chargeBase > 0 && amountReceived !== null"`): linea inline con `formatPrice(pendingBalance, displayCurrency)`.

### 5. Banner amarillo (template)

`q-card v-if="isPartialCharge" flat bordered class="q-mb-md bg-yellow-1"` justo despues del bloque Cobro (above-the-fold). Texto en espanol: `"El plan se asigna con saldo pendiente. El miembro quedará como deudor por {formatPrice(pendingBalance, displayCurrency)}."`. Patron reutilizado del banner `bg-red-1` "Cambio no permitido" (L270-296 original).

### 6. Boton Confirmar — disable expression

Antes:

```
:disable="props.mode === 'change' && startMode === 'now' && changePlanPreviewData?.allowed === false"
```

Ahora:

```
:disable="(props.mode === 'change' && startMode === 'now' && changePlanPreviewData?.allowed === false) || isCobroInvalid"
```

### 7. executeConfirm payload extension

Una sola linea agregada al `AssignPlanInput` literal en `executeConfirm` (~L1115):

```ts
amountReceived:
  chargeBase.value === 0 ? undefined : (amountReceived.value ?? undefined),
```

Cubre los dos branches (`subsApi.changePlan` y `subsApi.assignPlan`) porque ambos consumen el mismo `payload`. El comportamiento `undefined` es compatible con el backend D-13 (default = `pricePaid` cuando no se envia).

### 8. useSubscriptionsApi.ts — verify-only

Inspeccion confirma que `assignPlan(userId, input)` (L169-184), `changePlan(userId, input)` (L186-201) y `renewSubscription(userId, input)` (L240-258) usan `api.post<SubscriptionDetail>(url, input)` sin desestructurar el input. El campo `amountReceived` (ya tipado en `AssignPlanInput` y `RenewSubscriptionInput` por Plan 107-04) fluye al body HTTP automaticamente. Sin cambio de codigo, sin commit dedicado.

## Verification

### Grep acceptance criteria (Task 1)

| Check | Expected | Actual | Pass |
| ----- | -------- | ------ | ---- |
| `grep -c "amountReceived"` | >= 5 | 16 | yes |
| `grep -cE "isPartialCharge|pendingBalance|chargeBase"` | >= 6 | 24 | yes |
| `grep -c "bg-yellow-1"` | 1 | 1 | yes |
| `grep -c "Plan gratuito - sin cobro"` | 1 | 1 | yes |
| `grep -c "Cobro parcial"` (texto user-visible en banner) | 1 | 1 (linea 544); +1 ocurrencia en comentario inline (linea 851) | yes |
| `grep -c 'v-model="assignForm.paymentMethod"'` (unica) | 1 | 1 | yes |

### Typecheck

`npx vue-tsc --noEmit -p tsconfig.json` corre con node_modules ausentes en el worktree (mismo escenario documentado por Plan 04). Errores filtrados por archivo:

```
AssignPlanDialog.vue(613): TS2307 Cannot find module 'vue'        — pre-existente (import L613 sin types)
AssignPlanDialog.vue(614): TS2307 Cannot find module 'quasar'    — pre-existente (import L614 sin types)
AssignPlanDialog.vue(771): TS7006 Parameter 'p' implicit any     — pre-existente (filteredPlans existente)
AssignPlanDialog.vue(774): TS7006 Parameter 'p' implicit any     — pre-existente (filteredPlans existente)
AssignPlanDialog.vue(782): TS7006 Parameter 'p' implicit any     — pre-existente (plansByTier existente)
AssignPlanDialog.vue(930): TS7006 Parameter 's' implicit any     — pre-existente (formatSelectedSchedules existente)
AssignPlanDialog.vue(957): TS2366 Function lacks return          — pre-existente (getBasePrice existente)
AssignPlanDialog.vue(1163): TS7006 Parameter 'open' implicit any — pre-existente (watch on props.modelValue existente)
```

**Cero errores nuevos** introducidos por Plan 107-05. Todos son pre-existentes y derivan de la falta de node_modules (mismo issue ya validado en Plan 04 SUMMARY como Scope Boundary).

El primer intento del watch nuevo `[step, chargeBase]` introdujo dos implicit-any en los binding-elements `newStep` y `base`; se corrigio con tipado explicito `[number, number]` antes del commit, eliminando esas filas del output de typecheck. Verificado.

### Lint

`npx eslint -c eslint.config.js src/components/AssignPlanDialog.vue` falla con `ERR_MODULE_NOT_FOUND: Cannot find package '@eslint/js'` por la misma razon (sin `node_modules`). No bloqueante per Scope Boundary; el pre-commit hook con lint-staged se ejecutara al rebajar a la rama de la release y ahi se corrigen issues si los hay.

### Structural balance

- `<q-card` opens (regex `<q-card([ >]|$)`): 9 — `</q-card>` closes: 9.
- `<q-card-section>` opens: 9 — `</q-card-section>` closes: 9.
- `<template>` tags: 9 — `</template>` tags: 9.

Tags balanceados; el archivo parsea con vue-tsc (los TS errors son de tipos, no de sintaxis SFC).

## Deviations from Plan

### [Discovery — no rule needed] Step location of paymentMethod q-select

Al releer el archivo, el `q-select` de paymentMethod (lineas 481-490 del original) estaba dentro del `<q-step :name="confirmStep">`, no del step 2. La descripcion del PLAN y de PATTERNS.md afirmaban que el q-select vivia en el step 2 (Configurar) y debia migrarse al step Confirmar. Realidad: el q-select ya estaba en el Confirmar pero como bloque suelto fuera de cualquier q-card agrupador. El intent del refactor (D-01) sigue siendo identico: agruparlo dentro del nuevo q-card "Cobro" junto al monto recibido. Sin cambio funcional respecto al plan, solo precision en la descripcion.

Resultado: el `grep -c 'v-model="assignForm.paymentMethod"'` devuelve `1`, cumpliendo el acceptance criterion al pie.

## Known Stubs

Ninguno. Toda la UI esta wired contra refs/computeds reales y el payload reach el backend con el campo correcto.

## Threat Flags

Ninguno. Cambio se queda en UI client-side; el cap se valida tambien en el backend (Plan 107-02 / 107-03 / threat T-107-13 mitigado en 2 capas). El banner amarillo expone "saldo pendiente" pero esto se ve solo en admin app con RBAC ya en su lugar — coincide con el threat T-107-14 (accept).

## Checkpoint Deferred

Task 3 (`type="checkpoint:human-verify"`, `gate="blocking"`) requiere smoke visual en staging admin: 6 escenarios (asignar full, asignar parcial, change con proration, boarding pass, cap-exceeded, espanol consistente). Bajo el modo `parallel_execution` del worktree, los checkpoints `human-verify` se difieren al merge del worktree — el orquestador debe gatillar el smoke una vez que la rama vuelve a master (o staging), antes de mergear a produccion (D-20).

**Smoke checklist a correr post-merge:**

1. AlumnosPage -> miembro -> "Gestionar Plan" -> "Asignar plan" -> step Confirmar muestra el q-card "Cobro" con monto pre-llenado.
2. Modificar monto a un valor menor: aparece banner amarillo + "Saldo pendiente: $X".
3. Cambiar plan con `startMode='now'`: chargeBase = netAmount; el desglose de proration sigue arriba.
4. Asignar con boarding pass: bloque visible con leyenda "Plan gratuito - sin cobro", inputs grises, Confirmar habilitado.
5. Tipear monto > chargeBase: Confirmar disabled.
6. Verificar TODOS los textos en espanol: "Cobro", "Monto recibido", "Metodo de pago", "Saldo pendiente", "Cobro parcial", "Plan gratuito - sin cobro".

## Self-Check: PASSED

- `el-templo-admin/src/components/AssignPlanDialog.vue` exists and was modified (verified via `git diff --stat HEAD~1`).
- Commit `23d5cef4` exists in `git log` (verified via `git rev-parse --short HEAD` post-commit).
- `el-templo-admin/src/composables/useSubscriptionsApi.ts` is referenced as verify-only (no diff).
- SUMMARY.md created at `.planning/phases/107-cobro-al-asignar-plan/107-05-SUMMARY.md`.
- All grep acceptance criteria pass (see Verification table).
- Typecheck shows zero NEW errors introduced by Plan 107-05 (all 8 errors are pre-existing).

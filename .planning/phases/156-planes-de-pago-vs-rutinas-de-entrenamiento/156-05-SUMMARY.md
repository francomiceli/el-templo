---
phase: 156-planes-de-pago-vs-rutinas-de-entrenamiento
plan: 05
subsystem: admin (pricing UI + plan form)
tags:
  [white-label, pricing, zero-price, gate, multi-program, programIds, admin-ui]
requires:
  - "156-01: endpoint GET/PUT /admin/settings/pricing/zero-price + gate server-side resolvePriceType"
  - "156-02: programIds en el payload de create/update de planes (planSchema/mapPlanRow/PlanListItem)"
  - "156-04: flag de superficie TEMPLO_TRAINING_ROUTINES en templo-config.ts"
provides:
  - "usePricingSettingsApi.getZeroPriceEnabled / setZeroPriceEnabled"
  - "segundo toggle 'Precio Zero' en /configuracion/precios (revert optimista)"
  - "gate visual del campo priceZero (PlanFormDialog) + opción Zero (AssignPlanDialog) + toggle Zero (CobrosPage)"
  - "multi-select de programas en PlanFormDialog cableado a form.programIds"
  - "programIds?: number[] en PlanListItem/CreatePlanInput/UpdatePlanInput (admin types)"
affects:
  - "el-templo-admin/src/composables/usePricingSettingsApi.ts"
  - "el-templo-admin/src/pages/ConfiguracionPreciosPage.vue"
  - "el-templo-admin/src/components/PlanFormDialog.vue"
  - "el-templo-admin/src/components/AssignPlanDialog.vue"
  - "el-templo-admin/src/pages/CobrosPage.vue"
  - "el-templo-admin/src/types/subscription.ts"
tech-stack:
  added: []
  patterns:
    - "réplica exacta del par card-surcharge (154) en el composable + la página de configuración"
    - "carga de flag de pricing en componentes admin con fallback conservador OFF ante error"
    - "gate solo-visual: la UI esconde, el server normaliza y persiste normalizado (156-01/156-02)"
    - "q-select multiple use-chips gateado por superficie (TEMPLO_TRAINING_ROUTINES) + estado grantsAllPrograms"
key-files:
  created:
    - ".planning/phases/156-planes-de-pago-vs-rutinas-de-entrenamiento/156-05-SUMMARY.md"
  modified:
    - "el-templo-admin/src/composables/usePricingSettingsApi.ts"
    - "el-templo-admin/src/pages/ConfiguracionPreciosPage.vue"
    - "el-templo-admin/src/components/PlanFormDialog.vue"
    - "el-templo-admin/src/components/AssignPlanDialog.vue"
    - "el-templo-admin/src/pages/CobrosPage.vue"
    - "el-templo-admin/src/types/subscription.ts"
decisions:
  - "onSubmit defaultea priceZero al valor persistido (edit) o priceRegular/0 (create) cuando el campo Zero está oculto — el POST del API sigue exigiendo priceZero"
  - "Foundation excluida de las opciones del multi-select por nombre (FOUNDATION_PROGRAM_NAME) — coherencia con el filtro anti-piratería server-side de 156-03"
  - "carga conjunta card+zero vía Promise.all en ConfiguracionPreciosPage; en los otros componentes se duplica el patrón de carga existente"
  - "payload de planes envía programIds:[] cuando grantsAllPrograms está ON (reconcilia delete+insert; el server igual la ignora)"
  - "boarding pass en AssignPlanDialog queda como mecanismo independiente (server ya normaliza, 156-01) — no se toca"
metrics:
  duration: ~4min
  completed: 2026-07-05
---

# Phase 156 Plan 05: Superficie admin de Zero + multi-programa Summary

Superficie admin de PLAN-02 (UI de Precio Zero, D-05) y PLAN-03 (multi-select de programas, D-08). Segundo toggle "Precio Zero" en `/configuracion/precios` (análogo al de recargo por tarjeta); con la regla Zero OFF se esconden todos los controles Zero (campo `priceZero` en PlanFormDialog, opción "Zero" en AssignPlanDialog, toggle Zero en CobrosPage) — la UI solo esconde, el gate real ya vive server-side (156-01). PlanFormDialog gana un multi-select de programas visible cuando `grantsAllPrograms` está OFF y la superficie de rutinas (`TEMPLO_TRAINING_ROUTINES`) está ON; el payload viaja con `programIds` (156-02).

## What Was Built

**Task 1 — Métodos zero en el composable + toggle en ConfiguracionPreciosPage (commit `43214e0c`):**

- `usePricingSettingsApi.ts`: `getZeroPriceEnabled`/`setZeroPriceEnabled` contra `/admin/settings/pricing/zero-price` (réplica exacta del par card-surcharge: `loading`/`error`/`extractError`, expuestos en el return).
- `ConfiguracionPreciosPage.vue`: segunda `q-card-section` (separada por `q-separator`) con banner explicativo ("Con la regla apagada, la opción de Precio Zero no se ofrece al cobrar ni al armar planes"), `q-toggle` con `onToggleZero` de revert optimista ante error, y carga conjunta card+zero en `onMounted` vía `Promise.all`.

**Task 2 — PlanFormDialog: gate priceZero + multi-select + tipos (commit `4c38d4d2`):**

- `types/subscription.ts`: `programIds?: number[]` agregado a `PlanListItem`, `CreatePlanInput` y `UpdatePlanInput`.
- `PlanFormDialog.vue`:
  - Campo `priceZero` gateado con `v-if="zeroPriceEnabled"` (analog exacto de Tarjeta); ref `zeroPriceEnabled` + `loadZeroPriceRule` (conservador OFF ante error) invocado al abrir junto a `loadCardSurchargeRule`.
  - `onSubmit` defaultea `priceZero` cuando el campo está oculto: valor persistido (edit) o `priceRegular`/`0` (create), ya que el POST del API lo exige.
  - `q-select multiple use-chips` bindeado a `form.programIds`, visible solo cuando `trainingRoutinesEnabled` (`TEMPLO_TRAINING_ROUTINES` de templo-config) Y `!form.grantsAllPrograms`. `multiProgramOptions` computed excluye Foundation (`FOUNDATION_PROGRAM_NAME`) por coherencia con el filtro server-side de 156-03.
  - Watch de `grantsAllPrograms` extendido para limpiar también `form.programIds` al prender 'todos'.
  - `form.programIds` inicializado en el estado del form, poblado en edit-mode desde `props.plan.programIds`, reseteado en create, y agregado al payload (`[]` cuando all=true).

**Task 3 — Gate de la opción Zero en AssignPlanDialog + CobrosPage (commit `8cbe5fad`):**

- `AssignPlanDialog.vue`: ref `zeroPriceEnabled` + `loadZeroPriceRule` (conservador OFF) invocado al abrir; el push de `{ value: 'zero' }` en `priceTypeOptions` pasa a ser condicional por `zeroPriceEnabled` (simétrico al de `credit_card`). El boarding pass queda como mecanismo independiente (server ya normaliza, 156-01).
- `CobrosPage.vue`: `q-toggle` Zero gateado con `v-if="zeroPriceEnabled"` + ref/carga análogos (`loadZeroPriceRule` en `onMounted`). El payload `zero:false` queda correcto sin cambios porque `zeroPrice` ya resetea a `false` con el toggle oculto.

## Threat Model Coverage

- **T-156-11** (Tampering, UI esconde Zero pero el payload podría forzarlo): mitigado — el gate real es server-side (`resolvePriceType`, 156-01); esta UI solo esconde. El bypass por payload directo quedó cerrado en 156-01 (T-156-02).
- **T-156-12** (Information Disclosure, multi-select expone programas gateados): accept — el selector solo aparece con superficie de rutinas ON + owner; sin dato sensible.
- **T-156-SC** (installs): accept — no se instalaron paquetes nuevos.

## Deviations from Plan

None — plan ejecutado exactamente como fue escrito. Se ejercieron las discreciones del plan: (a) carga conjunta card+zero vía `Promise.all` en ConfiguracionPreciosPage; (b) exclusión de Foundation por nombre (`FOUNDATION_PROGRAM_NAME`, la seña que el componente ya usa para identificarla) en las opciones del multi-select.

## Notas de verificación

- Gate local `pnpm lint` (eslint) verde en los 6 archivos tocados. Los 2 warnings de `CobrosPage.vue` (`showPaymentMethods`, `hasAlumnoContext` sin usar, líneas 971/1225) son pre-existentes y fuera de scope (SCOPE BOUNDARY).
- `vue-tsc --noEmit` a nivel proyecto: 0 errores en los 6 archivos tocados (el repo arrastra errores pre-existentes en archivos no relacionados — fuera de scope; suite completa corre en CI, no local).
- Verificación visual (toggle Zero, gates, multi-select) → UAT de fase, no bloqueante aquí. El gate efectivo lo garantizan los tests server-side de 156-01.

## Self-Check: PASSED

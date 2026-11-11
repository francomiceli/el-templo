---
phase: 207-centavos-sede-alumno
plan: 10
subsystem: admin-money-inputs
tags: [money, MoneyInput, pos, ficha, registrar-pago]
requires: ["207-09"]
provides:
  - "PoS (Cobros), Asignar plan, Renovar y Registrar pago con monto recibido de hasta 2 decimales (MoneyInput)"
  - "reparto FIFO, suma asignada, faltan/sobran, deuda y cobro parcial en centavos (utils/money)"
affects: [207-11]
key-files:
  modified:
    - el-templo-admin/src/components/RegisterPaymentDialog.vue
    - el-templo-admin/src/pages/CobrosPage.vue
    - el-templo-admin/src/components/AssignPlanDialog.vue
    - el-templo-admin/src/components/MemberSubscriptionTab.vue
metrics:
  tasks: 2
  completed: 2026-11-10
---

# Phase 207 Plan 10: inputs de plata recibida con centavos

El monto RECIBIDO (PoS, Asignar plan, Renovar, Registrar pago y su reparto por concepto) usa `MoneyInput` y aritmética en centavos. Los PRECIOS (DI-03) siguen enteros.

## Commits

- `24582e125` feat(207-10): Registrar pago con MoneyInput y reparto FIFO en centavos
- `e61745091` feat(207-10): monto recibido con centavos en la PoS, Asignar plan y Renovar

## Verificación

| Gate | Antes | Después |
|------|-------|---------|
| vue-tsc admin (`error TS`) | 27 | 27 (ninguno en archivos de este plan) |
| eslint de los 4 archivos | - | 0 errores (2 warnings preexistentes en CobrosPage: `showPaymentMethods`, `hasAlumnoContext` sin usar) |
| prettier | - | ok |

Tests: el admin no tiene tests de componentes (sin runner ni `@vue/test-utils`) y el plan no los pide; no se corrió vitest. La lógica de redondeo/suma/parser que usan está cubierta por `utils/__tests__/money.test.ts` (207-09, 43/43) y el API por 207-02/05.

## Cambios por archivo

- `RegisterPaymentDialog.vue`: `MoneyInput` en Monto recibido y en cada asignación (`:model-value` + `@update:model-value`, `allocations` pasa a `Record<string, number | null>`; `null` cuenta 0). `totalSaldos` y `sumAllocated` con `sumMoney`; `isInvalid` con `moneyEquals`; `sumStatus` con `compareMoney`; `sumDiff` redondeado; FIFO con `toCents`/`fromCents`; payload con `roundMoney` en `amount` y `allocatedAmount`. Regla por concepto "No puede superar $saldo" (reemplaza `:max`).
- `CobrosPage.vue`: Monto de la PoS (`amount`) con `MoneyInput` (label, suffix, hint intactos). `isAltaPartial` con `compareMoney`; deuda del banner de alta parcial con `roundMoney`; validaciones `amount <= precioAcordadoMonto` / `<= renewProratedPrice` con `compareMoney`.
- `AssignPlanDialog.vue`: `amountReceived` con `MoneyInput` y `amountReceivedRules` (>= 0 y `compareMoney(v, chargeBase) <= 0`); `pendingBalance` con `roundMoney`; `isPartialCharge`, `isCobroInvalid`, `miscExceedsPrice`/`miscBelowPrice` con `compareMoney` (el cobro suelto imputado puede tener centavos).
- `MemberSubscriptionTab.vue`: `renewalAmountReceived` con `MoneyInput` y `renewalAmountReceivedRules`; deuda y cobro parcial con `roundMoney`/`compareMoney`; el `:disable` del botón usa `compareMoney`.

## `type="number"` que quedan (todos PRECIOS, DI-03)

- `CobrosPage.vue`: `proratedPrice` (precio prorrateado del alta), `renewProratedPrice` (prorrateo de renovación), `precioAcordadoMonto`.
- `AssignPlanDialog.vue`: `keepDiffAmount` (diferencia a cobrar, viaja como `priceOverrideAmount`), `proratedPrice`, `assignForm.priceOverrideAmount`.
- `MemberSubscriptionTab.vue`: `renewalProratedAmount`, `renewalOverrideAmount`.

## Decisiones del ejecutor

- `MoneyInput` y el reset a `null` (limitación conocida del 09): los tres montos viven dentro de contenido que se desmonta al cerrar/cambiar de paso (`q-dialog` solo renderiza abierto; en Cobros el Monto está en el paso 3 de un `v-else-if`; en los diálogos de ficha el input está en el paso de confirmación). Por eso un texto inválido no sobrevive a un reset a `null`: no hizo falta `:key` ni tocar el componente. Las asignaciones externas no nulas (autocompletar, "Pagar todo", prefill de `chargeBase`) sí reescriben el texto.
- Registrar pago: una asignación mayor al saldo de su concepto ahora también bloquea Confirmar (`hasOverAllocation`), no solo muestra la regla roja. Antes el `:max` del input numérico era solo un atributo HTML sin efecto sobre el botón (el API lo rechazaba). Es la opción conservadora; el FIFO nunca lo dispara.
- En `CobrosPage` no se agregaron reglas al Monto (el original no tenía `:min`/`:max`): la obligatoriedad y `> 0` siguen en `canConfirm`/`onConfirm`.

## Desviaciones

Ninguna respecto del plan salvo lo anotado arriba (bloqueo extra de Confirmar por sobre-asignación y comparaciones del cobro suelto imputado en `AssignPlanDialog`, ambas en el espíritu de DI-02).

## Bugs encontrados

Ninguno fuera del plan.

## UAT manual

1. PoS, renovar con Monto "15.000,50": el resumen y "Confirmar" muestran $15.000,50; el cobro y la deuda salen exactos (precio 30000 -> deuda $14.999,50).
2. PoS con Monto "15.000,505": el campo muestra "Máximo 2 decimales" y Confirmar queda deshabilitado.
3. Ficha, Asignar plan con Monto recibido "10000,25": "Saldo pendiente" exacto; con un monto mayor al precio aparece "No puede superar $..." y no deja confirmar. Lo mismo en Renovar.
4. Registrar pago de 100,00 con tres conceptos: tipear 33,33 / 33,33 / 33,34 en las asignaciones cuadra (check verde, sin "Faltan/Sobran"); 0,1 + 0,2 contra 0,3 también cuadra. "Pagar todo" con saldos con centavos asigna cada saldo exacto.
5. Los inputs de precio (Precio acordado, prorrateado, Diferencia a cobrar) siguen rechazando decimales.

## Known Stubs

Ninguno.

## Self-Check: PASSED

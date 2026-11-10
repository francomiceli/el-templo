---
phase: 207-centavos-sede-alumno
plan: 04
subsystem: api-finance
tags: [money, traslados, egresos, retiros, json-schema]
requires: ["207-03"]
provides:
  - "traslados, egresos y retiros con importes de hasta 2 decimales (> 0), 3 decimales rechazados"
  - "ajuste por diferencia de conteo exacto (|contado - esperado| redondeado) y sin ajuste con diferencia 0,00"
  - "totales de cobros pendientes y resumen de retiro (saldo anterior, esperado) exactos al centavo"
affects: [207-05]
key-files:
  created:
    - el-templo-api/test/finance/centavos-traslados-retiros.test.ts
  modified:
    - el-templo-api/src/modules/finance/movement-service.ts
    - el-templo-api/src/modules/finance/withdrawal-service.ts
    - el-templo-api/src/modules/finance/schemas.ts
metrics:
  tasks: 3
  completed: 2026-11-10
---

# Phase 207 Plan 04: centavos en traslados, egresos y retiros

## Commits

- `749abc8f3` feat(207-04): traslados y egresos con importes en centavos
- `e063f6051` feat(207-04): retiros con centavos y schemas de movimiento/egreso/retiro
- `213f862c1` test(207-04): centavos en traslados, egresos y retiros

## Cambios por archivo

- `movement-service.ts`: `registerMovement` y `registerExpense` validan con `assertMoneyAmount` (el conteo con `allowZero`); "hay diferencia" con `moneyEquals`, `diff = roundMoney(...)`, ajuste con `direction` por signo y `amount = |diff|`; audit y nota con valores redondeados. `voidMovement`/`voidExpense` solo caminan links/ids, sin sumas ni comparaciones de importes: sin cambios.
- `withdrawal-service.ts`: `listPendingPayments` (ambos totales) y resumen (`inflowTotal`, `outflowTotal`, `previousBalance`, `expectedInDrawer`) con `sumMoney`/`roundMoney`; `registerWithdrawal` con `assertMoneyAmount` (monto y conteo), `expected` con `sumMoney`, `difference = roundMoney`, `hasDifference` con `moneyEquals`, ajuste `Math.abs(roundMoney(difference))`, `available = roundMoney(available + difference)`. `list`/`getById` solo leen: sin cambios.
- `schemas.ts`: `amount` de movimiento/egreso/retiro con `MONEY_POSITIVE_SCHEMA`; `countedAmount` de movimiento/retiro con `MONEY_NON_NEGATIVE_SCHEMA`. JSDoc de `createEfectivoCajaSchema` corregido (pesos/euros con 2 decimales). Prettier (lint-staged) reformateo 3 lineas `response` ajenas.

## Verificacion

- `tsc --noEmit` = 0; `pnpm lint:tenant` = 0.
- Grep de importes `integer` en `finance/schemas.ts`: vacio (finance completo migrado).
- `typecheck:tests`: 18 discrepancias, las preexistentes; ninguna en archivos de este plan.
- `centavos-traslados-retiros.test.ts`: 14/14 (foreground, 163 s).
- Regresion `withdrawals.test.ts` (26) + `movement-service.test.ts` (14) = 40/40 (una corrida de 2 archivos).

## Decisiones del ejecutor

- Ningun test existente asertaba el texto viejo "debe ser mayor a 0": se uso `assertMoneyAmount` directo (mensaje "debe ser mayor a cero").

## Desviaciones

Ninguna respecto del plan.

## Bugs encontrados

Ninguno fuera del plan. No se toco la idempotencia de `POST /movements` (vive en otra rama).

## Known Stubs

Ninguno.

## Self-Check: PASSED

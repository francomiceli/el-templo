---
phase: 207-centavos-sede-alumno
plan: 05
subsystem: api-finance-subscriptions
tags: [money, pos-profe, ficha, json-schema]
requires: ["207-04"]
provides:
  - "PoS del profe (pay-plan, misc, alta) y ficha (assign, change-plan, renew) con monto recibido de hasta 2 decimales, 3 rechazados"
  - "deuda exacta al centavo en recordAssignmentCharge y en el cobro de deuda"
  - "error SUB_HAS_ACTIVE_TRANSACTIONS con totalAmount con centavos"
affects: [207-06]
key-files:
  created:
    - el-templo-api/test/finance/centavos-cobros.test.ts
  modified:
    - el-templo-api/src/modules/finance/coach-load-routes.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/src/modules/subscriptions/service.ts
metrics:
  tasks: 3
  completed: 2026-11-10
---

# Phase 207 Plan 05: PoS del profe y ficha en centavos

## Commits

- `6d9e43b36` feat(207-05): PoS del profe con monto recibido en centavos
- `068d131be` feat(207-05): ficha del admin con monto recibido en centavos
- `81e00ce36` test(207-05): centavos en la PoS del profe y la ficha del admin

## Cambios por archivo

- `coach-load-routes.ts`: `amountReceived` (pay-plan y alta) y `amount` (misc) con `MONEY_NON_NEGATIVE_SCHEMA`; `priceOverrideAmount` sigue `integer` (2 apariciones, con comentario DI-03). `findSettleTarget`, la rama de deuda de `POST /pay-plan` (`outstanding > 0`, `amount <= 0`, `amount > outstanding`) y los dos usos de `outstanding` en `GET /autocompletar` con `compareMoney`; mensajes con `roundMoney`. Corregido el comentario "Monto recibido (cents)". `POST /misc` y `POST /alta` no comparan ni restan importes (pasan `amount`/`amountReceived` a `create()`/`assignPlan`): sin cambios mas alla del schema.
- `subscriptions/schemas.ts`: `amountReceived` de assign/change-plan/renew con `MONEY_NON_NEGATIVE_SCHEMA`; `cancelErrorSchema.details.totalAmount` con `MONEY_RESPONSE_SCHEMA`. Los 4 `priceOverrideAmount` siguen `integer`.
- `subscriptions/service.ts`: `recordAssignmentCharge` (`< 0`, `> chargeBase`, `> 0`, `< chargeBase` con `compareMoney`; `pendingBalance` y mensaje con `roundMoney`), anticipo (`compareMoney(advance.amount, pricePaid) > 0`), `hasChargeTx` con `compareMoney(effectiveAmountReceived, 0)`, `_cancelSubscription` con `sumMoney`. Los demas usos de `amountReceived` (changePlan ~5114, ~5544, renew ~6425) solo reenvian el valor a `recordAssignmentCharge`: sin cambios.

## Verificacion

- `tsc --noEmit` = 0; `pnpm lint:tenant` = 0.
- `typecheck:tests`: 18 discrepancias, las preexistentes; ninguna en `centavos-cobros.test.ts`.
- `centavos-cobros.test.ts` 12/12 + `coach-load.test.ts` 58/58 (una corrida, 248 s).
- Regresion `subscriptions/charge-on-assign.test.ts` 14/14 y `coach-load-alta.test.ts` 7/9: los 2 fallos ("crear-nuevo" espera user `activo` y recibe `prueba`; "void preexistente" espera `activo` y recibe `freemium`) son PREEXISTENTES: reproducidos identicos en `b1472ba2e` (base del plan, sin mis cambios).

## Decisiones del ejecutor

- Plan de test con precio 30000 (como pide `<behavior>`), no 100000 de los tests modelo.
- Se agrego un test de "3 x 33.33 + 0.01 = 100" sobre deuda sembrada (DI-02 / tests requeridos de la fase) y uno de rechazo de `priceOverrideAmount` decimal.

## Desviaciones

- El verify de Task 2 usa `! grep "params.chargeBase - amountReceived\b"`, que matchea tambien la linea nueva `roundMoney(params.chargeBase - amountReceived)` (es la forma pedida por `key_links`): el grep deberia ignorar esa linea; no es un problema de codigo.

## Bugs encontrados

- `coach-load-alta.test.ts`: 2 tests fallan en la base (estado de usuario `prueba`/`freemium` en vez de `activo` tras el alta). No relacionado con importes; no se toco. Conviene investigarlo aparte.

## Known Stubs

Ninguno.

## Self-Check: PASSED

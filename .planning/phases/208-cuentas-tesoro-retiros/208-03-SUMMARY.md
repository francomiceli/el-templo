---
phase: 208-cuentas-tesoro-retiros
plan: 03
subsystem: api-finance
tags: [regla-medio-cuenta, cheque, egresos, traslados, validacion]
requires: ["208-02"]
provides:
  - "assertMethodAllowedForAccount aplicado en registerExpense, registerMovement (patas internal) y TransactionService.validate (caja elegida)"
  - "RegisterExpenseInput.paymentMethod opcional (nivel service, default internal)"
  - "resolveCashRegister resuelve cheque a la cuenta banco de la moneda"
  - "test/finance/regla-medio-cuenta.test.ts (17 tests)"
affects: [208-06, 209]
key-files:
  created:
    - el-templo-api/test/finance/regla-medio-cuenta.test.ts
  modified:
    - el-templo-api/src/modules/finance/cash-register-service.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/movement-service.ts
    - el-templo-api/src/modules/finance/types.ts
decisions:
  - "La ruta POST /expenses no se toca: no expone paymentMethod y sigue guardando internal (exento)"
  - "validate solo chequea la regla cuando llega cashRegisterId (no retroactivo, la caja sugerida existente no se revisa)"
metrics:
  tasks: 2
  completed: 2026-11-11
---

# Phase 208 Plan 03: regla medio-cuenta aplicada

La regla unica de 208-01 queda aplicada en las altas de egreso y traslado, en la validacion de cobros con caja elegida y en el resolver (cheque -> banco). Ningun camino de cobro actual la viola con datos legitimos.

## Commits

- `f71629857` feat(208-03): regla medio-cuenta en egresos, traslados, validacion y resolver
- `f0696d1c0` test(208-03): regla medio-cuenta en cobros, egresos, traslados y validacion

## Que se hizo

- `resolveCashRegister`: `cheque` entra en la rama banco junto a transfer/card/direct_debit (docblock actualizado).
- `TransactionService.validate`: el SELECT de la caja elegida suma `type` y `name`; tras los guards de existencia/moneda llama a `assertMethodAllowedForAccount(existing.paymentMethod, caja)`. Sin `cashRegisterId` no se valida nada nuevo. Confirmado leyendo `BandejaPendientesTab.vue:588-605`: la Bandeja ya ofrecia solo cajas compatibles (transfer/card/direct_debit -> banco, cash -> efectivo), asi que el assert solo cierra el camino por API.
- `MovementService`: `CajaRef` y `loadCaja` suman `name`. `registerExpense` usa `input.paymentMethod ?? "internal"`, asserta tras `loadCaja` y lo usa en el `create`. `registerMovement`: SOLO dos asserts `internal` (origen y destino) antes de la tx, sin tocar el resto del cuerpo (merge futuro con T0 trivial).
- `RegisterExpenseInput.paymentMethod?: PaymentMethod` (comentado: la ruta no lo expone en la 208, la 209 lo abre).

## Caracterizacion de los cobros (DI-04 / T-208-10)

Ningun camino viola la regla con datos legitimos, no hubo que dejar nada fuera:

- PoS `/coach-load/misc` cash -> caja efectivo de la sede; transfer + `bankAccountId` -> esa caja banco.
- PoS `/coach-load/pay-plan` (renovacion) cash -> caja efectivo de la sede.
- `POST /transactions` (owner): cash -> efectivo; transfer y card -> banco (via `resolveCashRegister`).
- `POST /transactions` con `paymentMethod: "cheque"` -> 400 (el schema de cobros no lo admite, 208-01).

## Verificacion

- `npx tsc --noEmit` (api): 0. `pnpm lint:tenant`: DISCREPANCIAS 0. `pnpm typecheck:tests`: 18 (preexistentes), ninguna en `regla-medio-cuenta.test.ts`.
- Tests con DB, en foreground y de a un archivo (`--hookTimeout=540000`): `regla-medio-cuenta` 17/17, `validate-caja` 18/18, `movement-service` 14/14, `coach-load` 58/58 (sin fallos, ni siquiera los preexistentes que se esperaban).

## Decisiones del ejecutor / desviaciones

1. **Tests por encima del minimo:** 17 `it` (el plan pedia >= 9). Se sumaron: validar sin `cashRegisterId` conserva la caja sugerida; la ruta POST /expenses ignora un `paymentMethod` del body (Ajv lo recorta, graba `internal`, 201); cheque desde caja de efectivo rechazado; el saldo de la caja no cambia cuando el egreso se rechaza.
2. **Cleanup del test:** el `afterAll` borra por SQL crudo (FK checks apagados, acotado por `tenant_id`) las filas del socio de prueba y de las cajas propias, como hace `coach-load.test.ts`.
3. **Shape de `POST /expenses`:** responde `{ expense: { expenseTxId } }` (sin schema de response 201), el test lo lee asi.
4. Los comandos de vitest de mas de 180 s los paso a segundo plano el propio arnes de Bash (no use `run_in_background`); se espero el fin de cada uno antes de lanzar el siguiente, nunca hubo dos vitest a la vez.

## Para los planes siguientes

- 208-06 (retiro con destino): las patas son `internal`, `registerMovement` ya asserta eso; si el retiro reutiliza `registerMovement` no hace falta mas.
- 209: para abrir el medio en `POST /expenses`, sumar `paymentMethod` al schema Ajv de la ruta y pasarlo en el handler (`routes.ts` ~770); el service ya lo valida. Cheque solo desde cuenta banco, cash solo desde efectivo (incluye Tesoro y Central).
- `loadCaja` en `movement-service.ts` ahora devuelve `name` (util para mensajes).
- La caja de efectivo de test de un egreso de efectivo necesita saldo de apertura (el guard de efectivo rechaza saldo negativo).

## Known Stubs

Ninguno.

## Self-Check: PASSED

Commits f71629857 y f0696d1c0 existen; `regla-medio-cuenta.test.ts` presente; tsc 0, lint:tenant 0.

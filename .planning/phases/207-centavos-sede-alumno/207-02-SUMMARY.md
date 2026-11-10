---
phase: 207-centavos-sede-alumno
plan: 02
subsystem: api-finance
tags: [money, ledger, balances, json-schema]
requires: ["207-01"]
provides:
  - "TransactionService.create() con guardia central de importes y suma de links en centavos"
  - "BalanceService en centavos (deuda exacta, gestion de deuda por compareMoney)"
  - "schemas de transacciones con body moneyTwoDecimals y respuestas number"
affects: [207-03, 207-04, 207-06]
key-files:
  created:
    - el-templo-api/test/finance/centavos-ledger.test.ts
  modified:
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/balance-service.ts
    - el-templo-api/src/modules/finance/schemas.ts
decisions:
  - "getIncomeByBranch acumula en centavos enteros (toCents al sumar, fromCents al armar la fila)"
metrics:
  tasks: 3
  completed: 2026-11-10
---

# Phase 207 Plan 02: centavos en el ledger

`TransactionService.create()` valida cada importe con `assertMoneyAmount` (red de seguridad de todos los caminos de alta) y compara la suma de links con `moneyEquals(sumMoney(...))`. `BalanceService.applyDelta()` redondea el delta y el saldo y pasa la deuda a `cobrada` con `compareMoney(newAmount, 0) <= 0`. Los schemas de transacciones usan `MONEY_NON_NEGATIVE_SCHEMA` en body y `MONEY_RESPONSE_SCHEMA` en respuesta.

## Commits

- `a03bfa295` feat(207-02): TransactionService y BalanceService en centavos
- `c84f62bbf` feat(207-02): schemas de transacciones con importes de 2 decimales
- `6c21c0209` test(207-02): centavos en el ledger

## Cambios por archivo

- `transaction-service.ts`: `assertMoneyAmount` (monto y cada `allocatedAmount`, cero permitido) antes del paso 1a; `moneyEquals(sumMoney(...))` en lugar de `sum !== input.amount`; `getIncomeByBranch` acumula en centavos. `correct()` sin cambios de logica (el link unico usa `newAmount` tal cual; `create()` lo revalida). `getSummary()`: solo `Number(r.total)` sobre `COALESCE(SUM(..),0)`, sin sumas en JS, sin cambios. `getIncomeByMemberBranch` intacto (207-06): sigue con su unico `AS SIGNED`.
- `balance-service.ts`: `delta`, `newAmount` y `finalAmount` con `roundMoney`; `compareMoney` para el estado de la gestion; `getOutstandingTotalsByCurrency` sin `CAST AS SIGNED`. Revisado el resto del archivo: sin otras sumas ni comparaciones de importes (las `amount > 0` en SQL son exactas sobre DECIMAL).
- `schemas.ts`: body `amount`, `links[].allocatedAmount`, `correctedFields.amount`; respuesta `amount`/`allocatedAmount` del listado, `monthlyRevenue`, 6 metodos, `revenue`, 7 kinds, `allocatedAmount` del historial y `balance` de conceptos pendientes (19 usos de `MONEY_RESPONSE_SCHEMA`, 3 de `MONEY_NON_NEGATIVE_SCHEMA` mas el import; el conteo da 20 y 4 con el import).

Resultado del grep de `integer` en importes que quedan en `schemas.ts` (todos de 207-03/04): lineas 620, 623 (movimientos), 647 (egreso), 765 (`openingBalance`), 1135/1136 (retiro), 1221 (arqueo), 1257 (fondo de cambio). `total` de paginado (353, 507) queda `integer` (conteo).

## Verificacion

- `tsc --noEmit` = 0; `pnpm lint:tenant` = 0; `typecheck:tests` sin menciones del archivo nuevo.
- `test/finance/centavos-ledger.test.ts`: 14/14 (foreground, 133 s).
- Regresion (foreground, en dos corridas porque las tres juntas superaron el timeout de 595 s): `transaction-service.test.ts` + `summary-by-kind.test.ts` 53/53; `transactions-api.test.ts` 59/59. Sin cambios necesarios en tests existentes.

## Desviaciones

Ninguna respecto del plan. Los `[Rule 2]` del plan (guardia central) ya estaban previstos en la Task 1.

## Bugs encontrados

Ninguno fuera del plan. Nota: las rutas `/transactions/:id/correct` no tienen schema de respuesta 2xx, asi que `correct()` no necesitaba cambio de schema de salida.

## Known Stubs

Ninguno.

## Self-Check: PASSED

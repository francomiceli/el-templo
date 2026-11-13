---
phase: 209-egresos
plan: 06
subsystem: finance
tags: [egresos, pagos, anulacion, guarda-de-caja, direct-debit, ledger]
requires: [209-01, 209-02, 209-03, 209-04, 209-05]
provides:
  - ExpensePaymentService.voidPayment
  - assertNotExpensePaymentRow (guarda de Caja)
  - direct_debit como medio saliente
affects: [209-07, 209-08, 209-09]
tech-stack:
  added: []
  patterns: [anulacion con voidInTx en la misma tx, candados gasto -> pago, guarda por id con tenantWhere en entradas publicas]
key-files:
  created:
    - el-templo-api/src/modules/finance/expense-payment-guard.ts
    - el-templo-api/test/finance/expense-payments-anulacion.test.ts
  modified:
    - el-templo-api/src/modules/finance/expense-payment-service.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/movement-service.ts
    - el-templo-api/test/finance/direct-debit.test.ts
decisions:
  - La guarda no esta en `_void` ni en `voidInTx`; se llama al principio de las 3 entradas publicas que reciben un id arbitrario del ledger
  - `voidMovement` no lleva la guarda: `collectTransferGroupIds` ya rechaza (400 "No es un traslado") cualquier fila que no sea `cash_transfer`, y un pago es `expense`
metrics:
  tasks: 2
  completed: 2026-11-11
---

# Phase 209 Plan 06: Anulacion de pagos, guarda de Caja y debito automatico Summary

`ExpensePaymentService.voidPayment` anula un pago (fila de `expense_payments` + fila del ledger por `voidInTx`) en una sola transaccion; una guarda nueva impide anular o corregir esa fila del ledger desde Caja; la validacion SEPA de `create` pasa a aplicar solo a cobros, con lo que `direct_debit` sirve como medio de pago de un gasto desde un banco.

## Que se hizo

1. **Task 1** (`e7d202020`): `voidPayment`, `expense-payment-guard.ts`, la guarda en las entradas de Caja y el cambio DI-06 en `transaction-service.ts`.
2. **Task 2** (`6f36bc05f`): `expense-payments-anulacion.test.ts` (21 tests) y un `describe` nuevo de 3 casos en `direct-debit.test.ts`.

## Diff resumido de los caminos de cobro y Caja (produccion)

`git diff` de los dos archivos: 18 lineas en `transaction-service.ts`, 3 en `movement-service.ts`. Nada reordenado, renombrado ni refactorizado. Prettier/lint-staged no tocaron lineas ajenas.

`transaction-service.ts`:

- `+ import { assertNotExpensePaymentRow } from "./expense-payment-guard";`
- Validacion SEPA de `create`, las dos ramas solo para `inflow`, con el comentario `fase 209 DI-06: para salidas, direct_debit es el debito automatico de un gasto y lo acota la regla medio-cuenta (solo banco)`:
  - `if (input.direction === "inflow" && input.paymentMethod === "direct_debit" && branch.country !== "ES")` (antes sin la primera condicion)
  - `} else if (input.direction === "inflow" && input.paymentMethod === "direct_debit") {` (antes sin la primera condicion)
- `void(...)`: `await assertNotExpensePaymentRow(ctx, this.db, id);` antes de abrir la tx.
- `correct(...)`: `await assertNotExpensePaymentRow(ctx, this.db, originalId);` antes de abrir la tx (por lo tanto antes de anular).

`movement-service.ts`:

- `+ import { assertNotExpensePaymentRow } from "./expense-payment-guard";`
- `voidExpense(...)`: `await assertNotExpensePaymentRow(ctx, this.db, expenseRowId);` despues de validar el motivo y antes del despacho por formato.

La guarda es UNA query por id con `tenantWhere(expensePayments)` + `transaction_id = id` + `LIMIT 1`; si no hay pago, no hace nada (no cambia el resultado de ningun cobro, egreso viejo ni retiro).

## Entradas que llevan la guarda (lista final)

| Entrada | Ruta |
|---|---|
| `TransactionService.void` | `POST /transactions/:id/void` |
| `TransactionService.correct` | `POST /transactions/:id/correct` |
| `MovementService.voidExpense` | `POST /expenses/:id/void` |

Revisadas y SIN guarda, con motivo:

- `TransactionService._void` y `voidInTx`: Egresos anula por `voidInTx`.
- `TransactionService.voidPair`: publica pero solo la llaman `MovementService` (`voidMovement`, `voidExpense`) con ids ya validados; `voidExpense` ya paso por la guarda.
- `MovementService.voidMovement` (`POST /movements/:id/void`): `collectTransferGroupIds` rechaza con 400 toda fila que no sea `cash_transfer`; un pago de gasto es `expense`.
- `subscriptions/service.ts:2926` (`voidInTx` del anticipo): id que la propia suscripcion creo.

## Verificacion

| Corrida | Resultado |
|---|---|
| `test/finance/no-regresion-208.test.ts` + `test/finance/movement-service.test.ts` (sin tocarlos, tras Task 1) | 14 + 14 = 28 pasan |
| `test/finance/expense-payments-anulacion.test.ts` + `test/finance/direct-debit.test.ts` | 21 + 9 = 30 pasan (direct-debit: 6 existentes sin cambios + 3 nuevos) |
| `test/finance/expense-payments.test.ts` + `test/finance/expense-records-edicion.test.ts` | 35 + 31 = 66 pasan |

Gates finales: `npx tsc --noEmit` = 0; `npm run -s lint:tenant` = `DISCREPANCIAS: 0`; `npm run -s typecheck:tests` = `DISCREPANCIAS: 18`.

Mutaciones (codigo restaurado con `git checkout -- <archivo>` y verificado con `git status`):

- Quitar la guarda de `void`, `correct` y `voidExpense`: fallan los 3 tests de la guarda (uno por entrada); los demas pasan (incluido el control del egreso comun).
- Quitar `direction === "inflow"` de la rama sin sede: falla el caso nuevo de `direct-debit.test.ts` ("La domiciliacion bancaria requiere una sucursal"); los 2 casos de cobros siguen verdes. En esa corrida el archivo `expense-payments-anulacion` murio por el `Hook timed out` conocido del provisioning (2 archivos a la vez), asi que los tests de pago con `direct_debit` no se vieron fallar con esta mutacion, pero pasan por la misma rama (banco sin sede). Una primera mutacion (solo la rama con sede) no fallo nada porque los bancos no tienen sede: esa rama la cubren los cobros AR de `direct-debit.test.ts`, que no cambian.

## Deviations from Plan

None - plan ejecutado como estaba escrito.

Detalle menor: `voidPayment` devuelve `getDetail` con `country`, igual que `registerPayment`; si el gasto es de otro pais, 404 "Gasto no encontrado".

## Decisiones del ejecutor

- **Guarda con `this.db` antes de abrir la tx** (no dentro de la tx) en `void` y `correct`, como pedia el plan ("antes de abrir la tx" / "antes de anular"): es una lectura simple por id y el pago no puede aparecer despues, porque los pagos se crean con su fila del ledger recien creada en la misma tx. La guarda acepta `TxHandle` por si un plan futuro la necesita dentro de una tx.
- **La guarda tambien rechaza filas de pagos ya anulados** (no filtra por `voided_at`): desde Caja siempre dice "es el pago de un gasto", nunca "ya anulada". Es la respuesta mas simple y no cambia nada para filas que no son pagos.
- **Motivo de `voidPayment`**: recortado, obligatorio, mismo texto que la anulacion del gasto ("El motivo de la anulación es obligatorio"). Se guarda recortado en el pago, en el ledger (`void_reason`) y en el audit.
- **Gasto de otro pais en `voidPayment`**: 404 "Gasto no encontrado" (antes que el 404 del pago).
- **Pago de otro gasto**: 404 "Pago no encontrado".
- **Candado del pago**: `SELECT ... FOR UPDATE` sobre `expense_payments` sin join (leccion de 209-05). El gasto se lee solo con `id` y `country`.

## Para los planes siguientes

- `ExpensePaymentService.voidPayment(ctx, recordId, paymentId, reason, adminId, opts?: { country?: ExpenseCountry | null }): Promise<ExpenseRecordDetail>`. Errores: 400 motivo vacio o pago ya anulado, 404 gasto (inexistente o de otro pais) o pago (inexistente o de otro gasto). La ruta de 209-07 (`POST /expenses/records/:id/payments/:paymentId/void` o la que defina el plan) devuelve el detalle del gasto.
- Audit `expense_payment_voided` (`targetKind "expense_record"`, `targetId` = id del gasto, `reason`, payload `{ paymentId, transactionId, amount, appliedAmount, currency }`); en el detalle sale en `history`. El ledger tambien deja `transaction_voided` (`targetKind "transaction"`).
- Un pago anulado sigue en `detail.payments` con `voidedAt`, `voidReason` y `voidedByName`; no suma en `paid`.
- `direct_debit` ya sirve para pagar un gasto desde un banco (AR sin sede y EUR en un gasto de Espana). Desde una caja de efectivo da 400 por la regla medio-cuenta (mensaje "El medio Domiciliación no corresponde a la caja de efectivo ...").
- Mensaje de la guarda de Caja, para el admin: "Este movimiento es el pago de un gasto: anulalo desde Egresos, en el detalle del gasto". Las pantallas de Caja/Retiros que anulen una fila del ledger pueden mostrarlo tal cual (viene como 400).
- Tests que limpian el ledger: ademas de `financial_transactions` por `cash_register_id`, borrar `audit_log` con `target_kind = 'transaction'` y los ids del ledger propio (lo deja `_void`).

## Known Stubs

None.

## Threat Flags

None. T-209-21 (guarda en las 3 entradas publicas, probada con mutacion), T-209-22 (condicion `inflow`, cobros AR y sin sede intactos y con el mismo mensaje) y T-209-23 (motivo obligatorio, `expense_payment_voided` y `transaction_voided` en la misma tx, probados) quedan mitigados.

## Self-Check: PASSED

- Archivos creados verificados en disco (guarda, test de anulacion) y `git status` limpio tras los commits de codigo.
- Commits `e7d202020` y `6f36bc05f` existen en la rama.

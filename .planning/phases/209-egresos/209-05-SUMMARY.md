---
phase: 209-egresos
plan: 05
subsystem: finance
tags: [egresos, pagos, ledger, idempotencia, for-update, tipo-de-cambio]
requires: [209-01, 209-02, 209-03, 209-04]
provides:
  - ExpensePaymentService.registerPayment, listPaymentAccounts y getFormOptions
affects: [209-06, 209-07, 209-08, 209-09]
tech-stack:
  added: []
  patterns: [pago + fila del ledger en la misma tx, candados gasto -> cuenta, idempotencia con relectura ante duplicado]
key-files:
  created:
    - el-templo-api/src/modules/finance/expense-payment-service.ts
    - el-templo-api/test/finance/expense-payments.test.ts
  modified:
    - el-templo-api/src/modules/finance/expense-record-service.ts
decisions:
  - La sede de la cuenta se lee aparte (sin leftJoin) para que el FOR UPDATE no bloquee la fila de la sede
  - `optionalText` de expense-record-service pasa a exportarse (una palabra) en vez de duplicarlo
metrics:
  tasks: 3
  completed: 2026-11-11
---

# Phase 209 Plan 05: Pagos de un gasto Summary

`ExpensePaymentService` registra un pago como una fila de `expense_payments` y su fila `expense`/`outflow` del ledger (`txnService.create` con la tx del pago, sin responsable), con todas las guardas de DI-05, importes de `computePaymentAmounts`, idempotencia y audit; mas las cuentas elegibles SIN saldos y las opciones del formulario.

## Que se hizo

1. **Task 1** (`600fc50d6`): `registerPayment`. Orden dentro de la tx: gasto `FOR UPDATE` -> cuenta `FOR UPDATE` -> sede de la cuenta -> moneda -> fechas (futura / anterior al corte) -> regla medio-cuenta -> `computePaymentAmounts` -> pagado de mas (solo gasto `confirmado`, lee `loadPaidByRecord`) -> tope de efectivo (`getBalance` + `assertEfectivoCoversOutflow`) -> ledger -> `expense_payments` -> audit `expense_payment_registered`. Tambien se exporto `optionalText` de `expense-record-service.ts`.
2. **Task 2** (`7bf0c4f04`): `listPaymentAccounts` (sin saldos, con orden efectivo de sede / Central y Tesoros / bancos) y `getFormOptions`.
3. **Task 3** (`0344ed2a2`): `test/finance/expense-payments.test.ts`, 35 tests.

## Verificacion

| Corrida | Resultado |
|---|---|
| `npx vitest run test/finance/expense-payments.test.ts --hookTimeout=540000` | 35 tests pasan (~172 s con el provisioning), a la primera |
| Mutacion: quitar el `FOR UPDATE` de la cuenta y correr `-t "simultáneos"` | falla el test de efectivo simultaneo (2 pagos pasaron), los demas pasan; codigo restaurado con `git checkout -- <archivo>` |

Gates finales: `npx tsc --noEmit` = 0; `npm run -s lint:tenant` = `DISCREPANCIAS: 0`; `npm run -s typecheck:tests` = `DISCREPANCIAS: 18`. El service no menciona `responsibleName`.

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written, salvo las adiciones y ajustes de abajo.

### Ajustes menores (fuera de la letra del plan)

- **Sede de la cuenta sin `leftJoin` en la lectura con candado.** El plan pedia la cuenta con `leftJoin` de `branches`. Un `SELECT ... FOR UPDATE` con join bloquea tambien la fila de la sede, asi que se bloquea solo la cuenta y la sede se lee en una query aparte con `tenantWhere` (misma validacion, menos contencion). `listPaymentAccounts` si usa el `leftJoin` con `tenantWhere` en el ON.
- **`expense-record-service.ts` tocado** (no estaba en `files_modified`): solo `function optionalText` -> `export function optionalText`, para reusar el recorte de texto y no duplicarlo. Sin cambio de comportamiento.
- **Moneda de la cuenta**: el mensaje del paso (b) es "La cuenta X esta en EUR: no sirve para pagar este gasto" (sin nombrar el pais) para no duplicar el mapa de nombres de pais que ya tienen `expense-math.ts` y `expense-record-service.ts` (ambos privados).

## Decisiones del ejecutor

- **Idempotencia**: la clave se busca ANTES de validar (como en el alta de gasto). Con la misma clave en el mismo gasto se devuelve el pago (`created: false`) sin revalidar nada; si el gasto no es del pais del request, `getDetail` da 404. En otro gasto, 409 "Esa clave de pago ya se usó en otro gasto". Clave vacia tras recortar = sin clave; mas de 64 caracteres = 400. La normalizacion de la clave es una funcion local (el metodo equivalente de `ExpenseRecordService` es privado).
- **Carrera de la misma clave**: dos pedidos simultaneos entran a la tx, el segundo espera el candado del gasto, choca con la unique `(tenant_id, idempotency_key)`, la tx se deshace entera (ledger incluido) y se relee. Probado: un solo pago y una sola fila del ledger.
- **Lo pagado se lee con `recordService.loadPaidByRecord`** (otra conexion, ve lo commiteado) y no con un SUM propio dentro de la tx: es la unica fuente del "pagado" (DI-11) y, con el gasto bloqueado, no hay otro pago en vuelo. El tope de efectivo lee `getBalance` igual que el retiro.
- **Tope de efectivo para cualquier fecha**: se compara contra el saldo firme actual aunque el pago sea de una fecha pasada (igual que el retiro).
- **Medios admitidos**: `EXPENSE_PAYMENT_METHODS` incluye `direct_debit`. Hasta 209-06, un pago con `direct_debit` pasa las guardas del service pero `txnService.create` lo rechaza con 400 (validacion SEPA) y no queda nada escrito. Los tests de este plan no lo usan.
- **`opts.country`**: el gasto de otro pais es 404 "Gasto no encontrado" (como `getDetail`).
- **Mensajes del plan** respetados al pie de la letra (gasto anulado, cuenta inactiva, otro pais, futura, corte, pagado de mas, ya pagado, medio). Mensajes elegidos por el ejecutor: "La fecha del pago no es válida", "El importe del pago tiene que ser un entero entre 1 y 2000000000", "{La referencia|Las notas} no puede superar los N caracteres".
- **Tests**: cuentas propias por test (sin compartir saldos), ledger propio borrado por `cash_register_id` de las cuentas propias, caja del gimnasio 2 sembrada con `seedSecondTenant` y limpiada con `limpiarSegundoGimnasio`. El test de "no es retiro" tiene un control positivo (un egreso con responsable en la misma cuenta SI aparece como retiro).

## Para los planes siguientes

En `el-templo-api/src/modules/finance/expense-payment-service.ts`:

- `new ExpensePaymentService(db, log, txnService: TransactionService, cashRegisterService: CashRegisterService, recordService: ExpenseRecordService)`
- `registerPayment(ctx, recordId: number, input: RegisterExpensePaymentInput, adminId: number, opts?: { country?: ExpenseCountry | null }): Promise<{ record: ExpenseRecordDetail; payment: ExpensePaymentItem; created: boolean }>`. Errores: 404 `NotFoundError("Gasto no encontrado")`, 409 `ConflictError` (clave de otro gasto), el resto `BadRequestError`. La ruta (209-07) debe responder 201 con `created: true` y 200 con `created: false` (DI-16).
- `listPaymentAccounts(ctx, country): Promise<ExpensePaymentAccount[]>` y `getFormOptions(ctx, country): Promise<ExpenseFormOptions>` (sin saldos; las rutas de Egresos NO usan `enforceCajaScope`).
- Audit: `expense_payment_registered`, `targetKind "expense_record"`, `targetId` = id del gasto, payload `{ paymentId, transactionId, paidOn, cashRegisterId, paymentMethod, amount, currency, appliedAmount, fxRate, amountArs }`. 209-06 debe escribir `expense_payment_voided` con el mismo `targetKind`/`targetId`.
- Cada pago guarda `transaction_id` (unique con `tenant_id`) = fila `expense`/`outflow` del ledger: la anulacion del pago (209-06) tiene que anular ESA fila con `txnService.voidInTx(ctx, tx, transactionId, voidedBy, { reason, ... })` dentro de su tx, tomando los candados en el mismo orden (gasto primero).
- **209-06 / `direct_debit` saliente**: hoy `transaction-service.ts:~286-302` rechaza `direct_debit` en cualquier fila con sede nula o de pais distinto de ES. El cambio de DI-06 (validacion SEPA solo para `inflow`) hace que `registerPayment` funcione con ese medio sin tocar este service; agregar ahi el test de un pago `direct_debit` desde un banco.
- Para tests de otros planes: `listMovEgresos(ctx, { cashRegisterId, isOwner: true })` ve el pago como `kind: "expense"` con `costCenterName` y `responsibleName: null`; `WithdrawalService.list(ctx, { cashRegisterId, isOwner: true })` no lo lista.
- El saldo de una cuenta con pagos de fecha anterior a su `cutoff_date` NO los cuenta: por eso el service rechaza esas fechas. Un test que arme pagos a mano (como el de 209-04) tiene que respetarlo.

## Known Stubs

None.

## Threat Flags

None. T-209-15 (`tenantWhere` en la cuenta y mismo 400 para inexistente y ajena, probado), T-209-16 (ledger y pago en la misma tx, saldo exacto probado, tx deshecha ante la carrera de la clave), T-209-17 (400 anterior al corte), T-209-18 (`listPaymentAccounts` sin saldos, claves exactas probadas) y T-209-20 (orden fijo gasto -> cuenta, dos concurrencias probadas) quedan mitigados. T-209-19 aceptado (el mensaje del tope de efectivo muestra el saldo, es el guard existente).

## Self-Check: PASSED

- Archivos creados y modificados verificados en disco (service, test y `expense-record-service.ts`).
- Commits `600fc50d6`, `7bf0c4f04` y `0344ed2a2` existen en la rama.

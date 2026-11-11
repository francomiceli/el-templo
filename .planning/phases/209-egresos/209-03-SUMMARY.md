---
phase: 209-egresos
plan: 03
subsystem: finance
tags: [egresos, gasto, reparto, idempotencia, audit-log, cargadores-en-lote]
requires: [209-01, 209-02]
provides:
  - ExpenseRecordService.create y getDetail
  - cargadores en lote reutilizables (reparto, pagado, pagos, historial, toListItems, nombres de usuarios)
affects: [209-04, 209-05, 209-07, 209-09]
tech-stack:
  added: []
  patterns: [una query por tabla con inArray, filtro de tenant en el ON de los joins, idempotencia con relectura ante duplicado]
key-files:
  created:
    - el-templo-api/src/modules/finance/expense-record-service.ts
    - el-templo-api/test/finance/expense-records-alta.test.ts
  modified: []
decisions:
  - Tasks 1 y 2 en un solo commit (create depende de getDetail)
  - clave de idempotencia usada en otro pais da 400, no devuelve el gasto ajeno
metrics:
  tasks: 3
  completed: 2026-11-11
---

# Phase 209 Plan 03: Alta y detalle del gasto Summary

`ExpenseRecordService` con el alta de gasto (validaciones en español, reparto y audit en UNA transacción, idempotencia con relectura ante carrera) y el detalle con reparto por sede, pagos, estado calculado, marca de datos incompletos e historial leído de `audit_log`, más los cargadores en lote que usarán el listado (209-04) y el Resumen (209-09).

## Que se hizo

1. **Tasks 1 y 2** (`b3d3461f6`, un solo commit porque `create` termina llamando a `getDetail`, como admite el plan): `expense-record-service.ts`.
2. **Task 3** (`6e5bc2176`): `test/finance/expense-records-alta.test.ts`, 23 tests.

## Verificacion

| Corrida | Resultado |
|---|---|
| `npx vitest run test/finance/expense-records-alta.test.ts --hookTimeout=540000` | 23 tests pasan (~146 s con el provisioning), a la primera |

Gates finales: `npx tsc --noEmit` = 0 errores; `npm run -s lint:tenant` = `DISCREPANCIAS: 0`; `npm run -s typecheck:tests` = `DISCREPANCIAS: 18` (línea base, ninguna en archivos del plan). `grep -c inArray` del service = 6.

## Deviations from Plan

None - plan executed exactly as written. (Las Tasks 1 y 2 se commitearon juntas, supuesto previsto en el criterio de aceptación de la Task 1.)

## Decisiones del ejecutor

- **Idempotencia entre países:** si la clave ya existe pero el gasto es de otro país que el del request, `create` lanza 400 "La clave de idempotencia ya se usó en un gasto de otro país" en lugar de devolver el gasto ajeno (lo más conservador: no filtra datos entre países para no-owners). Una clave vacía tras recortar equivale a "sin clave"; más de 64 caracteres da 400.
- **Orden de validación:** concepto, beneficiario, mes, importe, moneda, tipo de cambio, estado del importe, rubro, links, notas, reparto. El primer error corta.
- **Mensajes agregados por el ejecutor** (el plan no los fijaba): concepto > 200 "El concepto no puede superar los 200 caracteres"; beneficiario/observaciones largos "{El beneficiario|Las observaciones} no puede superar los N caracteres"; estado del importe inválido "El estado del importe tiene que ser estimado o confirmado"; "La clave de idempotencia no puede superar los 64 caracteres".
- **`receipt_links`:** se guarda `null` (no `[]`) cuando no hay links; el detalle devuelve `[]`.
- **Retorno de `loadPayments` / `loadHistory`:** devuelven `{ items, userIds }` con `createdBy`/`voidedBy`/`actorId` crudos en cada item, para que `getDetail` resuelva TODOS los nombres con UNA query (`userNamesByIds`) en vez de joins con alias de `users`. Los métodos son públicos (no `protected`) para que 209-04/209-09 y los services de pagos los usen.
- **Nombres de usuario:** `firstName` + `lastName` recortados y unidos con espacio; `null` si ninguno existe o el usuario es de otro gimnasio.
- **Narrowing de DB a tipos cerrados:** `toExpenseCountry`, `toExpenseCurrency` (exportadas) y un helper interno para el medio de pago; un valor inesperado lanza `Error` (dato corrupto), no 400.
- **Test del rubro "Retiros":** se busca el de El Templo existente (AR) y, si no está, se crea y se borra al final. Supone que el existente está activo (si estuviera inactivo, el mensaje sería "Elegí un rubro activo..." y el test fallaría; en la DB de test no ocurre).
- **Tests con datos del gimnasio 2:** el test usa `seedSecondTenant`/`limpiarSegundoGimnasio` y un rubro propio del gimnasio 2 (borrado antes de limpiar el tenant por la FK) para verificar T-209-07.

## Para los planes siguientes

Todo en `el-templo-api/src/modules/finance/expense-record-service.ts`:

- `class ExpenseRecordService { constructor(db: MySql2Database<typeof schema>, log: FastifyBaseLogger) }`
- `create(ctx: TenantContext, country: ExpenseCountry, input: CreateExpenseRecordInput, adminId: number): Promise<{ record: ExpenseRecordDetail; created: boolean }>`
- `getDetail(ctx, id: number, opts?: { country?: ExpenseCountry | null }): Promise<ExpenseRecordDetail>` (`NotFoundError("Gasto no encontrado")` si no existe, es de otro gimnasio o `opts.country` difiere)
- `loadAllocations(ctx, recordIds: number[]): Promise<Map<number, Array<{ branchId: number | null; branchName: string; amount: number }>>>`
- `loadPaidByRecord(ctx, recordIds: number[]): Promise<Map<number, number>>` (Σ `applied_amount` con `voided_at IS NULL`; un gasto sin pagos vigentes NO aparece en el Map: usar `?? 0`)
- `loadPayments(ctx, recordId): Promise<{ items: Array<{ item: Omit<ExpensePaymentItem, "createdByName" | "voidedByName">; createdBy: number; voidedBy: number | null }>; userIds: number[] }>`
- `loadHistory(ctx, recordId): Promise<{ items: Array<{ item: Omit<ExpenseHistoryItem, "actorName">; actorId: number }>; userIds: number[] }>`
- `toListItems(ctx, rows: ExpenseRecordRow[]): Promise<ExpenseRecordListItem[]>` (rubros, reparto y pagado en UNA query cada uno; reparto con `amountInCountryCurrency` prorrateado)
- `userNamesByIds(ctx, userIds: number[]): Promise<Map<number, string>>`
- Tipo `ExpenseRecordRow = typeof schema.expenseRecords.$inferSelect`; funciones sueltas `toExpenseCountry(value: string)` y `toExpenseCurrency(value: string)`.

Notas:
- El país se pasa a `create` desde el scope (209-07); no se puede editar después, ni la moneda.
- `create` valida el rubro con un método privado `assertUsableCostCenter(ctx, country, costCenterId)` (activo, del país, no "Retiros"). 209-05 (edición) que cambie el rubro tiene que repetir esa regla: conviene volverlo `protected`/público al editar ese archivo en vez de duplicarlo.
- El evento `expense_record_created` guarda en el payload `{ concept, amount, currency, amountStatus, fxRate, imputationMonth, costCenterId, allocations }`.
- Los pagos de 209-05/06 que escriban audit deben usar `targetKind: "expense_record"` y `targetId` = id del gasto (el historial del detalle los lee con esa condición).
- `afterAll` de los tests de los planes siguientes: borrar `expense_payments` → ledger propio → `expense_allocations` → `expense_records` → `audit_log` propio.

## Known Stubs

None.

## Threat Flags

None. T-209-07 (rubro y sede de otro gimnasio rechazados, probado), T-209-08 (audit en la misma transacción), T-209-09 (unique por tenant + relectura ante duplicado) y T-209-10 (`normalizeReceiptLinks`) quedan mitigados.

## Self-Check: PASSED

- Archivos creados verificados en disco (service y test).
- Commits `b3d3461f6` y `6e5bc2176` existen en la rama.

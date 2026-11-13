---
phase: 211-resultado-por-sede
plan: 01
subsystem: finance
tags: [egresos, resultado, margen, cobros-alumnos]
requires: [209-09 computeMonth, 207 member_branch_id]
provides: [expense-result-math, getMemberIncomeByBranch, tipos ExpenseResult*]
affects: [211-02, 211-03, 211-04, 211-05]
key-files:
  created:
    - el-templo-api/src/modules/finance/expense-result-math.ts
    - el-templo-api/test/unit/expense-result-math.test.ts
    - el-templo-api/test/finance/expense-result-income.test.ts
  modified:
    - el-templo-api/src/modules/finance/expense-types.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
metrics:
  tasks: 2
  completed: 2026-11-13
---

# Phase 211 Plan 01: Base de cálculo del Resultado por sede Summary

Cuentas puras del Resultado (columnas por sede, Casa Matriz, Consolidado, margen con un decimal) y lector nuevo de cobros firmes a alumnos por sede, sin cambiar ninguna línea existente de los caminos de cobro.

## Qué se hizo

- **Task 1** (`73c7e74e6`): tipos `ExpenseResult*` en `expense-types.ts`; módulo puro `expense-result-math.ts`; test unitario (24 casos).
- **Task 2** (`aeaa2f2b5`): `TransactionService.getMemberIncomeByBranch` (solo líneas agregadas: import `isNotNull` + método nuevo) y su test de integración (6 casos).

## Firmas exportadas para 211-02

`src/modules/finance/expense-result-math.ts` (sin DB):

```ts
RESULT_CONSOLIDATED_KEY = "consolidado"; RESULT_CONSOLIDATED_LABEL = "Consolidado"
monthDateRange(month: string): { dateFrom: string; dateTo: string }
marginPctOf(result: number, income: number): number | null
partitionIncome(
  raw: ReadonlyMap<number, ReadonlyMap<string, { amount: number; count: number }>>,
  countryBranches: ReadonlyMap<number, { name: string }>,
  currency: string,
): { incomeByBranch: Map<number, number>; foreignIncome: ExpenseResultForeignIncome[] }
buildResultMatrix(input: {
  destinations: ReadonlyArray<{ key; branchId: number | null; name; isActive }>;
  records: ReadonlyArray<{ costCenterId; costCenterName; shares: ReadonlyMap<string, { cost; costEstimated }> }>;
  incomeByBranch: ReadonlyMap<number, number>;
  countryBranches: ReadonlyMap<number, { name; isActive; isVirtual }>;
}): { columns: ExpenseResultColumn[]; costCenters: ExpenseResultCostCenter[] }
```

`expense-types.ts`: `ExpenseResultColumnKind`, `ExpenseResultColumn`, `ExpenseResultCostCenter`, `ExpenseResultForeignIncome`, `ExpenseResult`.

`TransactionService.getMemberIncomeByBranch(ctx, { dateFrom, dateTo }): Promise<Map<branchId, Map<moneda, { amount, count }>>>`. No filtra moneda, estado ni virtualidad de la sede ni país: el service de 211-02 debe pasar por `partitionIncome` con `countryBranches` (todas las sedes del país, activas o no, virtuales o no) y la moneda del país.

Notas para 211-02:
- `buildResultMatrix` recibe `destinations` de `computeMonth` (con la clave `casa_matriz` para Casa Matriz) y `records` de `computeMonth` directamente (los tipos son estructurales, `ExpenseMonthRecord`/`Destination` encajan).
- La columna de una sede extra (con cobros, fuera de `destinations`) usa `key = String(branchId)`.
- `isVirtual` de las columnas de `destinations` sale de `countryBranches`: hay que incluir ahí también las sedes inactivas con reparto.
- Las sedes con cobros en `incomeByBranch` que NO estén en `countryBranches` se ignoran (`partitionIncome` ya las descartó).
- El Consolidado trae `isActive: true`, `branchId: null`, `name: "Consolidado"`.

## Resultados

Corridas (foreground):
- `npx vitest run --config vitest.config.unit.ts test/unit/expense-result-math.test.ts`: 24 pasados / 0 fallados.
- `npx vitest run test/finance/expense-result-income.test.ts test/finance/member-branch-snapshot.test.ts --hookTimeout=540000`: `expense-result-income` 6/0, `member-branch-snapshot` 14/0 (20 pasados, 0 fallados; 209 s). El harness mandó la corrida a segundo plano a los 180 s; se esperó con un único `tail --pid`.

Gates (tras el último commit):
- `npx tsc --noEmit` = 0
- `npm run -s typecheck:tests` = `DISCREPANCIAS: 18`
- `npm run -s lint:tenant` = `DISCREPANCIAS: 0`
- Diff de `transaction-service.ts` sin líneas borradas ni modificadas (`grep -E '^-[^-]'` vacío); `grep -c "isNotNull(schema.financialTransactions.memberId)"` = 1.
- Módulo puro: 0 imports de drizzle/fastify/schema; 1 `Math.round` fuera de comentarios.
- `vue-tsc` del admin no se corrió: no se tocó el admin.

## Desviaciones del plan

Ninguna: el plan se ejecutó como estaba escrito.

## Decisiones del ejecutor

1. `buildResultMatrix`: cuando un destino con clave `casa_matriz` viene en `destinations` se usa su `name` (con "Casa Matriz" de respaldo si viniera vacío). Una sede extra con cobros cuyo id no está en `countryBranches` se ignora (no debería ocurrir tras `partitionIncome`).
2. La excepción por costo en clave sin columna incluye el nombre del rubro y la clave en el mensaje.
3. Test de integración: el ajuste de arqueo y la devolución se insertan directo con `tenantValues`; el `cash_transfer` se siembra con `seedIncome` sobre un alumno (para que lo excluya el `kind` y no solo la falta de alumno). La devolución es outflow: la excluye `direction = 'inflow'`.
4. `isActive` del Consolidado = `true` (no tiene sentido nullable en el contrato).

## Bugs encontrados

Ninguno.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Archivos creados presentes, commits `73c7e74e6` y `aeaa2f2b5` existen.

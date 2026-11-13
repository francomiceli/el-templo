---
phase: 211-resultado-por-sede
plan: 02
subsystem: finance
tags: [egresos, resultado, api, excel, tenancy]
requires: [211-01]
provides: [ExpenseResultService, buildExpenseResultWorkbook, EXPENSES_RESULT_ROLES, listCountryBranches, rutas /expense-records/result]
affects: [211-03, 211-04, 211-05]
key-files:
  created:
    - el-templo-api/src/modules/finance/expense-result-service.ts
    - el-templo-api/src/modules/finance/expense-result-excel.ts
  modified:
    - el-templo-api/src/modules/shared/permissions.ts
    - el-templo-api/src/modules/finance/expense-branches.ts
    - el-templo-api/src/modules/finance/expense-summary-excel.ts
    - el-templo-api/src/modules/finance/expense-schemas.ts
    - el-templo-api/src/modules/finance/expense-routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
metrics:
  tasks: 2
  completed: 2026-11-13
---

# Phase 211 Plan 02: API del Resultado por sede Summary

Service, Excel, permiso propio (owner y admin), schemas y 2 rutas (`/result` JSON y `/result/export` Excel) que sacan el Resultado de una sola función (`getResult`), con el costo de `computeMonth` y los cobros de `getMemberIncomeByBranch`; manifiesto de tenancy 568 -> 570.

## Qué se hizo

- **Task 1** (`80f30cd9c`): `EXPENSES_RESULT_ROLES = ["owner","admin"]` (literal propio); `listCountryBranches` (todas las sedes del país, activas o no, virtuales o no, con `tenantWhere`); `ExpenseResultService.getResult` (valida mes, `Promise.all` de `computeMonth` + `getMemberIncomeByBranch(monthDateRange)` + `listCountryBranches`, `partitionIncome`, `buildResultMatrix`, `log.warn` si hay `foreignIncome`); `expense-result-excel.ts`; `export` de `COUNTRY_LABELS` (único cambio en `expense-summary-excel.ts`).
- **Task 2** (`57c6da046`): `expenseResultSchema` (200 completo con todo en `required`) y `expenseResultExportSchema`; las 2 rutas dentro de `registerExpenseRoutes`, después del Resumen y antes de `GET /expense-records` y de `/:id`, reusando la misma instancia `summaryService`; manifiesto y baseline.

## Firmas y forma del JSON para 211-03 en adelante

```ts
// permissions.ts
EXPENSES_RESULT_ROLES = ["owner", "admin"] as const

// expense-branches.ts
listCountryBranches(db, ctx, country): Promise<Map<number, { id; name; isActive; isVirtual }>>

// expense-result-service.ts
new ExpenseResultService(db, log, summaryService: ExpenseSummaryService, transactionService: TransactionService)
.getResult(ctx, country, month): Promise<ExpenseResult>   // BadRequestError si el mes no es AAAA-MM

// expense-result-excel.ts
RESULT_FOOTNOTE: string
resultColumnLabel({ name, isActive, isVirtual }): string   // "Nombre", "Nombre (inactiva)", "Nombre (virtual)", "Nombre (inactiva, virtual)"
buildExpenseResultWorkbook(result: ExpenseResult): Workbook
```

Rutas (prefijo `/api/admin/finance`, `?month=AAAA-MM` obligatorio, `?country=AR|ES` lo usa el owner):
- `GET /expense-records/result` -> JSON `ExpenseResult`:
  `{ month, country, currency: "ARS"|"EUR", columns: [{ key, kind: "branch"|"casa_matriz"|"consolidado", branchId|null, name, isActive, isVirtual, income, costsByCostCenter: { [costCenterId]: int }, cost, costEstimated, result, marginPct: number|null }], costCenters: [{ id, name }], incomplete: { total, estimated, missingFxRate, missingReceipts }, foreignIncome: [{ branchId, branchName, currency, count, amount }] }`
- `GET /expense-records/result/export` -> `.xlsx` (`egresos-resultado-<país>-<mes>-YYYY-MM-DD.xlsx`), hoja "Resultado".
- 403 con `{ error: "Acceso denegado", message: "Solo owner y admin ven el Resultado por sede" }` para gestion, admin_sede, recepcion y coach. Etiquetas de `assertTenant`: `finance.expense-records.result` y `...result.export`.

Excel: fila 1 encabezados (`Concepto` + `resultColumnLabel` por columna); filas "Cobros a alumnos" (Casa Matriz "—"), un renglón por rubro, "Total costos" (negrita), "De eso, estimado", "Resultado" (negrita), "Margen" (`marginPct/100`, `0.0%`; Casa Matriz "—"; `null` -> "sin base de cálculo"); fila vacía; título en itálica `Resultado AAAA-MM · País · Moneda`; `RESULT_FOOTNOTE` en itálica. La columna Consolidado va en negrita; importes `#,##0`.

## Resultados

Corridas (foreground):
- `npx vitest run test/tenancy/iso-01-manifiesto.test.ts --hookTimeout=540000`: 13 pasados / 0 fallados (129 s).

Gates (tras el último commit de código):
- `npx tsc --noEmit` = 0
- `npm run -s typecheck:tests` = `DISCREPANCIAS: 18`
- `npm run -s lint:tenant` = `DISCREPANCIAS: 0`
- Greps: `computeMonth(` en el service = 1; `expenseRecords|expenseAllocations|expensePayments` en el service = 0; diff de `expense-summary-excel.ts` = 1 línea (`export const COUNTRY_LABELS`); `grep -c "expense-records/result" test/tenant-manifest.ts` = 2; rutas del Resultado (líneas 304 y 334) antes de `"/expense-records/:id"` (429).
- `ENTRADAS_BASELINE`: 568 (el valor encontrado, sin que nadie lo moviera) -> **570**.

No hay tests HTTP del Resultado en este plan (van en 211-03): las rutas y el Excel se verificaron solo por tipos y por el manifiesto.

## Desviaciones del plan

Ninguna: el plan se ejecutó como estaba escrito.

## Decisiones del ejecutor

1. El título de `it("el manifiesto tiene exactamente las 568 entradas…")` en `iso-01-manifiesto.test.ts` también se actualizó a 570 (el plan decía "títulos al día si los hubiera").
2. `denyUnlessRole` quedó partido en varias líneas por Prettier: `EXPENSES_RESULT_ROLES` aparece 4 veces en `expense-routes.ts` (import, 1 mención en el docblock del archivo y los 2 usos), no 3.
3. En el Excel, `resultColumnLabel` combina las marcas como `(inactiva, virtual)` y la negrita del Consolidado se aplica celda a celda sobre las filas de la tabla (no sobre la columna entera, para no teñir el título ni la nota).
4. El schema 200 declara `marginPct` como `["number","null"]` (único decimal) y el resto de los importes como `integer`, todos en `required`.

## Bugs encontrados

Ninguno.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: las 2 rutas nuevas están en el modelo de amenazas del plan (T-211-04..07) y en el manifiesto de tenancy.

## Self-Check: PASSED

Archivos creados presentes; commits `80f30cd9c` y `57c6da046` existen.

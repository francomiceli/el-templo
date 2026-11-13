---
phase: 211-resultado-por-sede
plan: 04
subsystem: admin
tags: [egresos, resultado, admin, helpers, composable]
requires: [211-03]
provides: [ExpenseResult types, getExpenseResult, exportExpenseResult, helpers del Resultado, incompleteExpensesText, expenseCurrencyNote]
affects: [211-05]
key-files:
  modified:
    - el-templo-admin/src/types/expense.ts
    - el-templo-admin/src/utils/expenses.ts
    - el-templo-admin/src/utils/__tests__/expenses.test.ts
    - el-templo-admin/src/components/egresos/ResumenTab.vue
    - el-templo-admin/src/composables/useExpensesApi.ts
metrics:
  tasks: 2
  completed: 2026-11-13
---

# Phase 211 Plan 04: Base del admin para el Resultado Summary

Tipos espejo de la API, 9 exports de presentación con test en `utils/expenses.ts`, 2 métodos nuevos en `useExpensesApi` (con la descarga en blob compartida) y `ResumenTab.vue` usando los helpers de incompletos y de moneda con los mismos textos de antes.

## Qué se hizo

- **Task 1** (`736065e88`): tipos `ExpenseResult`, `ExpenseResultColumn`, `ExpenseResultColumnKind`, `ExpenseResultCostCenter`, `ExpenseResultForeignIncome` en `types/expense.ts`; helpers y constantes en `utils/expenses.ts`; 9 tests nuevos; `ResumenTab.vue` reemplaza `currencyNote` e `incompleteText` por llamadas a los helpers (único cambio del archivo, más el import).
- **Task 2** (commit `feat(211-04): llamadas del resultado por sede en el admin`): `downloadBlob` privado (único `responseType: 'blob'` del composable), `exportExpenseSummary` delega en él con el mismo mensaje, y se suman `getExpenseResult` y `exportExpenseResult` al retorno.

## Firmas exportadas para 211-05

```ts
// types/expense.ts
type ExpenseResultColumnKind = 'branch' | 'casa_matriz' | 'consolidado'
interface ExpenseResultColumn { key: string; kind: ExpenseResultColumnKind; branchId: number | null; name: string; isActive: boolean; isVirtual: boolean; income: number; costsByCostCenter: Record<string, number>; cost: number; costEstimated: number; result: number; marginPct: number | null }
interface ExpenseResultCostCenter { id: number; name: string }
interface ExpenseResultForeignIncome { branchId: number; branchName: string; currency: string; count: number; amount: number }
interface ExpenseResult { month: string; country: ExpenseCountry; currency: 'ARS' | 'EUR'; columns: ExpenseResultColumn[]; costCenters: ExpenseResultCostCenter[]; incomplete: ExpenseSummary['incomplete']; foreignIncome: ExpenseResultForeignIncome[] }

// utils/expenses.ts
RESULT_CONSOLIDATED_KEY = 'consolidado'
RESULT_FOOTNOTE: string
formatMarginPct(marginPct: number): string                       // "12,3 %", "-50,0 %"
resultMarginLabel(column: Pick<ExpenseResultColumn, 'kind' | 'marginPct'>): string   // "—" | "sin base de cálculo" | "22,2 %"
resultColumnLabel(column: Pick<ExpenseResultColumn, 'name' | 'isActive' | 'isVirtual'>): string
resultDetailDestination(column: Pick<ExpenseResultColumn, 'kind' | 'key'>): string   // consolidado -> 'total'
foreignIncomeNotice(items: ReadonlyArray<Pick<ExpenseResultForeignIncome, 'branchName' | 'currency' | 'count' | 'amount'>>): string  // '' si no hay
incompleteExpensesText(inc: ExpenseSummary['incomplete']): string // '' si total <= 0
expenseCurrencyNote(country: ExpenseCountry): string

// composables/useExpensesApi.ts
getExpenseResult(country: ExpenseCountry, month: string): Promise<ExpenseResult>
exportExpenseResult(country: ExpenseCountry, month: string): Promise<Blob>
```

## Resultados

Corridas (foreground):
- `npx vitest run --root ../el-templo-admin src/utils/__tests__/expenses.test.ts`: 100 pasados / 0 fallados (91 previos + 9 nuevos).

Gates (tras el último commit de código):
- `vue-tsc --noEmit | grep -c "error TS"` = 27
- `pnpm lint` (admin) = 0 errores, 8 warnings preexistentes (ninguno en archivos del plan)
- `el-templo-api` `npx tsc --noEmit` = 0
- Greps: `grep -c "datos incompletos" ResumenTab.vue` = 0; `incompleteExpensesText(` y `expenseCurrencyNote(` presentes en `ResumenTab.vue`; `result/export` en el composable; `responseType: 'blob'` = 1.

## Desviaciones del plan

Ninguna.

## Decisiones del ejecutor

1. `formatMarginPct`: un negativo que redondea a "0,0" se muestra sin signo ("0,0 %", no "-0,0 %"); lo fija su propio `it`. El `describe` tiene 9 `it`: los bullets del plan agrupados por helper más constantes y este caso.
2. El test importa `formatPrice` desde `../format-price` para armar los esperados de importes, como permitía el plan.
3. Prettier no cambió el formato de nada tras los reemplazos salvo `utils/expenses.ts`.

## Bugs encontrados

Ninguno.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. Los helpers devuelven texto plano (T-211-11) y los textos del Resumen están fijados literalmente por tests (T-211-12).

## Self-Check: PASSED

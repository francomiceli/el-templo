---
phase: 209-egresos
plan: 02
subsystem: finance
tags: [egresos, contratos, aritmetica-entera, prorrateo, sedes-operativas]
requires: [209-01]
provides:
  - contratos de Egresos (expense-types.ts)
  - aritmetica pura de Egresos (expense-math.ts)
  - helper unico de sedes operativas y "hoy" por pais (expense-branches.ts)
affects: [209-03, 209-04, 209-05, 209-06, 209-07, 209-08, 209-09, 209-10, 209-11]
tech-stack:
  added: []
  patterns: [funciones puras con test unit, BigInt en prorrateos, tenantWhere inline en helpers de sedes]
key-files:
  created:
    - el-templo-api/src/modules/finance/expense-types.ts
    - el-templo-api/src/modules/finance/expense-math.ts
    - el-templo-api/src/modules/finance/expense-branches.ts
    - el-templo-api/test/unit/expense-math.test.ts
    - el-templo-api/test/finance/expense-branches.test.ts
  modified: []
decisions:
  - ExpenseAmountStatus de expense-types es re-export del tipo del schema (una sola fuente)
  - prorateCapped redistribuye el exceso de la ultima parte hacia atras
metrics:
  tasks: 3
  completed: 2026-11-11
---

# Phase 209 Plan 02: Contratos y calculo puro de Egresos Summary

Contratos TypeScript de Egresos, toda la aritmetica entera como funciones puras (reparto, estado, tipo de cambio, importes de un pago, prorrateos con BigInt) y el helper unico de sedes operativas con tenancy.

## Que se hizo

1. **Task 1** (`6e8447a19`): `expense-types.ts` con todos los tipos del plan (entrada/salida de gasto, reparto, pago, opciones de formulario, Resumen y detalle del Resumen), `EXPENSE_PAYMENT_METHODS` (5 medios, `as const satisfies`) y comentario "entero, en la moneda indicada" en cada campo de plata.
2. **Task 2** (`d1dc16999`): `expense-math.ts` y su test unit (90 casos con resultados literales).
3. **Task 3** (`743ce6883`): `expense-branches.ts` y `test/finance/expense-branches.test.ts` (9 tests).

## Verificacion

| Corrida | Resultado |
|---|---|
| `npx vitest run --config vitest.config.unit.ts test/unit/expense-math.test.ts` | 90 tests pasan (sin DB) |
| `npx vitest run test/finance/expense-branches.test.ts --hookTimeout=540000` | 9 tests pasan (~148 s con el provisioning) |

Gates finales: `npx tsc --noEmit` = 0 errores; `npm run -s lint:tenant` = `DISCREPANCIAS: 0`; `npm run -s typecheck:tests` = `DISCREPANCIAS: 18` (linea base, ninguna en archivos del plan).

## Deviations from Plan

None - plan executed exactly as written.

## Decisiones del ejecutor

- `ExpenseAmountStatus` en `expense-types.ts` se re-exporta del tipo del schema (`import type ... as SchemaExpenseAmountStatus`) en lugar de redeclarar el union: queda una sola fuente. Mismo nombre y mismos valores que pide el plan.
- `computePaymentAmounts` valida primero la moneda de la cuenta contra el pais, despues el importe (entero 1..`MAX_MONEY`), despues si necesita o no tipo de cambio, y recien ahi `assertValidFxRate`. Un importe 0/negativo/decimal da 400 "El importe del pago tiene que ser un entero mayor a 0" (el plan no fijaba ese texto).
- `prorateCapped`: interpretacion de DI-12 tal como pide el plan (se usa para prorratear lo PENDIENTE sobre el costo de cada destino, asi "pagado de ese costo = costo - pendiente" nunca da negativo por sede). Con total 2 y topes `[1,1,1]` el resultado es `[0,1,1]`. Si `total > suma de topes` lanza `Error` (de programacion, no 400).
- `normalizeReceiptLinks`: ademas de los mensajes del plan, una etiqueta de mas de 80 caracteres da 400 "El nombre del link de comprobante {n} tiene mas de 80 caracteres" (texto elegido por el ejecutor). URL vacia, de mas de 500 caracteres o no http(s) usan el mensaje "no es una URL valida".
- `validateAllocations` valida en este orden: sin destinos, partes enteras > 0, Casa Matriz (permitida / una sola), sede repetida, sede dentro del set valido, suma exacta. Los numeros de "El reparto suma X y el gasto es de Y" van sin separador de miles. Con `allowCasaMatriz=false` y dos Casa Matriz gana el mensaje de "solo para gastos de Argentina".
- `assertValidFxRate` admite como maximo 4 decimales con tolerancia 1e-6 sobre `fx * 10000` (evita falsos rechazos de `1560.1234` por coma flotante).
- `countryToday` asume que todas las sedes de un pais comparten zona horaria (usa la de la primera sede operativa por nombre).
- `listOperationalBranches` ordena por `name` y luego `id`; el orden usa la collation de MySQL, no un `sort` de JS.

## Para los planes siguientes

Firmas exportadas:

`expense-math.ts`
- `MAX_MONEY = 2_000_000_000`
- `EXPENSE_CURRENCIES_BY_COUNTRY: Record<ExpenseCountry, readonly ExpenseCurrency[]>` (AR: ARS, USD; ES: EUR)
- `countryCurrencyOf(country: ExpenseCountry): "ARS" | "EUR"`
- `isValidImputationMonth(s: string): boolean`
- `assertValidFxRate(fx: number): void` (400 si invalido)
- `toCountryCurrency(amount: number, fxRate: number): number`
- `expenseCostInCountryCurrency({ country, currency, amount, fxRate }): number | null`
- `expenseStatusOf(amount, paid): { status: ExpensePaymentStatus; pending: number; overpaid: boolean }`
- `splitEvenly(total: number, n: number): number[]`
- `prorateByWeights(total: number, weights: number[]): number[]`
- `prorateCapped(total: number, caps: number[]): number[]`
- `validateAllocations({ amount, allocations, validBranchIds: ReadonlySet<number>, allowCasaMatriz }): void`
- `computePaymentAmounts({ country, expenseCurrency, accountCurrency: string, amount, fxRate? }): { appliedAmount: number; amountArs: number | null; fxRate: number | null }`
- `isHttpUrl(s: string): boolean`
- `normalizeReceiptLinks(links: ReceiptLink[] | null | undefined): ReceiptLink[]`

`expense-branches.ts`
- `CASA_MATRIZ_LABEL = "Casa Matriz"`, `casaMatrizAllowed(country): boolean`
- `listOperationalBranches(db, ctx, country): Promise<Array<{ id; name; timezone }>>`
- `branchNamesByIds(db, ctx, ids): Promise<Map<number, { name; isActive }>>`
- `countryToday(db, ctx, country): Promise<string>`

`expense-types.ts`: todos los tipos del plan, mas `EXPENSE_PAYMENT_METHODS`. El pais NO viaja en `CreateExpenseRecordInput` (sale del scope).

Notas:
- Los pagos que el service guarde deben tomar `appliedAmount`, `amountArs` y `fxRate` de `computePaymentAmounts`: el unico decimal (`fxRate`) nunca se suma.
- Para "pagado de ese costo" por destino usar `prorateCapped(pendiente, costosPorDestino)` y restar; para costo por destino con tipo de cambio, `prorateByWeights(costoEnMonedaPais, importesPorDestino)` (resto al ultimo destino del array que se le pase; el orden de las sedes lo da `listOperationalBranches`).
- `lint:tenant` no marca los helpers nuevos (usan `tenantWhere` inline).

## Known Stubs

None.

## Threat Flags

None. T-209-04 (suma exacta del reparto), T-209-05 (`MAX_MONEY` y BigInt) y T-209-06 (`tenantWhere` en sedes) quedan mitigados; el test de `branchNamesByIds`/`countryToday` con otro tenant lo verifica.

## Self-Check: PASSED

- Archivos creados verificados en disco (3 de codigo, 2 tests).
- Commits `6e8447a19`, `d1dc16999`, `743ce6883` existen en la rama.

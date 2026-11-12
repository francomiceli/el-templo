---
phase: 209-egresos
plan: 09
subsystem: finance
tags: [egresos, resumen, prorrateo, aritmetica-entera, identidades, detalle]
requires: [209-02, 209-03, 209-05, 209-08]
provides:
  - ExpenseSummaryService.computeMonth, getSummary y getDetail
affects: [209-10, 209-11, 209-14]
tech-stack:
  added: []
  patterns: [un solo calculo mensual reutilizado, una query por tabla con agregacion en memoria, prorrateos de expense-math sin redondeos propios]
key-files:
  created:
    - el-templo-api/src/modules/finance/expense-summary-service.ts
    - el-templo-api/test/finance/expense-summary.test.ts
  modified: []
decisions:
  - "Pendiente en pesos de un gasto en USD = saldo impago en USD x TC de referencia del gasto, con tope en su costo"
  - "Pagado de ese costo = costo - pendiente (identidad exacta aunque los pagos hayan usado otro TC)"
  - "Gasto sin reparto: Error visible (no un numero mal)"
metrics:
  tasks: 2
  completed: 2026-11-11
---

# Phase 209 Plan 09: Resumen de Egresos Summary

`ExpenseSummaryService`: un unico calculo mensual (`computeMonth`) que alimenta el Resumen por destino, el detalle por rubro y concepto y, en 209-10, el Excel. Aritmetica entera con los prorrateos de `expense-math.ts` (`prorateByWeights`, `prorateCapped`, `toCountryCurrency`, `expenseCostInCountryCurrency`, `expenseStatusOf`), sin redondeos propios en el service.

## Que se hizo

1. **Task 1** (`335fdfab2`): `expense-summary-service.ts`.
2. **Task 2** (`8164eee19`): `test/finance/expense-summary.test.ts`, 23 `it`.

### Como calcula `computeMonth`

Cuatro queries propias (pagos del mes con join al gasto, gastos relevantes, rubros, sedes operativas) mas los cargadores de 209-03 (`loadAllocations`, `loadPaidByRecord`), reutilizados sin duplicar la query:

- Un gasto es "relevante" si esta imputado al mes o tiene pagos vigentes con `paid_on` dentro del mes (una factura de septiembre pagada en octubre aporta su pago a octubre y su costo a septiembre). Anulados (gasto o pago) no entran.
- Costo por destino = `prorateByWeights(costoEnMonedaPais, importesDelReparto)`; si el costo es null (USD sin TC) no aporta costo y suma en `missingFxRate`.
- Pendiente por destino = `prorateCapped(pendienteEnMonedaPais, costoPorDestino)`, asi ninguna parte es negativa ni supera su costo. Si `prorateCapped` lanzara (total mayor a la suma de topes), el `Error` sube sin atraparse.
- Pagado en el mes por destino = `prorateByWeights(amount_ars (AR) o amount (ES), importesDelReparto de su gasto)`.
- `costPaid = cost - pending` en cada columna, y la columna Total es la suma de las columnas: las identidades son exactas por construccion y los tests las verifican contra consultas directas.

## Firmas exportadas (las necesitan 209-10 y el admin)

En `el-templo-api/src/modules/finance/expense-summary-service.ts`:

```ts
new ExpenseSummaryService(db: MySql2Database<typeof schema>, log: FastifyBaseLogger, recordService: ExpenseRecordService)

getSummary(ctx: TenantContext, country: ExpenseCountry, month: string): Promise<ExpenseSummary>
getDetail(ctx: TenantContext, country: ExpenseCountry, month: string,
          destination: "total" | "casa_matriz" | number): Promise<ExpenseSummaryDetail>
computeMonth(ctx: TenantContext, country: ExpenseCountry, month: string): Promise<ExpenseMonthComputation>

export const SUMMARY_CASA_MATRIZ_KEY = "casa_matriz";
export const SUMMARY_TOTAL_KEY = "total";
export interface ExpenseMonthShare { cost; costEstimated; pending; paidInMonth }          // enteros, moneda del pais
export interface ExpenseMonthDestination { key: string; branchId: number | null; name: string; isActive: boolean }
export interface ExpenseMonthRecord { id; concept; beneficiary: string | null; costCenterId; costCenterName;
  imputationMonth; amountStatus; currency; shares: Map<string, ExpenseMonthShare> }  // destKey -> parte
export interface ExpenseMonthComputation { country; month; currency: "ARS" | "EUR";
  destinations: ExpenseMonthDestination[];   // en el orden del Resumen, SIN el Total
  records: ExpenseMonthRecord[];             // por id; incluye gastos con shares vacio
  incomplete: ExpenseSummary["incomplete"] }
```

Tipos de respuesta (de `expense-types.ts`, 209-02, sin cambios):

```ts
ExpenseSummary = {
  month: string; country: "AR" | "ES"; currency: "ARS" | "EUR";
  columns: ExpenseSummaryColumn[];      // sedes..., "casa_matriz" (solo AR), "total" (siempre la ultima)
  incomplete: { total; estimated; missingFxRate; missingReceipts };
}
ExpenseSummaryColumn = {
  key: string;            // id de sede como string | "casa_matriz" | "total"
  branchId: number | null; name: string; isActive: boolean;   // Casa Matriz y Total: branchId null, isActive true
  paidInMonth; cost; costEstimated; costPaid; pending         // enteros, moneda del pais
}
ExpenseSummaryDetail = {
  month; country; currency;
  destination: string;     // "total" | "casa_matriz" | id de sede como string
  destinationName: string; // nombre de la sede | "Casa Matriz" | "Total"
  groups: Array<{ costCenterId; costCenterName; cost; pending; paidInMonth;
                  concepts: Array<{ expenseRecordId; concept; beneficiary: string | null;
                                    imputationMonth; estimated: boolean; cost; pending; paidInMonth }> }>;
}
```

Detalles de la forma:
- Orden de columnas: sedes operativas (nombre, luego id, el de `listOperationalBranches`), sedes no operativas con reparto ese mes (por nombre, `isActive` segun la DB), `casa_matriz` solo en AR, `total`.
- Un destino de reparto aparece solo si algun gasto relevante le asigna algo (reparto de un gasto imputado al mes o con pago en el mes). Una sede inactiva sin repartos del mes no aparece.
- Detalle: grupos ordenados por nombre de rubro y conceptos por concepto, luego id (`localeCompare("es")`); solo filas con algun valor distinto de cero (costo, pendiente o pagado). Un concepto de otro mes pagado en este mes aparece con `cost: 0, pending: 0, paidInMonth > 0` y su `imputationMonth` propio. Los grupos y conceptos sumados dan exactamente la columna. `"total"` suma todos los destinos de cada gasto.
- Errores: mes mal formado, `BadRequestError("El mes tiene que tener el formato AAAA-MM")` (400, en `getSummary`, `getDetail` y `computeMonth`). `getDetail`: `NotFoundError("Destino no encontrado")` (404) para una sede que no existe o no es del gimnasio y del pais, y para `"casa_matriz"` en un pais sin Casa Matriz. Una sede valida del pais sin movimiento da `groups: []`, no 404. Un dato corrupto (gasto sin reparto, pago AR sin `amount_ars`) lanza `Error` plano (500), a proposito.
- La ruta de 209-10 debe pasar `country` desde el scope (como 209-07) y resolver el `destination` de la query (`"total"`, `"casa_matriz"` o numero entero) antes de llamar.

## Verificacion

| Corrida | Resultado |
|---|---|
| `npx vitest run test/finance/expense-summary.test.ts --hookTimeout=540000` (1a, 22 `it`) | 22 pasan (~147 s con el provisioning) |
| Mutacion: `prorateByWeights` en vez de `prorateCapped` para el pendiente, y `payment.amount` en vez de `amount_ars` | fallo el test del tope; el segundo no lo detecto la 1a vez (todos los pagos eran ARS) |
| Se agrego el `it` del pago desde cuenta USD con otro TC (aplica `amount_ars`), 23 `it` | 23 pasan (~150 s) |

Gates finales: `npx tsc --noEmit` = 0; `npm run -s lint:tenant` = `DISCREPANCIAS: 0`; `npm run -s typecheck:tests` = `DISCREPANCIAS: 18`. `grep -c "prorateCapped\|prorateByWeights"` del service = 7; `grep -c "Math.floor"` = 0.

Casos del test: columnas AR y ES, mes mal formado, factura del mes anterior pagada este mes (costo al anterior, pago al actual), USD 300 a 1560 con pago de 234000 (cada sede +156000 de costo, +78000 de pagado en el mes, +78000 de pendiente, +78000 pagado de ese costo, total +468000), pago desde cuenta USD con otro TC (160000 pagado vs 156000 de costo), estimados, tope (3 entre 3 con 1 pagado: pendientes `[0, 1, 1]`), 100 entre 3 (33, 33, 34) con pago de 50 (pendiente `[16, 16, 18]`, pagado de ese costo `[17, 17, 16]`), anulados (pago anulado, gasto anulado, pago anulado de otro mes), Espana en EUR, sede inactiva con reparto, incompletos (USD sin TC insertado directo), identidades contra consultas directas (AR mes actual y anterior, ES), detalle de sede / Casa Matriz / total / Espana, 404, aislamiento entre gimnasios y gasto sin reparto como error visible.

## Deviations from Plan

None - plan executed exactly as written. (Ajuste de forma: el filtro opcional de `computeMonth` va dentro del mismo `and(tenantWhere(...), ...)` porque `lint:tenant` no reconoce un `tenantWhere` armado en un array declarado antes del statement.)

## Decisiones del ejecutor

- **Un destino aparece si recibe algo.** Las sedes no operativas se agregan solo si algun gasto relevante (imputado al mes o con pago en el mes) las usa en su reparto Y llega a tener una parte calculada. Un gasto USD sin TC (sin costo y sin pagos) no hace aparecer su sede inactiva.
- **Sede inactiva que no existe como "operativa" por ser virtual o de otro pais**: se toma `isActive` de la DB tal cual (sin filtrar por virtual). No ocurre con datos validos (DI-08 lo impide).
- **`getDetail` con una sede valida pero sin movimiento** devuelve `groups: []` en vez de 404 (el destino existe).
- **Pago AR sin `amount_ars`**: `Error` (dato corrupto), no 0. `computePaymentAmounts` siempre lo calcula para AR.
- **Test**: las sedes propias son nuevas, asi que el Total, Casa Matriz y las sedes existentes se afirman por diferencia y las sedes propias tambien por diferencia (varios `it` las comparten). Casa Matriz solo se usa en el detalle (grupos filtrados por los rubros propios X e Y). Mes de Espana calculado con `countryToday(ES)` aparte del de Argentina (pueden diferir en el borde del mes).

## Para los planes siguientes

- **209-10 (rutas + Excel):** el Excel tiene que usar `computeMonth` (hoja de resumen con las columnas de `getSummary`, hoja de detalle recorriendo `records` y `shares`); no recalcular nada. Para el detalle del Excel por todos los destinos conviene llamar `getDetail` por cada `destinations[i].key` o armar las filas desde `records[].shares` (los dos dan los mismos numeros). Las rutas son nuevas: sumar a `ENTRADAS_BASELINE` (hoy **565**) y `CASOS_BASELINE` (hoy **61**) con sus `describe` de 2 `it` en `iso-03-finance-egresos.test.ts`. Este plan NO toco manifiesto ni baselines.
- **Admin (209-14):** `columns` viene lista para una tabla (una columna por destino, la ultima es el Total, `isActive: false` para pintar la sede cerrada). `incomplete` trae los tres contadores. El detalle se pide por `key` de columna.
- **Cargadores reutilizados** de `ExpenseRecordService`: `loadAllocations` y `loadPaidByRecord`, sin cambios en ese archivo. `loadAllocations` consulta `branches` por su cuenta (nombre) y el service vuelve a consultar solo las sedes no operativas con reparto.
- No se modificaron `transaction-service.ts`, `movement-service.ts` ni `cash-register-service.ts`.

## Known Stubs

None.

## Threat Flags

None. T-209-31 (`tenantWhere` en todas las queries y en el ON del join; test con otro gimnasio y 404 para una sede ajena), T-209-32 (prorrateos de `expense-math` con suma exacta; identidades como tests) mitigados; T-209-33 aceptado (una query por tabla, agregacion en memoria).

## Self-Check: PASSED

- Archivos creados verificados en disco (service y test).
- Commits `335fdfab2` y `8164eee19` existen en la rama.

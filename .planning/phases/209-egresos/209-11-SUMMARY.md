---
phase: 209-egresos
plan: 11
subsystem: admin
tags: [egresos, admin, quasar, composable, tipos, calculo-puro, router]
requires: [209-10]
provides:
  - types/expense.ts (espejo de expense-types.ts de la API)
  - utils/expenses.ts (splitEvenly, allocationDifference, previewPayment, expenseStatusOf, etiquetas, meses)
  - useExpensesApi (11 llamadas a /admin/finance/expense-records*)
  - constants/egresos.ts (EGRESOS_TABS)
  - EgresosPage.vue con 4 pestañas vacías, ruta /egresos y entrada del menú
affects: [209-12, 209-13, 209-14, 209-15, 209-16]
tech-stack:
  added: []
  patterns: [espejo de cálculo de la API con la misma tabla de casos en el test, hub q-tabs con ?tab= como CajaPage]
key-files:
  created:
    - el-templo-admin/src/types/expense.ts
    - el-templo-admin/src/utils/expenses.ts
    - el-templo-admin/src/utils/__tests__/expenses.test.ts
    - el-templo-admin/src/composables/useExpensesApi.ts
    - el-templo-admin/src/constants/egresos.ts
    - el-templo-admin/src/pages/EgresosPage.vue
  modified:
    - el-templo-admin/src/config/templo-config.ts
    - el-templo-admin/src/router/routes.ts
decisions:
  - Los imports de utils/expenses.ts son relativos (no `src/...`) porque el vitest del admin corre desde el-templo-app y no resuelve el alias del admin
  - El Excel con error devuelve el message en español leyendo el Blob de error
  - canManageRubros es un alias de canVoid (mismo set: owner y admin)
metrics:
  tasks: 3
  completed: 2026-11-11
---

# Phase 209 Plan 11: Base del admin para Egresos Summary

Sección Egresos del admin lista para que los planes 209-12 a 209-16 llenen sus pestañas: tipos espejo de la API, cálculo puro con test (partes iguales y estado del gasto idénticos a la API), composable propio con las 11 llamadas, y la página `/egresos` con menú y ruta para owner, admin y gestión.

## Qué se hizo

1. **Task 1** (`4f5b33393`): `types/expense.ts` (copia de `expense-types.ts` con `ExpenseAmountStatus = 'confirmado' | 'estimado'` escrito a mano en vez del tipo del schema, `PaymentMethod` del admin y `PaginatedResult` reexportado de `types/report`), `utils/expenses.ts` y su test (41 `it`).
2. **Task 2** (`eaddb37b4`): `composables/useExpensesApi.ts`.
3. **Task 3** (`da5c79728`): `constants/egresos.ts`, `EgresosPage.vue`, `EGRESOS_ROLES`/`EGRESOS_ANULAR_ROLES` y la entrada `Egresos` del menú Finanzas (entre Cobros y Reportes), y la ruta `egresos` con `meta.allowedRoles`.

## Firmas exportadas (para 209-12 a 209-16)

### `src/types/expense.ts`
Mismos nombres y campos que `expense-types.ts` de la API: `ExpenseCountry`, `ExpenseCurrency`, `ExpenseAmountStatus`, `ExpensePaymentStatus`, `ExpensePaymentMethod`, `EXPENSE_PAYMENT_METHODS` (const), `ReceiptLink`, `ExpenseAllocationInput`, `CreateExpenseRecordInput`, `UpdateExpenseRecordInput`, `ExpenseAllocationItem`, `ExpenseRecordListItem`, `ExpensePaymentItem`, `ExpenseHistoryItem`, `ExpenseRecordDetail`, `ExpenseListFilters`, `RegisterExpensePaymentInput`, `ExpensePaymentAccount`, `ExpenseDestinationOption`, `ExpenseFormOptions`, `ExpenseSummaryColumn`, `ExpenseSummary`, `ExpenseSummaryConcept`, `ExpenseSummaryDetailGroup`, `ExpenseSummaryDetail`, y `type PaginatedResult<T>` (`{ rows, total, page, limit }`).

### `src/utils/expenses.ts`
```ts
MAX_MONEY = 2_000_000_000
isValidMoneyInteger(v: unknown): v is number              // entero entre 1 y MAX_MONEY
splitEvenly(total: number, n: number): number[]           // floor para todas, resto a la última; n<=0 => []
allocationsSum(rows: ReadonlyArray<{ amount: number | null }>): number   // null cuenta 0
allocationDifference(amount: number, rows: ReadonlyArray<{ amount: number | null }>): number  // + falta, - sobra
needsExpenseFx(country: ExpenseCountry, currency: ExpenseCurrency): boolean   // AR + USD
paymentNeedsFx(p: { country; accountCurrency: string; expenseCurrency }): boolean
previewPayment(p: { country; accountCurrency: string; expenseCurrency; amount: number | null | undefined; fxRate?: number | null }): PaymentPreview
interface PaymentPreview { needsFx: boolean; appliedAmount: number | null; amountArs: number | null }
expenseStatusOf(amount: number, paid: number): { status: ExpensePaymentStatus; pending: number; overpaid: boolean }
EXPENSE_STATUS_META: Record<ExpensePaymentStatus, { label; color }>   // Pendiente deep-orange, Parcial amber-8, Pagado positive
AMOUNT_STATUS_LABELS: Record<ExpenseAmountStatus, string>             // Estimado / Confirmado
EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string>   // direct_debit = "Débito automático"
paymentMethodsForAccount(type: 'efectivo' | 'banco'): ExpensePaymentMethod[]
isValidMonth(month: string): boolean
monthLabel(month: string): string                          // '2026-11' => 'Noviembre 2026'; inválido => tal cual
shiftMonth(month: string, n: number): string
isHttpUrl(s: string): boolean
```
`previewPayment` devuelve `appliedAmount`/`amountArs` en `null` (no tira) cuando falta un dato: importe inválido, tipo de cambio faltante, no positivo o NaN, o un pago que aplicaría menos de 1 al gasto. Con `needsFx: false` no mira `fxRate`. Un `fxRate` con más de 4 decimales NO se valida en el admin (lo rechaza la API).

### `src/composables/useExpensesApi.ts`
`useExpensesApi()` devuelve `{ loading, error, cleanup, ... }` más:
```ts
listExpenseRecords(country, params?: ExpenseListParams): Promise<PaginatedResult<ExpenseRecordListItem>>
getExpenseFormOptions(country): Promise<ExpenseFormOptions>
createExpenseRecord(country, input: CreateExpenseRecordInput): Promise<{ record: ExpenseRecordDetail; created: boolean }>
getExpenseRecord(id, country): Promise<ExpenseRecordDetail>
updateExpenseRecord(id, country, input: UpdateExpenseRecordInput): Promise<ExpenseRecordDetail>
voidExpenseRecord(id, country, reason): Promise<ExpenseRecordDetail>
registerExpensePayment(id, country, input: RegisterExpensePaymentInput): Promise<{ record; payment: ExpensePaymentItem; created: boolean }>
voidExpensePayment(id, paymentId, country, reason): Promise<ExpenseRecordDetail>
getExpenseSummary(country, month): Promise<ExpenseSummary>
getExpenseSummaryDetail(country, month, destination: string): Promise<ExpenseSummaryDetail>
exportExpenseSummary(country, month): Promise<Blob>
```
`ExpenseListParams = Omit<ExpenseListFilters, 'country'>` (`month, destination, costCenterId, status, q, includeVoided, page, limit`). Detalles: el `record` ya se desenvuelve (las funciones devuelven el detalle, no `{ record }`); `created` es `res.status === 201`; `q` vacío y `includeVoided: false` no se mandan; `error.value` guarda el `message` de la API (o el fallback en español) y cada función re-lanza el error original. `exportExpenseSummary` lee el `message` del Blob de error. Para la descarga: `URL.createObjectURL(blob)` + `<a download>` como `SaldosPorCajaTab.vue` (el nombre sugerido por la API es `egresos-resumen-{AR|ES}-{AAAA-MM}-{YYYY-MM-DD}.xlsx`, hoy no se lee de `Content-Disposition`: el componente puede armarlo igual). `cleanup()` resetea `loading` y `error`; el componente la llama en su `onUnmounted`.

### `src/config/templo-config.ts` y `src/constants/egresos.ts`
`EGRESOS_ROLES = ['gestion', 'admin', 'owner']`, `EGRESOS_ANULAR_ROLES = ['admin', 'owner']`; `EGRESOS_TABS = { gastos: 'gastos', porPagar: 'por-pagar', resumen: 'resumen', rubros: 'rubros' }`, `EgresosTab`, `EGRESOS_DEFAULT_TAB` (`gastos`), `EGRESOS_TAB_NAMES`.

## Pestañas de `EgresosPage.vue`

Todas las pestañas son `q-tab-panel` VACÍOS dentro de `q-tab-panels keep-alive`. Cada plan monta su componente dentro del panel con `:selected-country="selectedCountry" :is-owner="isOwner"` (y `:can-void="canVoid"` donde anula), y tiene que sumar esas variables a su `<script setup>` al importar (ya existen `selectedCountry`, `isOwner`, `canVoid`; no hay que crearlas):

| Pestaña (`?tab=`) | Panel | Lo llena | Notas |
|---|---|---|---|
| Gastos (`gastos`, portada) | `EGRESOS_TABS.gastos` | 209-13 | lista, alta/edición y detalle |
| Por pagar (`por-pagar`) | `EGRESOS_TABS.porPagar` | 209-14 | pendientes y parciales con registro de pago |
| Resumen (`resumen`) | `EGRESOS_TABS.resumen` | 209-16 | matriz por destino y Excel |
| Rubros (`rubros`) | `EGRESOS_TABS.rubros`, con `v-if="canManageRubros"` | 209-12 | solo owner y admin; `?tab=rubros` de otro rol cae a Gastos |

Los comentarios dentro de cada panel dicen qué plan lo llena. El patrón de props es el de `CajaPage` (`selected-country`, `is-owner`); `canVoid` es el único agregado. El país del owner se pasa siempre a la API en `country`; para el resto la API ignora el valor.

## Verificación

| Corrida | Resultado |
|---|---|
| `cd el-templo-app && npx vitest run --root ../el-templo-admin src/utils/__tests__/expenses.test.ts` | 1 archivo, 41 tests pasan |
| `cd el-templo-admin && npx vue-tsc --noEmit 2>&1 \| grep -c "error TS"` | 27 (línea base; `grep -E "expense\|egresos\|Egresos"` vacío) |
| `pnpm lint` | 0 errores, 8 warnings (los mismos de antes: `CobrosPage.vue`, `session-pdf-builder.ts`, `env.d.ts`; ninguno en archivos del plan) |
| `npx prettier --check` de los archivos del plan | limpio |
| `grep -nE "blue\|indigo\|cyan\|'info'" EgresosPage.vue` | vacío |
| `grep "onUnmounted\|console\."` en `useExpensesApi.ts` | vacío |

No se hizo mutación: son funciones puras con resultados escritos a mano y los casos iguales a los de `el-templo-api/test/unit/expense-math.test.ts` (100 entre 3 = 33, 33, 34; 150000 entre 6; 2 entre 3 = 0, 0, 2; la tabla de `previewPayment`; los 4 de `expenseStatusOf`). No se tocó la API, por lo que `tsc` de la API no se corrió.

## Deviations from Plan

- **Imports relativos en `utils/expenses.ts`.** Con `src/types/expense` y `src/utils/payment-method-rules` el test fallaba (vitest corre con la config de `el-templo-app` y `src/` resuelve al otro proyecto). Quedó con `../types/expense` y `./payment-method-rules`, igual que `payment-method-rules.ts`. El resto del código del admin (composable, página) sí usa el alias `src/...`.
- **Lectura del Blob de error en `exportExpenseSummary`** (no pedido): con `responseType: 'blob'` el cuerpo del error también llega como Blob y `extractError` mostraría "Request failed with status code 403". Un helper privado lo parsea y lanza `new Error(message)`.
- **`previewPayment` además devuelve `null` si el aplicado es < 1 o si algún importe pasa `MAX_MONEY`** (la API lo rechaza con 400 en esos casos; el admin muestra "no calculable" en vez de un número que el server va a rechazar).

## Decisiones del ejecutor

- **Icono del menú:** `receipt_long` (ya lo usa la pestaña Historial de cobros de Caja, pero no el menú).
- **Iconos de las pestañas:** `receipt_long`, `schedule`, `table_chart`, `category`.
- **Etiqueta del selector:** "País" con acento (CajaPage dice "Pais").
- **`canManageRubros`** es un alias de `canVoid` (los dos sets son owner y admin).
- **`PaginatedResult`** se reexporta desde `types/expense.ts` para que los componentes importen todo de un solo lugar.
- **`EXPENSE_PAYMENT_METHODS`** (const con el orden del enum de la API) queda en `types/expense.ts` y `utils/expenses.ts` mantiene su propia lista local para `paymentMethodsForAccount`, que es la que define el orden de los selectores: cash, transfer, card, cheque, direct_debit.
- Las fechas `paidOn` y los meses no tienen helper de "hoy": usar `ExpenseFormOptions.today` (la API manda la fecha de hoy en la zona del gimnasio).

## Para los planes siguientes

- **209-12 (Rubros):** montar en el panel `rubros`; los datos son los endpoints `/cost-centers*` de la API (preexistentes, ya los envuelve `useTransactionsApi` para `CuentasTab`; reutilizar esas funciones y `CategoriaEgresoFormDialog.vue`, no agregar nada a `useExpensesApi`).
- **209-13/14:** `getExpenseFormOptions` no trae saldos. Las cuentas vienen con `type` y `currency`: filtrar medios con `paymentMethodsForAccount(account.type)` y calcular la vista previa con `previewPayment({ country: options.country, accountCurrency: account.currency, expenseCurrency: record.currency, amount, fxRate })`. `idempotencyKey: crypto.randomUUID()` por intento de confirmación (alta de gasto y de pago); si falla y se reintenta con el mismo diálogo abierto, reusar la misma clave.
- **209-13:** el orden de `destinations` ya es el definitivo (viene ordenado de `form-options`): `splitEvenly(importe, destinos.length)` asigna por posición. Casa Matriz es `branchId: null`.
- **209-16:** el `key` de cada columna de `ExpenseSummary.columns` es el `destination` de `getExpenseSummaryDetail`.
- Fixtures del admin: no hay vitest propio, los tests corren con `cd el-templo-app && npx vitest run --root ../el-templo-admin <archivo>` y los imports del test y del código bajo prueba deben ser relativos.

## Known Stubs

Los cuatro `q-tab-panel` de `EgresosPage.vue` están vacíos a propósito: los llenan 209-12 (Rubros), 209-13 (Gastos), 209-14 (Por pagar) y 209-16 (Resumen). La página no cumple su objetivo hasta esos planes; el plan 209-11 solo entrega la base.

## Threat Flags

None. T-209-37 mitigado: `meta.allowedRoles: EGRESOS_ROLES` en la ruta y `roles: EGRESOS_ROLES` en el menú (la API responde 403 igual, ver 209-07/08/10). T-209-38 mitigado: `splitEvenly`, `expenseStatusOf` y `previewPayment` espejan `expense-math.ts` con los mismos casos en el test; el server revalida todo.

## Self-Check: PASSED

- Archivos creados verificados en disco: `types/expense.ts`, `utils/expenses.ts`, `utils/__tests__/expenses.test.ts`, `composables/useExpensesApi.ts`, `constants/egresos.ts`, `pages/EgresosPage.vue`.
- Commits `4f5b33393`, `eaddb37b4` y `da5c79728` existen en la rama; `git status` limpio antes del commit del SUMMARY.

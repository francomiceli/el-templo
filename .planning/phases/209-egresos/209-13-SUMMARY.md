---
phase: 209-egresos
plan: 13
subsystem: admin
tags: [egresos, admin, quasar, gastos, reparto, idempotencia, formulario]
requires: [209-12]
provides:
  - components/egresos/RepartoEditor.vue (directo, partes iguales, por montos)
  - components/egresos/GastoFormDialog.vue (alta y edicion de gasto)
  - components/egresos/GastosTab.vue (listado con filtros, alta y edicion)
  - EgresosPage monta Gastos y abre el alta con ?nuevo=1
  - ayudas puras en utils/expenses.ts con test (splitEvenlyRemainder, sameAllocations, toNumberOrNull, moneyIntegerRule, isValidFxRate, amountAtRate, cleanReceiptLinks, diffExpenseUpdate)
affects: [209-14, 209-15, 209-16]
tech-stack:
  added: []
  patterns: [PATCH solo con lo cambiado calculado por una funcion pura, clave de idempotencia por apertura del dialogo, last-response-wins con contador de pedidos]
key-files:
  created:
    - el-templo-admin/src/components/egresos/RepartoEditor.vue
    - el-templo-admin/src/components/egresos/GastoFormDialog.vue
    - el-templo-admin/src/components/egresos/GastosTab.vue
  modified:
    - el-templo-admin/src/pages/EgresosPage.vue
    - el-templo-admin/src/utils/expenses.ts
    - el-templo-admin/src/utils/__tests__/expenses.test.ts
decisions:
  - El PATCH se arma con diffExpenseUpdate (funcion pura con test), no dentro del componente
  - RepartoEditor suma una prop opcional extraDestinations para no perder sedes inactivas del reparto guardado
  - El dialogo de gasto es persistent (formulario largo: un click afuera no descarta lo cargado)
metrics:
  tasks: 3
  completed: 2026-11-12
---

# Phase 209 Plan 13: Pestana Gastos del admin Summary

Egresos -> Gastos ya lista, filtra, crea y corrige gastos: el formulario arma el reparto (directo, partes iguales o por montos) y no deja guardar si no suma exactamente el importe; el alta lleva `idempotencyKey` por apertura; la edicion manda solo lo cambiado y pide motivo cuando cambia importe, estado o tipo de cambio; y `/egresos?tab=gastos&nuevo=1` (el acceso de Caja) abre el alta.

## Que se hizo

1. **Task 1** (`28f5c8b92`): `RepartoEditor.vue` + ayudas puras `splitEvenlyRemainder`, `sameAllocations`, `toNumberOrNull`, `moneyIntegerRule` con 10 `it` nuevos.
2. **Task 2** (`bed4d6d2d`): `GastoFormDialog.vue` + `isValidFxRate`, `amountAtRate`, `cleanReceiptLinks`, `diffExpenseUpdate` con 12 `it` nuevos.
3. **Task 3** (`8e3ffebea`): `GastosTab.vue` y el montaje en `EgresosPage.vue`.

## Componentes (para 209-14, 209-15 y 209-16)

### `components/egresos/RepartoEditor.vue`
Props: `modelValue: ExpenseAllocationInput[]` (solo se lee al montar), `amount: number | null`, `currency: string`, `country: ExpenseCountry`, `destinations: ExpenseDestinationOption[]`, `extraDestinations?: ExpenseDestinationOption[]` (agregada), `initialMode?: 'directo' | 'iguales' | 'montos'`. Emite `update:modelValue` (importes por destino ya calculados, tambien al montar) y `update:valid`. Exporta el tipo `RepartoMode`. Sin `initialMode`, arranca en "Por montos" si `modelValue` tiene mas de una parte y en "Directo" si no. En "Directo" y "Partes iguales" el reparto se recalcula solo si cambia el importe; en "Por montos" no se toca y el pie muestra "Falta x" (warning) o "Sobra x" (negative). "Partes iguales" usa solo las `destinations` con `branchId !== null`, en el orden recibido, `splitEvenly` del util y la nota del resto nombra a la ultima sede. El dialogo lo monta de nuevo cada vez que se abre (QDialog desmonta el contenido al cerrar).

### `components/egresos/GastoFormDialog.vue`
Props: `modelValue: boolean`, `country: ExpenseCountry`, `options: ExpenseFormOptions`, `record?: ExpenseRecordDetail | null` (null o ausente = alta). Emite `update:modelValue` y `saved(record: ExpenseRecordDetail)` (tambien cuando la API devuelve el gasto ya existente por `created: false`). El formulario se resetea con un `watch` sobre `modelValue` (no con `@show`) para que el editor de reparto monte ya con los datos.

**Como se abre la edicion de un gasto desde otra pestana:** montar `GastoFormDialog` con `v-model`, `country`, `options` (de `getExpenseFormOptions`) y `record` (el resultado de `getExpenseRecord(id, country)`, que trae reparto, links y observaciones). No hay otro camino: el detalle (209-15) y las otras pestanas tienen que cargar el detalle y pasarlo. Despues de `saved`, la pestana que lo monto recarga lo suyo. `GastosTab` no expone nada: cada pestana recarga su lista.

### `components/egresos/GastosTab.vue`
Props: `selectedCountry`, `isOwner` (declarado, hoy sin efecto), `openNew?: boolean`. Emite `new-consumed` y `open-detail(id: number)`. Carga `getExpenseFormOptions` al montar y al cambiar el pais (resetea destino y rubro), mes por defecto = mes de `options.today`. **`open-detail(id)` se emite al hacer click en una fila; hoy nadie lo escucha** (lo hace 209-15). Lo recomendable es que `EgresosPage` escuche `@open-detail` y monte el dialogo de detalle una sola vez para que Por pagar y Resumen puedan abrirlo tambien (modelo: `GastosTab` ya tiene el evento).

### `EgresosPage.vue`
`GastosTab` en el panel `gastos` con `:selected-country`, `:is-owner`, `:open-new="openNew"` y `@new-consumed`. `openNew = computed(() => route.query.nuevo === '1')`, asi que es reactivo con el panel en keep-alive; `onNewConsumed` hace `router.replace({ query: { ...route.query, nuevo: undefined } })`. No se paso `canVoid` (esta pestana no anula).

## Ayudas puras agregadas a `utils/expenses.ts`

```ts
splitEvenlyRemainder(total, n): number            // resto de la division = lo que la ultima parte suma de mas
sameAllocations(a, b): boolean                    // mismos destinos e importes, sin importar el orden
toNumberOrNull(v: unknown): number | null         // valor de q-input type=number ('' -> null)
moneyIntegerRule(v: unknown): true | string       // regla de q-input para importes enteros
isValidFxRate(v: unknown): v is number            // > 0, hasta 4 decimales, <= 99999999.9999
amountAtRate(amount, fxRate): number              // Math.round(importe x tc)
cleanReceiptLinks(links): ReceiptLink[]           // recorta y descarta filas vacias
interface ExpenseFormValues { concept; beneficiary; costCenterId; imputationMonth; amount; amountStatus; fxRate; receiptLinks; notes; allocations }
diffExpenseUpdate(original: ExpenseRecordDetail, values: ExpenseFormValues): { changes: UpdateExpenseRecordInput; needsReason: boolean; hasChanges: boolean }
```

## Verificacion

| Corrida | Resultado |
|---|---|
| `cd el-templo-app && npx vitest run --root ../el-templo-admin src/utils/__tests__/expenses.test.ts` | 1 archivo, 63 tests pasan (antes 41) |
| Mutacion: `needsReason` sin `amountChanged` en `diffExpenseUpdate` | falla exactamente "cambiar el importe pide motivo y manda el reparto completo"; restaurado |
| `cd el-templo-admin && npx vue-tsc --noEmit 2>&1 \| grep -c "error TS"` | 27 tras cada tarea; `grep -iE "egresos\|expense"` vacio |
| `pnpm lint` | 0 errores, 8 warnings (los mismos preexistentes); `eslint` sobre los archivos del plan sin salida |
| `npx prettier --check` de los archivos del plan | limpio |
| Greps: `Math.floor` en `RepartoEditor.vue`, `MoneyInput`, `blue\|indigo\|cyan\|'info'`, `console.`, `any` en `components/egresos` | todos vacios; `randomUUID` y `RepartoEditor` presentes en el dialogo; `GastosTab` y `nuevo` en la pagina |

Sin tests de componentes (plan): el comportamiento (apertura con `?nuevo=1` con la pestana ya montada, reparto, motivo condicional, reintento con la misma clave) queda para la UAT 209-17. No se toco la API.

## Deviations from Plan

- **Prop agregada `extraDestinations` en `RepartoEditor`** (el plan fija otras props): el pedido exige que al editar se muestre con su nombre una sede hoy inactiva del reparto guardado y se la deje seguir. Esas sedes se pueden elegir en "Directo" y "Por montos" y nunca entran en "Partes iguales". El dialogo las arma desde `record.allocations` con el nombre "X (inactiva)".
- **El rubro desactivado de un gasto viejo se agrega al select de rubro al editar** (`"Alquiler (desactivado)"`), porque `form-options` solo manda los activos y si no el select quedaria vacio.
- **El `watch` de `modelValue` reemplaza a `@show`** para resetear el formulario y generar la clave: el contenido del dialogo se renderiza antes de `@show` y el editor de reparto tiene que montar con los datos ya cargados.
- **Mas ayudas puras con test de las previstas** (`diffExpenseUpdate`, `isValidFxRate`, etc.): el criterio del plan era "si hace falta otra cuenta, va en `utils/expenses.ts` con su caso".

## Decisiones del ejecutor

- **Dialogo `persistent`:** formulario largo; un click afuera no descarta lo cargado (cierra con Cancelar o la X).
- **Aviso de `created: false`:** `type: 'warning'` ("Ese gasto ya estaba cargado"), porque `info` es azul y la paleta no lo admite. Se cierra y se emite `saved` igual.
- **Clave de idempotencia:** `crypto.randomUUID()` sin alternativa para contextos no seguros (el admin corre en https y en localhost). Se genera al abrir el alta; si falla el guardado queda la misma clave; en edicion no se usa.
- **Filtro de rubro y de destino** usan solo lo que manda `form-options` (rubros activos, sedes operativas y Casa Matriz en Argentina): un gasto viejo de un rubro desactivado o de una sede inactiva se ve en el listado pero no se filtra por ese rubro/sede. El listado sin filtros de destino/rubro los muestra.
- **Filtro de mes:** de 24 meses atras a 2 por delante, mas "Todos los meses"; por defecto el mes de `options.today`. Estado: Todos, Pendiente, Parcial, Pagado (la API acepta ademas `por_pagar`, que es de la pestana Por pagar).
- **"Ver anulados"** visible para todos los roles que entran a Egresos; el boton Editar no aparece en filas anuladas.
- **Fila clickeable (`open-detail`) sin escucha todavia:** el click no hace nada hasta 209-15; se dejo el cursor de mano porque el plan lo pide asi y la fila ya emite el evento.
- **`isOwner`** queda declarado en `GastosTab` como en las demas pestanas aunque hoy no se use: el pais viaja siempre a la API y el server lo ignora para los demas roles.
- **Fila de comprobante vacia (sin descripcion ni link) se descarta al guardar**; una fila con descripcion pero sin link da el error "Pegá un link que empiece con https://".

## Para los planes siguientes

- **209-14 (Por pagar):** puede reusar `GastoFormDialog` si necesita corregir el gasto; el `options` que carga cada pestana sale de `getExpenseFormOptions(country)` (ya trae `accounts` sin saldos para pagar). `idempotencyKey` por intento: el mismo patron del dialogo de gasto (generar al abrir, reusar al reintentar).
- **209-15 (Detalle):** escuchar `open-detail(id)` de `GastosTab`; el detalle de un gasto se carga con `getExpenseRecord(id, country)`. Para "Editar" desde el detalle, pasar ese mismo detalle como `record` a `GastoFormDialog`. Los links se abren con `target="_blank" rel="noopener noreferrer"` (T-209-43).
- **209-16 (Resumen):** nada nuevo de esta pestana.
- Fixtures: el test de `utils/expenses.ts` sigue necesitando imports relativos.

## Known Stubs

- Click en una fila de `GastosTab` emite `open-detail(id)` sin listener hasta 209-15 (previsto por el plan, no impide cargar, listar, filtrar ni editar).

## Threat Flags

None. T-209-41 mitigado (`idempotencyKey` por apertura reusada en el reintento y boton con `submitting`), T-209-42 mitigado (el boton Guardar exige `valid` del editor: al menos un destino, partes enteras, sin repetir y diferencia 0; la API revalida), T-209-43 queda para 209-15 (aca solo se valida que el link sea `http(s)` y hasta 500 caracteres).

## Self-Check: PASSED

- Archivos creados verificados en disco: `RepartoEditor.vue`, `GastoFormDialog.vue`, `GastosTab.vue`.
- Commits `28f5c8b92`, `bed4d6d2d` y `8e3ffebea` existen en la rama; `git status` limpio antes del commit del SUMMARY.

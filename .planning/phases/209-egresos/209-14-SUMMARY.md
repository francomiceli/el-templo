---
phase: 209-egresos
plan: 14
subsystem: admin
tags: [egresos, admin, quasar, por-pagar, pagos, tipo-de-cambio, idempotencia]
requires: [209-13]
provides:
  - components/egresos/RegistrarPagoDialog.vue (alta de pago de un gasto)
  - components/egresos/PorPagarTab.vue (gastos por pagar con total pendiente)
  - EgresosPage carga las opciones de Egresos por pais y las comparte
  - ayudas puras en utils/expenses.ts con test (paymentDateError, paymentOverpayState, sumPendingByCurrency)
affects: [209-15, 209-16]
tech-stack:
  added: []
  patterns: [guardas de la API anticipadas con funciones puras testeadas, clave de idempotencia por apertura del dialogo, opciones del formulario cargadas una vez en la pagina]
key-files:
  created:
    - el-templo-admin/src/components/egresos/RegistrarPagoDialog.vue
    - el-templo-admin/src/components/egresos/PorPagarTab.vue
  modified:
    - el-templo-admin/src/pages/EgresosPage.vue
    - el-templo-admin/src/utils/expenses.ts
    - el-templo-admin/src/utils/__tests__/expenses.test.ts
decisions:
  - Las opciones del formulario (cuentas, destinos, rubros, hoy) las carga EgresosPage y se pasan por prop, no cada pestana
  - El evento del dialogo es paid(record) (el plan decia saved) y recibe ExpenseRecordListItem o ExpenseRecordDetail
  - El total pendiente se calcula en el cliente recorriendo las paginas del mismo filtro (la API no devuelve totales)
metrics:
  tasks: 2
  completed: 2026-11-12
---

# Phase 209 Plan 14: Por pagar y registro de pagos del admin Summary

Egresos -> Por pagar lista los gastos con plata pendiente (lo mas viejo primero) con el total pendiente a la vista, y desde cada fila (o desde el detalle, 209-15) se registra un pago desde cualquier cuenta elegible, sin mostrar ni pedir los importes de las cuentas, con el medio segun la cuenta, el tipo de cambio solo cuando hace falta y una vista previa de cuanto cancela del gasto antes de confirmar.

## Que se hizo

1. **Task 1** (`73bbdac22`): `RegistrarPagoDialog.vue` + `paymentDateError`, `paymentOverpayState`, `sumPendingByCurrency` en `utils/expenses.ts` con 12 `it` nuevos (63 -> 75).
2. **Task 2** (`66803d677`): `PorPagarTab.vue` y el montaje en `EgresosPage.vue` (que ahora carga `form-options` por pais).

## Componentes (para 209-15 y 209-16)

### `components/egresos/RegistrarPagoDialog.vue`
Props: `modelValue: boolean`, `country: ExpenseCountry`, `options: ExpenseFormOptions` (necesita `today` y `accounts`), `record: ExpenseRecordListItem | ExpenseRecordDetail` (usa `id`, `concept`, `beneficiary`, `amount`, `currency`, `amountStatus`, `paid`, `pending`, `overpaid`). Emite `update:modelValue` y `paid(record: ExpenseRecordDetail)` (el gasto actualizado que devuelve la API, tambien cuando `created: false`); cierra solo tras el exito. El formulario se resetea con un `watch` sobre `modelValue` (mismo criterio que `GastoFormDialog`) y ahi se genera `idempotencyKey = crypto.randomUUID()`; se reusa en reintentos mientras el dialogo siga abierto. Es `persistent` y bloquea cierre y confirmar mientras `submitting`.

Uso desde el detalle (209-15): montar con `v-model`, `country`, `options` (de `getExpenseFormOptions`, ver abajo) y `record` (el detalle ya cargado). Tras `paid`, el detalle tiene que volver a pedir/usar el `record` recibido y avisar a la lista.

Comportamiento: fecha (default `options.today`, `max`, error "No puede ser futura" y "Es anterior al corte de la cuenta (...)"), cuenta agrupada (Cajas de sedes, Caja central, Tesoro, Bancos; etiqueta "{nombre} · {sede | Caja central | Tesoro | Banco} · {moneda}"), medio segun `paymentMethodsForAccount` (se limpia si deja de valer y se elige solo si queda uno), importe en la moneda de la cuenta (con el pendiente de default si la moneda coincide y el usuario no lo tocó), atajo "Pagar todo lo pendiente" (solo con misma moneda), tipo de cambio solo si `paymentNeedsFx` (si no hace falta no se manda), vista previa con `previewPayment` ("Cancela {x} del gasto · Quedan {y}" y "Equivale a {z} en pesos" si hay tipo de cambio), pago de más (confirmado: banner rojo y boton deshabilitado con el máximo; estimado: aviso "Vas a pagar de más sobre un importe estimado"), referencia (100) y nota (2000). Errores de la API con su `message` tal cual. `created: false` -> aviso `warning` "Ese pago ya estaba registrado".

### `components/egresos/PorPagarTab.vue`
Props: `selectedCountry: ExpenseCountry`, `isOwner: boolean` (declarado, sin efecto), `options: ExpenseFormOptions | null`. Emite `open-detail(id: number)` (click en la fila; el boton "Registrar pago" usa `@click.stop`) y `paid(record: ExpenseRecordDetail)`. Expone `reload()` y se recarga sola en `onActivated` (salvo la primera activacion), asi refleja un pago hecho desde el detalle. Filtros: mes (default "Todos los meses"), destino, rubro, busqueda; `status: 'por_pagar'` fijo.

### `EgresosPage.vue`
Nuevo: `expenseOptions: Ref<ExpenseFormOptions | null>`, cargado al montar y al cambiar el pais (se pone en `null` mientras carga; last-response-wins). Se pasa a `PorPagarTab` como `:options`. **209-15 debe usar esta misma variable para el dialogo de pago del detalle** (y para el de edicion). `onOpenDetail(_id)` esta como funcion vacia con comentario: `PorPagarTab` ya la tiene enganchada en `@open-detail`; 209-15 la completa y engancha tambien `GastosTab`.

## Ayudas puras agregadas a `utils/expenses.ts`

```ts
paymentDateError(paidOn, today, cutoffDate: string | null): { kind: 'required' | 'future' | 'beforeCutoff'; cutoffDate?: string } | null
paymentOverpayState(applied: number | null, pending: number, amountStatus: ExpenseAmountStatus): 'ok' | 'warning' | 'blocked'
sumPendingByCurrency(rows: ReadonlyArray<{ currency: string; pending: number }>): Array<{ currency: string; total: number }>
```

## Verificacion

| Corrida | Resultado |
|---|---|
| `cd el-templo-app && npx vitest run --root ../el-templo-admin src/utils/__tests__/expenses.test.ts` | 1 archivo, 75 tests pasan (antes 63) |
| Mutacion: `applied <= pending` -> `applied < pending` en `paymentOverpayState` | falla "lo que cancela hasta lo pendiente esta bien..."; restaurado |
| `cd el-templo-admin && npx vue-tsc --noEmit 2>&1 \| grep -c "error TS"` | 27 tras cada tarea; ninguno en egresos/expense |
| `pnpm lint` | 0 errores, 8 warnings (los preexistentes) |
| Greps del plan: `previewPayment`, `paymentMethodsForAccount`, `randomUUID`, `por_pagar`, `PorPagarTab`; sin `saldo`/`Balance` en el dialogo salvo el mensaje del corte; sin `console.`, `any`, azul, `MoneyInput` | ok |
| `npx prettier` de los archivos del plan | limpio |

Sin tests de componentes (plan): el comportamiento queda para la UAT 209-17. No se toco la API.

## Deviations from Plan

- **Evento `paid(record)` en vez de `saved(record)`** (lo pidio el encargo para que 209-15 lo use desde el detalle). La prop `record` acepta el item del listado o el detalle.
- **Las opciones del formulario las carga `EgresosPage`, no la pestana** (el plan dejaba elegir entre extraerlo o pasarlas desde la pagina). Elegido porque 209-15 las necesita para el dialogo de pago del detalle y evita una tercera carga. `GastosTab` sigue cargando las suyas (no esta en `files_modified`; no se toco).
- **`PorPagarTab` no declara `canVoid`**: el plan lo listaba pero esta pestana no anula nada.
- **Tres ayudas puras con test** (fecha, pago de mas, suma de pendientes) que el plan no preveia: son logica de decision y no iban dentro del componente.

## Decisiones del ejecutor

- **Total pendiente**: la API no devuelve totales del filtro, asi que `PorPagarTab` recorre las paginas del mismo filtro (200 por pagina, hasta 10 paginas) y suma por moneda con `sumPendingByCurrency`; si hubiera mas de 2000 gastos por pagar muestra "(al menos...)". Cambiar de pagina en la tabla no lo recalcula; cambiar filtros, pagar o volver a la pestana si. Si el calculo falla no avisa (la tabla ya avisa) y no se muestra el total.
- **Moneda del total**: un renglon por moneda (ARS, EUR, USD), nunca se mezclan.
- **Sin cuenta preseleccionada**: aunque haya una sola, se elige a mano (la pantalla saca plata).
- **Cambiar de cuenta**: el medio que deja de valer se limpia y, si queda un unico medio (efectivo), se elige solo; el importe NO se pisa si el usuario ya lo toco; el tipo de cambio se descarta si ya no hace falta.
- **Mensaje de pago de mas bloqueado**: "Supera lo que falta pagar ({pendiente})." y, solo con la misma moneda, "Podés pagar hasta {pendiente}." (con tipo de cambio el maximo depende de lo que se cargue). Gasto sin pendiente: "Este gasto ya está pagado por completo: no admite más pagos."
- **Avisos en `warning`, no `info`** (paleta sin azul); banners `bg-red-1`/`bg-orange-1`.
- **`created: false`**: aviso `warning` y se cierra emitiendo `paid`.
- **Limite de `reference` 100 y `notes` 2000** igual que el schema de la API.
- **`Registrar pago` deshabilitado** hasta que las opciones del pais actual esten cargadas (`options.country === selectedCountry`).

## Para los planes siguientes

- **209-15 (Detalle):** montar `RegistrarPagoDialog` con `expenseOptions` de `EgresosPage` y el `ExpenseRecordDetail` cargado; despues de `paid(record)` reemplazar el detalle por el `record` recibido y recargar la lista de la pestana (Por pagar se recarga sola al reactivarse; `GastosTab` NO tiene ese refresco: si hace falta, agregarle `onActivated` o exponer `reload()`). Completar `onOpenDetail` en `EgresosPage` y engancharlo tambien a `GastosTab` (`@open-detail`).
- **209-16 (Resumen):** nada nuevo de esta pestana.
- El test de `utils/expenses.ts` sigue necesitando imports relativos.

## Known Stubs

- `onOpenDetail` en `EgresosPage.vue` es una funcion vacia hasta 209-15: click en una fila de Por pagar no abre nada todavia (previsto por el plan).

## Threat Flags

None. T-209-44 mitigado (`idempotencyKey` por apertura reusada en el reintento + boton con `submitting` y `persistent`). T-209-45 mitigado (el dialogo no pide ni muestra importes de cuentas; la API tampoco los manda).

## Self-Check: PASSED

- Archivos creados verificados en disco: `RegistrarPagoDialog.vue`, `PorPagarTab.vue`.
- Commits `73bbdac22` y `66803d677` existen en la rama; `git status` limpio antes del commit del SUMMARY.

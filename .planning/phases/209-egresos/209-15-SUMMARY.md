---
phase: 209-egresos
plan: 15
subsystem: admin
tags: [egresos, admin, quasar, detalle, historial, anulaciones]
requires: [209-14]
provides:
  - components/egresos/GastoDetailDialog.vue (detalle del gasto con pagos, historial y anulaciones)
  - historyEntryLines y formatFxRate en utils/expenses.ts con test
  - EgresosPage aloja un unico detalle y expone onOpenDetail(id) para cualquier pestana
  - GastosTab y PorPagarTab con refreshKey; GastosTab se recarga al reactivarse y expone reload()
affects: [209-16, 209-17]
tech-stack:
  added: []
  patterns: [un solo dialogo de detalle en la pagina, refreshKey con recarga inmediata solo si la pestana esta activa]
key-files:
  created:
    - el-templo-admin/src/components/egresos/GastoDetailDialog.vue
  modified:
    - el-templo-admin/src/utils/expenses.ts
    - el-templo-admin/src/utils/__tests__/expenses.test.ts
    - el-templo-admin/src/components/egresos/GastosTab.vue
    - el-templo-admin/src/components/egresos/PorPagarTab.vue
    - el-templo-admin/src/pages/EgresosPage.vue
decisions:
  - Las pestanas con lista se refrescan por refreshKey solo si estan a la vista; la oculta lo hace al activarse (evita una recarga doble)
  - El motivo de las anulaciones se pide con $q.dialog prompt, que tambien es la confirmacion explicita
  - Un link de comprobante que no pasa isHttpUrl se muestra como texto, nunca como link
metrics:
  tasks: 2
  completed: 2026-11-12
---

# Phase 209 Plan 15: Detalle del gasto del admin Summary

El detalle de un gasto reune en una pantalla de donde salio la plata (pagos por cuenta), a que sede corresponde (reparto) y en que mes impacta, con el rastro de cambios y las anulaciones de pago y de gasto para owner y admin. Se abre tocando una fila de Gastos o de Por pagar, y cualquier cambio refresca las listas.

## Que se hizo

1. **Task 1** (`f6de4afa9`): `historyEntryLines` puro en `utils/expenses.ts` con 15 casos nuevos (75 -> 90).
2. **Task 2** (`1d5909689`): `GastoDetailDialog.vue`, cableado en `EgresosPage`, `GastosTab` y `PorPagarTab`, y `formatFxRate` con 1 caso (90 -> 91).

## Componente creado

### `components/egresos/GastoDetailDialog.vue`
Props: `modelValue: boolean`, `recordId: number | null`, `country: ExpenseCountry`, `options: ExpenseFormOptions | null` (null mientras cargan: "Registrar pago" y "Editar" quedan deshabilitados), `canVoid: boolean`. Emite `update:modelValue` y `changed` (tras pago, edicion o anulacion exitosos). Carga `getExpenseRecord` cada vez que se abre (o cambia `recordId`) y arranca de cero (nunca se ve el gasto anterior). Con error de carga muestra el mensaje de la API y "Reintentar".

Contenido: encabezado (concepto, beneficiario, rubro, mes de imputacion, badge de estado con `EXPENSE_STATUS_META`, "Pagado de mas", "Anulado" con motivo, quien y cuando, "Importe estimado"); importe con Estimado/Confirmado y, en USD, "TC de referencia ... · ≈ pesos" (o "Falta el tipo de cambio"); Pagado y Falta pagar (los `paid`/`pending`/`status` de la API, sin recalcular); reparto por destino (Casa Matriz incluida) con equivalente en pesos en USD; comprobantes; observaciones; pagos; historial en `q-timeline`.

Pagos: fecha, cuenta, medio, importe en la moneda de la cuenta, "Cancela X del gasto" (siempre), TC y equivalente en pesos si corresponde, referencia, nota, quien lo cargo y cuando. Los anulados van con `text-strike text-grey-6`, y debajo (sin tachar) "Anulado por X · fecha · Motivo: ...". No se muestran saldos de cuentas.

Acciones del pie, solo con el gasto vigente: "Registrar pago" (si `pending > 0` o el importe es estimado; abre `RegistrarPagoDialog` con `options` y el detalle), "Editar" (abre `GastoFormDialog` con el detalle), "Anular gasto" (solo `canVoid`; deshabilitado mientras haya pagos vigentes, con tooltip "Primero anula sus pagos" y la misma frase como texto visible). "Anular pago" por fila, solo con `canVoid` y pago vigente. Un gasto anulado no ofrece pagar, editar ni anular.

Anulaciones: `$q.dialog` con `prompt` de motivo (el OK no se habilita vacio, maximo 500) cuyo mensaje explica la consecuencia: es la confirmacion explicita. Los errores de la API (incluido el 409 de pagos vigentes) se muestran con su `message` tal cual.

Despues de `paid(record)` o `saved(record)` el detalle reemplaza su `record` por el que llega y emite `changed`. Tras anular, usa el `record` que devuelve la API.

### Ayudas puras agregadas a `utils/expenses.ts`

```ts
historyEntryLines(item: ExpenseHistoryItem, ctx: { currency: string; costCenterNames?: Record<number, string> }): { title: string; lines: string[] }
formatFxRate(fxRate: number): string   // 1560 -> "1.560", 1560.5 -> "1.560,5"
```

`historyEntryLines`: alta ("Alta del gasto", "Importe: X · Estimado/Confirmado"); correccion ("Correccion", una linea `anterior → nuevo` por campo en orden fijo: concepto, beneficiario, rubro, mes, importe, estado del importe, tipo de cambio, comprobantes (cantidad), observaciones (sin mostrar el texto); "Reparto corregido" si hay `allocations`); "Pago registrado" (importe en la moneda de la cuenta, fecha, medio, TC y cuanto cancela si la moneda difiere); "Pago anulado"; "Gasto anulado". Accion desconocida: el texto de la accion como titulo (o "Movimiento del gasto" si viene vacia); campo desconocido en `changes`: "campo: modificado"; payload con otra forma (null, array, `changes` no objeto) no rompe. El tipo de cambio acepta numero o string de DECIMAL.

## Como abre el detalle otra pestana (para 209-16)

`EgresosPage.vue` tiene `showDetail`, `detailId`, `refreshKey` y la funcion **`onOpenDetail(id: number)`** (pone `detailId` y abre el unico `GastoDetailDialog`). La pestana Resumen solo tiene que emitir un evento `open-detail(id)` con el `expenseRecordId` de cada concepto y la pagina lo engancha con `@open-detail="onOpenDetail"`, igual que Gastos y Por pagar. Cuando el detalle emite `changed`, la pagina hace `refreshKey += 1`: si el Resumen tiene que refrescarse, recibe `:refresh-key="refreshKey"` y usa el mismo patron que las otras dos pestanas (ver abajo). Al cambiar el pais con el detalle abierto, se cierra.

Patron de refresco de las pestanas (ya aplicado a Gastos y Por pagar): `refreshKey?: number` (default 0); `onActivated`/`onDeactivated` mantienen un flag `isActive`; `watch(refreshKey)` recarga solo si `isActive`; `onActivated` recarga siempre salvo la primera activacion (la del montaje). Asi la pestana oculta se actualiza al mostrarse y no se recarga dos veces.

## Verificacion

| Corrida | Resultado |
|---|---|
| `cd el-templo-app && npx vitest run --root ../el-templo-admin src/utils/__tests__/expenses.test.ts` | 1 archivo, **91 tests** pasan (antes 75: +15 de `historyEntryLines`, +1 de `formatFxRate`) |
| Mutacion: invertir `before`/`after` en la linea de importe de `historyEntryLines` | fallan "correccion de importe" y "reparto corregido"; restaurado |
| `cd el-templo-admin && npx vue-tsc --noEmit 2>&1 \| grep -c "error TS"` | **27** tras cada tarea; ninguno en egresos/expense |
| `pnpm lint` | **0 errores**, 8 warnings (los preexistentes) |
| Greps del plan | `noopener` en el detalle (rel="noopener noreferrer"), sin `v-html` en `components/egresos`, `refreshKey` en `EgresosPage`, sin `console.`, `any` ni azul en los archivos del plan |
| `npx prettier --check` de los archivos del plan | limpio |

Sin tests de componentes (plan): el comportamiento (abrir el detalle, anular, refrescar) queda para la UAT 209-17. No se toco la API.

## Deviations from Plan

- **`options` acepta `null`** (el plan decia `ExpenseFormOptions`): `EgresosPage` las carga por pais y valen `null` mientras cargan; con `null` se deshabilitan "Registrar pago" y "Editar" en vez de ocultar el detalle.
- **`refreshKey` recarga solo si la pestana esta a la vista** (el plan decia "recargan con un `watch`"): con keep-alive, la oculta se recarga igual al volver a mostrarse, y recargar en las dos ocasiones duplicaba pedidos (en Por pagar son hasta 10 paginas del total). Efecto observable igual.
- **`GastosTab` suma `onActivated` y `reload()`** (pedido del encargo, igual que Por pagar), ademas del `refreshKey` del plan.
- **`formatFxRate` exportada con test** (no estaba en el plan): el tipo de cambio se muestra igual en el detalle y en el historial.
- **Tooltip de "Primero anula sus pagos" sobre un `<span>` que envuelve el boton**, mas la misma frase como texto bajo el pie: Quasar deshabilita los eventos de puntero de un boton `disable`, y el tooltip no aparecia sobre el boton.

## Decisiones del ejecutor

- **Texto del tooltip**: "Primero anulá sus pagos" (el encargo), no "Primero anulá los pagos" (el plan).
- **Confirmacion de anulacion**: un unico `$q.dialog` con `prompt` que explica la consecuencia (la plata vuelve a la cuenta / no se deshace) y exige el motivo; no se agrega un segundo dialogo de "estas seguro".
- **Links de comprobante**: solo los que pasan `isHttpUrl` son `<a target="_blank" rel="noopener noreferrer">`; el resto se muestra como texto plano (la API ya los valida al guardar).
- **Observaciones del historial**: se dice "Observaciones modificadas" sin mostrar el texto anterior/nuevo (pueden ser largas y no son plata).
- **Historial en orden cronologico** (el de la API, mas viejo primero), con `q-timeline layout="dense"`; colores `primary`/`brown`/`grey` (sin azul).
- **Fechas con hora**: `toLocaleString('es-AR', short)` en la zona del navegador; la fecha de pago (`paidOn`) con el `formatDate` existente.
- **"Pagado de mas"**: badge en el encabezado y un aviso bajo los importes ("Al confirmar el importe se corrige").
- **Un pago muestra siempre "Cancela X del gasto"**, aunque la moneda coincida (el plan lo pide para cada pago).

## Para los planes siguientes

- **209-16 (Resumen):** emitir `open-detail(id)` desde el detalle por rubro/concepto (`expenseRecordId`) y enganchar `@open-detail="onOpenDetail"` en `EgresosPage`; si el Resumen debe refrescarse tras un cambio del detalle, copiar el patron `refreshKey` + `isActive`. El Excel y el JSON no cambian.
- **209-17 (UAT):** probar con owner, admin y gestion: gestion no ve "Anular pago" ni "Anular gasto"; con pagos vigentes "Anular gasto" esta deshabilitado; anular un pago y luego el gasto; ver el historial de una correccion de importe (con reparto) y de un pago en otra moneda; abrir un link (pestana nueva); abrir el detalle desde Por pagar y desde Gastos y comprobar que la lista de al lado se actualiza; gasto anulado: sin acciones y tachado en la lista (`Ver anulados`).
- El test de `utils/expenses.ts` sigue necesitando imports relativos (`./format-price` incluido).

## Known Stubs

None. (`onOpenDetail` ya no es una funcion vacia.)

## Threat Flags

None. T-209-46 mitigado (todo con interpolacion de Vue, sin `v-html`; los links solo si `isHttpUrl`). T-209-47 mitigado (`rel="noopener noreferrer"`). T-209-48 mitigado (botones y handlers de anulacion condicionados a `canVoid`; la API exige `EXPENSES_VOID_ROLES`).

## Self-Check: PASSED

- Archivo creado verificado en disco: `GastoDetailDialog.vue`.
- Commits `f6de4afa9` y `1d5909689` existen en la rama; `git status` limpio antes del commit del SUMMARY.

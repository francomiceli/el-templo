---
phase: 209-egresos
plan: 16
subsystem: admin
tags: [egresos, admin, quasar, resumen, excel]
requires: [209-15]
provides:
  - components/egresos/ResumenTab.vue (resumen mensual por destino, incompletos y Excel)
  - components/egresos/ResumenDetalleDialog.vue (detalle por rubro y concepto de un destino)
  - EgresosPage monta ResumenTab en el panel resumen
affects: [209-17]
tech-stack:
  added: []
  patterns: [tabla con filas = medidas y columnas = destinos con primera columna fija, refreshKey con recarga solo si la pestana esta a la vista]
key-files:
  created:
    - el-templo-admin/src/components/egresos/ResumenTab.vue
    - el-templo-admin/src/components/egresos/ResumenDetalleDialog.vue
  modified:
    - el-templo-admin/src/pages/EgresosPage.vue
decisions:
  - La tabla va con una columna por destino (orden de la API, Total al final) y tres filas; el costo muestra debajo lo estimado y lo pagado
  - El Resumen no calcula nada: solo formatPrice sobre lo que manda la API
metrics:
  tasks: 2
  completed: 2026-11-12
---

# Phase 209 Plan 16: Pestana Resumen del admin Summary

Administracion ve, para un mes, lo pagado, lo imputado y lo pendiente por sede y por Casa Matriz, con el Total que manda la API, el detalle por rubro y concepto, el contador de datos incompletos y el Excel del mes.

## Que se hizo

1. **Task 1** (`4540939a2`): `ResumenTab.vue` y montaje en `EgresosPage`.
2. **Task 2** (`06803de8c`): `ResumenDetalleDialog.vue` y cableado desde la tabla.

## Componentes creados

### `components/egresos/ResumenTab.vue`
Props: `selectedCountry: ExpenseCountry`, `isOwner: boolean`, `options?: ExpenseFormOptions | null` (de ahi sale el mes por defecto), `refreshKey?: number` (default 0). Emite `open-detail(id: number)` (reenvia el del dialogo de detalle). `EgresosPage` lo monta con `:selected-country`, `:is-owner`, `:options`, `:refresh-key` y `@open-detail="onOpenDetail"`.

- Selector de mes con flechas (`shiftMonth`, `monthLabel`; se deshabilita fuera de 2000-2099). Mes por defecto: el de `options.today` si el pais coincide; mientras las opciones cargan, el del navegador, y al llegar se corrige solo si el usuario no tocó el selector.
- Aclaracion de moneda (AR: pesos con USD convertidos por TC de referencia; ES: euros) y leyenda corta de las tres medidas.
- Tabla `q-markup-table`: una columna por `summary.columns` en el orden recibido (el Total viene ultimo y va con fondo `#fff8e1` y negrita); tres filas "Pagado en el mes", "Costo del mes" y "Pendiente de ese costo". Debajo del costo: "incluye X estimados" en `amber-9` si `costEstimated > 0`, y "pagado X" (`costPaid`). Sede con `isActive: false`: "(inactiva)" bajo el nombre. Primera columna fija (`position: sticky`) con scroll horizontal. Click en encabezado o celda abre el detalle de esa columna.
- Banner de incompletos arriba si `incomplete.total > 0`, con solo las partes mayores a 0 (estimados, sin comprobante, sin tipo de cambio).
- Estado vacio ("No hay gastos imputados ni pagos en {mes}.") cuando todas las columnas tienen paidInMonth, cost y pending en 0.
- Excel: `exportExpenseSummary` -> blob -> link temporal -> `revokeObjectURL`, archivo `egresos-resumen-{AR|ES}-{AAAA-MM}.xlsx`, boton con `loading`/`disable` mientras baja, errores con el `message` de la API.
- Carga con `loadSeq` (una respuesta vieja no pisa a la nueva); al cambiar mes o pais se vacian los numeros, al refrescar (`refreshKey`, reactivacion) se dejan a la vista con un inner-loading. Error de carga con "Reintentar".
- Patron `isActive`/`firstActivation` de Gastos y Por pagar para `refreshKey` y reactivacion.

### `components/egresos/ResumenDetalleDialog.vue`
Props: `modelValue: boolean`, `country: ExpenseCountry`, `month: string`, `destination: string | null` (la `key` de la columna), `currency: 'ARS' | 'EUR'`, `refreshKey?: number`. Emite `update:modelValue` y `open-detail(expenseRecordId: number)`. Carga `getExpenseSummaryDetail` al abrir (y al cambiar destino, mes o pais) arrancando de cero; con `refreshKey` mientras esta abierto recarga sin vaciar. Titulo "{destinationName} · {monthLabel}"; un `q-expansion-item` abierto por rubro con Costo / Pendiente / Pagado en el mes; cada concepto es un `q-item` clickable con concepto, beneficiario, badge "Estimado", la marca "imputado a {mes}" cuando `imputationMonth !== month` (factura de otro mes pagada este mes) y sus tres importes. Vacio: "Sin gastos ni pagos para este destino en el mes.".

## Verificacion

| Corrida | Resultado |
|---|---|
| `cd el-templo-admin && npx vue-tsc --noEmit 2>&1 \| grep -c "error TS"` | **27** tras cada tarea; ninguno en egresos/expense/Resumen |
| `pnpm lint` | **0 errores**, 8 warnings (los preexistentes) |
| `cd el-templo-app && npx vitest run --root ../el-templo-admin src/utils/__tests__/expenses.test.ts` | **91 tests** pasan (sin cambios: no hay funcion pura nueva) |
| Greps | `createObjectURL` en ResumenTab; `ResumenTab`/`ResumenDetalleDialog` enlazados; sin `reduce(`, `Math.floor/round`, `console.`, `any`, `v-html` ni azul en los archivos nuevos |
| `npx prettier --check` de los archivos del plan | limpio |

Sin tests de componentes (plan): el comportamiento queda para la UAT 209-17. No se toco la API.

## Deviations from Plan

- **Tabla transpuesta** (plan: una fila por destino; encargo: tres filas por destino): columnas = destinos, filas = medidas, por pedido explicito del orquestador. "Pagado de ese costo" no tiene fila propia: queda como "pagado X" bajo el costo.
- **`options` como prop opcional** del tab (no estaba en el plan): el mes por defecto sale de `options.today`, que `EgresosPage` ya carga por pais.
- **`refreshKey` tambien en el dialogo de detalle** (no estaba en el plan): el gasto se abre con el detalle del resumen debajo; si el gasto cambia algo, ambos numeros se actualizan.
- **Banner de incompletos con singular/plural** ("1 gasto de este mes tiene ...") en vez del texto fijo del plan.

## Decisiones del ejecutor

- **El dialogo del resumen queda abierto** al abrir un gasto desde un concepto: el detalle del gasto se abre encima y al cerrarlo se vuelve al resumen. Cambiar de mes o de pais cierra el dialogo.
- **Condicion de "imputado a ..."**: `imputationMonth !== month` (el plan), que es equivalente a `cost: 0 y paidInMonth > 0` del encargo.
- **Vacio** = ninguna columna con pagado, costo ni pendiente distintos de 0 (comparaciones, sin sumar).
- **Nombre del archivo Excel** con el codigo de pais (`AR`/`ES`).
- **Moneda del dialogo** con respaldo por pais mientras el resumen no llego (`ARS`/`EUR`); en la practica el dialogo solo se abre con el resumen cargado.

## Para el plan de cierre (209-17, checklist manual)

- Resumen de Argentina: orden de columnas = sedes (por calle/nombre), Casa Matriz, Total al final; el Total coincide con la suma visible de las columnas (lo calcula la API, el cliente no suma).
- Mes de hoy por defecto; flechas de mes; cambiar de pais (owner) recarga y cierra el detalle; el mes sin gastos muestra el vacio.
- Sede inactiva con reparto historico: aparece marcada "(inactiva)".
- "Pagado en el mes" distinto de "Costo del mes": registrar un pago de una factura de otro mes y ver que aparece en el detalle como "imputado a {mes}" con costo 0.
- Importe estimado: "incluye X estimados" bajo el costo, badge "Estimado" en el detalle, y el banner de incompletos con el desglose.
- Click en encabezado y en celda de cada columna (incluido Total) abre el detalle; tocar un concepto abre el gasto encima; pagar/editar/anular desde ahi refresca el Resumen y el detalle.
- Excel: el boton se deshabilita mientras baja; el archivo trae los mismos numeros que la pantalla; error de API (por ejemplo rol sin acceso) muestra el `message`.
- Pantalla angosta (movil/ventana chica): la tabla scrollea horizontal con la primera columna fija.
- Gestion ve el Resumen (la ruta y la API lo permiten); el detalle del gasto no le ofrece anular.

## Known Stubs

None.

## Threat Flags

None. T-209-49 mitigado (la pantalla no recalcula: solo `formatPrice` sobre lo que manda la API; el Excel sale del mismo `computeMonth`). T-209-50 sin cambios (ruta `/egresos` con `EGRESOS_ROLES` y API con `EXPENSES_ROLES`).

## Self-Check: PASSED

- Archivos verificados en disco: `ResumenTab.vue`, `ResumenDetalleDialog.vue`.
- Commits `4540939a2` y `06803de8c` existen en la rama.

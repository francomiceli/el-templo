---
phase: 211-resultado-por-sede
plan: 05
subsystem: admin
tags: [egresos, resultado, admin, pestaña, roles]
requires: [211-04]
provides: [ResultadoTab.vue, pestaña Resultado en Egresos, EGRESOS_RESULTADO_ROLES]
affects: [211-06]
key-files:
  created:
    - el-templo-admin/src/components/egresos/ResultadoTab.vue
  modified:
    - el-templo-admin/src/constants/egresos.ts
    - el-templo-admin/src/config/templo-config.ts
    - el-templo-admin/src/pages/EgresosPage.vue
metrics:
  tasks: 2
  completed: 2026-11-13
---

# Phase 211 Plan 05: Pestaña Resultado en el admin Summary

`ResultadoTab.vue` (matriz por sede, Casa Matriz y Consolidado, con avisos, detalle y Excel) y la pestaña "Resultado" entre Resumen y Rubros, visible solo para owner y admin con el mismo patrón que Rubros.

## Qué se hizo

- **Task 1** (`73c80d3b6`): `ResultadoTab.vue`, copia del patrón de `ResumenTab.vue` (selector de mes, `options.today`, `monthTouched`, `loadSeq`, keep-alive con `onActivated`/`onDeactivated`/`refreshKey`, Excel en blob, `onUnmounted(() => expensesApi.cleanup())`). Usa los helpers de 211-04 (`resultColumnLabel`, `resultMarginLabel`, `resultDetailDestination`, `foreignIncomeNotice`, `incompleteExpensesText`, `expenseCurrencyNote`, `RESULT_FOOTNOTE`) y `ResumenDetalleDialog` tal cual.
- **Task 2** (`854a9b1ed`): `EGRESOS_TABS.resultado` (y en `EGRESOS_TAB_NAMES` entre `resumen` y `rubros`), `EGRESOS_RESULTADO_ROLES = ['admin', 'owner']` en `templo-config.ts` y, en `EgresosPage.vue`, `canSeeResult` propio usado en el `q-tab`, el `q-tab-panel` y `tabFromQuery()` (un `?tab=resultado` sin permiso cae a Gastos). `canVoid` y `canManageRubros` sin cambios.

## Qué se ve

Mes con flechas y "Descargar Excel"; nota de moneda y leyenda ("Resultado = cobros a alumnos − costos imputados. Consolidado = ..."); banner ámbar de gastos incompletos; banner ámbar de cobros en otra moneda (si hay); tabla con una columna por sede (marca "(inactiva)"/"(virtual)" debajo del nombre), Casa Matriz y Consolidado (fondo `#fff8e1`, negrita). Filas: Cobros a alumnos (Casa Matriz "—"), un renglón por rubro con sangría, Total costos (con "incluye $X estimados" en ámbar), Resultado y Margen (negativos con `text-negative`, el rojo cálido de la paleta). Tocar una columna abre el detalle por rubro y concepto (Consolidado = destino `total`). Nota fija `RESULT_FOOTNOTE` debajo. Con país España el informe sale en euros y sin Casa Matriz (lo manda la API; la leyenda omite la mención de Casa Matriz).

## Resultados

Sin tests de componentes (el plan lo establece: vue-tsc + lint + greps; el comportamiento se prueba en la UAT de 211-06). Corridas de vitest: ninguna.

Gates (tras el último commit de código):
- `cd el-templo-admin && npx vue-tsc --noEmit 2>&1 | grep -c "error TS"` = 27 (ningún error en archivos del plan)
- `pnpm lint` (admin) = 0 errores, 8 warnings preexistentes (ninguno en archivos del plan)
- `cd el-templo-api && npx tsc --noEmit` = 0
- Greps: `getExpenseResult(`, `createObjectURL`, `resultDetailDestination(` presentes en `ResultadoTab.vue`; ausentes `reduce(`, `Math.`, `v-html`, `console.`, `blue`, `indigo`, `cyan`, `info`; `canSeeResult` en tab, panel y `tabFromQuery`; `git diff` sin cambios en las líneas de `canVoid`/`canManageRubros`.

## Desviaciones del plan

Ninguna.

## Decisiones del ejecutor

1. Leyenda del Consolidado: "suma de las sedes menos los costos de Casa Matriz, una sola vez" (el plan dice "menos Casa Matriz"; se agregó "los costos de" para que coincida con CONTEXT criterio 3 y no se lea como restar una columna de cobros).
2. La marca "(inactiva)"/"(virtual)" se obtiene recortando el nombre del rótulo que arma `resultColumnLabel`, para no duplicar la lógica de marcas; así el nombre queda en negrita y la marca en `text-caption`.
3. Se agregó un contenedor `overflow-x: auto` alrededor de `q-markup-table` (como pedía el plan); `q-markup-table` ya scrollea por sí misma, así que el contenedor es inocuo.
4. La nota al pie solo se muestra cuando hay datos y el mes no está vacío.
5. Los renglones de rubro (primera columna) llevan sangría de 24 px por CSS propio.
6. El orden de los banners es: incompletos, otra moneda, error de carga (los dos avisos solo aparecen con datos cargados).

## Bugs encontrados

Ninguno.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-211-13: `v-if`/`tabFromQuery` con `EGRESOS_RESULTADO_ROLES` (el gate real es la API). T-211-14: interpolación escapada, sin `v-html`. T-211-15: la pantalla no calcula plata.

## Self-Check: PASSED

---
phase: 206-tablero-semanal
plan: 08
subsystem: admin
tags: [weekly-board, admin, composable, types, format]
requires: [206-05, 206-06]
provides:
  - "types/weekly-board.ts: espejo del contrato del API"
  - "useWeeklyBoardApi(): getBoard, saveLeads, loading, saving, error, isCanceled, cleanup"
  - "utils/weekly-board-format.ts: etiquetas, notas, formato, deltas, tono, estados de bloque, opciones de semana"
affects: [206-09]
key-files:
  created:
    - el-templo-admin/src/types/weekly-board.ts
    - el-templo-admin/src/composables/useWeeklyBoardApi.ts
    - el-templo-admin/src/utils/weekly-board-format.ts
  modified: []
requirements-completed: [SC-2, SC-3, SC-4, D-05, D-06, D-07, D-13, D-14, D-18, D-20, D-22, D-25, D-26, D-29]
completed: 2026-11-03
---

# Phase 206 Plan 08: Capa de datos del Tablero en el admin Summary

Tipos espejo del contrato, composable con cancelación de pedidos y un util puro con todos los textos, formatos y reglas de color del Tablero, listos para que 206-09 solo dibuje.

## Commits

| Commit | Subject |
| --- | --- |
| 7929688d4 | feat(206-08): tipos y composable del tablero en el admin |
| e78e7f936 | feat(206-08): formato, deltas y semanas del tablero |

## Que se hizo

- `types/weekly-board.ts`: copia exacta de los nombres del API (`BoardMetricKey` con las 21 claves, `BoardCell`, `BoardMetric`, `BoardGroup`, `BoardBlockInfo`, `BoardBlockState`, `BoardWarning`, `WeeklyBoardResponse`, `LeadsUpsertInput`, `LeadsUpsertResult`, `CountryCurrency`, `BoardFreezeBlock`, `BoardMetricFreeze`). `BOARD_METRICS` no se copia.
- `useWeeklyBoardApi.ts`: `getBoard(weekStart?)` (solo manda `weekStart`, nada mas), `saveLeads({branchId, weekStart, leads})`, refs `loading`/`saving`/`error`, `isCanceled(err)` y `cleanup()` que aborta lo que este en vuelo. Pedir otra semana cancela la anterior (sin carreras al cambiar rapido de semana). Sin `onUnmounted`, sin `console`. El logger recibe solo status y mensaje, nunca el cuerpo de la respuesta (T-206-28); los 4xx esperados no van a Sentry.
- `weekly-board-format.ts`: `METRIC_LABELS`, `BLOCK_LABELS`, `METRIC_NOTES` (con "sin Online" en Cobrado), `HIGHER_IS_BETTER`, `formatBoardValue`, `boardDelta`, `deltaTone`, `BLOCK_STATE_LABELS` (el tooltip de provisorio trae `{fecha}` para que la pantalla lo reemplace con `freezesOn`), `weekOptions` (12 semanas por defecto).

## Gates

| Gate | Resultado |
| --- | --- |
| vue-tsc (binario aprobado) | 26 `error TS`, igual que la linea base; ninguna menciona archivos de esta fase |
| `pnpm lint` | exit 0 (0 errores, 8 warnings preexistentes en `env.d.ts`, `CobrosPage.vue`, `session-pdf-builder.ts`; ninguno en archivos de esta fase) |
| Prettier | OK en los tres archivos |

Verificacion de helpers (script descartable fuera del repo, empaquetado con esbuild del arbol `el-templo-test-gsd`, no commiteado): 33 chequeos, todos OK. Cubre null -> "—" (y que 0 no sea null), % sin decimales, miles es-AR, plata ARS/EUR, deltas de conteo/plata/porcentaje (`+5 pp`, `−8 pp`, `0 pp`), delta nulo si falta un lado, tono (deuda y no renueva suben = negativo, cobrado sube = positivo, vencimientos neutro, flat/null neutro), 21 claves en etiquetas y en `HIGHER_IS_BETTER`, y `weekOptions` (etiquetas, 12 opciones, domingo a la noche AR, cruce de anio).

## Decisiones del ejecutor

- **Nombres de tipos**: el plan lista `BoardMetricBlock`/`BoardMetricUnit` pero la instruccion pide copiar los nombres del API (`BoardBlockName`/`BoardUnit`). Se exportan ambos (los del API como alias).
- **Direccion del delta en porcentajes**: sale del valor redondeado, para no mostrar ▲ con "+0 pp". Signo negativo con "−" (U+2212), como pedia el plan para plata.
- **Cancelacion**: el composable agrega `isCanceled` y cancela el pedido anterior de `getBoard` (el plan solo pedia cancelar en `cleanup`). Un pedido cancelado rechaza con el error de cancelacion de axios y no pisa `error`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `weekOptions` devolvia una semana futura los domingos**
- **Found during:** Task 2 (chequeo con la fecha de un domingo 23:30 AR)
- **Issue:** `getWeekRange(0)` usa `getMondayInTz`, que el domingo salta al lunes siguiente (convencion Lun-Sab de Horarios). El Tablero es Lun-Dom y el API rechaza semanas futuras con 400, asi que "Esta semana" fallaba todos los domingos.
- **Fix:** `weekOptions` ancla `now` al sabado anterior cuando `dowInTz(RENEWALS_TZ, now) === 7`. `renewals-week.ts` no se toco (lo usan Renovaciones y Sesiones de prueba).
- **Files modified:** el-templo-admin/src/utils/weekly-board-format.ts
- **Commit:** e78e7f936

## Notas para 206-09 (la pantalla)

- Clave de celda por sede: `metric.byBranch[String(branch.id)]`; Total: `metric.totalByCountry[group.country]`; Online: `metric.onlineByCountry[group.country]` (solo si `group.online`). Una celda ausente = "—", no 0.
- Moneda: `group.currency` para `formatBoardValue` y `boardDelta` de cada grupo.
- Flecha: `boardDelta(cell, metric.unit, group.currency)` da `direction` (`up`/`down`/`flat`/null) y `label`; dibujar ▲/▼ segun `direction` y color segun `deltaTone(metric.key, direction)` (`positive`/`negative`/`neutral`, usar tonos calidos, sin azul). Sin `direction` no se dibuja nada.
- "Sin contactar" en rojo si `value > 0` es presentacion de la pantalla; no esta en el util.
- Estados: `blocks.main` rige caja/deuda/alumnos/"vencen la semana que viene"; `blocks.late` rige Embudo y Renovaciones. Para el tooltip de `provisorio`/`en_curso`, reemplazar `{fecha}` con `freezesOn` formateado dd/mm. Avisar si `capturedLate`.
- Leads editable solo si `leadsEditable` y solo en celdas de sede fisica (no Total ni Online). Enviar numeros enteros; vaciar la celda = `leads: null`. Tras guardar, recargar con `getBoard(weekStart)`.
- Llamar `cleanup()` desde el `onUnmounted` de la pagina; en los `catch` de la pagina, ignorar errores con `isCanceled(err)`.
- `weekOptions()` devuelve `value` = lunes; pasar ese valor a `getBoard`. La primera opcion es la semana en curso (en el selector inicial se puede llamar `getBoard()` sin parametro).
- Tipografia: las etiquetas de fila vienen de `METRIC_LABELS[metric.key]` y los titulos de bloque de `BLOCK_LABELS[metric.block]`; las notas (`METRIC_NOTES`) van como tooltip de la fila.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-206-27 (validacion real en el API) y T-206-28 (logger sin volcar respuestas) cubiertos.

## Self-Check: PASSED

Archivos creados presentes en disco; commits 7929688d4 y e78e7f936 presentes en `git log`.

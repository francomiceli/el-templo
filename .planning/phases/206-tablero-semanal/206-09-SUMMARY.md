---
phase: 206-tablero-semanal
plan: 09
subsystem: admin
tags: [weekly-board, admin, vue, quasar, page]
requires: [206-08]
provides:
  - "pages/TableroPage.vue: pantalla /tablero (sin ruta ni menu, los agrega 206-10)"
  - "components/tablero: TableroMatrix, TableroCell, TableroLeadsCell, TableroWeekSelector"
affects: [206-10]
key-files:
  created:
    - el-templo-admin/src/components/tablero/TableroCell.vue
    - el-templo-admin/src/components/tablero/TableroLeadsCell.vue
    - el-templo-admin/src/components/tablero/TableroWeekSelector.vue
    - el-templo-admin/src/components/tablero/TableroMatrix.vue
    - el-templo-admin/src/pages/TableroPage.vue
  modified:
    - el-templo-admin/src/utils/weekly-board-format.ts
requirements-completed: [SC-2, SC-3, SC-4, SC-7, D-02, D-05, D-07, D-11, D-14, D-16, D-18, D-22, D-24, D-25]
completed: 2026-11-03
---

# Phase 206 Plan 09: Pantalla del Tablero semanal Summary

Pantalla `/tablero` que dibuja `WeeklyBoardResponse` como la planilla (Bloque | Métrica | sedes | Total | Semana anterior | ▲▼ | Online), con celda de leads editable, chips de estado por bloque y selector de semana en la URL; sin cálculos de negocio en la UI.

## Commits

| Commit | Subject |
| --- | --- |
| ae2ee5674 | feat(206-09): celdas y selector de semana del tablero |
| b94e216c7 | feat(206-09): pantalla del tablero semanal |

## Que se hizo

- `TableroCell`: valor (tabular-nums, a la derecha), debajo "ant. X" + ▲/▼ con tono por `deltaTone` (verde/rojo/olive). Props del plan más `part` (`cell` | `previous` | `delta`) para que las columnas Total / Semana anterior / ▲▼ reusen el mismo formateo sin duplicar.
- `TableroLeadsCell`: `q-popup-edit` (Guardar/Cancelar), entero 0..100000 o vacío (vacío emite `leads: null`), icono `edit` al hover/foco, `role=button` + `aria-label="Editar leads"`, Enter/Espacio abre el editor; no editable -> tooltip D-24; `saving` deshabilita.
- `TableroWeekSelector`: `weekOptions(12)`; si el valor de la URL no está, lo agrega como "Semana del dd/mm al dd/mm" (el domingo sale de `getWeekRange`, sin fechas propias).
- `TableroMatrix`: un grupo por país (título + "en pesos"/"en euros"), `rowspan` por bloque, chips de estado (`BLOCK_STATE_LABELS`, tooltip con `freezesOn` dd/mm) y chip "Foto tomada el dd/mm" si `capturedLate`; notas por fila (`METRIC_NOTES`) y nota visible bajo Cobrado; Total/Semana anterior/▲▼ solo con `hasTotal`; Online apagada y sin tocar el Total, solo con `group.online`; "Sin contactar" > 0 en rojo y negrita.
- `TableroPage`: la semana es un `computed` de `?semana=` (única fuente de verdad: selector, atrás/adelante y recarga pasan por la URL); `q-inner-loading`, banner de error con "Reintentar", banner de montos en otra moneda, estado vacío, `cleanup()` en `onUnmounted`, `isCanceled(err)` ignorado, recarga tras guardar leads con `Notify`.

## Gates

| Gate | Resultado |
| --- | --- |
| vue-tsc (binario aprobado) | 26 `error TS`, igual que la línea base; ninguna menciona archivos de esta fase |
| `pnpm lint` | exit 0 (0 errores, 8 warnings preexistentes ajenos) |
| Prettier | aplicado a todos los archivos |
| grep `v-html`, `blue`, `indigo`, `console.`, `any`, `reduce(`, `/ 100`, `* 100` | sin resultados en los archivos nuevos |

No se corrió `quasar build/dev` ni hay runner de tests en el admin; la pantalla no fue vista en navegador.

## Decisiones del ejecutor

- **Semana inicial = `weekOptions(1)[0].value`**, no `getWeekRange(0).dateFrom` como decía el plan: el domingo `getWeekRange(0)` salta al lunes siguiente (semana futura, el API responde 400). Es la misma corrección de 206-08.
- **Selector sin `?semana=` en la semana en curso** y la URL gobierna la carga (no hay un `ref` paralelo que pueda desincronizarse). El watcher ignora cambios si la ruta ya no es la de la página (evita un pedido suelto al navegar afuera).
- **Gris de captions `#6b6459`** en lugar de Olive Stone `#8A8472`: a 11-12 px el segundo no llega a 4.5:1 (pedido de contraste accesible).
- **"Vencen la semana que viene"** es del bloque `main` pero está en Renovaciones (`late`): el chip del bloque sigue `late`; si el estado de `main` difiere, esa fila lleva su propio chip.
- **Columna Online al final** (después de ▲▼), como lista el plan, para que no se lea como parte del Total. Sin `danger` en Online (apagada).
- **Sin columnas pegajosas**: con `rowspan` por bloque y scroll horizontal (`overflow-x: auto`) se descartó el sticky; con 6-7 sedes entra en pantalla de escritorio.
- **Tooltip de `provisorio` sin `freezesOn`** dice "se congela pronto" (reemplaza ` el {fecha}`).
- `show-previous` en leads de sede: se muestra "ant. X" y ▲▼ también para leads (dato cargado a mano), igual que el resto de celdas.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Se exporta `ddmm` de `weekly-board-format.ts`**
- **Found during:** Task 1
- **Issue:** la pantalla necesita "dd/mm" para el subtítulo, `freezesOn` y el selector; la función existía privada en el util (206-08) y duplicarla violaría DRY.
- **Fix:** `export function ddmm` (un solo cambio de palabra clave, sin cambio de comportamiento).
- **Files modified:** el-templo-admin/src/utils/weekly-board-format.ts
- **Commit:** ae2ee5674

**2. [Rule 1 - Bug] Semana inicial en domingo** (ver Decisiones): `weekOptions(1)[0]` en vez de `getWeekRange(0)`.

## Notas para 206-10 (ruta, menú, landing)

- Importar la página: `src/pages/TableroPage.vue`. Ya usa `q-page`, así que va como hija de `MainLayout`.
- La página lee/escribe solo `?semana=YYYY-MM-DD` y preserva el resto de la query; la ruta puede llevar `meta` de roles owner/admin/gestion/admin_sede según D-02.
- No hace chequeo de rol en el cliente: el alcance (una sola columna para admin_sede, país del rol) lo decide el API.
- Los bundles de CI no typechequean el admin: correr `vue-tsc` local tras agregar la ruta.
- UAT visual pendiente (no se levantó el admin): mirar con datos reales encabezados, chips de estado, Online apagada, edición de leads y el ancho con todas las sedes.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-206-29/30/31 cubiertos (la UI solo dibuja lo que manda el API, validación de leads en el popup, interpolación `{{ }}` sin `v-html`).

## Self-Check: PASSED

Los 5 archivos nuevos existen; commits ae2ee5674 y b94e216c7 en `git log`.

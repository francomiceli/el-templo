---
phase: 178-bloque-alternativo-en-t-cnica-combos-dos-deuteros-en-pantall
plan: 07
subsystem: admin-frontend
tags: [tv, vue, quasar, admin]

# Dependency graph
requires:
  - phase: 178-06
    provides: "Contrato backend TV: TvClassPayload.columns hasta 4 (2×2 deuteros), showAlternative en TvControlState, swap del bloque alt sobre bloque persistido"
provides:
  - "Botón 'Ver alternativo' en el control del profe (TvControlPage.vue), visible solo en días técnica/combos, consume/escribe showAlternative — reemplaza el botón de rotación de deuteros ya erradicado del backend"
  - "Grilla 2×2 de deuteros en la pantalla del TV (render.ts + TvScreenPage.vue): hasta 4 columnas con data-cols='4' y tipografía reducida en modo 4 columnas"
  - "TvClassMode del mirror admin corregido a 'regular'|'rom'|'combos'|'tecnica' (estaba stale en 'regular'|'rom')"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El front del TV degrada limpio con sesiones/estado viejos: el toggle showAlternative arranca false y el layout 2×2 sólo se activa con data-cols segun columnas que devuelve el backend"

key-files:
  created: []
  modified:
    - el-templo-admin/src/composables/useTvApi.ts
    - el-templo-admin/src/pages/TvControlPage.vue
    - el-templo-admin/src/tv/render.ts
    - el-templo-admin/src/pages/TvScreenPage.vue

key-decisions:
  - "Task 3 (checkpoint human-verify, gate=blocking) NO se aprobó dentro del flujo GSD: la validación visual/funcional en el TV real se difiere a UAT en producción por decisión de Franco (2026-08-19) — se mergea la fase a master para probar en el TV físico (que sólo existe en prod). El código de Tasks 1-2 quedó implementado, committeado y verde (vue-tsc/eslint/tsc)."

patterns-established: []

requirements-completed: []

# Metrics
duration: ~4min (Tasks 1-2; Task 3 diferido a UAT en prod)
completed: 2026-08-19
---

# Phase 178 Plan 07: Front del TV — grilla 2×2 de deuteros + toggle "Ver alternativo" Summary

**El control del profe gana el botón "Ver alternativo" (sólo en días técnica/combos) que escribe `showAlternative`, y la pantalla del TV pinta hasta 4 columnas de deuteros en grilla 2×2 — cerrando los refs colgados a la rotación vieja (`deuterosAutoRotate`/`deuterosPinnedAt`) que 178-06 dejó en el admin. Tasks 1-2 verdes (vue-tsc admin sin errores nuevos sobre baseline, eslint 0, api tsc sigue en 0). Task 3 es un checkpoint de validación visual, diferido a UAT en el TV real de producción.**

## Performance

- **Duration:** ~4 min (implementación); Task 3 = checkpoint humano diferido
- **Completed:** 2026-08-19
- **Tasks:** 2 de 3 implementadas y committeadas; Task 3 = checkpoint:human-verify (UAT en prod)
- **Files modified:** 4

## Accomplishments
- **Contrato del front + botón "Ver alternativo" (Task 1):** `useTvApi.ts` y `TvControlPage.vue` reemplazan el toggle de rotación de deuteros por el botón "Ver alternativo", que consume/escribe `showAlternative` del `TvControlState`. Visible sólo cuando el modo del día es `combos`/`tecnica`. Sin referencias colgadas a `deuterosAutoRotate`/`deuterosPinnedAt`.
- **Grilla 2×2 de deuteros en el TV (Task 2):** `render.ts` + `TvScreenPage.vue` pintan hasta 4 columnas de deuteros (2 deuteros × par de niveles) en grilla 2×2 vía `data-cols='4'`, con tipografía reducida en el modo 4 columnas para mantener legibilidad en el televisor.

## Task Commits

1. **Task 1: Contrato del front + botón "Ver alternativo" (sacar rotación)** - `e606ed1f` (feat)
2. **Task 2: Grilla 2×2 de deuteros en la pantalla del TV** - `1f53056f` (feat)
3. **Task 3: checkpoint:human-verify (gate=blocking)** - diferido a UAT en prod (ver Decisions)

## Files Created/Modified
- `el-templo-admin/src/composables/useTvApi.ts` - `showAlternative` reemplaza los refs de rotación; `TvClassMode` corregido a `'regular'|'rom'|'combos'|'tecnica'`
- `el-templo-admin/src/pages/TvControlPage.vue` - botón "Ver alternativo" (visible en técnica/combos), sin botón de rotación
- `el-templo-admin/src/tv/render.ts` - grilla 2×2, hasta 4 `.lista-col`
- `el-templo-admin/src/pages/TvScreenPage.vue` - regla `data-cols='4'` + tipografía reducida en modo 4 columnas

## Decisions Made
- **Task 3 diferido a UAT en producción:** el checkpoint pide validación visual/funcional en el TV físico, que sólo existe en prod. Franco decidió (2026-08-19) mergear la fase a master y probar desde ahí, en vez de aprobar el checkpoint en local. El código está implementado y verde; la aprobación funcional queda como UAT post-deploy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Missing critical] `TvClassMode` stale en el mirror del admin**
- **Found during:** Task 1
- **Issue:** `TvClassMode` en `useTvApi.ts` era `'regular' | 'rom'`, mirror desactualizado del backend (que ya tenía `'regular'|'rom'|'combos'|'tecnica'` desde una fase anterior). El botón "Ver alternativo" compara `context.value?.mode === 'combos'|'tecnica'`, lo que sin el fix daba TS2367 (comparación sin overlap) y no compilaba.
- **Fix:** Se extendió `TvClassMode` para espejar el backend real.
- **Committed in:** `e606ed1f` (Task 1 commit)

---

**Total deviations:** 1 (mirror de tipo stale, corregido para compilar).

## Issues Encountered
- Verificación automatizada corrida y verde: `vue-tsc` admin 20 errores (todos preexistentes, ninguno en archivos TV/`useTvApi.ts`), `eslint` de los 4 archivos = 0, `el-templo-api` tsc exit 0 (no se tocó). Refs viejos (`deuterosAutoRotate`/`deuterosPinnedAt`) = 0 en `useTvApi.ts` y `TvControlPage.vue`.

## User Setup Required
- **UAT en prod (Task 3):** tras el deploy, validar en el TV real: card del bloque alt en el editor (combos/técnica) con ejercicios distintos del II; página del alt en el PDF; grilla 2×2 de deuteros legible en día regular; toggle "Ver alternativo" swapea sin reiniciar el cronómetro; ausencia del botón/rotación automática de deuteros.
- **Operativo post-deploy:** refrescar/reiniciar las pantallas de TV una vez (el `TvScreenPage.vue` no tiene auto-reload; una pestaña vieja cacheada apretaría 4 columnas en una fila hasta recargar).

## Next Phase Readiness
- Fase 178 completa a nivel implementación (7/7 planes). Pendiente: UAT en prod (Task 3) + back-merge master→staging del tren TV.

---
*Phase: 178-bloque-alternativo-en-t-cnica-combos-dos-deuteros-en-pantall*
*Completed: 2026-08-19*

## Self-Check: PASSED (Tasks 1-2; Task 3 = UAT en prod diferido)

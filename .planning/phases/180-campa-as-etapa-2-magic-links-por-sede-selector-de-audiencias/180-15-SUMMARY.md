---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 15
subsystem: ui
tags: [scheduling, admin, quasar, vue3]
status: completed

# Dependency graph
requires:
  - phase: 180-10
    provides: "GET/PUT /api/admin/scheduling/class-label-descriptions + KV class_label_description.% en tenant_settings"
provides:
  - "useSchedulingApi().getClassLabelDescriptions() / saveClassLabelDescription(mode, description) — cliente admin del KV de descripciones derivadas"
  - "Sección 'Descripciones de clases derivadas' en ActivitiesDialog.vue: dos textarea (Combos/Técnica) con guardado independiente"
affects: ["180-16"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Métodos nuevos del composable siguen el mismo bloque loading/error/try-finally + extractError que todos los métodos hermanos de useSchedulingApi.ts, sin introducir un composable nuevo"
    - "El textarea de descripción derivada vive en el MISMO diálogo donde ya se edita activities.description, para que 'la descripción de una clase' tenga un único lugar de edición en el admin"

key-files:
  created: []
  modified:
    - el-templo-admin/src/composables/useSchedulingApi.ts
    - el-templo-admin/src/components/scheduling/ActivitiesDialog.vue

key-decisions:
  - 'El composable real es useSchedulingApi.ts (no useSchedulingAdminApi.ts como decía files_modified en el plan) — es el único archivo del admin que habla con /admin/scheduling/*, ya usado por HorariosPage y ActivitiesDialog; se extendió ese, sin crear un composable duplicado (verificado: grep -rln "admin/scheduling" src/composables/ sigue devolviendo 1 archivo)'
  - "saveClassLabelDescription(mode, description) devuelve Promise<void> tal como pide el plan, aunque la ruta PUT devuelve las descripciones actualizadas — la UI vuelve a leer el estado desde su propio v-model (fuente de verdad optimista), no necesita el eco del servidor para este caso de uso simple"

requirements-completed: [RES-05]

# Metrics
duration: ~15min
completed: 2026-08-24
---

# Fase 180 Plan 15: Edición de descripciones de Combos/Técnica en el admin (D-18) Summary

**Dos métodos nuevos en `useSchedulingApi.ts` (GET/PUT contra las rutas del plan 180-10) más una sección "Descripciones de clases derivadas" al final de `ActivitiesDialog.vue`, con un textarea y botón de guardado independiente por modo (Combos/Técnica) en el mismo diálogo donde ya se edita `activities.description`.**

## Performance

- **Duration:** ~15 min (2 tasks)
- **Completed:** 2026-08-24
- **Tasks:** 2/2 ejecutados
- **Files modified:** 2 (0 nuevos, 2 modificados)

## Accomplishments

- `getClassLabelDescriptions()` (`GET /admin/scheduling/class-label-descriptions` → `{ combos, tecnica }`) y `saveClassLabelDescription(mode, description)` (`PUT` con el mismo endpoint) agregados a `useSchedulingApi.ts`, con el mismo patrón `loading`/`error`/`try-finally` + `extractError` que el resto del archivo.
- `ActivitiesDialog.vue` suma una tarjeta separada "Descripciones de clases derivadas" con texto de ayuda explicando por qué existen (los días de Combos/Técnica reetiquetan la actividad genérica, así que el socio necesita leer la descripción de ESO), dos `q-input type="textarea"` (uno por modo) y un botón de guardado por cada uno, con loading independiente (`savingCombos`/`savingTecnica`).
- Carga los valores actuales al montar el componente y cada vez que el tab "Actividades" se vuelve a activar (mismo hook que `loadActivities`), así el admin siempre ve el estado fresco.
- Guardar un textarea vacío borra la descripción — comportamiento delegado a la API (plan 180-10, `setDerivedLabelDescription` hace `trim()` y borra la fila si queda vacío), no reimplementado en el cliente.
- Sin chips ni campos de nivel (D-18 dice que el mensaje de niveles es global, no por actividad) — verificado por grep negativo.

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 1: Métodos del composable** - `48be18a9` (feat)
2. **Task 2: Sección de edición en ActivitiesDialog.vue** - `c319c8c9` (feat)

**Plan metadata:** este SUMMARY se escribe en el checkout principal y NO se commitea (lo commitea el orquestador junto con STATE.md/ROADMAP.md).

## Files Created/Modified

- `el-templo-admin/src/composables/useSchedulingApi.ts` - `getClassLabelDescriptions()`, `saveClassLabelDescription(mode, description)`, exportados en el `return` del composable
- `el-templo-admin/src/components/scheduling/ActivitiesDialog.vue` - tarjeta "Descripciones de clases derivadas" (2 textarea + 2 botones), `labelDescriptionsForm`, `savingCombos`/`savingTecnica`, `loadLabelDescriptions()`, `onSaveLabelDescription(mode)`, enganchados en `onMounted`/`watch(() => props.active)`

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para quien retome: el archivo declarado en `files_modified` del plan (`useSchedulingAdminApi.ts`) no existe — el composable real de `/admin/scheduling/*` es `useSchedulingApi.ts` y es el que se extendió (sin crear un duplicado, verificado con grep).

## Deviations from Plan

**1. Nota — nombre real del composable difiere del declarado en `files_modified`**

- **Encontrado en:** Task 1, `read_first`.
- **Detalle:** el plan declaraba `el-templo-admin/src/composables/useSchedulingAdminApi.ts`; el archivo real (único que habla con `/admin/scheduling/*`, ya consumido por `HorariosPage.vue` y `ActivitiesDialog.vue`) es `useSchedulingApi.ts`.
- **Acción:** se extendió el archivo real, tal como indica explícitamente el `read_first` del Task 1 ("No crear un composable nuevo si ya existe uno... ajustar `files_modified` en el SUMMARY si el nombre difiere"). No es una desviación de Regla 1-4 — es una instrucción del propio plan.
- **Impacto:** ninguno en el comportamiento; el `key-files.modified` de este SUMMARY refleja el nombre real.

**Total deviations:** 0 (Rule 1-4). 1 nota documentada, prevista explícitamente por el plan.

## Issues Encountered

Ninguno.

## Verification

- Task 1: `grep -rc "class-label-descriptions" src/composables/` → `useSchedulingApi.ts:2` (GET + PUT, ≥2 ✓). `grep -c ": any" src/composables/useSchedulingApi.ts` → 0 ✓. `grep -rln "admin/scheduling" src/composables/ | wc -l` → 1 (sin duplicar) ✓.
- Task 2: `grep -c "Combos"` → 9 (≥1 ✓), `grep -c "Técnica"` → 7 (≥1 ✓), `grep -c "saveClassLabelDescription"` → 1 (≥1 ✓), `grep -ciE "principiante|intermedio|avanzado"` → 0 (==0 ✓), `grep -c "console\."` → 0 (==0 ✓).
- `pnpm dlx --package vue-tsc@3.2.5 --package typescript@5.9.3 vue-tsc --noEmit` corrido 3 veces (baseline, tras Task 1, tras Task 2): **20 errores en 14 archivos las 3 veces** — el baseline exacto documentado en el contexto de base. Ninguno de los 2 archivos tocados (`useSchedulingApi.ts`, `ActivitiesDialog.vue`) aparece en la lista de errores en ninguna corrida (confirmado con grep explícito sobre el log de la corrida final).
- `git status --short` vacío tras cada commit; solo 2 commits, ambos con `git add` por ruta explícita; ningún commit en el checkout principal (`/home/franco/projects/el-templo`) — todo el trabajo ocurrió en `/home/franco/projects/et-180`.

## User Setup Required

None — no se instaló ningún paquete, no hay variables de entorno nuevas, no hay migración nueva (el KV de `tenant_settings` ya existe desde el plan 180-10).

## Next Phase Readiness

- El ciclo completo queda cerrado: el admin escribe/guarda el copy de Combos/Técnica (este plan) → `getWeeklyGrid` lo resuelve coherente con la etiqueta mostrada (180-10) → el bottom sheet de la app lo consume (180-13).
- Verificación funcional real (abrir el diálogo, escribir un texto, guardar, recargar la página y confirmar que persiste, y que un texto vacío lo borra) queda para el checkpoint humano del plan 180-16, tal como indica `<verification>` de este plan.
- Sin bloqueos para los planes siguientes de la fase 180.

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Completed: 2026-08-24_

## Self-Check: PASSED

- FOUND: el-templo-admin/src/composables/useSchedulingApi.ts (worktree et-180)
- FOUND: el-templo-admin/src/components/scheduling/ActivitiesDialog.vue (worktree et-180)
- FOUND: commit 48be18a9 (feat, Task 1)
- FOUND: commit c319c8c9 (feat, Task 2)
- FOUND: este SUMMARY.md en el checkout principal

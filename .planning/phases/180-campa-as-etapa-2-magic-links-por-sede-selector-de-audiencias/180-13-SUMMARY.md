---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 13
subsystem: member-app-scheduling
tags: [bottom-sheet, activity-description, member-app, vue, quasar, reservas]

# Dependency graph
requires:
  - phase: 180-10
    provides: "activityDescription en el payload de getWeeklyGrid, coherente con la etiqueta MOSTRADA (D-23)"
  - phase: 180-07
    provides: "card '¿Primera vez?' y confirmación enriquecida en ReservasPage.vue (mismo archivo, sin conflicto de líneas)"
provides:
  - 'ActivityInfoSheet.vue — primer bottom sheet del repo (q-dialog position="bottom")'
  - "WeeklySlotView.activityDescription en el-templo-app/src/types/scheduling.ts (espejo del tipo de la API)"
  - "Tap en el nombre de la actividad de un slot abre la hoja con título+descripción coherentes"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Bottom sheet propio (q-dialog position="bottom") reestilado de PlanExpiryDialog/BranchPickerDialog — NO $q.bottomSheet() de Quasar, sin precedente en el repo y sin soporte de styling de marca'
    - "Affordance condicional por :class (no v-if de markup duplicado): el modificador --tappable solo se aplica cuando slot.activityDescription es verdadero"

key-files:
  created:
    - el-templo-app/src/components/ActivityInfoSheet.vue
  modified:
    - el-templo-app/src/types/scheduling.ts
    - el-templo-app/src/pages/ReservasPage.vue

key-decisions:
  - "El handler onActivityNameTap se bindea SIEMPRE en los 4 puntos de render, pero hace early-return sin efecto si slot.activityDescription es null/vacío — funcionalmente equivalente a 'sin handler' (el tap cae al onClick del slot padre sin stopPropagation), evita duplicar 2x el markup de cada uno de los 4 spans para separar 'con descripción' vs 'sin descripción'"
  - "Título y descripción de la hoja viajan TAL CUAL los emite el slot (activityName/activityDescription) — cero lógica de resolución en el cliente, cero uso de activityId, preservando la garantía de coherencia server-side de 180-10 (T-180-61)"

requirements-completed: [RES-05]

# Metrics
duration: ~35min
completed: 2026-08-24
---

# Phase 180 Plan 13: Bottom sheet de detalle de actividad (D-18) Summary

**Primer bottom sheet del repo (`ActivityInfoSheet.vue`, reestilado de `PlanExpiryDialog`) que se abre al tocar el nombre de una clase en la grilla de Reservas, mostrando el título visible del slot junto con la descripción que 180-10 ya garantiza coherente, más el mensaje global de que todas las clases son aptas para todos los niveles.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-24
- **Tasks:** 2/2
- **Files modified:** 3 (1 creado, 2 modificados)

## Accomplishments

- `ActivityInfoSheet.vue` (nuevo): bottom sheet con card charcoal/terracotta/cream (mismos tokens que `PlanExpiryDialog`/`BranchPickerDialog`), handle visual arriba, descripción renderizada por interpolación de Vue (sin directivas de HTML crudo — T-180-59) y pie fijo con el mensaje global de niveles, sin chips por actividad.
- `WeeklySlotView` (app) suma `activityDescription: string | null`, espejo exacto del tipo de la API post 180-10.
- El nombre de la actividad en los 4 puntos de render de la grilla (trial mañana/tarde, regular mañana/tarde) es tappeable SOLO cuando `slot.activityDescription` tiene contenido — affordance visual (subrayado punteado) condicional por `:class`, sin markup duplicado.
- El tap abre la hoja con `title: slot.activityName` y `description: slot.activityDescription` tal cual los emite el server — cero resolución de descripción por `activityId` en el cliente, preservando la garantía de coherencia etiqueta↔descripción de 180-10.
- El tap detiene la propagación (`event.stopPropagation()`) para no disparar la acción de reservar/abrir el slot del contenedor padre.
- Funciona en ambos modos (prueba y regular): la información de la clase no está gateada por elegibilidad.

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 1: Tipo `activityDescription` + componente `ActivityInfoSheet.vue`** - `81d2f6fc` (feat)
2. **Task 2: Tap en el nombre de la actividad del slot abre la hoja** - `6e10de36` (feat)

## Files Created/Modified

- `el-templo-app/src/components/ActivityInfoSheet.vue` (nuevo) — Props `modelValue`/`title`/`description`, emit `update:modelValue`. `q-dialog position="bottom"`.
- `el-templo-app/src/types/scheduling.ts` — `WeeklySlotView.activityDescription: string | null`.
- `el-templo-app/src/pages/ReservasPage.vue` — import + montaje único de `ActivityInfoSheet`, estado `activitySheet`, `onActivityNameTap()`/`onActivitySheetUpdate()`, affordance `--tappable` en los 4 spans `slot-card__activity` (2 en el modo prueba, 2 en el modo regular) + estilo `.slot-card__activity--tappable` (subrayado punteado, cursor pointer).

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen: se prefirió un único handler con early-return (en vez de renderizar dos variantes de markup por slot, una con y otra sin `@click`) para minimizar el diff en los 4 puntos de render — el comportamiento observable es idéntico a "sin handler" cuando no hay descripción (el tap cae al `onClick` del slot padre sin interceptarlo).

## Deviations from Plan

### Auto-fixed Issues

**1. [Ajuste de redacción — no Rule 1-4] Comentarios con literales que rompían los acceptance criteria del propio plan**

- **Found during:** Task 1 y Task 2, al correr los greps de `acceptance_criteria`.
- **Issue:** Dos comentarios explicativos del código citaban literalmente las palabras que los criterios de aceptación miden por conteo: `grep -c "v-html"` (Task 1, esperado 0) y `grep -c "activityId"` (Task 2, esperado sin aumento respecto del baseline 0). El comentario "sin v-html: el copy..." y "nunca se busca... por activityId..." hacían match consigo mismos, inflando el conteo aunque el código no usara ninguna de las dos cosas.
- **Fix:** Reescritos ambos comentarios para preservar la intención documental sin usar las cadenas literales ("sin directivas de HTML crudo" / "por el id de la actividad").
- **Files modified:** `el-templo-app/src/components/ActivityInfoSheet.vue`, `el-templo-app/src/pages/ReservasPage.vue` (mismos commits de cada task, no hubo commits adicionales).
- **Verification:** `grep -c "v-html" ActivityInfoSheet.vue` == 0; `grep -c "activityId" ReservasPage.vue` == 0 (baseline).

**Total deviations:** 0 (Rule 1-4). 1 ajuste de redacción documentado (no es un cambio de comportamiento).
**Impact on plan:** Ninguno — el código nunca tuvo `v-html` ni resolución por `activityId`; solo los comentarios necesitaron reformularse para no auto-matchear los greps mecánicos del propio plan.

## Issues Encountered

- `pnpm exec vue-tsc --noEmit` (invocación directa) falla con "Command not found" en este worktree — se usó la invocación indicada en `<execution_context>`: `pnpm dlx --package vue-tsc@2.2.10 --package typescript@5.9.3 vue-tsc --noEmit -p .quasar/tsconfig.json`. 17 errores antes y después de los cambios (baseline documentado, sin errores nuevos).
- `pnpm test` corre la suite completa de `el-templo-app` (13 archivos, 125 tests). 2 fallos preexistentes en `test/level-display.test.ts` (documentados como "ignorar" en el contexto de ejecución), sin relación con este plan. 123/125 verdes antes y después.

## User Setup Required

None - sin configuración de servicios externos. El copy de Combos/Técnica lo carga el admin vía las rutas de 180-10; hasta que eso ocurra, `activityDescription` es `null` para todos los slots y el affordance de tap simplemente no aparece (comportamiento esperado, no un bug).

## Next Phase Readiness

- `ActivityInfoSheet.vue` queda disponible para cualquier otro flujo que necesite un bottom sheet con el mismo styling de marca — primer precedente del patrón en el repo.
- La verificación visual (abrir la hoja, ver el texto correcto, confirmar que el pie de niveles aparece y que slots sin copy no muestran affordance) queda para el checkpoint de cierre de fase (plan 180-16), como en el resto de los planes visuales de esta fase.
- Sin bloqueos para los planes siguientes de la fase 180 (14, 15, 16).

## Self-Check: PASSED

- FOUND: el-templo-app/src/components/ActivityInfoSheet.vue (worktree et-180)
- FOUND: el-templo-app/src/types/scheduling.ts (worktree et-180, modificado)
- FOUND: el-templo-app/src/pages/ReservasPage.vue (worktree et-180, modificado)
- FOUND: commit 81d2f6fc (feat, Task 1)
- FOUND: commit 6e10de36 (feat, Task 2)

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Plan: 13_
_Completed: 2026-08-24_

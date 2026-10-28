---
phase: 177-paquete-de-clases-alta-de-corto-plazo-a-medida-por-formula
plan: 04
subsystem: ui
tags: [quasar, vue3, assign-plan-dialog, subscription-plans, plan-category]

# Dependency graph
requires:
  - phase: 177-01
    provides: "enum plan_category acepta 'paquete', 36 filas subscription_plans (18 AR/ARS + 18 ES/EUR) con durationDays=semanas*7 y classesPerWeek=frecuencia"
  - phase: 177-03
    provides: "patrón selector-resuelve-planId (2 refs + computed find() sobre el catálogo ya cargado) validado en CobrosPage"
provides:
  - "Modo 'Paquete de clases' en AssignPlanDialog.vue (alta admin) con 2 selectores (semanas 1-3, clases/semana 1-6) que resuelven el planId real"
  - "Modo paquete disponible también en mode='change' (cambio/renovación admin) — D-11"
  - "Las 18 filas paquete (por país) quedan excluidas globalmente de filteredPlans/plansByTier y de todos los filtros de categoría del diálogo"
  - "isOnlinePlan/showScheduleStep tratan paquete como presencial-flexible (no online, no exige turnos fijos)"
affects: [177-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Selector-resuelve-planId + selectPlan(): el watcher no setea selectedPlan directamente, invoca el mismo selectPlan(plan) que un click en la grilla — reutiliza el reset de assignForm, la carga del change-preview (mode='change') y el avance de step sin código nuevo en esas rutas"
    - "Exclusión global temprana en filteredPlans: un solo filter al inicio del computed (antes de cualquier rama de categoryFilter) es más robusto que parchear cada rama por separado — cualquier filtro futuro hereda la exclusión gratis"

key-files:
  created: []
  modified:
    - el-templo-admin/src/components/AssignPlanDialog.vue

key-decisions:
  - "Toggle 'Paquete de clases' visible sólo cuando (categoryFilter es undefined o 'presencial') Y !memberBranchIsVirtual Y plans.value tiene al menos una fila paquete — evita ofrecer el modo en los diálogos online/especial o a sedes virtuales, y evita mostrarlo si por algún motivo la sede no tuviera filas paquete cargadas"
  - "resolvedPaquetePlan busca en plans.value (crudo), NO en filteredPlans — filteredPlans ahora excluye paquete siempre (Task 1), así que la única fuente correcta es el catálogo sin filtrar; getPlans ya lo acota al país de la sede"
  - "watch([resolvedPaquetePlan, paqueteMode], ..., {immediate:true}) en vez de handlers @update:model-value por selector — mismo patrón ya probado en 177-03/CobrosPage; dispara selectPlan() (con todos sus efectos) cada vez que la combinación resuelta cambia mientras el modo está activo"
  - "isOnlinePlan se corrige para excluir explícitamente 'paquete' (antes: cualquier categoría !== 'presencial' se trataba como online, lo que hubiera ocultado el schedule step y el branch picker para paquete) — paquete queda tratado igual que un flex presencial de siempre"

patterns-established: []

requirements-completed: [D-01, D-11, D-12, D-15]

# Metrics
duration: ~25min
completed: 2026-08-14
---

# Phase 177 Plan 04: Modo Paquete de clases en AssignPlanDialog (alta admin) Summary

**AssignPlanDialog.vue suma un modo "Paquete de clases" con 2 selectores (semanas, clases/semana) que resuelven el planId real de la matriz de 36 filas — disponible tanto en alta (mode='assign') como en cambio/renovación (mode='change'), con las 18 filas paquete excluidas de la grilla por tier y de todos los filtros de categoría.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-14T22:15:00Z (aprox.)
- **Completed:** 2026-08-14T22:42:54Z
- **Tasks:** 2/2 completados
- **Files modified:** 1

## Accomplishments

- `filteredPlans` excluye `planCategory === 'paquete'` de forma global al inicio del computed — la exclusión cubre automáticamente la grilla por tier (`plansByTier`) y **todos** los filtros de categoría (sin categoryFilter, `'presencial'`, `'especial'`, `'online'`), no sólo el filtro `'online'` que el plan señalaba como bug puntual.
- `isOnlinePlan` corregido para tratar `paquete` como presencial-flexible (`!== 'presencial' && !== 'paquete'`), evitando que se ocultara el schedule step / branch picker que sí le corresponden a un plan paquete.
- `showScheduleStep`/`isFixedMode` documentados con comentario Fase 177: paquete cae en la rama `bookingMode === 'flexible'` igual que un flex presencial existente — no exige turnos fijos, se reserva semana a semana.
- Toggle "Paquete de clases" en Step 1 del diálogo, visible sólo para catálogo presencial (sin `categoryFilter` u `'presencial'`), sedes físicas, y con al menos una fila paquete cargada para la sede.
- 2 `q-select` (semanas 1-3, clases/semana 1-6) + tarjeta con precio en vivo y detalle `N sem · M/sem · X clases en total`, mismo idioma visual que el tab de CobrosPage (177-03).
- `resolvedPaquetePlan` (computed) busca en `plans.value` crudo (nunca en `filteredPlans`, que ahora excluye paquete) la fila `planCategory==='paquete'` con `durationDays===semanas*7` y `classesPerWeek===frecuencia`.
- `watch([resolvedPaquetePlan, paqueteMode], ..., {immediate:true})` dispara `selectPlan(plan)` — el mismo camino que clickear una fila de la grilla normal — cada vez que la combinación resuelta cambia mientras el modo está activo. Esto reutiliza gratis: reset de `assignForm`, precarga del `changePlanPreview` en `mode='change'` (D-11), preselección de turnos actuales, y avance automático al step de precio.
- Si no hay fila para la combinación (no debería pasar con las 18 pre-generadas por país), `selectedPlan` se limpia a `null` — el guard existente que exige `selectedPlan` para avanzar de paso deshabilita el submit sin lógica de validación nueva; el aviso "No hay un paquete configurado para esa combinación en esta sede" se muestra en el template.
- Reset de `paqueteMode`/`paqueteSemanas`/`paqueteFrecuencia` a sus defaults cada vez que el diálogo se reabre (mismo `watch(() => props.modelValue, ...)` que resetea el resto del estado).
- El precio nunca se calcula en el front: sale de `resolvedPaquetePlan.priceRegular`, leído de la fila generada por la migración 0205 (177-01).

## Task Commits

Each task was committed atomically:

1. **Task 1: Excluir paquete del tier grouping y del filtro online** - `fdc6fab1` (feat)
2. **Task 2: Modo paquete con 2 selectores en alta y renovación (D-11)** - `3590dd96` (feat)

## Files Created/Modified

- `el-templo-admin/src/components/AssignPlanDialog.vue` - exclusión global de `paquete` en `filteredPlans`; `isOnlinePlan` corregido; toggle + selectores + tarjeta de precio en el template del Step 1; `paqueteMode`/`paqueteSemanas`/`paqueteFrecuencia`/`showPaqueteToggle`/`resolvedPaquetePlan`/`paqueteTotalClases` (nuevo estado/computed) y watcher que dispara `selectPlan()`.

## Decisions Made

Ver `key-decisions` en el frontmatter.

## Deviations from Plan

**1. [Alcance ampliado, no un bug — Rule 2] Exclusión global de paquete en vez de sólo el filtro 'online'**

El plan pedía puntualmente arreglar el filtro `'online'` (~línea 1317) y, por separado, asegurar que la grilla sin `categoryFilter` tampoco leakee paquete. Se implementó como un único filtro `list = list.filter((p) => p.planCategory !== 'paquete')` al inicio de `filteredPlans`, antes de cualquier rama de `categoryFilter` — cubre las 4 ramas (sin filtro, presencial, especial, online) con una sola línea en vez de parchear cada una. Comportamiento equivalente al pedido, más robusto ante filtros futuros. No requiere aprobación (Rule 1/2 — más correcto, mismo alcance funcional).

Sin otras desviaciones — ambos tasks se implementaron según las `<action>`/`<interfaces>` del plan.

## Issues Encountered

None — los 2 tasks se ejecutaron sin bloqueos. `vue-tsc --noEmit` se verificó en verde (mismo baseline de 19 errores pre-existentes, ninguno en `AssignPlanDialog.vue`) antes y después de cada task. `eslint`/`prettier` limpios tras cada commit (pre-commit hook).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- El modo paquete queda funcional en `AssignPlanDialog.vue`, usado por los 5 puntos de entrada del admin (alta presencial, cambio/renovación presencial en `MemberSubscriptionTab.vue`, y los flujos post-alta/post-conversión en `AlumnosPage.vue`/`AlumnoDetailPage.vue`). Los diálogos `online`/`especial` (categoryFilter) NO ofrecen el modo paquete — correcto, paquete es presencial-only.
- **Nota de alcance (no bloqueante):** la "Renewal Dialog" dedicada de `MemberSubscriptionTab.vue` (renovación rápida al mismo plan, sin selector) NO fue tocada — está fuera de `files_modified` de este plan (sólo `AssignPlanDialog.vue`). D-11 se satisface vía `AssignPlanDialog` en `mode='change'`, que ya permite elegir cualquier plan (incluido el modo paquete) al renovar/cambiar. Si Franco quiere que la Renewal Dialog rápida también ofrezca reabrir el selector paquete para una sub paquete vigente, es un plan aparte.
- Verificación visual (alta + renovación con modo paquete) queda para el UAT de Franco, según el plan (`--skip-ui`, sin contrato visual formal).
- 177-05 (siguiente plan, no incluido en este contexto) puede construir sobre el mismo patrón `resolvedPaquetePlan`/`watch` usado en 177-03 y 177-04 si necesita un tercer punto de entrada.

---

_Phase: 177-paquete-de-clases-alta-de-corto-plazo-a-medida-por-formula_
_Completed: 2026-08-14_

## Self-Check: PASSED

Modified file verified present on disk; both task commits (`fdc6fab1`, `3590dd96`) verified present in `git log --oneline --all`.

---
phase: 177-paquete-de-clases-alta-de-corto-plazo-a-medida-por-formula
plan: 03
subsystem: ui
tags: [quasar, vue3, cobros-pos, subscription-plans, plan-category]

# Dependency graph
requires:
  - phase: 177-01
    provides: "enum plan_category acepta 'paquete', 36 filas subscription_plans (18 AR/ARS + 18 ES/EUR) con durationDays=semanas*7 y classesPerWeek=frecuencia, categoryGroup('paquete')==='presencial'"
provides:
  - "Tab 'Paquete de clases' en CobrosPage.vue (PoS del profe) con 2 selectores (semanas 1-3, clases/semana 1-6)"
  - "resolvedPaquetePlan: computed que resuelve el planId real desde plans.value por planCategory+durationDays+classesPerWeek"
  - "Las 18 filas paquete (por sede) quedan excluidas de los tabs presencial/online/especial (D-01)"
affects: [177-04, 177-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Selector-resuelve-planId: 2 refs (semanas, frecuencia) + computed find() sobre el catálogo ya cargado, en vez de un motor de precio en el front — el precio SIEMPRE se lee de priceRegular del plan resuelto"
    - "Grupo de tab dedicado sin grilla: planGroupOf mapea una categoría a un grupo propio para que el template renderice un widget distinto en vez de la grilla genérica de tier×plan"

key-files:
  created: []
  modified:
    - el-templo-admin/src/pages/CobrosPage.vue

key-decisions:
  - "resolvedPaquetePlan NO filtra por country/currency explícitamente — getPlans(true, {branchId}) ya acota plans.value al país de la sede, así que el find() por planCategory+durationDays+classesPerWeek es unívoco entre las 18 filas del país activo"
  - "Combinación sin fila (no debería pasar con las 18 pre-generadas): selectedPlan se limpia a null en vez de dejar el plan anterior stale — reutiliza el guard existente (línea ~1148/1182 exige selectedPlan) para deshabilitar el paso siguiente, sin lógica de validación nueva"
  - "Toggle Precio Zero oculto en el tab paquete (D-14: priceZero===priceRegular para paquete, no hay Precio Zero real que mostrar)"

patterns-established: []

requirements-completed: [D-01, D-12, D-15]

# Metrics
duration: ~10min
completed: 2026-08-14
---

# Phase 177 Plan 03: Tab Paquete de clases en CobrosPage (PoS del profe) Summary

**Tab "Paquete de clases" en la PoS con 2 selectores (semanas, clases/semana) que resuelven en vivo el planId real de la matriz de 36 filas y ocultan esas 18 filas por sede de los tabs presencial/online/especial.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-14T19:25:00-03:00
- **Completed:** 2026-08-14T19:27:56-03:00
- **Tasks:** 2/2 completados
- **Files modified:** 1

## Accomplishments

- `PlanGroupFilter` extendido con `'paquete'`; `planGroupOf(p)` resuelve `'paquete'` desde `p.planCategory === 'paquete'` ANTES del fallback `'online'`, así que las 36 filas de la matriz (177-01) nunca caen en los tabs presencial/online/especial (D-01 cumplido).
- `planGroupTabs` incluye `'paquete'` en el orden fijo — el tab solo aparece cuando la sede activa tiene filas paquete cargadas (mismo patrón que los demás grupos).
- Tab paquete reemplaza la grilla cruda de `plansByTier` por 2 `q-select` (semanas 1-3, clases/semana 1-6) + una tarjeta con el precio en vivo y el detalle `N sem · M/sem · X clases en total`.
- `resolvedPaquetePlan` (computed) busca en `plans.value` la fila `planCategory==='paquete'` con `durationDays===semanas*7` y `classesPerWeek===frecuencia`; el país queda acotado porque `getPlans` ya filtra por `branchId`.
- Un `watch([resolvedPaquetePlan, planGroupFilter])` empuja `selectPlan(resolvedPaquetePlan)` cada vez que cambia cualquier selector (o se entra al tab) — mismo camino que un click en la grilla normal, así que `altaPrice`/`scheduleIds`/el submit con `planId` funcionan sin tocarlos. El precio nunca se calcula en el front; se lee `resolvedPaquetePlan.priceRegular`.
- Si no hay fila para la combinación, `selectedPlan` se limpia a `null` y aparece un aviso — el guard existente que exige `selectedPlan` para avanzar de paso deshabilita el submit sin código de validación nuevo.
- `bookingMode='flexible'` de paquete hace que el template (condición preexistente) no muestre `FixedSchedulePicker` — no se eligen turnos.
- Toggle "Precio Zero" oculto en el tab paquete (D-14).

## Task Commits

Each task was committed atomically:

1. **Task 1: Grupo 'paquete' + exclusión de las otras tabs** - `506d3605` (feat)
2. **Task 2: Selectores de paquete + resolución de planId + display de precio** - `0e1cf42d` (feat)

## Files Created/Modified

- `el-templo-admin/src/pages/CobrosPage.vue` - grupo `'paquete'` en `PlanGroupFilter`/`planGroupOf`/`PLAN_GROUP_LABELS`/`planGroupTabs`; bloque de template con 2 selectores + tarjeta de precio para el tab paquete; `resolvedPaquetePlan`/`paqueteTotalClases` (computed) y watcher que resuelve `selectedPlan` desde los selectores.

## Decisions Made

- Ver `key-decisions` en el frontmatter.

## Deviations from Plan

None - plan ejecutado exactamente como estaba escrito. Ambos tasks se implementaron según las `<action>` e `<interfaces>` del plan sin necesidad de tocar backend, `assignPlan` ni el gap de solapamiento documentado en 177-01 (fuera de alcance de este plan, es UI de PoS que solo resuelve un `planId` y lo somete al camino de alta existente).

## Issues Encountered

None - los 2 tasks se ejecutaron sin bloqueos.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- El tab paquete queda funcional en la PoS del profe (`/coach-load` y flujo general de `CobrosPage`). Verificación visual queda para el UAT de Franco (Franco eligió `--skip-ui`; sin contrato visual formal, según indica el plan).
- `admin vue-tsc --noEmit`: mismo baseline de 19 errores pre-existentes (ninguno en `CobrosPage.vue`), verificado antes y después de cada task.
- **Gap heredado de 177-01 (NO corregido, fuera de alcance de este plan):** `assignPlan`'s `sameGroupCategoryCondition` sigue usando `eq(planCategory,'presencial')` literal en vez de `categoryGroup(...)`. Ahora que el tab paquete es una vía de alta REAL en la PoS, los 2 casos no bloqueados (presencial nuevo sobre paquete existente; dos paquetes simultáneos) dejaron de ser teóricos. Recomendado: decisión explícita de Franco antes de dar por cerrada la fase 177 (177-04/05 o un plan aparte).
- 177-04 (alta admin vía `AssignPlanDialog.vue`) y 177-05 (renovación con selector paquete + tests) pueden construir sobre el mismo patrón `resolvedPaquetePlan`/watcher usado acá.

---

_Phase: 177-paquete-de-clases-alta-de-corto-plazo-a-medida-por-formula_
_Completed: 2026-08-14_

## Self-Check: PASSED

All modified files verified present on disk; both task commits (`506d3605`, `0e1cf42d`) verified present in `git log --oneline --all`.

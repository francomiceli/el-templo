---
phase: 155-horarios
plan: 03
subsystem: admin
tags: [scheduling, activities, capacity, quasar, vue, dialogs]

# Dependency graph
requires:
  - phase: 155-02
    provides: "maxCapacity en el ABM de actividades del API (POST/PUT /activities, validación 1-500, response schema)"
provides:
  - "maxCapacity en ActivityRecord + createActivity/updateActivity del admin (mirror del API)"
  - "Campo Cupo en ActivitiesDialog (hint de herencia, carga al editar, vacío→null al guardar)"
  - "CreateSlotDialog: prop `initial` de prefill (consumido por 155-04) + creación de actividad inline con cupo reusando createActivity"
affects: [155-04, horarios, capacidad]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cupo como q-input type=number: v-model puede devolver string|number|'' → normalizeCapacity() a number|null (vacío = hereda sucursal)"
    - "Actividad inline: opción sentinel (-1) en el q-select despliega mini-form que reusa createActivity y setea form.activityId con el id devuelto"
    - "Prefill vía prop opcional consumido en resetForm (patrón del branchId=defaultBranchId ya existente), campos editables"

key-files:
  created: []
  modified:
    - el-templo-admin/src/types/scheduling.ts
    - el-templo-admin/src/composables/useSchedulingApi.ts
    - el-templo-admin/src/components/scheduling/ActivitiesDialog.vue
    - el-templo-admin/src/components/scheduling/CreateSlotDialog.vue

key-decisions:
  - "maxCapacity tipado `number | string | null` en el form porque el q-input type=number entrega string; normalización única en normalizeCapacity/validateCapacity antes de llamar al API"
  - "Actividad inline vía opción sentinel (-1) en el mismo q-select en vez de botón adyacente (key_link del plan pide la opción en el select); un watcher limpia el sentinel y abre el mini-form"
  - "Error 409 de nombre duplicado del alta inline se muestra en activityErrorMessage propio del mini-form (no toast, no pisa el errorMessage del alta de horario) — patrón inline de onSubmit"
  - "validateCapacity/normalizeCapacity duplicados en los 2 componentes (2 líneas c/u): se dejó local en vez de extraer util compartida (evitar abstracción prematura para 2 helpers triviales)"

patterns-established:
  - "Cupo por actividad en la UI del admin: input Cupo con hint 'vacío = hereda el cupo de la sucursal', validación client-side entero positivo/vacío, autoridad en el API (155-02)"
  - "Crear entidad relacionada al vuelo desde un dialog reusando su composable, sin backend nuevo"

requirements-completed: [HOR-02, HOR-03]

# Metrics
duration: 3min
completed: 2026-07-04
---

# Phase 155 Plan 03: Cupo por actividad en el ABM + prefill y actividad inline en CreateSlotDialog Summary

**El admin define el cupo de una actividad desde la UI (con herencia de la sucursal por defecto), y el dialog de crear horario queda listo para abrirse prefilleado desde la grilla (155-04) y crear una actividad al vuelo con su cupo sin salir del flujo.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-04T21:05:49Z
- **Completed:** 2026-07-04T21:08:52Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `ActivityRecord` (admin) espeja el API con `maxCapacity: number | null`; `createActivity`/`updateActivity` del composable aceptan `maxCapacity?: number | null`.
- `ActivitiesDialog` gana un input Cupo (`type=number`) con hint "vacío = hereda el cupo de la sucursal", validación entero positivo/vacío, carga del cupo al editar y normalización vacío→null al guardar.
- `CreateSlotDialog` acepta un prop opcional `initial` (branchId/día/hora) consumido en `resetForm` al abrir (fallback al comportamiento actual `branchId = defaultBranchId`), con los campos editables — listo para el click-para-crear de 155-04.
- `CreateSlotDialog` permite crear una actividad al vuelo: la opción "＋ Crear nueva actividad" del q-select despliega un mini-form (nombre + descripción opcional + cupo) que reusa `createActivity`, refresca la lista y deja el slot con la actividad nueva seleccionada; el error 409 de nombre duplicado se muestra inline en el mini-form.

## Task Commits

1. **Task 1: maxCapacity en types + composable + campo Cupo en ActivitiesDialog** - `d05c8322` (feat)
2. **Task 2: CreateSlotDialog — prop de prefill + actividad inline + campo cupo** - `b46dff8e` (feat)

## Files Created/Modified

- `el-templo-admin/src/types/scheduling.ts` - `maxCapacity: number | null` en `ActivityRecord`.
- `el-templo-admin/src/composables/useSchedulingApi.ts` - `maxCapacity?: number | null` en los data types de `createActivity` y `updateActivity`.
- `el-templo-admin/src/components/scheduling/ActivitiesDialog.vue` - Campo Cupo + `validateCapacity`/`normalizeCapacity`, carga en `startEditActivity`, envío en `onSaveActivity`, reset en `cancelEditActivity`.
- `el-templo-admin/src/components/scheduling/CreateSlotDialog.vue` - Prop `initial` + prefill en `resetForm`; opción sentinel + mini-form de actividad inline (`onCreateActivity`/`cancelNewActivity`) + watcher del sentinel; `validateCapacity`/`normalizeCapacity`.

## Decisions Made

- **`maxCapacity` como `number | string | null` en el form:** el `q-input type=number` de Quasar puede devolver string o cadena vacía; se centraliza la conversión en `normalizeCapacity` (vacío/inválido → null) y la validación en `validateCapacity` (entero positivo o vacío). La autoridad real es el JSON schema del API (155-02, 1-500).
- **Actividad inline vía opción sentinel `-1` en el q-select:** el `key_link` del plan pide "opción 'crear nueva actividad' en el q-select"; un watcher sobre `form.activityId` detecta el sentinel, lo limpia y abre el mini-form. Evita un botón adyacente extra.
- **Error 409 inline propio del mini-form:** `activityErrorMessage` separado de `errorMessage` (alta de horario) para no perder contexto ni pisar mensajes — patrón inline de `onSubmit`.
- **Duplicación aceptada de `validateCapacity`/`normalizeCapacity`:** 2 helpers triviales en 2 componentes; extraer una util compartida sería abstracción prematura.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - `pnpm lint` verde (0 errores; los 9 warnings son pre-existentes en archivos no tocados: BandejaPendientesTab, CobrosPage, session-pdf-builder, env.d.ts). El prettier de lint-staged reformateó las anotaciones de tipo de los dos refs `activityForm`/`newActivity` (cosmético, sin cambio de lógica).

## Known Stubs

None - toda la funcionalidad está cableada a `createActivity`/`updateActivity` reales. El prop `initial` de `CreateSlotDialog` es un contrato para 155-04 (aún no hay caller que lo pase); sin `initial` el dialog conserva el comportamiento actual.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 155-04 (grilla admin con N clases por celda + click-para-crear) puede abrir `CreateSlotDialog` pasando `:initial="{ branchId, dayOfWeek, startTime }"` desde la celda vacía clickeada; los campos quedan editables.
- El cupo por actividad ya viaja end-to-end: schema/migración (155-01), API + validación (155-02) y UI del admin (155-03). La grilla mostrará cupo efectivo por slot cuando 155-04 consuma `activityMaxCapacity`.

## Self-Check: PASSED

- Archivos presentes en disco: `types/scheduling.ts`, `composables/useSchedulingApi.ts`, `components/scheduling/ActivitiesDialog.vue`, `components/scheduling/CreateSlotDialog.vue`, SUMMARY.
- Commits `d05c8322` (feat) y `b46dff8e` (feat) verificados en git log.
- `pnpm lint` verde (0 errores) con ambos cambios.

---

_Phase: 155-horarios_
_Completed: 2026-07-04_

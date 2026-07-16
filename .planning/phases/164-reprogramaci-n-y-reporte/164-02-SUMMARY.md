---
phase: 164-reprogramaci-n-y-reporte
plan: 02
subsystem: ui
tags: [quasar, vue, scheduling, trials, admin, reschedule]

# Dependency graph
requires:
  - phase: 164-01
    provides: "POST /api/admin/scheduling/trials/:bookingId/reschedule transaccional (body {scheduleId,date,branchId}, resp {bookingId}, guard ALL_STAFF_ROLES + country-scope)"
provides:
  - "cliente rescheduleTrial(bookingId, {scheduleId,date,branchId}) en useSchedulingApi"
  - "RescheduleTrialDialog.vue: picker de fecha (q-date, sin pasado) + select de turnos del día elegido"
  - "acción 'Reprogramar' por fila en SesionesDePruebaDialog.vue (junto a 'quitar', ambos coexisten)"
affects: [164-03, trial-sessions-report, sp-automatizacion-v58]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Diálogo de reprogramación desacoplado: SesionesDePruebaDialog abre RescheduleTrialDialog vía v-model:show + props (trial/branchId) + evento @rescheduled → load()"
    - "Picker de slot por día-de-semana: getWeeklyGrid(branch, monday) trae plantillas recurrentes; se filtran por dayOfWeek de la fecha elegida (getUTCDay a mediodía UTC, 1=Lun..6=Sáb)"
    - "Feedback estándar $q.notify positivo/negativo con schedulingApi.error.value ?? fallback, espejando onBookTrial/removeTrial"

key-files:
  created:
    - el-templo-admin/src/components/scheduling/RescheduleTrialDialog.vue
  modified:
    - el-templo-admin/src/composables/useSchedulingApi.ts
    - el-templo-admin/src/components/scheduling/SesionesDePruebaDialog.vue

key-decisions:
  - "Cliente rescheduleTrial copia verbatim el envelope loading/error/try-finally de bookTrial, sólo cambia endpoint + payload (extractError con fallback ES)"
  - "El picker filtra plantillas recurrentes activas por dayOfWeek de la fecha elegida — el backend (164-01) revalida coherencia sede↔schedule y fecha, así que la UI no relaja nada"
  - "q-date restringe a fecha >= hoy (no reprogramar al pasado); reset de slot cuando cambia la fecha"
  - "reschedulingBookingId espejo de removingBookingId deshabilita el botón mientras su diálogo está abierto; watch de cierre lo libera"

patterns-established:
  - "Acción por fila que abre un diálogo hijo sembrado con la fila + sede del grupo (group.branchId), refrescando la lista al éxito"

requirements-completed: [REPRO-01]

# Metrics
duration: ~15min
completed: 2026-07-16
---

# Phase 164 Plan 02: UI admin de "Reprogramar" sesión de prueba Summary

**Gestión reprograma una sesión de prueba en un solo paso desde `SesionesDePruebaDialog.vue`: un botón "Reprogramar" por fila abre `RescheduleTrialDialog.vue` (picker de fecha + select de turnos del día) que POSTea al endpoint transaccional de 164-01 y refresca la lista, con el flujo "quitar" intacto.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- **Cliente `rescheduleTrial` (useSchedulingApi):** `rescheduleTrial(bookingId, {scheduleId, date, branchId}) → {bookingId}`, con el envelope loading/error/try-finally de `bookTrial`, `extractError(err, 'Error reprogramando sesión de prueba')` y `POST /admin/scheduling/trials/${bookingId}/reschedule`. Registrado en el `return {}`.
- **`RescheduleTrialDialog.vue` (nuevo):** diálogo Quasar que recibe `show`/`trial`/`branchId`, expone un `q-date` (restringido a hoy en adelante, normalizado `YYYY/MM/DD → YYYY-MM-DD`) + un `q-select` de turnos disponibles para la fecha elegida (poblado con `getWeeklyGrid` y filtrado por día de semana). Al confirmar llama `rescheduleTrial`, notifica `positive`, emite `@rescheduled` y cierra; en error `$q.notify` `negative` con `schedulingApi.error.value ?? fallback`. Logging vía `createLogger()`, sin colores fuera de la paleta.
- **Acción "Reprogramar" por fila (SesionesDePruebaDialog):** `q-btn` `event_repeat` color `primary` junto a "quitar", que abre el diálogo sembrado con `trial` + `group.branchId`. El evento `@rescheduled` dispara `load()` para refrescar (igual que `removeTrial`). El flujo "quitar" (`confirmRemoveTrial`/`removeTrial`) queda intacto — ambos coexisten (D-03).

## Task Commits

1. **Task 1: cliente rescheduleTrial + RescheduleTrialDialog.vue** — `829ad3a4` (feat)
2. **Task 2: acción Reprogramar por fila en SesionesDePruebaDialog** — `dd1106e6` (feat)

**Plan metadata:** commit aparte con SUMMARY.md + STATE.md + ROADMAP.md.

## Files Created/Modified

- `el-templo-admin/src/components/scheduling/RescheduleTrialDialog.vue` — NEW: picker fecha+slot + submit al endpoint de reschedule.
- `el-templo-admin/src/composables/useSchedulingApi.ts` — `rescheduleTrial` + registro en el `return`.
- `el-templo-admin/src/components/scheduling/SesionesDePruebaDialog.vue` — botón "Reprogramar" por fila + estado del diálogo + `onRescheduled → load()`.

## Decisions Made

- **Filtrado de slots por día de semana en la UI, revalidación en el backend.** `getWeeklyGrid` trae las plantillas recurrentes de la sede; al elegir fecha se filtran por `dayOfWeek` (getUTCDay a mediodía UTC = 1..6). La coherencia real sede↔schedule↔fecha la aplica 164-01 (409/404), así que la UI no relaja el guard — sólo ofrece opciones plausibles.
- **q-date sin pasado + reset de slot al cambiar fecha.** Evita reprogramaciones a fechas viejas y un `scheduleId` incoherente con la nueva fecha.
- **Diálogo desacoplado en vez de inline.** `RescheduleTrialDialog.vue` propio (rol-match con el sub-flujo de `SlotDetailDialog`), reutilizable y con estado aislado, en vez de inflar `SesionesDePruebaDialog`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Gate de typecheck sustituido: `vue-tsc` no instalado en el toolchain del admin**
- **Found during:** Task 1 (verificación)
- **Issue:** El plan y las reglas del repo especifican el gate `pnpm exec vue-tsc --noEmit`, pero `vue-tsc` NO está instalado en `el-templo-admin` (no figura en devDependencies; `pnpm exec vue-tsc` → "Command not found"). El checker del build (`vite-plugin-checker`, `quasar.config.js`) sólo tiene habilitado el checker de **eslint**, no el de vue-tsc. Instalar `vue-tsc` está prohibido sin permiso del usuario (regla dura: no instalar deps).
- **Fix:** Usé el gate realmente instalado del repo: `pnpm exec eslint -c ./eslint.config.js <archivos>` sobre los 3 archivos tocados. Salió limpio (0 errores) tras corregir 1 warning `no-unused-vars` (`err` sin usar en el catch de `loadSlots`, resuelto referenciándolo en el fallback como en `onSubmit`).
- **Files modified:** ninguno extra (sólo el fix del warning dentro de RescheduleTrialDialog.vue del Task 1).
- **Verification:** `eslint` exit 0 sobre useSchedulingApi.ts, RescheduleTrialDialog.vue y SesionesDePruebaDialog.vue.
- **Committed in:** parte de `829ad3a4` / `dd1106e6`.

---

**Total deviations:** 1 auto-fixed (1 blocking — gate no instalado, sustituido por el gate instalado del repo).
**Impact on plan:** Sin scope creep. El objetivo funcional del plan se cumple; sólo cambió la herramienta de verificación de tipos por la única disponible sin instalar dependencias.

## Issues Encountered

- **`vue-tsc` ausente del toolchain.** Ver deviation. El gate de tipos "full" del plan no es corrible en este worktree sin instalar deps; se dejó constancia para que el usuario decida si quiere agregar `vue-tsc` a devDependencies (fuera de scope de este plan).

## User Setup Required

None - sin configuración de servicios externos.

Verificación visual (UAT de milestone, D-03): abrir "Sesiones de Prueba" del día → "Reprogramar" en una fila → elegir fecha + turno → confirmar → notificación positiva + la fila se mueve al nuevo turno. El flujo "quitar" sigue funcionando.

## Next Phase Readiness

- 164-03 (reporte de reprogramaciones + indicador auto/manual + filtro, D-04/D-06) puede montarse sobre el backend/UI ya existente.
- Nota abierta (no bloqueante): si el equipo quiere el gate `vue-tsc` como en MEMORY, agregarlo a `el-templo-admin/devDependencies` — hoy sólo corre eslint.

## Self-Check: PASSED

Archivos presentes; commits `829ad3a4` + `dd1106e6` en git log; `grep rescheduleTrial useSchedulingApi.ts` muestra el cliente + registro; `grep event_repeat SesionesDePruebaDialog.vue` muestra el botón.

---
*Phase: 164-reprogramaci-n-y-reporte*
*Completed: 2026-07-16*

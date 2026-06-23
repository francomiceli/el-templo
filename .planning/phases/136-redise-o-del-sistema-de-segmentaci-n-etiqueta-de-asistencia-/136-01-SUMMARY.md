---
phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-
plan: 01
subsystem: database
tags: [segmentation, drizzle, mysql-enum, migration, attendance, fastify]

# Dependency graph
requires:
  - phase: 123-asistencia-funnel
    provides: "Cálculo de % de asistencia en ventana 28d (steps 8-11) que se reutiliza como base de las 4 bandas"
provides:
  - "MemberSegment union de 4 valores: optima | regular | alerta | ausente"
  - "Constantes de corte fijas en código (ATTENDANCE_OPTIMA/REGULAR/ALERTA_PCT, ATTENDANCE_WINDOW_DAYS)"
  - "calculateSegment(userId) -> MemberSegment | null por % de uso en 28d"
  - "Enum DB member_segment alterado a las 4 bandas + migración 0151 con reset a NULL"
affects:
  - "136-02..136-06 (analytics, notificaciones, members, app, frontend, Horarios — propagan el nuevo enum)"
  - "136-07 (elimina el subsistema de settings de thresholds que quedó muerto)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cortes de segmentación fijos en código (D-03) en vez de system_settings configurables"
    - "calculateSegment retorna NULL como resultado válido (sin etiqueta) para <1 mes y sin plan"

key-files:
  created:
    - el-templo-api/src/db/migrations/0151_attendance_label_enum.sql
  modified:
    - el-templo-api/src/modules/segmentation/types.ts
    - el-templo-api/src/modules/segmentation/service.ts
    - el-templo-api/src/db/schema/member-profiles.ts
    - el-templo-api/test/segmentation/segmentation.test.ts
  deleted:
    - el-templo-api/test/segmentation/golden-case.test.ts

key-decisions:
  - "SEGMENT_COLORS (D-69 discreción): optima→green, regular→amber, alerta→orange, ausente→red"
  - "MIN_TENURE_DAYS=30 como umbral de '1 mes' para el guard de antigüedad (D-07)"
  - "Reset a NULL con backticks `member_segment` (convención del proyecto, igual que 0064)"

patterns-established:
  - "Etiqueta de Asistencia = 100% % de uso de membresía sobre ventana móvil de 28 días"
  - "NULL es el contrato explícito cuando no aplica etiqueta (consumidores ya manejan sinSegmento)"

requirements-completed: [D-01, D-02, D-03, D-04, D-07, D-08, D-09]

# Metrics
duration: ~25min
completed: 2026-06-23
---

# Phase 136 Plan 01: Etiqueta de Asistencia (motor de segmentación) Summary

**Motor de segmentación reescrito a 4 bandas de Asistencia (optima/regular/alerta/ausente) por % de uso de membresía en 28d, con enum `member_segment` alterado en la DB y migración 0151 que resetea a NULL para recálculo en limpio.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-06-23T00:10:00Z
- **Tasks:** 3
- **Files modified:** 5 (4 modificados + 1 creado, 1 eliminado)

## Accomplishments

- `MemberSegment` colapsado de 6 valores conductuales a las 4 bandas de Asistencia (`optima`/`regular`/`alerta`/`ausente`), con cortes 75/50/1 fijos en código (D-01, D-03).
- `calculateSegment` reescrito: clasifica por `attendanceCount / (classesPerWeek × 28/7) × 100`; retorna `null` para <1 mes de antigüedad (D-07) y para miembros sin plan activo/sin `classesPerWeek` (D-08); `>100%` sigue siendo `optima` (D-04).
- Eliminado todo el andamiaje muerto: `getThresholds`, `isFrequencyGoldenCase`, `SEGMENT_SETTINGS_KEYS`, `SEGMENT_DEFAULTS`, `SegmentThresholds`, `FREQUENCY_ZERO_VISIT_WINDOW_DAYS`, y las ramas `nuevo`/`ghost`/`en_riesgo`-por-inactividad/`digital_warrior`/golden-case.
- Enum DB `member_segment` alterado a las 4 bandas; migración `0151_attendance_label_enum.sql` resetea todas las filas a NULL antes del ALTER (recálculo limpio, D-09) y borra los settings huérfanos de thresholds.
- Tests de segmentación reescritos a las 4 bandas (incluye casos <1 mes→NULL, sin plan→NULL, >100%→optima); `golden-case.test.ts` eliminado; grupo "Settings API" y el seed de thresholds removidos.

## Task Commits

1. **Task 1: Reescribir tipos a 4 bandas + cortes fijos** — `6d4a2928` (refactor)
2. **Task 3: Alterar enum + migración 0151 reset a NULL** — `42dab500` (feat)
3. **Task 2: Reescribir calculateSegment + tests** — `4d417f2d` (feat)

_Nota de orden: Task 3 (schema) se commiteó antes que Task 2 (service) porque el typecheck de `service.ts` (`calculateAndUpdate` persiste `MemberSegment | null`) depende del enum nuevo en la columna Drizzle. Ver Deviations._

**Plan metadata:** (commit final de docs pendiente, ver abajo)

## Files Created/Modified

- `el-templo-api/src/modules/segmentation/types.ts` — `MemberSegment` de 4 valores + constantes de corte fijas + `SEGMENT_LABELS/COLORS/VALUES`.
- `el-templo-api/src/modules/segmentation/service.ts` — `calculateSegment`/`calculateAndUpdate` reescritos a `MemberSegment | null`; `recordLogin` intacto.
- `el-templo-api/src/db/schema/member-profiles.ts` — `memberSegmentEnum` a `["optima","regular","alerta","ausente"]`.
- `el-templo-api/src/db/migrations/0151_attendance_label_enum.sql` — UPDATE→NULL + ALTER enum + DELETE settings huérfanos.
- `el-templo-api/test/segmentation/segmentation.test.ts` — suite reescrita a 4 bandas, sin Settings API ni seed de thresholds.
- `el-templo-api/test/segmentation/golden-case.test.ts` — **eliminado** (desaparece el golden case, D-01).

## Decisions Made

- **Colores (D-69, discreción):** optima→green, regular→amber, alerta→orange, ausente→red.
- **Umbral de antigüedad:** `MIN_TENURE_DAYS = 30` (interpretación de "1 mes" para el guard D-07). Coincide con el viejo `NUEVO_DAYS` default de 30.
- **Backticks en el reset:** la migración usa `` `member_segment` = NULL `` (convención del proyecto, igual que `0064`). El reset a NULL está presente y es correcto; difiere solo en backticks del literal del grep gate del plan.

## Deviations from Plan

### 1. [Rule 3 - Blocking] Orden de commits Task 3 antes de Task 2

- **Found during:** Task 2 (typecheck de `service.ts`)
- **Issue:** El plan lista el schema/migración como Task 3 (último), pero el typecheck de `calculateAndUpdate` en `service.ts` (Task 2) falla con `TS2322` porque la columna Drizzle `segment` aún tenía el enum viejo. El gate de Task 2 (`tsc` del módulo) no podía pasar sin el cambio de schema.
- **Fix:** Apliqué el cambio de `memberSegmentEnum` (parte de Task 3) antes de cerrar Task 2, y commiteé schema+migración (`42dab500`) antes que service+test (`4d417f2d`). El contenido de cada tarea no cambió; solo el orden de aplicación/commit.
- **Verification:** `pnpm tsc --noEmit` del módulo de segmentación limpio tras el cambio de schema.
- **Committed in:** `42dab500` (schema/migración), `4d417f2d` (service/test)

---

**Total deviations:** 1 (Rule 3 - reordenamiento por dependencia de tipos). Sin scope creep.

## Issues Encountered

**Breakage downstream esperada (NO corregida — fuera de file-ownership).** Como cambio FUNDACIONAL, alterar `MemberSegment` y borrar los símbolos de settings rompe el typecheck de los consumidores que las waves 2/3 reescriben. Errores actuales de `pnpm tsc --noEmit` (todos fuera del módulo de segmentación):

- `src/modules/settings/routes.ts`, `src/modules/settings/service.ts` — imports muertos de `SegmentThresholds`/`SEGMENT_SETTINGS_KEYS`/`SEGMENT_DEFAULTS` → los elimina **136-07**.
- `src/jobs/notification-cron.ts` — usa `getThresholds`, `calculateSegment(opts)` y literales `ghost`/`en_riesgo` → lo reconecta el plan de **notificaciones** (136-0x).
- `src/modules/analytics/engagement-service.ts`, `src/modules/analytics/service.ts` — `SEGMENT_KEYS`, comparaciones a `en_riesgo`/`ghost` → los propaga el plan de **analytics**.
- `src/modules/notifications/routes.ts` — `sendSegmentSchema` enum → plan de notificaciones.

El plan declara esta intención explícitamente ("deja MUERTO el subsistema de settings que 136-07 elimina"). El scope de verificación de este plan es **solo el módulo de segmentación**, que typechea limpio. No se tocaron archivos fuera de la lista de propiedad del plan.

## Verification

- **`pnpm tsc --noEmit` del módulo de segmentación (`segmentation/types.ts`, `segmentation/service.ts`, `schema/member-profiles.ts`, `segmentation.test.ts`): LIMPIO.**
- Schema Drizzle ↔ ALTER de la migración coinciden exactamente en `member_segment` con los 4 valores.
- Migración 0151: resetea a NULL antes del ALTER; sin `;` dentro de comentarios `--`.
- `golden-case.test.ts` eliminado; `segmentation.test.ts` sin grupo Settings API, sin seed de thresholds, sin literales de segmentos viejos.
- `getThresholds` eliminado de `service.ts`; `SEGMENT_SETTINGS_KEYS`/`SEGMENT_DEFAULTS`/`SegmentThresholds`/`FREQUENCY_ZERO_VISIT_WINDOW_DAYS` eliminados de `types.ts`.
- Tests NO ejecutados localmente (corren en CI al pushear, por convención del proyecto).

## Next Phase Readiness

- El contrato `MemberSegment` (4 valores) y el enum DB están listos para que las waves 2/3 propaguen.
- **Blocker conocido para CI:** el typecheck del proyecto completo NO pasa hasta que las waves 2/3 + 136-07 reescriban los consumidores downstream (settings, notification-cron, analytics, notifications/routes). Esperado por diseño foundational. No pushear a CI hasta completar la propagación.

## Self-Check: PASSED

- Todos los archivos creados/modificados existen en disco; `golden-case.test.ts` eliminado correctamente.
- Commits `6d4a2928`, `42dab500`, `4d417f2d` presentes en el historial.

---

_Phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-_
_Completed: 2026-06-23_

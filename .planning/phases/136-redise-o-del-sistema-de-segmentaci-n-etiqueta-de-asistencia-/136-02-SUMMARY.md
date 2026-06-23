---
phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-
plan: 02
subsystem: notifications
tags: [notifications, push, segmentation, cron, fastify, attendance]

# Dependency graph
requires:
  - phase: 136-01
    provides: "MemberSegment de 4 bandas (optima/regular/alerta/ausente), calculateSegment(userId)->MemberSegment|null, getThresholds() eliminado"
provides:
  - "SEGMENT_TRANSITION_TEMPLATES reconectado a las 4 bandas de Asistencia (template_key + copy intactos, D-10)"
  - "getTransitionTemplateKey reescrito a los 4 estados, maneja newSegment NULL (no dispara)"
  - "Batch 3AM sin golden-case ni getThresholds(); ghost_monthly_reattempt sobre ausente"
  - "sendSegmentSchema enum a optima/regular/alerta/ausente; MemberSegment importado de segmentation/types (DRY)"
affects:
  - "136-03..136-06 (analytics, members, app, frontend, Horarios siguen propagando el enum)"
  - "136-07 (elimina el subsistema de settings de thresholds que quedó muerto)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Disparadores de push reconectados al nuevo enum preservando template_key + copy (D-10)"
    - "calculateSegment NULL = no etiqueta => no se dispara transición"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/notifications/types.ts
    - el-templo-api/src/jobs/notification-cron.ts
    - el-templo-api/src/modules/notifications/routes.ts
    - el-templo-api/test/notifications.test.ts
  deleted: []

key-decisions:
  - "MemberSegment en routes.ts ahora se importa de ../segmentation/types (elimina la duplicación de 6 valores)"
  - "Se agregó un describe 'Segment Transition Mapping' (unit, sin DB) para cubrir T-136-06: mapeo + copy preservado, ya que el suite previo no tenía cobertura de las transiciones del cron"
  - "El bloque golden-case (FrequencyService + getThresholds + frequencyZeroVisitWindowDays) se eliminó por completo, incluido el import huérfano de FrequencyService"

requirements-completed: [D-10, D-11]

# Metrics
duration: ~15min
completed: 2026-06-23
---

# Phase 136 Plan 02: Reconexión de notificaciones push a las bandas de Asistencia Summary

**Los 5 disparadores de push (en_riesgo/ghost/recovery/espartano + ghost_monthly_reattempt) se reconectaron a las 4 bandas de Asistencia (alerta/ausente/optima/regular) PRESERVANDO copy y template_key (D-10); se eliminó el bloque golden-case con `getThresholds()` del batch 3AM, que sigue activo (D-11).**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-06-23
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `SEGMENT_TRANSITION_TEMPLATES` reconectado: claves nuevas `any_to_alerta`/`alerta_to_ausente`/`recovery_to_active`/`any_to_optima` apuntando a los mismos `template_key` (`segment_transition_en_riesgo`/`_ghost`/`_recovery`/`_espartano`). `TEMPLATE_SEEDS` intacto (copy/título/route/categoría/variantes female sin cambios).
- `getTransitionTemplateKey` reescrito a los 4 estados nuevos con tipos `MemberSegment | null`: (1) `alerta` && old !== alerta → en_riesgo; (2) `ausente` && old === alerta → ghost; (3) (alerta|ausente)→(optima|regular) → recovery; (4) `optima` && old !== optima → espartano. `newSegment === null` (miembro <1 mes o sin plan) corta antes y no dispara.
- Batch 3AM: eliminado el pre-fetch del golden-case (Set + `getThresholds()` + `FrequencyService.coolingOrInactiveUserIds`), la llamada `calculateSegment(profile.userId, { isFrequencyGoldenCase })` pasó a `calculateSegment(profile.userId)`, y el import huérfano de `FrequencyService` se removió.
- `ghost_monthly_reattempt` reapuntado: la condición `newSegment === "ghost" && old === "ghost"` ahora es `newSegment === "ausente" && oldSegment === "ausente"`, reusando `ghost_reattempt_count`/`last_ghost_reattempt_at` y el template sin cambios.
- Cron 3AM (`"0 3 * * *"`) y los demás jobs (queue processor, morning energy, weekly summary, program renewal) sin tocar (D-11).
- `sendSegmentSchema` enum → `["optima","regular","alerta","ausente"]`; el tipo `MemberSegment` local de 6 valores en `routes.ts` se reemplazó por un import de `../segmentation/types` (DRY). El handler `send-segment` no cambió su lógica.
- `notifications.test.ts`: literales `espartano`/`ghost` → `optima`/`ausente`; nuevo describe "Segment Transition Mapping" que asegura el mapeo de los 4 disparadores + el copy preservado (T-136-06).

## Task Commits

1. **Task 1: Reconectar SEGMENT_TRANSITION_TEMPLATES + getTransitionTemplateKey; eliminar golden-case/getThresholds** — `4b8e4158` (refactor)
2. **Task 2: sendSegmentSchema + MemberSegment DRY + tests** — `eb7a63e9` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/notifications/types.ts` — `SEGMENT_TRANSITION_TEMPLATES` reconectado; `TEMPLATE_SEEDS` sin cambios.
- `el-templo-api/src/jobs/notification-cron.ts` — `getTransitionTemplateKey` a 4 estados (+null); batch sin golden-case/getThresholds; ghost-reattempt sobre `ausente`; import de `FrequencyService` removido.
- `el-templo-api/src/modules/notifications/routes.ts` — `sendSegmentSchema` enum a 4 valores; `MemberSegment` importado de `segmentation/types`.
- `el-templo-api/test/notifications.test.ts` — literales de segmento actualizados + suite "Segment Transition Mapping".

## Decisions Made

- **DRY del tipo `MemberSegment`:** en vez de actualizar el tipo local de 6 valores en `routes.ts`, se importa de `../segmentation/types` (fuente única). El plan lo ofrecía como mejor opción ("o mejor, importarlo... para DRY").
- **Cobertura de transición:** el suite previo no testeaba `getTransitionTemplateKey` (no exportado, requeriría infra de cron + DB). Para cubrir T-136-06 sin scope creep se añadió un describe unit que valida `SEGMENT_TRANSITION_TEMPLATES` ↔ `TEMPLATE_SEEDS` (mapeo + copy preservado).

## Deviations from Plan

### 1. [Rule 3 - Blocking] Import huérfano de FrequencyService

- **Found during:** Task 1
- **Issue:** Al eliminar el bloque golden-case, el import `import { FrequencyService } from "../modules/analytics/frequency-service"` quedó sin uso. Dejarlo podría romper el typecheck (según config) y es código muerto.
- **Fix:** Removí la línea de import. El plan ya anticipaba esto ("quitar también... el import de FrequencyService si queda huérfano").
- **Verification:** grep confirma 0 referencias a `FrequencyService`/`getThresholds`/`isFrequencyGoldenCase`/`goldenCase` en el cron; typecheck file-scoped limpio.
- **Committed in:** `4b8e4158`

---

**Total deviations:** 1 (Rule 3, anticipada por el plan). Sin scope creep.

## Issues Encountered

- `NOTIFICATION_CATEGORIES` queda importado pero sin uso en `routes.ts` — **preexistente**, fuera del scope de este plan (no introducido por estos cambios) y no produce error de typecheck (el proyecto no usa `noUnusedLocals` estricto). No se tocó.
- Como en el plan 01, el typecheck del proyecto completo sigue rojo por los consumidores que las waves 3+ y 136-07 aún no reescriben (analytics, members, settings). Esperado por diseño. **Mis 4 archivos no aparecen en ningún error de `pnpm tsc --noEmit`.**

## Verification

- **`pnpm tsc --noEmit` file-scoped: ninguno de los 4 archivos del plan (`notifications/types`, `notification-cron`, `notifications/routes`, `notifications.test`) aparece en los errores. LIMPIO.**
- `SEGMENT_TRANSITION_TEMPLATES` mantiene los 4 `template_key` originales; `TEMPLATE_SEEDS` con los 9 fragmentos de copy intactos.
- Sin referencias a `en_riesgo`/`ghost`/`espartano`/`intermitente` como ESTADOS en el cron; sin `isFrequencyGoldenCase`; sin `getThresholds`.
- Cron de las 3AM (`"0 3 * * *"`) presente e intacto.
- Sin literales de segmento viejo en `routes.ts` ni en el test.
- Tests NO ejecutados localmente (corren en CI al pushear, convención del proyecto).

## Next Phase Readiness

- Notis reconectadas y typecheck-clean en su módulo. Listo para que las waves restantes propaguen el enum.
- **Blocker conocido para CI:** el typecheck del proyecto completo NO pasa hasta que el resto de consumidores (analytics, members) y 136-07 (settings) se reescriban. No pushear hasta completar la propagación.

## Self-Check: PASSED

- Los 4 archivos modificados existen en disco.
- Commits `4b8e4158` y `eb7a63e9` presentes en el historial de `staging`.

---

_Phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-_
_Completed: 2026-06-23_

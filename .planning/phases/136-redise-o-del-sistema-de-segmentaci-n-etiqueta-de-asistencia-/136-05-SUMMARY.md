---
phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-
plan: 05
subsystem: admin-frontend
tags: [admin, segmentation, attendance-label, vue, quasar, typescript]

# Dependency graph
requires:
  - phase: 136-01
    provides: "MemberSegment union de 4 valores (optima|regular|alerta|ausente)"
  - phase: 136-03
    provides: "SegmentCounts/EngagementMember backend shape + priorityRank ausente(0)/alerta(1)"
provides:
  - "MemberSegment + SEGMENT_LABELS/COLORS/DESCRIPTIONS (4 bandas) en admin types/member.ts, SIN SegmentThresholds"
  - "SegmentCounts (4 bandas + sinSegmento) + EngagementMember.segment (alerta|ausente) en types/analytics.ts"
  - "AlumnosPage filtro+columna a Asistencia (4 bandas)"
  - "AlumnoDetailPage card Asistencia"
  - "NotificacionesPage targeting a 4 bandas"
  - "MiembrosTab SEGMENT_PRIORITY remapeado a { ausente: 0, alerta: 1 }"
affects:
  - "136-07 (wave 3, depends_on 05) — borra los consumidores de SegmentThresholds (useSettingsApi + ConfiguracionPage), que quedan rojos a propósito tras este plan"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El admin tipifica MemberSegment e indexa SEGMENT_LABELS/COLORS por el enum; cambiar el record propaga labels/colors sin tocar las vistas"
    - "SEGMENT_PRIORITY con literales fuera del union = regresión silenciosa de orden en la worklist; remap obligatorio al cambiar el enum"

key-files:
  created:
    - .planning/phases/136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-/136-05-SUMMARY.md
    - .planning/phases/136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-/deferred-items.md
  modified:
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/types/analytics.ts
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
    - el-templo-admin/src/pages/NotificacionesPage.vue
    - el-templo-admin/src/components/analytics/MiembrosTab.vue
  deleted: []

key-decisions:
  - "SegmentThresholds borrado INCONDICIONALMENTE de types/member.ts; sus 2 consumidores (useSettingsApi.ts + ConfiguracionPage.vue) quedan rojos a propósito — 136-07 los elimina"
  - "Header del filtro y de la columna de AlumnosPage renombrados de 'Segmento' a 'Asistencia' (Claude's Discretion, coherencia semántica)"
  - "Card 'Segmentacion' de AlumnoDetailPage renombrada a 'Asistencia'"
  - "Colores D-69: optima=green, regular=amber, alerta=orange, ausente=red"

requirements-completed: [D-01]

# Metrics
duration: ~6min
completed: 2026-06-22
---

# Phase 136 Plan 05: Propagación de las 4 bandas al frontend admin Summary

**El enum de 4 bandas (optima/regular/alerta/ausente) propagado al admin: tipos de display (labels/colors/descriptions) y analytics, el filtro+columna de AlumnosPage, la card de AlumnoDetailPage, el targeting de NotificacionesPage y el orden de la worklist de MiembrosTab (SEGMENT_PRIORITY remapeado de `{ghost,en_riesgo}` muerto a `{ausente:0,alerta:1}`); `SegmentThresholds` eliminado incondicionalmente (sus consumidores los borra 136-07).**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-06-22
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- **`types/member.ts`:** `MemberSegment` reescrito a `optima|regular|alerta|ausente`; `SEGMENT_LABELS` (Óptima/Regular/Alerta/Ausente), `SEGMENT_COLORS` (green/amber/orange/red, D-69) y `SEGMENT_DESCRIPTIONS` (texto por banda de % de uso) remapeados; **`SegmentThresholds` eliminado incondicionalmente** (D-03: cortes fijos en código, sin thresholds configurables). Comentario actualizado de Phase 79 → Phase 136 D-01.
- **`types/analytics.ts`:** `SegmentCounts` a `{ optima, regular, alerta, ausente, sinSegmento }`; `EngagementMember.segment` a `'alerta' | 'ausente'`; JSDoc de "6 segments" actualizado a "4 bands" — alineado 1:1 con el backend del plan 03.
- **`AlumnosPage.vue`:** `segmentFilterOptions` reescrito a las 4 bandas (+ Todos); filtro `label` y header de columna renombrados de "Segmento" a "Asistencia"; `segmentLabel`/`segmentColor` siguen delegando en los records (auto-actualizados).
- **`AlumnoDetailPage.vue`:** badge del header + card "Segmentacion" delegan en `SEGMENT_COLORS`/`SEGMENT_LABELS` (auto-actualizados); card renombrada a "Asistencia". Sin literales de segmentos viejos hardcodeados.
- **`NotificacionesPage.vue`:** array `segments` de targeting reescrito a las 4 bandas; `sendForm.segmentIds` sigue `string[]`; sin `console.*` ni `any` introducidos.
- **`MiembrosTab.vue`:** `SEGMENT_PRIORITY` remapeado de `{ ghost: 0, en_riesgo: 1 }` (literales muertos tras la migración) a `{ ausente: 0, alerta: 1 }` (ausente = mayor prioridad, alineado con `priorityRank` del backend); comentario de bloque y caption de UI ("fantasma y en riesgo" → "ausentes y en alerta") actualizados. `prioritizedAttentionList` con fallback `?? 2` intacto.

## Task Commits

1. **Task 1: Tipos de display (member.ts) + analytics.ts a 4 bandas + borrar SegmentThresholds** — `93cd3df4` (refactor)
2. **Task 2: AlumnosPage (filtro+columna) + AlumnoDetailPage (card) + NotificacionesPage (targeting) + MiembrosTab (SEGMENT_PRIORITY)** — `17b7288c` (feat)

## Files Created/Modified

- `el-templo-admin/src/types/member.ts` — `MemberSegment` (4 bandas), `SEGMENT_LABELS/COLORS/DESCRIPTIONS` remapeados, `SegmentThresholds` borrado.
- `el-templo-admin/src/types/analytics.ts` — `SegmentCounts` (4 bandas + sinSegmento), `EngagementMember.segment` (alerta|ausente).
- `el-templo-admin/src/pages/AlumnosPage.vue` — `segmentFilterOptions`, filtro y columna a "Asistencia".
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` — card "Asistencia".
- `el-templo-admin/src/pages/NotificacionesPage.vue` — `segments` de targeting a 4 bandas.
- `el-templo-admin/src/components/analytics/MiembrosTab.vue` — `SEGMENT_PRIORITY` remapeado + comentario/caption.

## Decisions Made

- **`SegmentThresholds` borrado incondicionalmente** en este plan (dueño exclusivo de `types/member.ts`). Sus dos consumidores —`useSettingsApi.ts` y `ConfiguracionPage.vue`— quedan con error de typecheck **a propósito**; el plan 136-07 (wave 3, depends_on 05) los elimina. No se tocó ninguno de los dos.
- **"Segmento" → "Asistencia"** en el filtro/columna de AlumnosPage y en la card de AlumnoDetailPage (Claude's Discretion recomendada por el plan), para reflejar la nueva semántica de etiqueta de uso de membresía.
- **Caption de MiembrosTab** ("fantasma y en riesgo primero") actualizado a "ausentes y en alerta primero" (Rule 1: texto de display que describía el orden viejo, ahora incorrecto).

## Deviations from Plan

### 1. [Rule 1 - Texto de display stale] Caption de la worklist en MiembrosTab

- **Found during:** Task 2
- **Issue:** La línea 61 de `MiembrosTab.vue` mostraba "Ordenados por prioridad: fantasma y en riesgo primero", describiendo el orden por segmentos viejos que el remap de `SEGMENT_PRIORITY` deja obsoleto.
- **Fix:** Actualizado a "ausentes y en alerta primero" para coincidir con el nuevo orden. Sin cambio de lógica.
- **Files modified:** `el-templo-admin/src/components/analytics/MiembrosTab.vue`
- **Commit:** `17b7288c`

---

**Total deviations:** 1 (Rule 1 — texto de display). Sin scope creep; no se tocó ningún archivo fuera de la lista de propiedad.

## Issues Encountered

**Breakage downstream esperada (NO corregida — intencional, dueño 136-07).** Tras borrar `SegmentThresholds`, `useSettingsApi.ts` y `ConfiguracionPage.vue` fallan typecheck. Es exactamente lo coordinado en el plan: 136-07 (wave 3) borra ambos archivos. No se tocaron.

**Errores de typecheck pre-existentes y NO relacionados (deferidos).** El typecheck full-project del admin también reporta errores en `src/utils/pdf/session-pdf-builder.ts` (pdfMake `vfs`/`Content` typing, `@types/pdfmake@0.3.1`) y `src/boot/__tests__/axios-refresh-lock.test.ts` (`Cannot find module 'vitest'` + mocks de interceptores axios). Ambos archivos PREDATAN este plan (verificado contra `HEAD~1`) y no tocan ningún tipo de segmentación. Logueados en `deferred-items.md`; fuera de scope (SCOPE BOUNDARY).

## Verification

- **`pnpm tsc --noEmit` file-scoped sobre los 6 archivos propios: LIMPIO** (sin errores en `types/member`, `types/analytics`, `AlumnosPage`, `AlumnoDetailPage`, `NotificacionesPage`, `MiembrosTab`).
- Los únicos errores restantes del admin son: `useSettingsApi.ts` + `ConfiguracionPage.vue` (esperados → 136-07 los borra) y `session-pdf-builder.ts` + `axios-refresh-lock.test.ts` (pre-existentes, sin relación con segmentación, deferidos).
- Gate negativo: sin `value: '(nuevo|espartano|intermitente|en_riesgo|digital_warrior|ghost)'` en los selects de AlumnosPage/NotificacionesPage.
- `SEGMENT_PRIORITY` en MiembrosTab usa `{ ausente: 0, alerta: 1 }`; sin keys `ghost`/`en_riesgo`.
- `SegmentThresholds` ausente de `types/member.ts`.
- `SEGMENT_LABELS/COLORS/DESCRIPTIONS` y `SegmentCounts` en 4 bandas.
- **Tests NO ejecutados localmente** (convención del proyecto: corren en CI al pushear). Este plan es solo frontend de tipos/UI; sin migraciones ni lógica de datos nueva.

## Self-Check: PASSED

- Los 6 archivos modificados existen en disco y typechean limpio (file-scoped).
- Commits `93cd3df4` y `17b7288c` presentes en el historial de `staging`.
- Sin deletions accidentales en ninguno de los 2 commits (`git diff --diff-filter=D HEAD~2 HEAD` vacío).

---

_Phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-_
_Completed: 2026-06-22_

---
phase: 118-analytics-estrat-gico-funnel-de-conversi-n-retenci-n-por-cic
plan: 05
subsystem: admin-analytics-frontend
tags: [analytics, frontend, deletion, engagement, D-09]
requires:
  - "el-templo-admin AsistenciaTab/ReportesPage (Phase 117 estado)"
provides:
  - "AsistenciaTab.vue sin las 2 cards de engagement por segmento"
  - "ReportesPage.vue sin fetch ni prop de engagement"
affects:
  - "el-templo-admin/src/components/analytics/AsistenciaTab.vue"
  - "el-templo-admin/src/pages/ReportesPage.vue"
tech-stack:
  added: []
  patterns:
    - "Deleción de template/código Vue sin tocar backend ni composable"
key-files:
  created: []
  modified:
    - "el-templo-admin/src/components/analytics/AsistenciaTab.vue"
    - "el-templo-admin/src/pages/ReportesPage.vue"
decisions:
  - "D-09: borrar del display las 2 cards de engagement por segmento (mezclan poblaciones: online infla el segmento Digital); backend, EngagementService, engagement.test.ts, getEngagement del composable y el módulo segmentation quedan INTACTOS para AlumnosPage/NotificacionesPage"
metrics:
  duration: ~10min
  completed: 2026-05-26
  tasks: 2
  files: 2
---

# Phase 118 Plan 05: Borrar engagement por segmento del frontend (D-09) Summary

Deleción de las 2 cards de engagement por segmento de AsistenciaTab.vue (conteo por segmento + worklist nominal en_riesgo/ghost con botón WhatsApp) y del fetch/prop de engagement en ReportesPage.vue, dejando intacto todo el backend y el método `getEngagement` del composable.

## What Was Built

- **AsistenciaTab.vue:** removidas las dos `<q-card v-if="props.engagement">` (card "Activos por segmento de engagement" + worklist en_riesgo/ghost con WhatsApp). Borrado el código muerto resultante: `segmentCountCards`, `engagementColumns`, `formatMemberName`, `contactMember`, `segmentLabel`, `segmentColor`, la prop `engagement`, y los imports sin uso `SEGMENT_LABELS`/`SEGMENT_COLORS`/`SEGMENT_DESCRIPTIONS`/`MemberSegment` y `EngagementAnalytics`/`EngagementMember`. Conservados: banner warning <50% check-in, únicos 7/14/30, no-show, asistencias/día, heatmap, ocupación, ratio de check-in.
- **ReportesPage.vue:** removido `analyticsApi.getEngagement(...)` del `Promise.all` de `fetchAttendanceData` (y su destructuring), el ref `engagementData`, la prop `:engagement="engagementData"` y el import de tipo `EngagementAnalytics`.

## Preservado (NO tocado)

- Backend `GET /api/admin/analytics/engagement`, `EngagementService`, `test/analytics/engagement.test.ts` — verificados intactos en disco.
- Método `getEngagement` del composable `useAnalyticsApi.ts` (`grep -c` === 2).
- Módulo `segmentation` y constantes `SEGMENT_*` en `src/types/member` (los siguen usando AlumnosPage/NotificacionesPage).

## Tasks

| Task | Name                                                                  | Commit   | Files                                                      |
| ---- | --------------------------------------------------------------------- | -------- | ---------------------------------------------------------- |
| 1    | Borrar las 2 cards de engagement + código muerto de AsistenciaTab.vue | cec9458c | el-templo-admin/src/components/analytics/AsistenciaTab.vue |
| 2    | Quitar getEngagement del fetch de ReportesPage.vue                    | a5030c97 | el-templo-admin/src/pages/ReportesPage.vue                 |

## Verification

- `grep -c 'props.engagement' AsistenciaTab.vue` === 0 ✓
- `grep -c 'contactMember\|segmentCountCards\|engagementColumns\|formatMemberName' AsistenciaTab.vue` === 0 ✓
- `grep -c 'engagementData' ReportesPage.vue` === 0 ✓
- `grep -c ':engagement=' ReportesPage.vue` === 0 ✓
- `grep -c 'getEngagement' composables/useAnalyticsApi.ts` === 2 (intacto) ✓
- vue-tsc sin errores nuevos en AsistenciaTab.vue ni ReportesPage.vue ✓
- Banner <50% (`lowAdoptionBranch`) y únicos 7/14/30 (`uniqueMembersDisplay`) siguen presentes ✓

## Deviations from Plan

None - plan executed exactly as written. (El import `MemberSegment` quedó sin uso tras borrar las funciones que lo referenciaban, así que se removió junto con `SEGMENT_*` — está dentro del alcance explícito de la tarea: "los imports que queden SIN uso").

## Threat Flags

Ninguno — deleción de UI pura, sin nuevo surface de seguridad. T-118-14 (borrar imports en uso por error) mitigado vía vue-tsc como gate.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- FOUND: AsistenciaTab.vue, ReportesPage.vue, 118-05-SUMMARY.md
- FOUND commits: cec9458c, a5030c97

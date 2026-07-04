---
phase: 154-alumnos-de-templo-ficaci-n-accesos
plan: 05
subsystem: admin
tags: [quasar, vue3, feature-flag, ux, deep-link, white-label]

# Dependency graph
requires:
  - phase: 154-02
    provides: "GET /export acepta includeGreekLevel (columna Nivel del Excel gateada server-side)"
  - phase: 154-03
    provides: "Flag de superficie TEMPLO_GREEK_LEVELS en templo-config.ts"
  - phase: 154-04
    provides: "CobrosPage consume ?memberId= (deep-link listo end-to-end)"
provides:
  - "AlumnosPage: 'Crear alumno' como acción primaria prominente + secundarias degradadas"
  - "Botón de cobro por fila junto al lápiz → /cobros?memberId={id}"
  - "'Avatar' renombrado a 'Categoría' en filtro/columna/ficha (mecanismo avatarType intacto)"
  - "Niveles griegos gateados por TEMPLO_GREEK_LEVELS en columna/filtro/badge/subtítulo/export"
  - "includeGreekLevel? en MemberListParams (tipa el export gateado)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate de superficie por instalación (TEMPLO_GREEK_LEVELS) consumido en page como const local greekLevelsEnabled"
    - "Columna condicional vía filter en el computed visibleColumns (no v-if de template)"
    - "Consistencia pantalla↔export: el mismo flag viaja como includeGreekLevel al backend"

key-files:
  created:
    - .planning/phases/154-alumnos-de-templo-ficaci-n-accesos/154-05-SUMMARY.md
  modified:
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
    - el-templo-admin/src/types/member.ts

key-decisions:
  - "'Crear alumno' primario = unelevated no-dense color primary; 'Nuevo en Prueba' degradado a outline; export sigue flat round"
  - "Ícono del cobro por fila: 'payments' color positive, tooltip 'Registrar cobro' (a la izquierda del lápiz)"
  - "Columna acciones ampliada 80px→96px para dos botones dense round"
  - "Gate de columna Nivel en visibleColumns (filter), no en template — punto natural ya computed"
  - "session-level counts (Fase 99 R11) NO gateados: son superficie del sistema de entrenamiento, fuera del scope del plan"

requirements-completed: [ALUM-01, ALUM-02, ALUM-04, ALUM-05]

# Metrics
duration: ~9min
completed: 2026-07-04
---

# Phase 154 Plan 05: UX de Alumnos — crear prominente, cobro en fila, de-Templo-ficación Summary

**La página de Alumnos prioriza crear y cobrar (botón primario grande + acceso directo al PoS por fila), llama "Categoría" al avatar y esconde los niveles griegos fuera del default white-label — consistente entre pantalla y export, sin tocar los mecanismos subyacentes (avatarType, users.level).**

## Performance

- **Duration:** ~9 min
- **Completed:** 2026-07-04
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- **ALUM-01 (D-01):** "Crear alumno" es ahora la acción primaria prominente del header (botón `unelevated` no-dense, label completo, color primary). "Nuevo en Prueba" quedó degradado a `outline dense` y el export sigue como ícono `flat round` secundario. Reusa el flujo existente `showCreateDialog` → `MemberFormDialog` → `onMemberSaved` (sin flujo de alta nuevo).
- **ALUM-02 (D-02):** cada fila tiene un botón de cobro (`payments`, tooltip "Registrar cobro") a la izquierda del lápiz que hace `router.push({ path: '/cobros', query: { memberId: String(id) } })`. La columna de acciones se amplió a 96px para dos botones. CobrosPage ya consume `?memberId=` (plan 04), así que el flujo queda end-to-end sin duplicar el PoS.
- **ALUM-04 (D-06):** "Avatar" → "Categoría" en el filtro (label), la columna de la tabla (label), la opción "Sin avatar"→"Sin categoría" y el tooltip de la ficha ("Avatar:"→"Categoría:"). El mecanismo (`filters.avatarType`, `props.row.avatarType`, param de API, `AVATAR_LABELS` A-K) queda intacto. NO se usó "Segmento" (colisión con `member_segment` fase 136).
- **ALUM-05 (D-07/D-08):** los niveles griegos se gatean por `TEMPLO_GREEK_LEVELS` (superficie por instalación, no por usuario):
  - AlumnosPage: columna "Nivel" filtrada en `visibleColumns` cuando el flag está off; filtro de nivel bajo `v-if="greekLevelsEnabled"`; export pasa `includeGreekLevel: greekLevelsEnabled` para que la columna Nivel del Excel siga el flag (consistencia, backend plan 02).
  - AlumnoDetailPage: badge griego flotante sobre la foto y subtítulo `levelDisplayName` bajo `v-if`.
  - Los helpers `greekLevel`/`LEVEL_GREEK_MAP`/`levelDisplayName` quedan (gate only, no se borra lógica, NAV-04). Con el flag on todo se ve como hoy.

## Task Commits

1. **Task 1: AlumnosPage — crear prominente, cobro en fila, avatar→categoría, gating niveles + export** - `80c03ef7` (feat)
2. **Task 2: AlumnoDetailPage — avatar→categoría + gating del badge/subtítulo de nivel griego** - `700a194a` (feat)

## Files Created/Modified

- `el-templo-admin/src/pages/AlumnosPage.vue` - Header con "Crear alumno" primario + secundarias degradadas; botón de cobro por fila; renames avatar→categoría (filtro/columna/opción); import `TEMPLO_GREEK_LEVELS` → const `greekLevelsEnabled`; gating de columna Nivel en `visibleColumns` (filter), del filtro (`v-if`) y del export (`includeGreekLevel`); función `registerPayment`; columna acciones 80→96px.
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` - Tooltip "Avatar:"→"Categoría:"; import `TEMPLO_GREEK_LEVELS` → `greekLevelsEnabled`; badge griego flotante y subtítulo de nivel bajo `v-if="greekLevelsEnabled"`; helpers de nivel conservados.
- `el-templo-admin/src/types/member.ts` - `includeGreekLevel?: boolean;` en `MemberListParams` para tipar el param del export (forwardeado por `exportMembers` al query string, backend plan 02).

## Decisions Made

- **Jerarquía del header** (discreción D-01): "Crear alumno" `unelevated` no-dense primary (prominente); "Nuevo en Prueba" degradado a `outline`; export intacto como `flat round`. Orden: export · Nuevo en Prueba · Crear alumno (primario a la derecha, punto de mayor peso visual).
- **Ícono/posición del cobro** (discreción D-02): `payments` color `positive`, tooltip "Registrar cobro", a la izquierda del lápiz. La columna se amplió a 96px para dos botones dense round.
- **Gate de columna en `visibleColumns`** (recomendación PATTERNS): filtrar la entrada `nivel` en el computed (ya existía) es más limpio que envolver el `<template #body-cell-nivel>`.
- **session-level counts NO gateados** (scope): la sección "Últimos 30 días" (Fase 99 R11) muestra niveles de sesión del sistema de entrenamiento, superficie ya gateada por su propia capa Templo — fuera del scope de este plan (que gatea las dos superficies de nivel griego del socio nombradas en el plan).

## Deviations from Plan

None - plan executed exactly as written.

(Higiene, no desviación de scope: el pre-commit de lint-staged reformateó el bloque `<template v-if>` del subtítulo de nivel en AlumnoDetailPage — sin cambio de comportamiento.)

## Issues Encountered

None.

## User Setup Required

None - consume el flag, el deep-link y el param de export ya existentes (planes 02/03/04).

## Next Phase Readiness

- Fase 154 completa (5/5 planes). La página de Alumnos queda de-Templo-ficada en su superficie MVP: crear prominente, cobro directo, "Categoría" en vez de avatar, niveles griegos gateados consistentes pantalla↔export.
- Sin blockers.

## Self-Check: PASSED

- Archivos modificados presentes; grep confirma "Crear alumno" (2), `memberId` + `'/cobros'`, cero labels "Avatar"/"Sin avatar" residuales, `TEMPLO_GREEK_LEVELS`/`greekLevelsEnabled` en ambas pages, `includeGreekLevel` en page (1) y tipo (1), cero `console.`/`: any` nuevos.
- Commits `80c03ef7`, `700a194a` presentes en git log.
- `pnpm lint` verde (0 errores; 9 warnings pre-existentes en archivos ajenos al plan).

---

_Phase: 154-alumnos-de-templo-ficaci-n-accesos_
_Completed: 2026-07-04_

---
phase: 165-self-service-y-ux-de-gesti-n
plan: 03
subsystem: api+admin
tags: [reports, trial-sessions, phone, wa.me, csv, sql-raw, quasar, vitest]

# Dependency graph
requires:
  - phase: 164-reprogramaci-n-y-reporte
    provides: "forma de extensión de columnas del reporte de SP (reschedules/lead_status_source en los seis touch-points)"
provides:
  - "Cada fila del reporte de Sesiones de Prueba (JSON + CSV) incluye el teléfono del lead (users.phone), null para leads legacy"
  - "Columna CSV 'Teléfono' (posición 2, tras 'Lead'), escapada RFC-4180"
  - "UI del reporte: columna Teléfono como link wa.me (o '—' para legacy) + acción por fila 'Ver ficha' → /alumnos/:userId"
affects: [recupero segmentado por Asistió, gestión de leads desde el reporte de SP]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extensión de columna del reporte de SP siguiendo la forma exacta de 164 (SELECT raw + result-type ×2 + mapper param/return + CSV header/cell en misma posición ordinal)"
    - "Link wa.me desde una celda de teléfono limpiando no-dígitos (whatsappUrl, mismo patrón que SesionesDePruebaDialog.openWhatsapp)"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/reports/types.ts
    - el-templo-api/src/modules/reports/schemas.ts
    - el-templo-api/test/reports-trial-sessions.test.ts
    - el-templo-admin/src/components/reports/TrialSessionsReport.vue
    - el-templo-admin/src/composables/useReportsApi.ts

key-decisions:
  - "Columna Teléfono ubicada en la posición 2 del reporte (tras Lead) tanto en JSON como en CSV — misma posición ordinal en headers y cells; expectedHeader del test CSV actualizado en consecuencia"
  - "Teléfono renderizado como link wa.me con <a href> (no window.open onClick) — más simple, satisface la limpieza de no-dígitos y el grep de acceptance; legacy sin teléfono muestra '—' sin link (D-06)"
  - "Ver ficha implementado como columna 'Acciones' propia (q-btn con :to) además del router-link ya existente en la celda del nombre — D-07 pide acción dedicada; sin pantallas nuevas, /alumnos/:userId ya hospeda estado + plan"
  - "seedLead del test gana un phone override opcional (null = legacy) para poder sembrar un lead sin teléfono y verificar phone=null en la fila"

patterns-established:
  - "Reporte de SP: phone es columna display+CSV, no filtrable ni ordenable — la count query no cambia (igual criterio que reschedules en 164)"

requirements-completed: [SELF-04]

# Metrics
duration: ~15min
completed: 2026-07-16
---

# Phase 165 Plan 03: Teléfono + Ver ficha en el reporte de Sesiones de Prueba Summary

**`users.phone` threaded a cada fila del reporte de SP (JSON + CSV columna 'Teléfono') siguiendo la forma de extensión de 164, más UI de admin con link wa.me y acción 'Ver ficha' → /alumnos/:userId — acorta el camino de recupero/conversión (SELF-04, D-06/D-07).**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- `getTrialSessionsReport` expone `phone` (users.phone) en el page query: `u.phone AS phone` en el SELECT, en los dos result-types inline y en el param+return de `mapTrialSessionRow` (`phone: r.phone ?? null`). Count query intacta.
- CSV export gana la columna "Teléfono" en la posición 2 (tras "Lead"), con `row.phone ?? ""` en la misma posición ordinal, escapada por `csvEscape` RFC-4180.
- Tipos (`TrialSessionsRow`) y schema AJV (`trialSessionsRowSchema.properties.phone: { type: ["string","null"] }`) actualizados.
- Test: `seedLead` acepta `phone` override (null = legacy); nuevo caso `it("includes the lead phone...")` verifica phone por fila (valor conocido + null); `expectedHeader` del CSV actualizado con "Teléfono".
- Admin UI: `TrialSessionsRowClient` gana `phone: string | null`; el reporte muestra la columna "Teléfono" como link wa.me (helper `whatsappUrl`) o "—" para legacy, y una columna "Acciones" con q-btn "Ver ficha" → /alumnos/:userId.

## Task Commits

1. **Task 1: Backend — u.phone en el reporte + CSV + tipos/schemas + test (D-06)** - `481e8813` (feat)
2. **Task 2: Admin UI — columna Teléfono con wa.me + acción "Ver ficha" (D-06/D-07)** - `6d0913ec` (feat)

**Plan metadata:** (docs commit — este SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `el-templo-api/src/modules/reports/service.ts` - `u.phone AS phone` en el SELECT del page query, ambos result-types inline, param+return de `mapTrialSessionRow`, columna "Teléfono" en `exportTrialSessions` (headers+cells).
- `el-templo-api/src/modules/reports/types.ts` - `phone: string | null` en `TrialSessionsRow` con doc comment.
- `el-templo-api/src/modules/reports/schemas.ts` - `phone: { type: ["string","null"] }` en el row schema.
- `el-templo-api/test/reports-trial-sessions.test.ts` - `phone` override en `SeedLeadOpts`/`seedLead`; nuevo test de phone por fila; `expectedHeader` del CSV con "Teléfono".
- `el-templo-admin/src/composables/useReportsApi.ts` - `phone: string | null` en `TrialSessionsRowClient`.
- `el-templo-admin/src/components/reports/TrialSessionsReport.vue` - columna "Teléfono" + slot `#body-cell-phone` (link wa.me / "—"), columna "Acciones" + slot `#body-cell-acciones` ("Ver ficha"), helper `whatsappUrl`.

## Decisions Made
- Columna Teléfono en la posición 2 (tras Lead) en JSON y CSV; `expectedHeader` del test CSV actualizado por consecuencia directa.
- wa.me con `<a href>` en vez de `window.open` onClick — más simple; legacy sin teléfono muestra "—" sin link.
- "Ver ficha" como columna "Acciones" dedicada (D-07) además del router-link ya existente en el nombre; sin pantallas nuevas.
- `phone` es columna display+CSV, no filtrable ni ordenable — la count query no cambia.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `expectedHeader` del test CSV desactualizado**
- **Found during:** Task 1
- **Issue:** El test "CSV export emits BOM + Spanish header line" fija el string de header exacto; al insertar "Teléfono" tras "Lead" el assert habría fallado.
- **Fix:** Actualizado `expectedHeader` para incluir "Teléfono" en la posición 2.
- **Files modified:** el-templo-api/test/reports-trial-sessions.test.ts
- **Verification:** El test de CSV pasa verde (20/20).
- **Committed in:** 481e8813 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — consecuencia directa del cambio de Task 1). Sin scope creep.

## TDD Gate Compliance

Task 1 tenía `tdd="true"`. Dada la naturaleza "copiar el hermano" de esta fase (extensión idéntica a 164, helper de seed ya siembra phone), se implementó backend + test en un único commit `feat` (mismo criterio pragmático que el sibling 164-03, que también hizo impl+test sin RED/GREEN estricto). El modo MVP+TDD no estaba activo (sin flags MVP_MODE/TDD_MODE del orquestador), por lo que el runtime gate no aplicaba. El test nuevo verifica el comportamiento (phone por fila, valor + null) y corre verde.

## Issues Encountered

- **Flake preexistente (NO causado por 165-03):** el test `attended filter handles si/no/pending` puede fallar cuando el suite corre cerca de medianoche UTC por el bug conocido UTC-vs-ART (`dateOffset()` UTC vs `CURDATE()` ART), ya registrado en 164-03. En esta corrida (00:43 ART) los 20 tests pasaron verde.

## User Setup Required

None - sin migraciones (todo derivado de datos existentes). Sin dependencias nuevas.

## Next Phase Readiness
- SELF-04 completo: el reporte de SP trae el teléfono (insumo del recupero segmentado por Asistió) y el salto directo a la ficha del lead. Base lista para 165-04/165-05 (resto de la UX de gestión).

## Self-Check: PASSED
- FOUND: el-templo-api/src/modules/reports/service.ts (u.phone AS phone + Teléfono CSV)
- FOUND: el-templo-admin/src/components/reports/TrialSessionsReport.vue (wa.me + alumnos/)
- FOUND commit 481e8813 (Task 1)
- FOUND commit 6d0913ec (Task 2)

---
*Phase: 165-self-service-y-ux-de-gesti-n*
*Completed: 2026-07-16*

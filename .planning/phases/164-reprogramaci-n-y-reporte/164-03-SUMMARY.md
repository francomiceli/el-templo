---
phase: 164-reprogramaci-n-y-reporte
plan: 03
subsystem: api
tags: [reports, trial-sessions, sql-raw, csv, lead-status-source, drizzle, mysql]

# Dependency graph
requires:
  - phase: 163-m-quina-de-estados-autom-tica-del-lead
    provides: "columna users.lead_status_source ('auto'|'manual'|null) — origen del estado del lead"
provides:
  - "Contador de reprogramaciones por lead en el reporte de Sesiones de Prueba (COUNT retroactivo de bookings de prueba canceladas)"
  - "leadStatusSource ('auto'|'manual'|null) por fila del reporte, null tratado como automático/histórico"
  - "Filtro leadStatusSource=auto|manual en GET /reports/trial-sessions (+export); auto incluye filas NULL"
  - "Columnas CSV 'Reprogramaciones' y 'Origen estado'"
affects: [164-04, TrialSessionsReport.vue, useReportsApi]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "COUNT correlacionado en SQL raw con alias explícito (rc.member_id = u.id) — seguro frente al gotcha de columnas sin calificar de Drizzle"
    - "Filtro enum auto-incluye-NULL: (col = 'auto' OR col IS NULL) para tratar histórico como automático"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/reports/types.ts
    - el-templo-api/src/modules/reports/schemas.ts
    - el-templo-api/src/modules/reports/routes.ts
    - el-templo-api/test/reports-trial-sessions.test.ts

key-decisions:
  - "reschedules cuenta TODAS las bookings de prueba canceladas del lead (incluye self-service) — proxy de ruido del lead, no solo reprogramaciones admin (specifics.67)"
  - "auto incluye lead_status_source NULL (histórico/desconocido) — D-05"
  - "Sin owner-strip para leadStatusSource: disponible a todos los report-viewers, no expone datos de otro scope"

patterns-established:
  - "Subquery COUNT correlacionada aliaseada dentro de la SELECT list del page query del reporte de SP"
  - "Filtro de origen bindeado con \${...} (nunca sql.raw/concat) — defense-in-depth sobre el enum AJV"

requirements-completed: [REPRO-02, REPRO-03]

# Metrics
duration: 12min
completed: 2026-07-15
---

# Phase 164 Plan 03: Reprogramaciones + origen del estado en el reporte de Sesiones de Prueba Summary

**COUNT correlacionado de bookings de prueba canceladas por lead + `lead_status_source` en cada fila del reporte, con filtro `leadStatusSource=auto|manual` (auto incluye NULL) y columnas CSV, todo derivado sin schema nuevo.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-15T23:21:00-03:00 (aprox)
- **Completed:** 2026-07-15T23:33:11-03:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `getTrialSessionsReport` expone `reschedules` (COUNT de `bookings` con `is_trial=1 AND booking_status='cancelado'` por member) y `leadStatusSource` derivados en el page query, sin tocar la count query de leads.
- Filtro `leadStatusSource` en `buildTrialSessionsConditions`: `auto` matchea `'auto' OR IS NULL`, `manual` matchea el valor exacto (bindeado con `${...}`).
- CSV export gana las columnas "Reprogramaciones" y "Origen estado" al final; origen renderizado como "Manual"/"Automático".
- Tipos (`TrialSessionsRow`/`TrialSessionsFilters`), schemas AJV (querystring enum + row props) y passthrough de ruta sin owner-strip.
- 3 tests de integración nuevos (count, source, filtro auto-incluye-NULL) + header CSV actualizado.

## Task Commits

1. **Task 1: reschedule count + lead_status_source + filtro + CSV** - `c13fb83b` (feat)
2. **Task 2: Tests de reschedules + source + filtro** - `db04940d` (test)

**Plan metadata:** (docs commit — este SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `el-templo-api/src/modules/reports/service.ts` - COUNT correlacionado `AS reschedules` + `u.lead_status_source` en el SELECT del page query, ambos row-type generics inline, `mapTrialSessionRow`, filtro en `buildTrialSessionsConditions`, columnas en `exportTrialSessions`.
- `el-templo-api/src/modules/reports/types.ts` - `reschedules`/`leadStatusSource` en `TrialSessionsRow`, `leadStatusSource?` en `TrialSessionsFilters`.
- `el-templo-api/src/modules/reports/schemas.ts` - `leadStatusSource` en querystring (enum) y `reschedules`/`leadStatusSource` en el row schema.
- `el-templo-api/src/modules/reports/routes.ts` - `leadStatusSource` en el generic querystring + passthrough sin owner-strip.
- `el-templo-api/test/reports-trial-sessions.test.ts` - `leadStatusSource` en `SeedLeadOpts`/`seedLead`; 3 casos nuevos; header CSV esperado actualizado.

## Decisions Made
- `reschedules` cuenta todas las pruebas canceladas del lead (self-service incluido) — proxy de ruido del lead, no solo reprogramaciones admin.
- `auto` incluye `lead_status_source IS NULL` (histórico), consistente con el cron de la fase 163.
- Sin owner-strip para `leadStatusSource` (a diferencia de `gestionaUserId`): el filtro no expone datos de otro scope; `country` sigue de `request.scope.country`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Header CSV esperado desactualizado en test preexistente**
- **Found during:** Task 2 (tests)
- **Issue:** El test "CSV export emits BOM + Spanish header line" fijaba el string de header sin las columnas nuevas; al agregar "Reprogramaciones"/"Origen estado" (Task 1) el assert habría fallado.
- **Fix:** Actualizado el `expectedHeader` del test para incluir las dos columnas nuevas al final.
- **Files modified:** el-templo-api/test/reports-trial-sessions.test.ts
- **Verification:** El test de CSV pasa verde.
- **Committed in:** db04940d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Ajuste necesario por consecuencia directa del cambio de Task 1. Sin scope creep.

## Issues Encountered

- **Flake preexistente (NO causado por 164-03):** el test `attended filter handles si/no/pending` (offset -1, no tocado) falla cuando el suite corre entre ~21:00–24:00 ART por el bug conocido UTC-vs-ART: `dateOffset()` usa UTC pero `CURDATE()` es ART, así que cerca de medianoche UTC la fila cae en el mismo día que `CURDATE()` y `< CURDATE()` la excluye. Registrado en `deferred-items.md`. Los 4 tests que toqué/agregué (reschedules, source, filtro, CSV) pasan verde corridos en aislamiento. Fix sugerido: migrar `dateOffset()` a fecha local, alineado con `test/expire-lost-leads.test.ts`.

## User Setup Required

None - no external service configuration required. Sin migraciones (todo derivado de datos existentes).

## Next Phase Readiness
- Backend de REPRO-02/REPRO-03 listo: la fila del reporte (JSON + CSV) ya trae `reschedules` y `leadStatusSource`, y el endpoint filtra por origen. Base para la UI del reporte (Plan 164-04: chip/tooltip auto/manual + columna reprogramaciones + select de filtro en `TrialSessionsReport.vue`).

## Self-Check: PASSED
- FOUND: el-templo-api/src/modules/reports/service.ts (AS reschedules + lead_status_source)
- FOUND: el-templo-api/test/reports-trial-sessions.test.ts (reschedules/leadStatusSource)
- FOUND commit c13fb83b (Task 1)
- FOUND commit db04940d (Task 2)

---
*Phase: 164-reprogramaci-n-y-reporte*
*Completed: 2026-07-15*

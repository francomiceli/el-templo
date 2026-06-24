---
phase: 143-profesor-por-clase-puntuaci-n-post-clase-presencial
plan: 01
subsystem: database
tags: [drizzle, mysql, schema, migration, ratings, scheduling]

# Dependency graph
requires:
  - phase: 61-attendance-scheduling
    provides: schedules + attendance append-log schema patterns reused as analogs
  - phase: 110-admin-multisede
    provides: user_branches junction (coach branch scope) reused for attribution
provides:
  - "class_coach_assignments table — weekly roster, ONE coach per (branch, ISO week, day, slot) with composite uniqueIndex (D-A2)"
  - "coach_ratings table — append-only 1-5 star ratings + optional comment attributed to a coach"
  - "slot enum ('morning','afternoon') derived from schedule startTime (D-A1)"
  - "migration 0152 applied and recorded in _migrations"
affects:
  [
    ratings-service,
    ratings-routes,
    HorariosPage-roster,
    RatingPromptDialog,
    owner-ratings-view,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Weekly roster junction with composite natural-key uniqueIndex (branch, week, day, slot)"
    - "Append-only rating log mirroring attendance (no UNIQUE on natural key; one-shot guard deferred to service layer)"
    - "Two FKs to users on one table disambiguated via relationName in relations block + column-name in constraint name"

key-files:
  created:
    - el-templo-api/src/db/schema/class-coach-assignments.ts
    - el-templo-api/src/db/schema/coach-ratings.ts
    - el-templo-api/src/db/migrations/0152_class_coach_roster_and_ratings.sql
  modified:
    - el-templo-api/src/db/schema/index.ts

key-decisions:
  - "weekStartDate kept per-week (date mode:string) so past ratings stay attributable — never mutate a single current row (D-A1)"
  - "Composite uniqueIndex enforces one-coach-per-slot/week at the DB engine level (D-A2)"
  - "coach_ratings has NO unique on natural key (append log); one-rating-per-class guard lives in the service layer (D-P2)"
  - "scheduleId on coach_ratings is nullable (resolves activity/day, defensive)"
  - "Hand-wrote 0152 SQL (drizzle-kit meta journal desynced past 0130) following 0142 structure exactly"

patterns-established:
  - "class_coach_assignments: weekly coach roster junction with composite natural-key uniqueIndex"
  - "coach_ratings: append-only event log with read-backing indexes (coach avg + member/session one-shot)"

requirements-completed: [PROF-DATA]

# Metrics
duration: ~5min
completed: 2026-06-24
---

# Phase 143 Plan 01: Persistencia roster + puntuaciones Summary

**Capa de persistencia de la fase 143: tabla de roster semanal `class_coach_assignments` (un profe por sucursal/semana/día/turno, unique natural-key) y tabla append-only `coach_ratings` (1-5 estrellas + comentario opcional), con migración 0152 aplicada vía el runner custom.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-24T01:27Z
- **Completed:** 2026-06-24T01:32Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- `class_coach_assignments` — roster semanal con clave natural única `(branch_id, week_start_date, day_of_week, slot)` que impide doble profe por slot/semana a nivel motor (D-A2); `slot` enum morning/afternoon derivado del turno (D-A1); index por `coach_id`.
- `coach_ratings` — log append-only espejo de `attendance`: `coach_id`/`member_id`/`branch_id`/`schedule_id`(nullable), `session_date`, `stars` tinyint, `comment` varchar(500) nullable; índices `idx_coach_ratings_coach` (promedio del owner, D-O1) y `idx_coach_ratings_member_session` (guard one-shot, D-P2); sin unique en la clave natural.
- Barrel `index.ts` extendido con ambos `export *`.
- Migración 0152 escrita a mano siguiendo 0142, aplicada vía `pnpm db:migrate` (runner custom), ambas tablas creadas y fila registrada en `_migrations`.

## Task Commits

Each task was committed atomically:

1. **Task 1: schema files class-coach-assignments.ts + coach-ratings.ts + barrel** - `7c3fb919` (feat)
2. **Task 2: migración 0152 + aplicación + commit del SQL** - `da739b82` (feat)

## Files Created/Modified

- `el-templo-api/src/db/schema/class-coach-assignments.ts` - Roster semanal, composite uniqueIndex, slot enum, relations branch/coach
- `el-templo-api/src/db/schema/coach-ratings.ts` - Log append-only de puntuaciones, índices de lectura, dos FKs a users con relationName distintos
- `el-templo-api/src/db/schema/index.ts` - Añadidos `export * from "./class-coach-assignments"` y `"./coach-ratings"`
- `el-templo-api/src/db/migrations/0152_class_coach_roster_and_ratings.sql` - DDL aditivo: dos CREATE TABLE

## Decisions Made

- `weekStartDate` se modela `date(mode:"string")` y se conserva una fila por semana (no se muta una fila "actual") para que ratings pasados sigan atribuibles (D-A1).
- `coach_ratings` sin `uniqueIndex`: es un append log; el guard one-shot por miembro+clase queda en la capa de servicio (D-P2), con índice `(member_id, session_date)` que lo respalda.
- SQL de la migración escrito a mano (el meta journal de drizzle-kit está desincronizado más allá de 0130, mismo patrón que 0108/0121/0125/0142) siguiendo la estructura exacta de 0142, con literal `ENUM('morning','afternoon')` carácter por carácter igual al `mysqlEnum` y sin `;` en líneas de comentario.

## Deviations from Plan

None - plan executed exactly as written.

Nota: el plan referenciaba `pnpm typecheck` pero el script real es `tsc --noEmit` (el package.json define `build: tsc`, no `typecheck`). Se usó `pnpm exec tsc --noEmit` (EXIT 0). No es una desviación de implementación, solo del comando de verificación.

## Issues Encountered

None en el código. El script de verificación ad-hoc de tablas requirió dos ajustes (top-level await → IIFE; el runner usa `DB_HOST/DB_USER/...` no `DATABASE_URL`) — sin impacto en el entregable; ambas tablas verificadas existentes y la migración registrada en `_migrations`.

## User Setup Required

None - no external service configuration required.

La migración 0152 ya está aplicada en `eltemplo` local. En producción se aplicará automáticamente en el próximo deploy (runner custom en CI/CD).

## Next Phase Readiness

- Cimiento de persistencia listo: las olas posteriores (servicio de ratings, rutas admin/member, roster en HorariosPage, RatingPromptDialog, vista del owner) pueden construir sobre `class_coach_assignments` y `coach_ratings`.
- Sin blockers.

## Self-Check: PASSED

- FOUND: el-templo-api/src/db/schema/class-coach-assignments.ts
- FOUND: el-templo-api/src/db/schema/coach-ratings.ts
- FOUND: el-templo-api/src/db/migrations/0152_class_coach_roster_and_ratings.sql
- FOUND: commit 7c3fb919
- FOUND: commit da739b82

---

_Phase: 143-profesor-por-clase-puntuaci-n-post-clase-presencial_
_Completed: 2026-06-24_

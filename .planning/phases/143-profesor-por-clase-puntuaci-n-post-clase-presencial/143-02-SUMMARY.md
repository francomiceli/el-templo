---
phase: 143-profesor-por-clase-puntuaci-n-post-clase-presencial
plan: 02
subsystem: api
tags:
  [fastify, drizzle, ratings, roster, attribution, privacy, integration-tests]

# Dependency graph
requires:
  - phase: 143-01
    provides: class_coach_assignments + coach_ratings tables (migration 0152)
  - phase: 110-admin-multisede
    provides: user_branches (coach branch scope) + attachCountryScope + requireBranchAccess
  - phase: 61-attendance-scheduling
    provides: attendance/schedules/activities used for in-person-class signal + slot/activity resolution
provides:
  - "RatingsService — roster upsert, coaches-for-branch, roster-week, pending (server-side 48h/last/one-shot/no-orphan), submit (deterministic attribution), owner per-coach average + recent"
  - "ratingsAdminRoutes (/api/admin/ratings) — coaches, roster GET/POST, owner-only view"
  - "ratingsMemberRoutes (/api/members/ratings) — pending + submit"
  - "Integration test suite for attribution, pending, one-shot, no-coach, owner-only, branch-scope, average"
affects:
  [
    HorariosPage-roster,
    RatingPromptDialog,
    owner-ratings-view,
    143-03,
    143-04,
    143-05,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deterministic attribution: resolve coachId from weekly roster by (branchId, ISO-week, ISO-dayOfWeek, slot derived from startTime<12:00)"
    - "Privacy-preserving pending: returns the CLASS only (activity/day), never the coach (D-A3)"
    - "Server-side enforcement of pop-up rules (48h window, last-class-only, one-shot, no-orphan) — never trusted to the client"
    - "Owner-only read gate as a per-handler role check on top of TRAINING_ROLES module guard"

key-files:
  created:
    - el-templo-api/src/modules/ratings/types.ts
    - el-templo-api/src/modules/ratings/schemas.ts
    - el-templo-api/src/modules/ratings/service.ts
    - el-templo-api/src/modules/ratings/routes.ts
    - el-templo-api/src/modules/ratings/index.ts
    - el-templo-api/test/ratings/ratings.test.ts
  modified:
    - el-templo-api/src/app.ts

key-decisions:
  - "Attribution helpers (isoDayOfWeek, isoWeekStart, slotFromStartTime) use noon-UTC like date-utils to avoid DST/day-boundary drift; reuse getWeekRange for the Monday"
  - "48h window measured from attendance.checkedInAt; getPendingRating scans the 20 most-recent confirmed classes newest-first and returns the first eligible one (D-P4 last-only, short-circuits to null once past the window)"
  - "Roster upsert uses ON DUPLICATE KEY UPDATE over the composite natural key so reassigning a slot replaces atomically (no duplicate row)"
  - "Owner view restricts non-owner staff by country via the rating's branchId (mirrors CoachService scope); owner unrestricted"
  - "POST /roster returns 204 (no body); POST /members/ratings returns 201"
  - "submitRating requires a confirmed attendance row for (member, sessionDate, scheduleId) before inserting (T-143-08 anti-spoof) and revalidates the 48h window server-side"

requirements-completed: [PROF-ROSTER, PROF-RATING, PROF-OWNERVIEW]

# Metrics
duration: ~7min
completed: 2026-06-24
---

# Phase 143 Plan 02: Módulo API ratings (roster + rating + vista owner) Summary

**Módulo backend `ratings` con tres flujos desacoplados: escritura del roster semanal (owner/coach asigna un profe por sucursal/semana/día/turno, persistencia inmediata, scope por sucursal), pending+submit del miembro (atribución determinística del coachId desde el roster, con guardas server-side de 48h/última-clase/one-shot/no-orphan/asistencia y sin exponer al profe), y vista owner-only (promedio por profe + recientes). Suite de 10 tests de integración.**

## Performance

- **Duration:** ~7 min
- **Tasks:** 2
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- **`RatingsService`** con 6 métodos: `getCoachesForBranch`, `getRosterWeek`, `upsertRosterAssignment`, `getPendingRating`, `submitRating`, `getOwnerRatings`.
- **Atribución determinística (D-Q1):** `resolveRosterCoachId(branchId, sessionDate, startTime)` deriva `(weekStart ISO, dayOfWeek ISO, slot por startTime<12:00)` y busca el coach en `class_coach_assignments`. La semana se conserva por fila, así clases pasadas siguen atribuibles aunque el roster cambie en otra semana.
- **`getPendingRating` (D-P3/D-P4, server-side):** escanea las 20 asistencias confirmadas más recientes (orden desc), aplica ventana de 48h desde `checkedInAt`, descarta clases ya puntuadas (D-P2) y sin profe en el roster (D-Q3), y devuelve **solo la última** clase elegible. El payload expone únicamente `{sessionDate, branchId, scheduleId, activityName, dayOfWeek}` — **nunca** al profe (D-A3).
- **`submitRating`:** exige asistencia confirmada del miembro para `(sessionDate, scheduleId)` (anti-spoof T-143-08), revalida la ventana de 48h, aplica one-shot (D-P2), resuelve el coach por atribución y lanza `BadRequestError` si no hay profe (no-orphan, D-Q3).
- **`getOwnerRatings` (D-O1):** `AVG(stars)` + `COUNT(*)` por coach (columnas prefijadas en groupBy) + 50 recientes con actividad; scope por país para staff no-owner.
- **Rutas:** `ratingsAdminRoutes` con guard `TRAINING_ROLES` + `attachCountryScope`; `POST /roster` con `requireBranchAccess({from:"body.branchId"})` (coach solo en sus sucursales, T-143-05); `GET /` con check extra owner-only (D-M3/T-143-04). `ratingsMemberRoutes` con solo `authenticate`: `GET /pending` y `POST /`.
- **Registro en `app.ts`** bajo `/api/admin/ratings` y `/api/members/ratings`.
- **JSON schemas:** `stars` integer 1–5, `comment` maxLength 500 (T-143-09 a nivel transporte).
- **10 tests de integración** cubriendo roster upsert/replace, branch-scope 403, atribución (incl. semana ajena), pending (48h + última + ya-puntuada + sin-profe + sin-exponer-profe), one-shot 400, no-coach 400 sin insertar, owner-only 403/403/200, promedio+count, y coaches-por-sucursal.

## Task Commits

1. **Task 1: módulo ratings + registro en app.ts** - `efa977b7` (feat)
2. **Task 2: tests de integración del módulo ratings** - `99a91b89` (test)

## Files Created/Modified

- `el-templo-api/src/modules/ratings/types.ts` - Interfaces tipadas (sin `any`): roster, coach option, pending, submit, owner result, scope
- `el-templo-api/src/modules/ratings/schemas.ts` - JSON schemas de validación (stars 1-5, comment ≤500, querystrings)
- `el-templo-api/src/modules/ratings/service.ts` - `RatingsService` con los 6 métodos + helpers de atribución (noon-UTC, slot por startTime)
- `el-templo-api/src/modules/ratings/routes.ts` - `ratingsAdminRoutes` + `ratingsMemberRoutes`
- `el-templo-api/src/modules/ratings/index.ts` - barrel `export * from "./routes"`
- `el-templo-api/test/ratings/ratings.test.ts` - 10 tests de integración
- `el-templo-api/src/app.ts` - import + registro de ambos plugins

## Threat Model Coverage

| Threat ID                                   | Mitigación implementada                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| T-143-04 (vista owner)                      | `GET /` verifica `request.user.role === "owner"` → 403 para member/coach; test cubre los 3 roles                |
| T-143-05 (roster cross-branch)              | `requireBranchAccess({from:"body.branchId"})` + validación `user_branches` en el service; test branch-scope 403 |
| T-143-06 (doble voto)                       | one-shot sobre `(memberId, sessionDate, scheduleId)`; test 400 + 1 fila                                         |
| T-143-07 (rating huérfano)                  | pending y submit rechazan sin fila de roster; test                                                              |
| T-143-08 (clase no asistida / fuera de 48h) | submit exige attendance confirmado + revalida 48h; cubierto en submit                                           |
| T-143-09 (stars/comment fuera de rango)     | JSON schema + validación en service                                                                             |
| T-143-16 (pending filtra al profe)          | pending devuelve solo clase; test verifica ausencia de `coachId`/`coachName`                                    |

## Decisions Made

- Helpers de fecha en noon-UTC (igual convención que `date-utils`) para evitar drift de DST/borde de día; `getWeekRange` reutilizado para el lunes ISO.
- Ventana de 48h medida desde `attendance.checkedInAt`. `getPendingRating` escanea las 20 más recientes y devuelve la primera elegible (última en el tiempo); corta a `null` al pasar la ventana (D-P4, sin cola).
- `upsertRosterAssignment` usa `ON DUPLICATE KEY UPDATE` sobre la clave natural compuesta (reemplazo atómico).
- Vista owner: staff no-owner se acota por país vía `coach_ratings.branchId`; el owner ve todo. (En esta fase la vista solo es accesible por owner — el scope por país queda implementado para reuso futuro pero el gate de ruta es owner-only.)
- `POST /roster` → 204; `POST /members/ratings` → 201.

## Deviations from Plan

None en la implementación — el plan se ejecutó como fue escrito.

Nota de verificación (no es desviación de implementación): el plan referenciaba `pnpm typecheck` y `pnpm lint`, pero el `package.json` de `el-templo-api` no define esos scripts (solo `build: tsc` y `test: vitest run`) ni hay config de ESLint local. Se usó `pnpm exec tsc --noEmit` (EXIT 0) — igual criterio que 143-01. El lint/formato lo aplica Prettier vía husky/lint-staged en el commit (se ejecutó automáticamente). Se verificó manualmente la ausencia de `console.` y `: any` en los archivos nuevos (CLEAN).

## TDD Gate Compliance

Task 2 está marcada `tdd="true"`. El gate RED→GREEN clásico **no** se ejecutó como secuencia separada de commits: el módulo se implementó en Task 1 (misma ola/plan) y los tests en Task 2. Además, el feedback del proyecto prohíbe correr el suite localmente (corre en CI al pushear a staging; solo se hace typecheck local). Por lo tanto:

- No hay un commit `test(...)` previo a un `feat(...)` que demuestre el RED; la implementación precedió a los tests dentro del mismo plan.
- Los tests escritos cubren todos los comportamientos del bloque `<behavior>` y typecheckean en verde.
- La validación funcional real (RED/GREEN efectivo contra MySQL) ocurrirá en CI al pushear.

## Issues Encountered

None. Typecheck verde en ambas tasks; Prettier reformateó `service.ts` (sin cambios funcionales) durante el commit.

## Next Phase Readiness

- API lista para las olas siguientes: `HorariosPage` (UI del roster, consume `GET/POST /api/admin/ratings/roster` + `GET /coaches`), `RatingPromptDialog` (consume `GET /api/members/ratings/pending` + `POST /api/members/ratings`), y la vista del owner (`GET /api/admin/ratings`).
- Sin blockers. La migración 0152 (143-01) ya está aplicada local; en prod se aplica en el próximo deploy.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/ratings/service.ts
- FOUND: el-templo-api/src/modules/ratings/routes.ts
- FOUND: el-templo-api/src/modules/ratings/schemas.ts
- FOUND: el-templo-api/src/modules/ratings/types.ts
- FOUND: el-templo-api/src/modules/ratings/index.ts
- FOUND: el-templo-api/test/ratings/ratings.test.ts
- FOUND: commit efa977b7
- FOUND: commit 99a91b89
- grep "class RatingsService" = 1; "register(ratingsAdminRoutes" = 1; "register(ratingsMemberRoutes" = 1

---

_Phase: 143-profesor-por-clase-puntuaci-n-post-clase-presencial_
_Completed: 2026-06-24_

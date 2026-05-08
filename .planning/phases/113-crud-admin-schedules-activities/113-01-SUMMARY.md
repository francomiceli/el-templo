---
phase: 113
plan: 01
subsystem: scheduling
tags: [backend, validation, hardening, scheduling, activities]
dependency-graph:
  requires: []
  provides:
    - createSchedule overlap validation (D-10/11/12)
    - createActivity name uniqueness on active activities (D-16)
    - updateActivity rename uniqueness + deactivation cascade-block (D-13/D-14/D-16)
    - 409 affectedSchedules payload contract for admin UI
  affects:
    - el-templo-api/src/modules/scheduling/service.ts
    - el-templo-api/src/modules/scheduling/activity-service.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/scheduling/types.ts
tech-stack:
  added: []
  patterns:
    - Lexicographic HH:MM string comparison via drizzle `lt`/`gt` (no
      time-of-day cast needed because `varchar(5)` "HH:MM" sorts numerically)
    - Half-open interval overlap check `[a.start, a.end) ∩ [b.start, b.end) ≠ ∅`
      via `a.start < b.end AND a.end > b.start` (strict inequalities make
      back-to-back boundaries non-overlapping)
    - ConflictError payload-extension idiom via TS intersection type
      (`ConflictError & { affectedSchedules?: AffectedScheduleRef[] }`) bypassing
      the shared `handleServiceError` for one specific 409 shape
    - Fastify fast-json-stringify schema declaration of optional rich
      properties (`affectedSchedules`) so they survive serialization
key-files:
  created:
    - el-templo-api/test/scheduling/schedule-activity-crud.test.ts
  modified:
    - el-templo-api/src/modules/scheduling/service.ts (createSchedule lines 80-116)
    - el-templo-api/src/modules/scheduling/activity-service.ts (createActivity + updateActivity)
    - el-templo-api/src/modules/scheduling/routes.ts (PUT /activities/:id catch branch)
    - el-templo-api/src/modules/scheduling/schemas.ts (createActivitySchema + updateActivitySchema 409)
    - el-templo-api/src/modules/scheduling/types.ts (AffectedScheduleRef export)
decisions:
  - D-10/11/12 implemented exactly as specced — half-open interval, strict <
    on start, strict > on end, isActive=true filter
  - 409 payload extension chose "intersection-type cast" over "subclass
    ConflictError" — minimal blast radius (one route + one service method)
    and avoids leaking a payload-aware error class into modules that don't
    need it (T-113-02 STRIDE row already accepts the disclosure on owner+admin
    role, so dedicated subclass would be over-engineering)
  - Test fixture uses seeded branch (Constitución) directly via the same
    `select first non-virtual` pattern already established in
    scheduling.test.ts — `cleanAllTestData(app)` does NOT touch branches so
    no fresh branch insert is needed (avoids `branch.code <= 20` constraint
    surprises Phase 106 hit)
metrics:
  duration: ~25min
  tasks_completed: 3/3
  files_modified: 5
  files_created: 1
  tests_added: 8
  tests_passing: 8/8
  completed_date: 2026-05-08
---

# Phase 113 Plan 01: Backend hardening for schedule + activity CRUD Summary

Backend validation hardening for the upcoming admin CRUD UI of schedules and
activities: real overlap detection on `createSchedule` (filtered by
`is_active=1`), activity-name uniqueness on create + rename, and a
cascade-block on deactivation that returns the list of referencing active
schedules so the admin UI can render an actionable "estos horarios usan la
actividad" message.

## What was built

### Task 1: createSchedule overlap validation (D-10/11/12)

**File:** `el-templo-api/src/modules/scheduling/service.ts`, lines 80-116.

Replaced the legacy "exact-startTime duplicate" check (which let
10:00-11:00 + 10:30-11:30 coexist) with:

1. **Range guard:** `if (endTime <= startTime)` → `BadRequestError("La hora
de fin debe ser posterior al inicio")`. HH:MM strings sort
   lexicographically equivalent to numeric ordering because the schema
   regex `^\\d{2}:\\d{2}$` enforces zero-padding.
2. **Half-open interval overlap query:** `lt(startTime, endTime) AND
gt(endTime, startTime)` plus `eq(branchId, X)`, `eq(dayOfWeek, X)`,
   `eq(isActive, true)` — historic inactive rows do NOT block new slots
   (D-12, the Constitución 10am case).
3. **Conflict message** includes the existing slot's range:
   `"Ya existe un horario activo HH:MM-HH:MM que se solapa en esta sede y dia"`.

Added imports: `lt`, `gt` from `drizzle-orm` (line 13).

### Task 2: Activity uniqueness + cascade-block (D-13/D-14/D-16)

**Files:** `activity-service.ts`, `routes.ts`, `schemas.ts`, `types.ts`.

**`createActivity`** now rejects duplicate name across active activities
with a 409. Inactive activities don't block reuse — admins can recreate by
name after soft-delete (D-16).

**`updateActivity`** has two new pre-update guards:

- **Rename collision** (D-16): if `data.name !== existing.name`, query for
  another active activity with that name (`ne(id)` excludes self) → 409.
  No-op renames (same name) are allowed and never query.
- **Deactivation cascade-block** (D-13): if `data.isActive === false &&
existing.isActive === true`, query `schedules` (active rows only) inner
  joined on `branches` (for branchName) referencing the activity. If any
  rows return, throw `ConflictError` with an attached
  `affectedSchedules: AffectedScheduleRef[]` payload via TS intersection
  cast.

**Reactivation** (`isActive: false → true`) is unrestricted per D-14 — no
cascade work needed.

**`PUT /activities/:activityId` route handler** now catches `ConflictError`
specifically when it carries `affectedSchedules` and serializes a
404-shaped body:

```json
{
  "error": "Conflicto",
  "message": "No se puede desactivar: 1 horario(s) activo(s) usan...",
  "affectedSchedules": [
    {
      "id": 12,
      "dayOfWeek": 2,
      "startTime": "09:00",
      "endTime": "10:00",
      "branchName": "Constitución"
    }
  ]
}
```

This bypasses the shared `handleServiceError` (which only serializes
`{error, message}`) for this one specific case. All other errors flow
through `handleServiceError` unchanged.

**`updateActivitySchema.response[409]`** declares the rich shape so
Fastify's `fast-json-stringify` preserves `affectedSchedules` instead of
silently stripping it. **`createActivitySchema.response[409]`** added with
the standard `errorSchema` shape (no payload extension needed there).

**`AffectedScheduleRef`** type exported from `types.ts` for both the
service-layer payload and the route-layer cast — single source of truth.

### Task 3: Integration tests (8 cases against real MySQL)

**File:** `el-templo-api/test/scheduling/schedule-activity-crud.test.ts` (new).

Followed the established pattern from `scheduling.test.ts`:
`createTestApp()`, `getAuthToken("admin@test.com")`,
`vi.useFakeTimers({ shouldAdvanceTime: true })`,
`vi.setSystemTime("2026-03-11T10:00:00Z")`. Uses `cleanAllTestData(app)`
in `beforeEach` for FK-ordered cleanup that preserves admin user and
seeded branches.

The 8 tests:

1. `rechaza overlap activo en mismo branch+day` — pre-insert active
   10:30-11:30, POST 10:00-11:00 → 409 "se solapa".
2. `permite back-to-back (10-11 + 11-12)` — both 201.
3. `ignora overlap con slot inactivo (D-12)` — pre-insert inactive
   10:00-11:00 directly via Drizzle, POST 10:00-11:00 → 201.
4. `rechaza activity con name duplicado entre activas` — POST
   `{name:"Calistenia"}` twice → 409.
5. `permite reusar nombre de activity inactiva` — POST + PUT
   isActive=false + POST same name → 201.
6. `rechaza rename a nombre tomado por otra activa` — POST A, POST B,
   PUT A {name:"B"} → 409.
7. `bloquea desactivar activity con schedules activos y devuelve
affectedSchedules` — full payload assertions: `id`, `dayOfWeek=2`,
   `startTime="09:00"`, `endTime="10:00"`, `branchName.length > 0`. Plus
   sanity check that the activity was NOT mutated to inactive.
8. `permite desactivar activity sin schedules activos` — sanity green
   path: PUT isActive=false → 200, body.isActive===false.

**Test result:** 8/8 pass against per-worker `eltemplo_test_*` DB.
Existing `scheduling.test.ts` regression: 48/48 pass — no behavioral drift
on legacy paths.

## Deviations from Plan

None — plan executed exactly as written. The plan's `<action>` blocks were
copy-paste implementable; no Rule 1/2/3/4 deviations triggered.

## Authentication Gates

None — all tests authenticate via the standard `admin@test.com` seed.

## Tests Run

- `cd el-templo-api && pnpm tsc --noEmit` → exit 0 (after each task)
- `cd el-templo-api && pnpm test schedule-activity-crud.test.ts` → 8/8 pass
- `cd el-templo-api && pnpm test test/scheduling/scheduling.test.ts` →
  48/48 pass (regression guard)

## Verification Grep Gates

```bash
grep -nE "lt\(schema.schedules.startTime, endTime\)" \
  src/modules/scheduling/service.ts          # 1 hit (line 107)
grep -nE "isActive, true" \
  src/modules/scheduling/service.ts          # 2 hits (overlap query + grid filter)
grep -n "Ya existe una actividad activa con ese nombre" \
  src/modules/scheduling/activity-service.ts # 1 hit
grep -n "AffectedScheduleRef" \
  src/modules/scheduling/types.ts            # 1 hit (export)
grep -c "validateAnchorSet" \
  src/modules/scheduling/activity-service.ts # 0 (only the pattern was reused, not the helper)
```

## Out of Scope

Frontend admin UI work (modal, tabs, error rendering) lives in plan 113-02.
The new 409 contract (`affectedSchedules` array shape) is the integration
point.

## Self-Check: PASSED

- All 3 task commits exist:
  - `d2d8270f feat(113-01): overlap validation in createSchedule`
  - `6a0d3f98 feat(113-01): activity uniqueness + cascade-block on deactivation`
  - `38f03635 test(113-01): integration tests for schedule + activity CRUD hardening`
- All modified files compile (tsc --noEmit clean).
- 8/8 new tests pass; 48/48 regression tests pass.
- No `any` types introduced; all casts use named TS intersection.
- No console.log; no migrations; no dependency changes.

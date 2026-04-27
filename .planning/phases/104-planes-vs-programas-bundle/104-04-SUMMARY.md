---
phase: 104
plan: 04
subsystem: programs / users / subscriptions
tags: [api, endpoints, current-program, R6, R9-prep, wave-2]
requires:
  - 104-01 (users.current_program_enrollment_id, subscription_plans.grants_all_programs, "Todos los Programas" seed)
provides:
  - GET /api/members/me/current-program
  - PUT /api/members/me/current-program
  - GET /api/members/me/enrollments
  - ProgramsService.getCurrentProgram, setCurrentProgram, listMyActiveEnrollments
  - CurrentProgramResponse, EnrollmentSummary, EnrollmentsListResponse types
  - ForbiddenError (shared) + 403 status label in error-handler
affects:
  - el-templo-api/src/modules/programs/routes.ts
  - el-templo-api/src/modules/programs/service.ts
  - el-templo-api/src/modules/programs/types.ts
  - el-templo-api/src/modules/shared/errors.ts
  - el-templo-api/src/modules/shared/error-handler.ts
  - el-templo-api/test/programs/current-program.test.ts
tech-stack:
  added: []
  patterns:
    - Closed Fastify JSON Schemas for request body + response shape
    - Service throws AppError subclasses; handleServiceError maps to HTTP statuses
    - Single-message defense against id-enumeration ("no encontrada o no autorizada" covers both not-found and ownership-mismatch)
key-files:
  created:
    - el-templo-api/test/programs/current-program.test.ts
  modified:
    - el-templo-api/src/modules/programs/routes.ts
    - el-templo-api/src/modules/programs/service.ts
    - el-templo-api/src/modules/programs/types.ts
    - el-templo-api/src/modules/shared/errors.ts
    - el-templo-api/src/modules/shared/error-handler.ts
decisions:
  - Use ForbiddenError (new 403 class added to shared/errors) for all R6 validation failures — ownership, status='active', presencial-required.
  - Single shared message "Inscripcion no encontrada o no autorizada" for both not-found and cross-user ownership-mismatch cases (security: avoids enumerating other users' enrollment IDs).
  - Pointer staleness handling in getCurrentProgram returns null/null + warn-log instead of throwing — defensive fallback for the case where users.current_program_enrollment_id outlives the enrollment (FK is ON DELETE SET NULL but cross-user / status='cancelled' drift is still possible).
  - Templo-view payload (enrollmentId=null) accepted when the user has an active OR paused presencial subscription (matching the existing dual-subscription rules in subscriptions/service.ts).
  - /members/me/enrollments endpoint moved from Plan 05 into Plan 04 per checker BLOCKER #2 — wave 2 owns the API surface, wave 3 stays frontend-only. Plan 05's files_modified should be trimmed of API files.
metrics:
  duration: ~23 min
  tasks_completed: 3
  files_changed: 6
  completed_date: 2026-04-27
---

# Phase 104 Plan 04: Current-program endpoints (R6) + enrollments listing — Summary

One-liner: Three new authenticated member endpoints (`GET`/`PUT /api/members/me/current-program`, `GET /api/members/me/enrollments`) plus three matching service methods give the member app the read/write pointer for "which program am I viewing right now" with full ownership / status / presencial validation, and a thin id-ASC listing that the Plan 05 selector consumes.

## What was built

### Service layer (`el-templo-api/src/modules/programs/service.ts`)

- **`getCurrentProgram(userId)`** — Reads `users.current_program_enrollment_id`; if set, joins `program_enrollments` + `programs` to return `{ enrollmentId, program: { id, name, goalPlanType, durationWeeks, currentWeek } }`. If the pointer is unset OR stale (deleted enrollment / cross-user / non-active), returns `{ enrollmentId: null, program: null }` and emits a `warn`-level log — staleness is a recoverable data-integrity signal, not an error.
- **`setCurrentProgram(userId, enrollmentId)`**:
  - `enrollmentId === null` ("Templo view") — only valid when the user has an active OR paused subscription with `plan_category='presencial'`. Otherwise `ForbiddenError("Solo usuarios con plan presencial activo pueden ver el Templo")`.
  - non-null — must (a) exist, (b) be owned by `userId`, (c) be `status='active'`. Not-found and ownership-mismatch both throw `ForbiddenError("Inscripcion no encontrada o no autorizada")` (same message — security: id enumeration). Status mismatch throws `ForbiddenError("La inscripcion no esta activa")`.
  - On success: writes the column, then calls `getCurrentProgram` to return the freshly-resolved shape.
- **`listMyActiveEnrollments(userId)`** — Inner-joins `program_enrollments` + `programs`, filters `status='active'`, orders by `program_enrollments.id ASC`. Returns `{ enrollments: EnrollmentSummary[] }` (empty array if none). Used by the Plan 05 program-selector bottom sheet.

### Types (`el-templo-api/src/modules/programs/types.ts`)

Three new exported interfaces:

```typescript
interface CurrentProgramResponse {
  enrollmentId: number | null;
  program: {
    id: number;
    name: string;
    goalPlanType: string | null;
    durationWeeks: number | null;
    currentWeek: number;
  } | null;
}

interface EnrollmentSummary {
  id: number;
  programId: number;
  programName: string;
  goalPlanType: string | null;
  currentWeek: number;
  durationWeeks: number | null;
}

interface EnrollmentsListResponse {
  enrollments: EnrollmentSummary[];
}
```

### Routes (`el-templo-api/src/modules/programs/routes.ts`)

Three handlers added at the bottom of the existing programs plugin (registered with prefix `/api`, so the URLs are `/api/members/me/...`):

- `GET /members/me/current-program` — auth-gated; delegates to `getCurrentProgram`; 200/200.
- `PUT /members/me/current-program` — auth-gated; closed body schema (`required: ["enrollmentId"]`, `additionalProperties: false`, `enrollmentId: type: ["integer", "null"]`); response schemas declared for 200 + 403; delegates to `setCurrentProgram`.
- `GET /members/me/enrollments` — auth-gated; delegates to `listMyActiveEnrollments`.

All three use the existing `handleServiceError` helper, which maps `AppError` subclasses to their `statusCode` and emits `{ error, message }` shape.

### Error infrastructure

- New **`ForbiddenError`** class added to `el-templo-api/src/modules/shared/errors.ts` (extends `AppError`, statusCode=403, default message "Acceso denegado").
- New 403 → "Acceso denegado" entry added to the `STATUS_LABELS` map in `el-templo-api/src/modules/shared/error-handler.ts` so the response `error` field is human-readable.

### Tests (`el-templo-api/test/programs/current-program.test.ts`)

10 integration tests in a fresh `test/programs/` subdirectory, all passing (verified by both isolated `pnpm test test/programs/current-program.test.ts` and the combined `pnpm test test/programs.test.ts test/programs/current-program.test.ts` run — 26/26 across both files):

| #   | Scenario                                                                               | Expected                                                           |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | GET initial state, no pointer set                                                      | 200 + `{ enrollmentId: null, program: null }`                      |
| 2   | PUT valid own active enrollment + GET round-trip + DB pointer assertion                | 200 + populated body + DB column equals enrollmentId               |
| 3   | PUT another user's enrollment                                                          | 403 + `/no encontrada o no autorizada/i`; B's pointer remains NULL |
| 4   | PUT cancelled enrollment                                                               | 403 + `/no esta activa/i`                                          |
| 5a  | PUT null without presencial                                                            | 403 + `/plan presencial/i`                                         |
| 5b  | PUT null WITH presencial (after pre-populating pointer)                                | 200 + null/null + DB column NULL                                   |
| 6   | PUT wrong-typed enrollmentId                                                           | 400 (Fastify schema validator)                                     |
| 6b  | PUT extra properties silently stripped                                                 | 200 + valid enrollmentId still applied                             |
| 7   | GET /enrollments lists active id ASC, excludes cancelled, full EnrollmentSummary shape | 200 + length 2, ordered, exact shape match for both rows           |
| 8   | GET /enrollments empty for user without enrollments                                    | 200 + `{ enrollments: [] }`                                        |

## Commits

| Task | Commit     | Message                                                                                         |
| ---- | ---------- | ----------------------------------------------------------------------------------------------- |
| 1    | `58f8d8b1` | feat(104-04): add getCurrentProgram, setCurrentProgram, listMyActiveEnrollments service methods |
| 2    | `f519f0c3` | feat(104-04): add GET/PUT /members/me/current-program and GET /members/me/enrollments routes    |
| 3    | `1b3fd74c` | test(104-04): integration tests for /members/me/current-program and /enrollments                |

## Verification results

- `pnpm build` (tsc): no NEW errors in any file modified by this plan. Pre-existing errors in `sessions/routes.ts` and `subscriptions/service.ts` (introduced by concurrent Plans 02/03 work) logged to `deferred-items.md`; out of Plan 04 scope.
- `pnpm test test/programs/current-program.test.ts` — 10/10 passing.
- `pnpm test test/programs.test.ts test/programs/current-program.test.ts` — 26/26 passing (no regression in the existing programs suite).
- `pnpm test` (full suite) — many parallel-DB-provisioning failures with "Unknown database 'eltemplo_test_4'" message; this is a pre-existing flake (see master commit `3aaba08c "ci: retrigger master build (flaky test isolation)"`) unrelated to Plan 04 changes; targeted plan tests pass deterministically.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 - Blocking] `ForbiddenError` class did not exist**

- **Found during:** Task 1
- **Issue:** Plan instructed to throw `ForbiddenError` but only `NotFoundError`, `ValidationError`, `BadRequestError`, `ConflictError` existed in `shared/errors.ts`. Without the class, the service couldn't compile.
- **Fix:** Added `export class ForbiddenError extends AppError` (statusCode 403) plus matching label in `STATUS_LABELS` so `handleServiceError` emits `{ error: "Acceso denegado", message: "..." }` for 403s.
- **Files modified:** `el-templo-api/src/modules/shared/errors.ts`, `el-templo-api/src/modules/shared/error-handler.ts`
- **Commit:** `58f8d8b1`

**2. [Rule 3 - Plan vs reality] `additionalProperties: false` does NOT yield 400 under Fastify default Ajv**

- **Found during:** Task 3 (test execution)
- **Issue:** Plan acceptance criterion #6 expected `PUT { enrollmentId, garbage: 1 }` to return 400. Fastify's default Ajv config (verified project-wide — see `test/scheduling/trials.test.ts:1116` comment block) STRIPS unknown properties silently rather than rejecting them, so the body becomes `{ enrollmentId }` and the request succeeds with 200.
- **Fix:** Replaced the single failing test with two complementary tests: (a) wrong-typed `enrollmentId` ("not-a-number" string) → asserts 400 from the validator; (b) extra-property body → asserts 200 + valid id still applied (documents project-standard behavior). The route schema retains `additionalProperties: false` since Ajv's default `removeAdditional` mode honors it for stripping.
- **Files modified:** `el-templo-api/test/programs/current-program.test.ts`
- **Commit:** `1b3fd74c`

**3. [Rule 3 - Plan vs reality] Test acceptance regex assumed `body.error` carries the Spanish message**

- **Found during:** Task 3 (test design)
- **Issue:** Plan stated `body.error matches /no encontrada o no autorizada/i` etc. But `handleServiceError` returns `{ error: <generic label like "Acceso denegado">, message: <actual Spanish message> }`. Matching against `body.error` would never match the message regex.
- **Fix:** Tests assert on `body.message` instead of `body.error` for the regex matches. The shared label still appears in `body.error` and could be asserted separately if needed.
- **Files modified:** `el-templo-api/test/programs/current-program.test.ts`
- **Commit:** `1b3fd74c`

### Cross-wave move (already documented in plan)

- `/members/me/enrollments` originally lived in Plan 05 but was moved into Plan 04 per checker BLOCKER #2. Wave 2 owns the API surface; wave 3 stays frontend-only. Plan 05's `files_modified` should be trimmed of any API/service/types files; only the Vue/Pinia files remain there.

## Authentication gates

None — all three endpoints sit behind the existing `fastify.authenticate` plugin, no new auth surface introduced.

## Known Stubs

None.

## Threat Flags

None — endpoints use established auth + service-layer ownership checks. No new trust boundaries; the `getCurrentProgram` defensive ownership re-check on read is an additional belt-and-suspenders guard that matches the plan's `<threat_model>` framing.

## Self-Check: PASSED

- File `el-templo-api/test/programs/current-program.test.ts` — FOUND
- Service methods in `el-templo-api/src/modules/programs/service.ts` — FOUND (`getCurrentProgram`, `setCurrentProgram`, `listMyActiveEnrollments`)
- Routes in `el-templo-api/src/modules/programs/routes.ts` — FOUND (3 handlers, paths `/members/me/current-program` x2 + `/members/me/enrollments` x1)
- Types in `el-templo-api/src/modules/programs/types.ts` — FOUND (3 new interfaces)
- `ForbiddenError` in `el-templo-api/src/modules/shared/errors.ts` — FOUND
- 403 label in `el-templo-api/src/modules/shared/error-handler.ts` — FOUND
- Commit `58f8d8b1` — FOUND
- Commit `f519f0c3` — FOUND
- Commit `1b3fd74c` — FOUND

---
phase: 104
plan: 03
subsystem: sessions / gating
tags: [api, gating, view-resolution, anti-piracy, R7, R8]
requires:
  - users.current_program_enrollment_id (Plan 01)
  - subscription_plans.planCategory='presencial' (existing)
  - program_enrollments.status (existing)
provides:
  - resolveSessionView(db, userId, requested) helper in sessions/routes.ts
  - GET /api/sessions/weekly?view=templo|program with 403/404 gating + view echo
  - GET /api/sessions/daily?view=templo|program with 403/404 gating + view echo
  - 8 integration tests covering all R7 + R8 acceptance scenarios
affects:
  - el-templo-api/src/modules/sessions/routes.ts
  - el-templo-api/src/modules/sessions/schemas.ts
  - el-templo-api/test/sessions/sessions.test.ts (presencial fixture)
  - el-templo-api/test/sessions/sessions-gating.test.ts (new)
tech-stack:
  added: []
  patterns:
    - Discriminated-union return type for view resolution (templo / program / deny)
    - Sibling (flat) shape for new response field — minimizes consumer breakage
    - Direct DB inserts in tests to bypass service-layer side effects
key-files:
  created:
    - el-templo-api/test/sessions/sessions-gating.test.ts
  modified:
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/src/modules/sessions/schemas.ts
    - el-templo-api/test/sessions/sessions.test.ts
decisions:
  - Daily response: chose flat sibling shape (`{...sessionResponseSchema.properties, view}`) over a nested wrapper. Existing clients destructuring `dayId`/`blocks`/etc. continue to work; only the new `view` field is additive.
  - Weekly response: `view` added as a sibling of `sessions`/`completedDates` (already a wrapper object — natural fit).
  - Foundation programs (`programs.goalPlanType IS NULL`) keep building W* dayIds even when resolved view is "program" — preserves Phase 83 D-08 behavior. The resolver still returns `{kind: "program"}` so `view` correctly echoes "program" but the dayId branch is W*.
  - Active OR paused presencial subscriptions both grant Templo access — consistent with subscription state machine (paused members retain plan access).
  - Default view fallback order (no `view` param): currentProgramEnrollmentId valid → program; presencial active → templo; first active enrollment by id ASC → program; else 404.
  - 403 reserved for "denied" (gate failed); 404 reserved for "no view possible" or "no current program selected" (R10 SPEC).
  - Test seed: `sessions.test.ts` shared member must now have a presencial subscription so the original Templo-style tests still resolve to W* dayIds. Added directly via `app.db.insert` in `beforeAll`.
metrics:
  duration: ~50 min (including infra debugging)
  tasks_completed: 3
  files_changed: 4 (3 modified + 1 new)
  completed_date: 2026-04-27
---

# Phase 104 Plan 03: Sessions gating + view resolution — Summary

One-liner: Replaces implicit Templo/program switching in `/sessions/weekly` and `/sessions/daily` with explicit `resolveSessionView` ownership gating, an optional `view=templo|program` query param, and a `view` echo in the response — implementing R7 (anti-piracy gating) and R8 (decoupled client view choice).

## What was built

### Schemas (`sessions/schemas.ts`) — UNCONDITIONAL edits

- Added `view: { type: "string", enum: ["templo", "program"] }` to both `getDailySessionSchema.querystring.properties` and `getWeeklySessionsSchema.querystring.properties` (optional — not added to `required`).
- Added `view?: "templo" | "program"` to `GetDailySessionInput` and `GetWeeklySessionsInput`.
- Added `view` field to `dailySessionResponse.200` (flat sibling shape via `...sessionResponseSchema.properties` spread + `view` field) and `weeklySessionsResponse.200` (sibling of `sessions`/`completedDates`).
- Added `403: errorResponseSchema` and `404: errorResponseSchema` to both response definitions.

**additionalProperties policy note:** The current schemas in `sessions/schemas.ts` do NOT use `additionalProperties: false` on response roots. Schema edits were applied UNCONDITIONALLY per checker-driven contract — adding `view` to both querystring and response in all cases regardless of policy. Documented here per Plan 03 output requirement.

### Helper (`sessions/routes.ts`)

`resolveSessionView(db, userId, requested)` — new private helper near top of file, before `sessionRoutes` plugin export. Returns a discriminated union:

```ts
| { kind: "templo" }
| { kind: "program"; enrollment: { id, programId, goalPlanType: string | null } }
| { kind: "deny"; status: 403 | 404; message: string }
```

Encodes the full R8 algorithm: presencial sub probe → `users.current_program_enrollment_id` lookup → enrollment ownership/active validation → fall-through ladder (current program → templo → first enrollment by id ASC → 404). Uses `import type { MySql2Database } from "drizzle-orm/mysql2"` for the typed `db` parameter (rather than referencing a non-existent `Database` export from `../../db`).

Spanish error messages used verbatim:

- 403 templo gate: `"Necesitas un plan presencial activo para ver las sesiones del Templo"`
- 403 program gate: `"Necesitas estar inscripto en un programa para ver estas sesiones"`
- 404 no current program: `"No tenes un programa activo seleccionado"`
- 404 no view available: `"No hay vista disponible para tu cuenta"`

### Handler refactors (`sessions/routes.ts`)

Both `/weekly` (lines 442+) and `/daily` (lines 360+) now:

1. Look up the user's level (existing).
2. Call `await resolveSessionView(fastify.db, userId, request.query.view)`.
3. On `kind === "deny"` → return matching status + Spanish message.
4. Compute `buildAsTemplo = templo OR (program with goalPlanType=null)` → preserves Phase 83 Foundation behavior of using W\* dayIds even when the resolved view is "program".
5. Build dayId per the branch (`GP-{type}-W*` only when `!buildAsTemplo && goalPlanType`).
6. Echo `view: viewResult.kind` in the response (sibling field).

The previous implicit enrollment lookup in `/weekly` (lines 266-281 of the original) was removed — `resolveSessionView` is the single source of truth for the user's view ownership.

### Tests (`test/sessions/sessions-gating.test.ts`) — 8 cases, all passing

| #   | Scenario                                                            | Expect                                                              |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | online-only user + `?view=templo`                                   | 403, body.error matches /plan presencial/i                          |
| 2   | no enrollment + `?view=program`                                     | 404, body.error matches /programa activo seleccionado/i             |
| 3   | presencial user + `?view=templo`                                    | 200, body.view='templo', dayId 'W1-martes-alfa'                     |
| 4   | active GP enrollment + currentProgramEnrollmentId + `?view=program` | 200, body.view='program', dayId 'GP-piernas_gluteos-W1-martes-alfa' |
| 5   | presencial only, no view param                                      | 200, body.view='templo'                                             |
| 6   | presencial + currentProgramEnrollmentId set, no view param          | 200, body.view='program' (program wins default)                     |
| 7   | stale (cancelled) enrollment pointer, no presencial, no view param  | 404, /no hay vista disponible/i                                     |
| 8   | daily smoke: online-only + `?view=templo` on /daily                 | 403, /plan presencial/i                                             |

### Test fixture update (`test/sessions/sessions.test.ts`)

Added a presencial subscription seed in `beforeAll` for the shared `session-member@test.com` user. Without it, Phase 104 R7 gating would change every existing test's outcome from 200 to 404 (member with no plan and no enrollment now correctly falls through to "no view available"). The seed inserts a `flex` / `flexible` / `presencial` plan and an active subscription — minimal change to keep prior assertions valid.

## Commits

| Task | Commit     | Message                                                                               |
| ---- | ---------- | ------------------------------------------------------------------------------------- |
| 1    | `f5c22b25` | feat(104-03): add view query/response + resolveSessionView gating to /sessions/weekly |
| 2    | `4cbc9283` | feat(104-03): apply resolveSessionView gating to /sessions/daily                      |
| 3    | `053e36b7` | test(104-03): integration tests for sessions gating (R7 + R8)                         |

## Verification

- `pnpm build` (tsc) — clean, no errors.
- `VITEST_POOL_ID=99 pnpm test test/sessions/sessions-gating.test.ts` — 8/8 passing.
- 4-grep contracts:
  - `grep -c '"view"' el-templo-api/src/modules/sessions/schemas.ts` returns ≥ 4 ✓ (4 occurrences: querystring×2 + response×2).
  - `grep -n 'resolveSessionView' el-templo-api/src/modules/sessions/routes.ts` returns 3 matches (definition + 2 handler call sites).

**Concurrent vitest pollution:** During Task 3 verification I observed parallel vitest processes (from concurrent orchestrator agents running other plans) writing to the same `eltemplo_test_<N>` databases, intermittently truncating the migration loop mid-flight. Setting `VITEST_POOL_ID=99` isolates the test DB and produces a deterministic pass. This is a workspace-level test infrastructure concern; my plan does not modify the provisioner.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `Database` type not exported from `../../db`**

- **Found during:** Task 1 helper definition.
- **Issue:** Plan instructed using `db: typeof fastify.db` or referencing a `Database` type. The codebase exports no such type from `el-templo-api/src/db/index.ts`. The `fastify.db` decoration uses `MySql2Database<typeof schema>` (declared in `plugins/database.ts`).
- **Fix:** Imported `MySql2Database` directly from `drizzle-orm/mysql2` and typed the helper parameter as `MySql2Database<typeof schema>`. Matches the actual decoration type at the boundary.
- **Files modified:** `el-templo-api/src/modules/sessions/routes.ts`
- **Commit:** `f5c22b25`

**2. [Rule 3 - Test regression caused by R7 gating] `sessions.test.ts` member needed presencial subscription**

- **Found during:** Task 1 — verifying no regression.
- **Issue:** `test/sessions/sessions.test.ts` registers a freemium member and expects 200 from `/sessions/weekly`. Under R7 gating that user would hit the new 404 ("No hay vista disponible para tu cuenta") path because they have no presencial plan and no enrollment. This is the deliberate behavior change R7 introduces, but it would have broken 5+ pre-existing tests including R3 and R10 acceptance proofs.
- **Fix:** Added a minimal presencial subscription seed to the existing `beforeAll` so the shared member retains Templo access. Implemented via direct `app.db.insert` (no service-layer side effects).
- **Files modified:** `el-templo-api/test/sessions/sessions.test.ts`
- **Commit:** `f5c22b25` (bundled with Task 1).

## Authentication Gates

None — no auth flow changes.

## Known Stubs

None.

## Threat Flags

None — gating is a pure restriction, no new attack surface introduced. The new query parameter `view` is enum-validated by Fastify schema (rejecting any value other than `templo` or `program`).

## Self-Check: PASSED

- File `el-templo-api/test/sessions/sessions-gating.test.ts` — FOUND
- File `el-templo-api/src/modules/sessions/routes.ts` — FOUND (with `resolveSessionView` helper and 2 handler call sites)
- File `el-templo-api/src/modules/sessions/schemas.ts` — FOUND (with 4 `"view"` occurrences)
- Commit `f5c22b25` — FOUND
- Commit `4cbc9283` — FOUND
- Commit `053e36b7` — FOUND

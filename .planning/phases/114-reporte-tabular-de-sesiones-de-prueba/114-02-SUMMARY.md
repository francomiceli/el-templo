---
phase: 114
plan: 02
subsystem: api/members
tags: [trial, lead-lifecycle, audit, security, d-31]
requires:
  - users.lead_status enum column (Plan 01)
  - users.created_by int self-ref FK (Plan 01)
provides:
  - createTrialMember service writes lead_status='en_seguimiento' on insert
  - createTrialMember service writes created_by=<JWT admin id> on insert
  - POST /api/admin/members/trial route forwards request.user.userId as createdBy
  - Spoofing guard: client-supplied createdBy in body is stripped (additionalProperties:false + Fastify default removeAdditional)
affects:
  - el-templo-api/src/modules/members/types.ts
  - el-templo-api/src/modules/members/service.ts
  - el-templo-api/src/modules/members/routes.ts
  - el-templo-api/test/members/members-trial.test.ts
tech-stack:
  added:
    - none (no new packages)
  patterns:
    - Service-layer-only input type extending the public request type with JWT-sourced fields (CreateTrialMemberServiceInput extends CreateTrialMemberInput)
    - Route handler builds the service payload by spreading the validated body and adding the trusted JWT-derived field (createdBy: request.user.userId)
    - additionalProperties:false on the request schema as the spoofing guard (Fastify default AJV strips unknown keys)
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/test/members/members-trial.test.ts
decisions:
  - "D-31 implemented as locked: createdBy crosses the route→service boundary via a service-layer-only input type, never via the public request schema."
  - "Spoofing mitigation: rather than 400-ing on extra body fields, Fastify's default AJV strips them (removeAdditional=true). Net effect on T-114-02-01 is identical — the spoofed value never reaches storage — and matches the project's existing test idiom for this endpoint (sibling test at members-trial.test.ts:179-197 has documented this behavior since Plan 102)."
  - "Extended the existing test/members/members-trial.test.ts rather than creating a parallel test/members-trial.test.ts. Keeps all trial-creation contract assertions in one place; avoids duplicate beforeAll/beforeEach scaffolding and the risk of drift between two near-identical files."
metrics:
  tasks_completed: 3
  files_modified: 4
  files_created: 0
  completed_date: 2026-05-12
---

# Phase 114 Plan 02: Members trial hook — createdBy + lead_status='en_seguimiento' Summary

Wires the lead lifecycle bookkeeping for trial creation. `POST /api/admin/members/trial` now stamps the new user row with `lead_status='en_seguimiento'` (the only valid initial state for an admin-created trial) and `created_by=<request.user.userId>` (the JWT-authenticated admin). The HTTP body remains the 4 receptionist fields; `createdBy` is sourced server-side and never trusts the client.

## Tasks Completed

| Task | Name                                                                 | Commit   | Files                                                                                    |
| ---- | -------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| T1   | Extend service signature + insert with createdBy + lead_status       | 19acb309 | el-templo-api/src/modules/members/types.ts, el-templo-api/src/modules/members/service.ts |
| T2   | Route handler injects request.user.userId as createdBy               | b1b8ba32 | el-templo-api/src/modules/members/routes.ts                                              |
| T3   | Integration test — trial creation populates lead_status + created_by | e3e07214 | el-templo-api/test/members/members-trial.test.ts                                         |

## Call-site Audit (per <output> directive)

`grep -rn "createTrialMember" el-templo-api/src` finds exactly **one** production call site:

- `el-templo-api/src/modules/members/routes.ts:599` — `POST /api/admin/members/trial` handler (updated in T2).

No other modules invoke `createTrialMember`. The type renaming from `CreateTrialMemberInput` → `CreateTrialMemberServiceInput` on the service parameter therefore touches only the one route. The public `CreateTrialMemberInput` type stays exported and is still referenced as the HTTP body shape by the route's `Body` generic.

## Schema-level Spoofing Guard (per <output> directive)

`createTrialMemberSchema.body.additionalProperties` remains `false` (`el-templo-api/src/modules/members/schemas.ts:199`). Fastify's default AJV configuration is `removeAdditional: true` for body validation, so unknown keys are silently stripped before the handler runs — the route handler's `request.body` is provably free of `createdBy`. T3's "ignores client-supplied createdBy" test verifies this end-to-end (posts `{...basePayload, createdBy: 999999}` and asserts the DB row has `created_by = <admin id>`, not 999999).

## Deviations from Plan

### 1. [Rule 1 — Bug in plan] Test 2 asserts strip-behavior, not 400

- **Found during:** Task 3 setup.
- **Issue:** The plan's Test 2 acceptance criterion states `additionalProperties:false` returns 400 on extra fields. In Fastify's default AJV configuration (used by this project — verified by reading `src/app.ts`, no custom AJV options), `additionalProperties:false` combined with the default `removeAdditional: true` **strips** unknown keys instead of 400-ing. The sibling test in the same file (`silently strips extra fields (closed schema removes them)` at line 179) documented this behavior for the same endpoint as of Plan 102.
- **Fix:** Test asserts that the spoofed `createdBy: 999999` results in `201` and the DB row's `created_by` equals the JWT admin id (not 999999). Functionally identical mitigation for T-114-02-01 — the spoofed value never reaches storage — and matches existing project idiom.
- **Files modified:** `el-templo-api/test/members/members-trial.test.ts`
- **Commit:** `e3e07214`

### 2. [Rule 3 — File location] Test file lives at test/members/, not test/

- **Found during:** Task 3 setup.
- **Issue:** The plan prescribed creating `el-templo-api/test/members-trial.test.ts`. An existing test file with the same intent already lives at `el-templo-api/test/members/members-trial.test.ts` (added by Plan 102 / Plan 111 for the soft-register endpoint). Creating a parallel file would split the trial-endpoint test suite across two files, duplicating `beforeAll`/`beforeEach` scaffolding and risking drift.
- **Fix:** Extended the existing `test/members/members-trial.test.ts` with the two new D-31 assertions. All 10 tests (8 pre-existing + 2 new) pass.
- **Files modified:** `el-templo-api/test/members/members-trial.test.ts`
- **Commit:** `e3e07214`

## Test Results

- `pnpm test test/members/members-trial.test.ts` → 10 tests, 10 passed. New tests:
  - "sets lead_status='en_seguimiento' and created_by from JWT"
  - "ignores client-supplied createdBy (additionalProperties strips it)"
- `pnpm exec tsc --noEmit` → exit 0, no errors.

## Acceptance Criteria Verification

| Criterion                                                                      | Result                                                                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `CreateTrialMemberServiceInput` exported once in types.ts                      | PASS (`grep -c` = 1)                                                                                     |
| `CreateTrialMemberServiceInput` ≥ 1 occurrence in service.ts (import + param)  | PASS (`grep -c` = 2)                                                                                     |
| `leadStatus.*en_seguimiento` exactly 1 in service.ts inside createTrialMember  | PASS (`grep -c` = 1)                                                                                     |
| `createdBy: input.createdBy` exactly 1 in service.ts                           | PASS (`grep -c` = 1)                                                                                     |
| `createdBy: request.user.userId` exactly 1 in routes.ts                        | PASS (`grep -c` = 1)                                                                                     |
| `additionalProperties` still present in schemas.ts (≥ 2 across closed schemas) | PASS (4 occurrences across createTrial / updateMember / checkDuplicates / session-levels closed schemas) |
| `pnpm exec tsc --noEmit` clean                                                 | PASS                                                                                                     |
| `pnpm test test/members/members-trial.test.ts` returns 0                       | PASS (10/10)                                                                                             |
| No `any` types in test file                                                    | PASS                                                                                                     |
| No `console.*` in test file                                                    | PASS                                                                                                     |

## Threat Model Verification (per plan's threat_model)

| Threat ID   | Mitigation                                                                                                                                                           | Status                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| T-114-02-01 | `additionalProperties: false` on createTrialMemberSchema → Fastify default removeAdditional strips spoofed `createdBy` → service receives only the JWT-derived value | MITIGATED (test verifies) |
| T-114-02-02 | createdBy is the JWT-authenticated user; no other user data leaks                                                                                                    | ACCEPTED                  |
| T-114-02-03 | `created_by` FK is the audit trail; no separate audit log row needed per D-30                                                                                        | ACCEPTED                  |

## Downstream Unblocked

- **Plan 114-03:** Subscription create hook can flip `lead_status` from `'en_seguimiento'` → `'cerrado'` on conversion. The starting state is now guaranteed populated.
- **Plan 114-04:** PATCH `/api/admin/leads/:userId` can mutate `lead_status` + `lead_notes` against rows that already have the lifecycle initialized.
- **Plan 114-05:** Reports can join `users` → `users` self-ref on `created_by` to render the "creador" column for every trial captured from this commit onwards.

## Self-Check: PASSED

- File `el-templo-api/src/modules/members/types.ts` contains `export interface CreateTrialMemberServiceInput` (line ~133+).
- File `el-templo-api/src/modules/members/service.ts` imports `CreateTrialMemberServiceInput`, uses it as `createTrialMember` param, and inserts `leadStatus: "en_seguimiento" as const, createdBy: input.createdBy`.
- File `el-templo-api/src/modules/members/routes.ts` line 600 area contains `createdBy: request.user.userId`.
- File `el-templo-api/test/members/members-trial.test.ts` contains the two new D-31 tests.
- Commits `19acb309`, `b1b8ba32`, `e3e07214` present in `git log --oneline -5`.
- `pnpm exec tsc --noEmit` clean.
- `pnpm test test/members/members-trial.test.ts` → 10/10 pass.

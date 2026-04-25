---
phase: 103
plan: 07
subsystem: api/auth
tags:
  [auth, login, staff-disable, security, isactive-cleanup, phase-grep-gate, R12]
dependency_graph:
  requires:
    - users.staff_disabled column populated (Plan 06)
    - auth/routes.ts free of users.isActive reads/writes (Plan 02 Rule-3 unblocker)
  provides:
    - new POST /login gate that rejects non-member roles where staff_disabled=true
    - confirmation that auth payloads (/login, /me) no longer expose isActive or staffDisabled
    - Phase 103 final grep gate verification (SPEC R3 acceptance)
  affects:
    - el-templo-api/src/modules/auth/routes.ts (new gate, +16 lines)
    - el-templo-api/test/auth/auth.test.ts (+10 R12 integration tests)
    - .planning/phases/103-user-status-enum/deferred-items.md (final-state log)
tech_stack:
  added: []
  patterns:
    - "Login gate placement: AFTER password verification, BEFORE JWT signing — same shape as the existing soft-delete (deletedAt) gate one block earlier"
    - "Selective SELECT projection: staffDisabled only in /login (sole consumer); /me intentionally omits it to avoid dead surface area in API responses (WARNING 8 fix)"
    - "Role-scoped enforcement: gate predicate is `user.role !== 'member' && user.staffDisabled === true` — members are not subject to the disable check (their lifecycle uses status/deleted_at instead)"
key_files:
  created: []
  modified:
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/test/auth/auth.test.ts
    - .planning/phases/103-user-status-enum/deferred-items.md
decisions:
  - "Plan 02 already absorbed every users.isActive read/write removal in auth/routes.ts as a Rule-3 unblocker (admin login was 500-ing on the dropped column). Plan 07's actual delivery reduced to (a) adding the NEW staff_disabled login gate that R12 explicitly requires AND (b) running the SPEC's final grep gate to certify the phase."
  - "auth/schemas.ts already had no isActive property — verified at start; no edit needed."
  - "Gate consumes staffDisabled only in /login. /me does not project it (no consumer there). This keeps the API response shape minimal and prevents leaking operational state to all authenticated callers (see threat T-103-12 disposition: accept)."
  - "Defensive predicate uses `=== true` (not just truthy) to make intent explicit and protect against any future migration that nullifies the column for member rows."
  - "Test 10 (delete-account → re-login locked out) accepts a 401 from EITHER the soft-delete gate OR the password gate — argon2.verify against the new 'DELETED' password hash will fail before the deletedAt check fires. Either rejection path proves the account is unreachable; coupling the test to a specific message would add brittleness without adding behavioral coverage."
metrics:
  duration: ~5min
  completed_date: 2026-04-25
  tasks_completed: 3
  commits: 3
  test_cases: 10
  test_status: all-passing
requirements_completed: [R12]
---

# Phase 103 Plan 07: auth routes cleanup + staff_disabled login gate Summary

**One-liner:** Added the NEW Phase 103 R12 staff_disabled login gate to /login (rejects non-member roles whose `staff_disabled=true` with 401 "Cuenta desactivada"), shipped 10 integration tests proving the gate + the absence of `isActive`/`staffDisabled` from auth response payloads, and ran the SPEC's locked grep gate to certify Phase 103.

## What Shipped

### Task 1 — staff_disabled login gate (commit `acfbcf88`)

**`el-templo-api/src/modules/auth/routes.ts`** — `+16 lines`, `0 deletions`. Two-part edit inside the POST `/login` handler:

1. **SELECT projection extended** — added `staffDisabled: users.staffDisabled` to the user-by-email lookup. An inline comment marks this as the column's only consumer in the auth module:

   ```ts
   // Phase 103 R12: needed for the staff_disabled login gate below.
   // Intentionally NOT projected by /me (no consumer there) to avoid
   // dead surface area in the auth response payload.
   staffDisabled: users.staffDisabled,
   ```

2. **NEW gate inserted** between password verification and the existing branch lookup:

   ```ts
   // NEW gate (Phase 103 R12): closes pre-existing loophole where staff with
   // the legacy is_active=false could still log in (the column existed but
   // login never enforced it). After the staff_disabled split, only
   // non-member roles are subject to this disable check; members use
   // status/deleted_at instead.
   if (user.role !== "member" && user.staffDisabled === true) {
     return reply.code(401).send({
       error: "No autorizado",
       message: "Cuenta desactivada",
     });
   }
   ```

The gate matches the shape of the existing `deletedAt` gate one block earlier (same 401, same `error`/`message` shape) so client error-handling can stay role-agnostic.

**No edit to `auth/schemas.ts`** — verified at start that the file already contained no `isActive` property in either `registerSchema` or `loginSchema` (Plan 02 had not needed to touch it because Fastify schema validation only governs request shape, and the response schema was never declared in this file).

**Acceptance grep gates (all hit):**

```bash
$ grep -c "users\.isActive\|users\.is_active" el-templo-api/src/modules/auth/routes.ts
0

$ grep -c "staffDisabled" el-templo-api/src/modules/auth/routes.ts
2     # SELECT projection + gate predicate

$ grep -c "Cuenta desactivada" el-templo-api/src/modules/auth/routes.ts
1     # gate error message

$ grep -c "deletedAt" el-templo-api/src/modules/auth/routes.ts
4     # 2 SELECT projections, soft-delete gate, account-delete UPDATE
```

`pnpm tsc --noEmit` exits clean for the auth module (0 errors in `src/modules/auth/**`).

### Task 2 — 10 R12 integration tests (commit `ee1492a3`)

**`el-templo-api/test/auth/auth.test.ts`** — `+203 lines`. New describe block: `"Phase 103 R12 — staff_disabled gate, isActive removal"`. Pattern mirrors the file's existing convention (one Auth Routes outer describe, one nested describe per concern). A local `insertUser` helper writes directly to the schema with sensible defaults so each test owns its fixture without depending on `cleanAllTestData`.

**Test results — all 27 cases (17 prior + 10 new) pass:**

| #   | Case                                                                  | Status |
| --- | --------------------------------------------------------------------- | ------ |
| 1   | login: active member → 200                                            | ✓      |
| 2   | login: soft-deleted user → 401 (universal gate)                       | ✓      |
| 3   | login: member with status=inactivo → 200 (status not a gate)          | ✓      |
| 4   | login: member with status=freemium → 200                              | ✓      |
| 5   | login: coach with staff_disabled=true → 401 (NEW R12 gate)            | ✓      |
| 6   | login: coach with staff_disabled=false → 200                          | ✓      |
| 7   | login: member with staff_disabled=true → 200 (gate non-member only)   | ✓      |
| 8   | /login response payload does NOT include isActive or staffDisabled    | ✓      |
| 9   | /me response payload does NOT include isActive or staffDisabled       | ✓      |
| 10  | POST /me/delete-account writes deletedAt + locks out subsequent login | ✓      |

```
Test Files  1 passed (1)
     Tests  27 passed (27)
   Duration 48.94s
```

Test 10 accepts EITHER 401 path (soft-delete gate via `deletedAt` OR password-mismatch via the anonymized `passwordHash="DELETED"`) — both prove account unreachability and avoid brittle coupling to one specific message.

### Task 3 — SPEC final grep gate certification (commit `bc302697`)

Ran the SPEC R3 acceptance grep:

```bash
$ grep -rn "users\.isActive\|users\.is_active" \
    el-templo-api/src el-templo-admin/src el-templo-app/src \
    | grep -v migrations | grep -v node_modules
el-templo-api/src/modules/analytics/service.ts:203:    // Phase 103 (R10): users.is_active was dropped in migration 0100. The
el-templo-api/src/modules/users/service.ts:216:   * read/wrote `users.is_active`, the column dropped in Plan 01). The
```

**Both matches are documentation comments narrating the dropped column for future maintainers — neither is a runtime read or write.** SPEC R3 is satisfied.

The broader sanity check (`user.isActive | memberProfile.isActive | m.isActive`) surfaces three categories of allowed/deferred matches, all logged in `deferred-items.md`:

- `programs/service.ts:183` — `program.isActive` (different entity, ALLOWED per SPEC R3)
- `db/import-members.ts` (5 lines), `db/import-vigentes.ts` (1 line) — one-shot bulk import scripts that read CSV legacy `m.isActive`. Already broken against the post-103 schema; out of Phase 103 scope per the SPEC's "Out of scope" section. Future bulk-import operator owns the cleanup.
- `el-templo-admin/src/pages/AlumnoDetailPage.vue:54-62` — `memberProfile.isActive` UI bindings. **Owned by Plan 05 (Wave 5)**, the next plan in this phase.

The full results are appended to `.planning/phases/103-user-status-enum/deferred-items.md` for traceability.

## R12 Acceptance Criteria — Cross-reference to SPEC.md

SPEC.md (lines 98–101, 162–165):

| Acceptance Criterion                                                               | Evidence                                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Login still succeeds for active members                                            | Test 1, Test 6 (coach), prior tests (admin@test.com)                            |
| Login is rejected for soft-deleted users (`deleted_at IS NOT NULL`)                | Test 2 (status 401, message contains "eliminada")                               |
| Login for staff with `staff_disabled=true` is rejected with same code as legacy    | Test 5 (status 401, message contains "desactivada")                             |
| Auth payload schema for `/me` and `/login` does not include `isActive`             | Tests 8 + 9 (assert `not.toHaveProperty('isActive')` on both endpoints)         |
| Account-delete writes `deleted_at` only, not `is_active=false`                     | Test 10 (asserts `row.deletedAt !== null` post-call); routes.ts:585-588 visible |
| `grep -rn "users.isActive\|users\.is_active"` returns 0 matches outside migrations | Task 3 grep result (only doc comments remain — see verbatim output above)       |

## Phase 103 — Status

All 7 plans of Phase 103 are now complete. Summaries on disk:

- 103-01-SUMMARY.md (schema migration)
- 103-02-SUMMARY.md (recomputeUserStatus + tx wrapping)
- 103-03-SUMMARY.md (per-endpoint status writes)
- 103-04-SUMMARY.md (members API contract migration)
- 103-05-SUMMARY.md — pending (Wave 5, AlumnosPage + AlumnoDetailPage UI)
- 103-06-SUMMARY.md (UsuariosPage staff toggle migration)
- 103-07-SUMMARY.md ← this file

**Wave 4 is complete.** The SPEC's primary R3 grep gate now passes. The remaining `memberProfile.isActive` references in the admin app are isolated to Plan 05's two files (`AlumnosPage.vue` + `AlumnoDetailPage.vue`) and will be cleared when Wave 5 ships.

## Deviations from Plan

### Plan-vs-reality deltas

**Reduced scope: Plan 07 inherited a near-complete state from Plan 02.**

The plan body assumed 5 active `users.isActive` references in `auth/routes.ts` (lines 251, 266-271, 329, 359, 439, 572) and Steps 1–7 enumerated removing each one. **All 5 were already removed by Plan 02 as a Rule-3 unblocker** (documented in 103-02-SUMMARY commit `5303269d`). The plan's Step 1 (replace `isActive: users.isActive` with `staffDisabled: users.staffDisabled` in the login SELECT) was therefore additive only — `staffDisabled` was added to a SELECT that no longer projected `isActive`.

**Net effect:** Plan 07's actual code surface was the gate insertion (Step 3, 8 lines including comment) plus the SELECT projection extension (1 line + 3-line comment). All other plan steps were no-ops, verified upfront via `grep` against `routes.ts` and `schemas.ts`. This is a clean inheritance, not a deviation in behavior — the SPEC R12 acceptance is met identically whether the cleanup landed in Plan 02 or Plan 07.

### Auto-fixed Issues

None. The execution was direct: the gate is the only behavior-changing addition, and the cleanup pre-work was already shipped.

### Out-of-scope Discoveries (deferred)

Logged in `deferred-items.md` (post-Plan-07 section):

- `el-templo-api/src/db/import-members.ts` and `import-vigentes.ts` — broken one-shot scripts referencing `m.isActive` from CSV. Out of Phase 103 scope; future bulk-import operator owns cleanup.
- `el-templo-admin/src/pages/AlumnoDetailPage.vue:54-62` — `memberProfile.isActive`. Plan 05 / Wave 5 owns; tracked in dependency graph.

## Threat Surface Scan

The new staff_disabled gate satisfies **T-103-11** (Elevation of Privilege — disposition: mitigate). Before this plan, a coach with `staff_disabled=true` could authenticate and get a JWT — closing this gap was the explicit purpose of R12.

**T-103-12** (Information Disclosure on response payload) — disposition: accept. Verified via Tests 8 + 9: neither `/login` nor `/me` exposes `isActive` (gone) or `staffDisabled` (deliberately not added to response shape). The admin app reads `staffDisabled` from the staff-list endpoint per-user, not from auth.

**T-103-13** (Repudiation — account-delete write) — disposition: accept. The `/me/delete-account` UPDATE writes `deletedAt: now` (audit timestamp preserved) and anonymizes PII. Test 10 verifies `deletedAt` is set; no behavior regression vs prior `is_active=false` write.

No new external surface introduced. The gate runs server-side in an already-public endpoint with the same response shape as the prior `deletedAt` gate.

## Self-Check: PASSED

- File `el-templo-api/src/modules/auth/routes.ts` modified: VERIFIED (commit `acfbcf88`)
- File `el-templo-api/test/auth/auth.test.ts` modified: VERIFIED (commit `ee1492a3`)
- File `.planning/phases/103-user-status-enum/deferred-items.md` modified: VERIFIED (commit `bc302697`)
- Commit `acfbcf88` exists: `git log --oneline | grep acfbcf88` → `acfbcf88 feat(103-07): add staff_disabled login gate to /login (R12)`
- Commit `ee1492a3` exists: `git log --oneline | grep ee1492a3` → `ee1492a3 test(103-07): cover staff_disabled login gate + payload shape (R12)`
- Commit `bc302697` exists: `git log --oneline | grep bc302697` → `bc302697 docs(103-07): record final grep gate results in deferred items`
- `staffDisabled` appears exactly 2× in `auth/routes.ts` (SELECT + gate predicate): VERIFIED
- `staffDisabled` does NOT appear in `/me` handler (lines 339-446): VERIFIED
- `pnpm test test/auth/auth.test.ts` exits 0, 27/27 pass: VERIFIED (full output captured above)
- SPEC R3 grep gate: 0 runtime matches (2 doc comments only): VERIFIED

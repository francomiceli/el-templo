---
phase: 110-admin-users-by-country-multi-branch-staff
plan: 06
subsystem: api/auth-and-permissions
tags:
  [
    branch-access,
    preHandler,
    requireBranchAccess,
    branches-endpoint,
    scope-filter,
    fastify,
    info-leak,
  ]
requires:
  - el-templo-api/src/modules/shared/branch-access.ts (Plan 03)
  - el-templo-api/src/modules/shared/country-scope.ts extended scope (Plan 03)
provides:
  - GET /admin/members/branches scope-filtered list (D-07/D-08/D-09)
  - requireBranchAccess preHandler wired into 21 admin endpoints across 6 modules
  - inline 403 body harmonization at 2 sites (members GET /:userId, finance POST /transactions)
  - module-level attachCountryScope on scheduling-admin + attendance-admin plugins
affects:
  - Plan 07 (integration tests can now assert 403 + BRANCH_OUT_OF_SCOPE on representative endpoints)
  - Frontend selectors (REQ-12 — auto-receive filtered list, no code change)
tech-stack:
  added: []
  patterns:
    - "Per-route requireBranchAccess registration (D-02 — explicit `from` declaration, no auto-detection)"
    - "Scope-filtered admin endpoint pattern (GET /admin/members/branches as the canonical seam)"
    - "Inline 403 harmonization to BRANCH_OUT_OF_SCOPE shape (Warning 2)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/attendance/routes.ts
    - el-templo-api/src/modules/reports/routes.ts
    - el-templo-api/src/modules/analytics/routes.ts
decisions:
  - "GET /admin/members/branches owner-without-?country= sees ALL branches (real + virtual). The handler reads the raw `request.query.country` to distinguish 'no toggle' from 'toggle=AR' since attachCountryScope already collapses owner toggle into scope.country."
  - "Members GET /:userId inline guard harmonized to 403 + BRANCH_OUT_OF_SCOPE per plan Warning 2, even though sibling routes (DELETE /:userId, financial-history, outstanding-concepts) intentionally return 404 for info-leak prevention. The plan explicitly requested 403 + code matching the new preHandler contract — flagged as a deferred consistency review for Phase 111+."
  - "Scheduling-admin and attendance-admin plugins did NOT have module-level attachCountryScope before Plan 06 — this was a Rule 3 blocker because requireBranchAccess reads request.scope. Added attachCountryScope to both module hooks (consistent with finance/reports/analytics/members)."
  - "Scheduling /trials route previously attached attachCountryScope per-route; refactored to rely on the new module-level attachment + standard requireBranchAccess preHandler."
metrics:
  duration: ~25m
  completed: 2026-04-30
  task_count: 3
  file_count: 6
  commit_count: 3
---

# Phase 110 Plan 06: Wire requireBranchAccess + scope-filter branches endpoint Summary

## One-liner

Plugged `requireBranchAccess({ from, optional? })` into 21 admin endpoints across 6 modules, rewrote `GET /admin/members/branches` to filter by `request.scope` (D-07/D-08/D-09), harmonized 2 inline 403 bodies to `BRANCH_OUT_OF_SCOPE` shape (Warning 2), and added missing `attachCountryScope` to scheduling-admin + attendance-admin plugins (Rule 3 blocking fix).

## Tasks Completed

| #   | Task                                                                                                                          | Commit     | Files                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Rewrite GET /admin/members/branches scope filter + apply requireBranchAccess to members endpoints + harmonize inline 403 body | `32bafaf3` | `el-templo-api/src/modules/members/routes.ts`                                                                                                     |
| 2   | Apply requireBranchAccess to finance + scheduling + attendance routes (+ Rule 3 module-hook fix)                              | `2d781a25` | `el-templo-api/src/modules/finance/routes.ts`, `el-templo-api/src/modules/scheduling/routes.ts`, `el-templo-api/src/modules/attendance/routes.ts` |
| 3   | Apply requireBranchAccess to reports + analytics routes                                                                       | `3f555dc3` | `el-templo-api/src/modules/reports/routes.ts`, `el-templo-api/src/modules/analytics/routes.ts`                                                    |

## Warning 7 Grep Pre-Step Results

Per the plan's Warning 7 requirement, the executor ran `grep -rn "branchId" <file>` for each route file before editing and reconciled output against the planner's interface table.

### `members/routes.ts`

Planner audit table:

- GET /admin/members/branches (line 119) — no branchId, rewrites response
- GET /admin/members/export (line 152) — query.branchId, optional
- GET /admin/members (line 226) — query.branchId, optional
- GET /admin/members/:userId (line 279) — branchId derived from row, NOT gated by preHandler (inline guard at 295-302)
- POST /admin/members (line 361) — body.branchId, required
- PUT /admin/members/:userId (line 460) — body.branchId, optional

Grep result (matches table): all 5 gated endpoints present with same semantics. Schema confirms `updateMemberSchema` includes `branchId: { type: "integer" }` so PUT body.branchId can be optional. No discrepancies.

Additional finding (NOT in audit but irrelevant for gating): line 295 inline guard returns **404** (info-leak prevention), not 403 as the plan describes. Preserved 404 status comment, harmonized response shape — see "Deviations" below.

### `finance/routes.ts`

Planner audit:

- POST transactions (line ~94) — body.branchId, required
- GET financial-summary (line 220) — query.branchId, optional
- GET transactions list (line 282) — query.branchId, optional
- GET other (line 335) — query.branchId, optional

Grep result:

- Line 102: `request.body.branchId` (POST /transactions) — gated.
- Line 178: `schema.financialTransactions.branchId` (inside void handler JOIN) — internal, not request payload.
- Lines 220 + 252: GET /transactions list — gated.
- Lines 282 + 303: GET /transactions/summary — gated.
- Lines 335 + 360: GET /transactions/export — gated.

The planner's "GET financial-summary" maps to the actual `/transactions/summary` route (line 280); naming differed but route is the same. No silent skips. Inline 403 body at lines 110-118 (Phase 98 D-03 belt-and-suspenders) harmonized to BRANCH_OUT_OF_SCOPE shape per Warning 2.

### `scheduling/routes.ts`

Planner audit:

- POST schedules (line 153) — body.branchId, required
- GET weekly grid (line 176) — query.branchId, optional
- POST schedules/seed (line 254) — body.branchId, required
- GET trials/eligible (line 327) — query.branchId, required (was "optional" in audit but Querystring type is non-optional)
- GET trials list (line 347) — query.branchId, optional
- GET member-weekly (line 452) — SKIP (member-app route)

Grep result: matches table. Line 487 (`schedulingService.getWeeklyGrid(branchId, ...)`) is inside the member-app `/weekly` handler — confirmed SKIP. Decision deviation: GET /trials/eligible Querystring declares `branchId: number` (non-optional), so applied `requireBranchAccess({ from: "query.branchId" })` with default optional=false. The audit table said "optional: true" — this is a divergence that the executor reconciled by following the actual type (which the schema enforces).

### `attendance/routes.ts`

Planner audit: POST force-checkin (line 78) — body.branchId, required. Grep: matches.

### `reports/routes.ts`

Planner audit: 7+ endpoints at lines 64, 93, 122, 143, 162, 195, 215, 243.

Grep result: **11 endpoints** with branchId — lines 64 (/access), 93 (/charges), 122 (/expiring), 143 (/inactive), 162 (/trial-conversion), 195 (/outstanding-balances), 243 (/access/export), 299 (/charges/export), 361 (/expiring/export), 415 (/inactive/export), 468 (/outstanding-balances/export). The audit's mention of "line 215" was inside the same `/outstanding-balances` handler (`request.scope.country` reference), not a separate route.

Discrepancy: 4 additional export endpoints (charges/export, expiring/export, inactive/export, outstanding-balances/export) at lines 299/361/415/468 surfaced beyond the audit. All match the same "owner-aggregate, optional" pattern, so all gated with `requireBranchAccess({ from: "query.branchId", optional: true })`. Final count: 11 calls to `requireBranchAccess(`.

### `analytics/routes.ts`

Planner audit: 4 endpoints at lines 42, 60, 78, 100. Grep result: matches exactly. 4 calls to `requireBranchAccess(`.

## Final Endpoint Table

| File                 | Route                            | from-location                         | optional |
| -------------------- | -------------------------------- | ------------------------------------- | -------- |
| members/routes.ts    | GET /admin/members/export        | query.branchId                        | true     |
| members/routes.ts    | GET /admin/members               | query.branchId                        | true     |
| members/routes.ts    | POST /admin/members              | body.branchId                         | false    |
| members/routes.ts    | PUT /admin/members/:userId       | body.branchId                         | true     |
| members/routes.ts    | GET /admin/members/:userId       | (inline guard, 403 + code harmonized) |
| finance/routes.ts    | POST /transactions               | body.branchId                         | false    |
| finance/routes.ts    | GET /transactions                | query.branchId                        | true     |
| finance/routes.ts    | GET /transactions/summary        | query.branchId                        | true     |
| finance/routes.ts    | GET /transactions/export         | query.branchId                        | true     |
| scheduling/routes.ts | POST /schedules                  | body.branchId                         | false    |
| scheduling/routes.ts | GET /schedules/weekly            | query.branchId                        | true     |
| scheduling/routes.ts | POST /schedules/seed             | body.branchId                         | false    |
| scheduling/routes.ts | GET /trials/eligible             | query.branchId                        | false    |
| scheduling/routes.ts | GET /trials                      | query.branchId                        | true     |
| attendance/routes.ts | POST /force                      | body.branchId                         | false    |
| reports/routes.ts    | GET /access                      | query.branchId                        | true     |
| reports/routes.ts    | GET /charges                     | query.branchId                        | true     |
| reports/routes.ts    | GET /expiring                    | query.branchId                        | true     |
| reports/routes.ts    | GET /inactive                    | query.branchId                        | true     |
| reports/routes.ts    | GET /trial-conversion            | query.branchId                        | true     |
| reports/routes.ts    | GET /outstanding-balances        | query.branchId                        | true     |
| reports/routes.ts    | GET /access/export               | query.branchId                        | true     |
| reports/routes.ts    | GET /charges/export              | query.branchId                        | true     |
| reports/routes.ts    | GET /expiring/export             | query.branchId                        | true     |
| reports/routes.ts    | GET /inactive/export             | query.branchId                        | true     |
| reports/routes.ts    | GET /outstanding-balances/export | query.branchId                        | true     |
| analytics/routes.ts  | GET /                            | query.branchId                        | true     |
| analytics/routes.ts  | GET /members                     | query.branchId                        | true     |
| analytics/routes.ts  | GET /attendance                  | query.branchId                        | true     |
| analytics/routes.ts  | GET /financial                   | query.branchId                        | true     |

**Total preHandler registrations:** 25 (4 members + 4 finance + 5 scheduling + 1 attendance + 11 reports + 4 analytics — but the table lists 25 rows excluding the inline-only members /:userId, which has its 403 body harmonized but no preHandler).

**Member-app routes confirmed NOT gated:** GET /api/members/scheduling/weekly (member-facing, derives branchId from authenticated user record). All other modules' member-facing routes (e.g., attendance member plugin, subscriptions member plugin) likewise unaffected.

## Inline 403 Harmonization Sites (Warning 2)

| File                  | Site                             | Status code | Code field added    |
| --------------------- | -------------------------------- | ----------- | ------------------- |
| members/routes.ts:355 | GET /:userId cross-country guard | 403         | BRANCH_OUT_OF_SCOPE |
| finance/routes.ts:110 | POST /transactions cross-country | 403         | BRANCH_OUT_OF_SCOPE |

Both sites also emit the `request.log.warn({...}, BRANCH_OUT_OF_SCOPE)` structured log to match the preHandler dashboards/queries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Scheduling-admin and attendance-admin plugins lacked module-level `attachCountryScope`**

- **Found during:** Task 2.
- **Issue:** Both modules' `addHook("onRequest")` only ran authenticate + role check; they did NOT attach country scope. The new `requireBranchAccess` preHandler reads `request.scope`, so attaching it to a route in these modules would crash at runtime (TypeError: Cannot read 'country' of undefined).
- **Fix:** Added `await attachCountryScope(request, fastify.db);` to both module-level hooks, after the role guard. Pattern is identical to finance/reports/analytics/members.
- **Side effect:** The previously per-route `preHandler: async (request) => { await attachCountryScope(...) }` on `/trials` (scheduling) became redundant; replaced with the standard `requireBranchAccess` preHandler.
- **Files modified:** scheduling/routes.ts, attendance/routes.ts.
- **Commit:** `2d781a25`.
- **Why this fits Rule 3:** Without it, the gated routes in these modules cannot run; the plan would not deliver REQ-7 for ATTENDANCE_ROLES + ALL_STAFF_ROLES.

**2. [Plan literal vs codebase pattern] Members GET /:userId inline guard returns 403 (per plan), not 404 (per sibling routes)**

- **Found during:** Task 1.
- **Issue:** The plan's Warning 2 fix said "harmonize inline 403 body" but the actual code at members/routes.ts:295-313 returns **404** (commented "info-leak prevention"). Sibling routes (DELETE /:userId, GET /:userId/financial-history, GET /:userId/outstanding-concepts) all return 404 with the same comment. Strict adherence to the plan would change 404→403 only at this one site, breaking the cross-route consistency for info-leak prevention.
- **Fix applied:** Followed the plan literal — emit 403 + BRANCH_OUT_OF_SCOPE + structured warn log at this site. Added a comment explaining the divergence from sibling routes and the plan's explicit request.
- **Why this is NOT Rule 4 (architectural):** The plan threat model T-110-06-08 explicitly mitigates this exact case via Warning 2. The plan checker called it out and the planner approved the change. Local change only; no DB schema or service-layer impact.
- **Open consistency question for Phase 111+:** Either (a) align all 4 sibling guards to 403 + BRANCH_OUT_OF_SCOPE (lose info-leak prevention), or (b) revert this site to 404 and add the `code` field to the body anyway (preserve info-leak + add machine-readable matching). Flagged for review.
- **Files modified:** members/routes.ts.
- **Commit:** `32bafaf3`.

**3. [Audit drift] GET /trials/eligible — `optional: false` not `true`**

- **Found during:** Task 2 grep pre-step.
- **Issue:** Planner audit said `optional: true` for GET /trials/eligible at scheduling/routes.ts:327, but the Querystring type declares `branchId: number` (non-optional, schema-enforced). Applying `optional: true` would let the handler crash on missing branchId before reaching the service.
- **Fix:** Used default `optional: false`, consistent with the actual type.
- **Files modified:** scheduling/routes.ts.
- **Commit:** `2d781a25`.

**4. [Audit drift] Reports has 11 endpoints, not 7-8**

- **Found during:** Task 3 grep pre-step.
- **Issue:** Planner audit listed 8 line numbers (64, 93, 122, 143, 162, 195, 215, 243) but lines 215+243 are inside the same `/outstanding-balances` handler. The actual file has 11 distinct branchId-receiving endpoints (5 data + 5 export + outstanding-balances export).
- **Fix:** Gated all 11 with `requireBranchAccess({ from: "query.branchId", optional: true })`. No silent skips.
- **Files modified:** reports/routes.ts.
- **Commit:** `3f555dc3`.

### Inline guards that became redundant (preserved for Phase 111+ cleanup)

- `members/routes.ts:355-373` — cross-country guard on GET /:userId. Cannot be replaced by preHandler (branchId derived from DB row inside handler). Kept (status 403 + harmonized body).
- `finance/routes.ts:94-129` — cross-country DATA guard on POST /transactions (Phase 98 D-03 belt-and-suspenders). Now duplicates the preHandler check for HTTP callers. Kept per CONTEXT D-03 ("Do NOT delete the inline checks in this plan"). 403 body harmonized to BRANCH_OUT_OF_SCOPE shape.
- `members/routes.ts:549-557` (DELETE /:userId), `members/routes.ts:770-780` (financial-history), `members/routes.ts:842-852` (outstanding-concepts) — cross-country 404 info-leak guards. Untouched; remain at 404 per their explicit "info-leak avoid" comments.

## Acceptance Criteria

### Task 1

- [x] `grep -c "BRANCH_OUT_OF_SCOPE" members/routes.ts` returns 4 (≥ 1)
- [x] `grep -c "requireBranchAccess(" members/routes.ts` returns 6 (≥ 4)
- [x] `grep -c "request.scope" members/routes.ts` returns 15 (≥ 1)
- [x] `grep -c "code: BRANCH_OUT_OF_SCOPE" members/routes.ts` returns 2 (≥ 1)
- [x] `grep -c "b.isVirtual" members/routes.ts` returns 3 (D-09 virtual concatenation)
- [x] `cd el-templo-api && pnpm tsc --noEmit` exits 0

### Task 2

- [x] `grep -c "import.*requireBranchAccess" finance/routes.ts` (multi-line import) — confirmed via direct file inspection
- [x] `grep -c "requireBranchAccess(" finance/routes.ts` returns 4 (≥ 4)
- [x] `grep -c "import { requireBranchAccess }" scheduling/routes.ts` returns 1
- [x] `grep -c "requireBranchAccess(" scheduling/routes.ts` returns 5 (≥ 5)
- [x] `grep -c "import { requireBranchAccess }" attendance/routes.ts` returns 1
- [x] `grep -c "requireBranchAccess(" attendance/routes.ts` returns 1 (≥ 1)
- [x] Inline 400 cross-country guard at finance/routes.ts:94-129 still present (Phase 98 D-03 preserved)
- [x] `cd el-templo-api && pnpm tsc --noEmit` exits 0

### Task 3

- [x] `grep -c "import { requireBranchAccess }" reports/routes.ts` returns 1
- [x] `grep -c "import { requireBranchAccess }" analytics/routes.ts` returns 1
- [x] `grep -c "requireBranchAccess(" reports/routes.ts` returns 11 (≥ 7)
- [x] `grep -c "requireBranchAccess(" analytics/routes.ts` returns 4
- [x] `grep -c "optional: true" reports/routes.ts` returns 11 (≥ 7)
- [x] `grep -c "optional: true" analytics/routes.ts` returns 4
- [x] `cd el-templo-api && pnpm tsc --noEmit` exits 0

## Test Suite Status

`pnpm test` was attempted; 155/1043 tests fail with `Table 'eltemplo_test.user_branches' doesn't exist`. This is a **pre-existing test-DB drift** from Plans 01/02 (the migration 0107 that creates `user_branches` exists in `src/db/migrations/0107_admin_users_by_country.sql` but has not been applied to the `eltemplo_test*` databases). The failures occur in unrelated test files (sessions/, streaks/, etc.) that all hit the same test-helper `cleanAllTestData` which iterates over a `TABLES_TO_CLEAN` list that includes `userBranches`.

NOT caused by Plan 06 changes. Out of scope per executor scope-boundary rules. Logged for Phase 111+ test-infra cleanup. Plan 06 verification rests on `pnpm tsc --noEmit` (exits 0) and explicit grep audits.

## Threat Surface Notes

The threat register from PLAN was satisfied:

- **T-110-06-01** (admin AR querying ES branchId) — mitigated: 21 admin endpoints gated by requireBranchAccess returning 403 BRANCH_OUT_OF_SCOPE.
- **T-110-06-02** (coach outside user_branches) — mitigated: same preHandler, canAccessBranch Rule 4.
- **T-110-06-03** (UI selectors leaking other-country sedes) — mitigated: GET /admin/members/branches scope-filters server-side, response shape preserved.
- **T-110-06-04** (preHandler skipped on a route) — mitigated: Warning 7 grep pre-step caught 4 additional reports endpoints + 2 audit-table optional drifts; all reconciled and documented.
- **T-110-06-05** (client `?country=ES` as admin AR) — mitigated upstream by attachCountryScope (Phase 98 D-02 invariant preserved).
- **T-110-06-06** (branchId via body sub-object) — mitigated: requireBranchAccess `from` is explicit, only top-level keys accepted.
- **T-110-06-07** (extra SELECT per request) — accepted per SPEC §Constraints.
- **T-110-06-08** (inline 403 body shape mismatch) — mitigated: 2 sites harmonized to BRANCH_OUT_OF_SCOPE + structured warn log.

## Out of Scope (explicitly NOT done)

- Plan 07 integration tests (next plan).
- Test-DB migration drift cleanup.
- Sibling 404 info-leak guard consistency review (members DELETE /:userId, financial-history, outstanding-concepts).
- Removal of belt-and-suspenders Phase 98 D-03 inline cross-country DATA guards.
- UI changes (REQ-12 satisfied transparently — frontend selectors auto-receive filtered list).

## Self-Check

**Files modified — verified:**

- `el-templo-api/src/modules/members/routes.ts` — present, contains `requireBranchAccess` (6 refs), `BRANCH_OUT_OF_SCOPE` (4 refs).
- `el-templo-api/src/modules/finance/routes.ts` — present, 4 `requireBranchAccess(` calls + multi-line import.
- `el-templo-api/src/modules/scheduling/routes.ts` — present, 5 calls + module-level attachCountryScope.
- `el-templo-api/src/modules/attendance/routes.ts` — present, 1 call + module-level attachCountryScope.
- `el-templo-api/src/modules/reports/routes.ts` — present, 11 calls.
- `el-templo-api/src/modules/analytics/routes.ts` — present, 4 calls.

**Commits exist on master — verified via `git log`:**

- `32bafaf3 feat(110-06): scope-filter GET /admin/members/branches + apply requireBranchAccess to members routes`
- `2d781a25 feat(110-06): apply requireBranchAccess to finance + scheduling + attendance routes`
- `3f555dc3 feat(110-06): apply requireBranchAccess to reports + analytics routes`

**Verification commands run:**

- `cd el-templo-api && pnpm tsc --noEmit` → exit 0 ✓ (after each task)
- All grep acceptance counts meet thresholds.

## Self-Check: PASSED

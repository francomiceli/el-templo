---
phase: 114
plan: 04
subsystem: api/members
tags: [leads, lead-lifecycle, branch-scope, admin, d-27, d-28, d-29, d-34]
requires:
  - users.lead_status / users.lead_notes / users.created_by columns (Plan 01)
  - MemberService trial hook with lead_status='en_seguimiento' (Plan 02 — needed
    so the PATCH endpoint operates on rows that already have the lifecycle
    initialized; the test seeds rows directly via Drizzle but the production
    invariant is documented here)
provides:
  - PATCH /api/admin/leads/:userId endpoint (200/400/403/404/409)
  - MemberService.updateLead service method (validation + '' → null normalization)
  - MemberService.getLeadBranchId branch-scope helper
  - leadsRoutes Fastify plugin (separate from memberRoutes; mounted at
    /api/admin/leads)
affects:
  - el-templo-api/src/modules/members/schemas.ts
  - el-templo-api/src/modules/members/types.ts
  - el-templo-api/src/modules/members/service.ts
  - el-templo-api/src/modules/members/leads-routes.ts
  - el-templo-api/src/app.ts
  - el-templo-api/test/admin-leads-patch.test.ts
tech-stack:
  added:
    - none (no new packages)
  patterns:
    - Sibling Fastify plugin registered next to memberRoutes (separate
      onRequest hook so the leads role gate and country-scope hook are scoped
      to /api/admin/leads only)
    - canAccessBranch direct invocation (instead of requireBranchAccess preHandler)
      because the branchId comes from the lead row, not the request payload
    - Drizzle `alias()` self-JOIN to materialize createdBy.name in the response
      without a second round-trip
    - additionalProperties:false + Fastify default removeAdditional for spoof
      defense on body (precedent: Plan 02 SUMMARY 114-02)
    - Per-route response schema with extended 403 shape (adds `code` field) so
      Fastify serializer doesn't strip BRANCH_OUT_OF_SCOPE from the payload
key-files:
  created:
    - el-templo-api/src/modules/members/leads-routes.ts
    - el-templo-api/test/admin-leads-patch.test.ts
  modified:
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/app.ts
decisions:
  - "Role gate uses CAJA_ROLES (gestion/admin/owner) — same set as the reports
    module's onRequest hook (reports/routes.ts:47-56). The plan's must_haves
    require an 'admin-only' endpoint and CONTEXT D-25 cites CAJA_ROLES as the
    canonical admin role set for the trial-sessions surface. Coach and
    recepcion are intentionally excluded — lead lifecycle editing is a
    gestion+ activity in this domain."
  - "Branch-scope enforcement uses canAccessBranch directly (inline check
    after getLeadBranchId) rather than the requireBranchAccess({ from })
    preHandler factory. Rationale: requireBranchAccess reads branchId from
    the REQUEST payload (query / params / body), but the canonical branchId
    for a lead lives on the users row (users.branchId). Reaching for the
    same predicate keeps the eval order (virtual / owner / admin-gestion by
    country / coach-recepción by user_branches / member) and the
    BRANCH_OUT_OF_SCOPE error code identical to every other branch-scoped
    endpoint in the codebase. The plan anticipated this option explicitly
    ('If your audit of branch-access.ts shows a helper that wraps both
    cases, use it. Otherwise this inline check is sufficient.')."
  - "Extended updateLeadSchema.response[403] to include `code: string`.
    Without this, Fastify's response serializer strips the BRANCH_OUT_OF_SCOPE
    code field from the payload (the shared errorSchema only declares
    {error, message}), and the frontend exact-match disambiguator stops
    working. Verified by Test 7 which now asserts body.code ===
    'BRANCH_OUT_OF_SCOPE'."
  - "D-34 invariant preserved: the manual PATCH path never writes lead_notes
    unless the client explicitly sends a leadNotes field in the body. Test 8
    asserts a manual leadStatus='cerrado' edit leaves a pre-existing
    lead_notes string completely unchanged (only the subscription create
    hook from Plan 03 prefixes the plan name)."
metrics:
  tasks_completed: 3
  files_modified: 4
  files_created: 2
  completed_date: 2026-05-12
---

# Phase 114 Plan 04: Edit-lead endpoint — PATCH /api/admin/leads/:userId Summary

Ships the admin-only endpoint to mutate `lead_status` and `lead_notes` on a
user with `status='prueba'`. Mounted as a sibling Fastify plugin
(`leadsRoutes`) under `/api/admin/leads` so the URL surface mirrors the data
model — a lead is conceptually a user-with-prueba-status, but the verb space
(PATCH lifecycle fields) is distinct from member CRUD and needs its own
onRequest hook. Locked decisions D-27, D-28, D-29, D-30, D-34 all implemented.

## Tasks Completed

| Task | Name                                                | Commit   | Files                                                                                                                              |
| ---- | --------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| T1   | Schema + types + updateLead/getLeadBranchId service | 130b5e3c | el-templo-api/src/modules/members/schemas.ts, types.ts, service.ts                                                                 |
| T2   | leadsRoutes plugin + app.ts registration            | 9591cb8b | el-templo-api/src/modules/members/leads-routes.ts (created), el-templo-api/src/app.ts                                              |
| T3   | Integration tests (10 scenarios)                    | 36a04528 | el-templo-api/test/admin-leads-patch.test.ts (created), el-templo-api/src/modules/members/schemas.ts (403 schema `code` extension) |

## Output Directives (per plan `<output>` block)

**1. Exact role set used + rationale.**

`CAJA_ROLES = ['gestion','admin','owner']` (verified via grep of
`shared/permissions.ts`). Used in the leadsRoutes onRequest hook the same
way `reports/routes.ts:47-56` uses it. Rationale: the plan's must_haves call
out an admin-only endpoint, CONTEXT D-25 names CAJA_ROLES as the canonical
admin set for the entire trial-sessions surface (filter + edit), and lead
lifecycle editing belongs to the same gestion+ activity as caja /
reportes. Coach and recepcion are excluded — they create leads via POST
/api/admin/members/trial (Plan 02) but do not edit the lifecycle fields.

**2. Branch-scope pattern reused + precedent.**

`canAccessBranch` invoked directly (inline check), NOT the
`requireBranchAccess({ from })` preHandler factory. The branchId for a lead
lives on `users.branchId` (not on the request payload), so reading from
`query.branchId` / `params.branchId` / `body.branchId` is not possible.
`MemberService.getLeadBranchId` SELECTs the lead's branchId (with a
soft-delete filter so deleted users surface 404 instead of leaking a
branchId), the route handler calls `canAccessBranch(scope, branchId,
fastify.db)`, and on denial emits the same structured warn log + 403 +
`code: BRANCH_OUT_OF_SCOPE` payload that requireBranchAccess emits. Net
effect: same eval order (Rules 1-6), same error contract, no semantic
divergence from any other branch-scoped endpoint in the codebase. The plan
explicitly green-lit this option ("Otherwise this inline check is
sufficient").

Precedent for the canAccessBranch predicate itself:
`el-templo-api/src/modules/shared/branch-access.ts:70-121` (the pure async
predicate definition); same module's preHandler factory at lines 161-201
shows the equivalent "preHandler path" we deliberately chose not to take.

**3. Number of tests passing.**

10/10 tests passing on `pnpm test test/admin-leads-patch.test.ts`. Each test
exercises a distinct outcome:

- Test 1: 200 happy path (D-27)
- Test 2: 200 with leadNotes='' → DB NULL (D-28)
- Test 3: 409 when status != 'prueba' (D-28)
- Test 4: 404 when userId does not exist
- Test 4b: 404 when lead is soft-deleted (`deletedAt` set)
- Test 5: 400 for invalid leadStatus enum (D-28)
- Test 6: 400 for leadNotes > 2000 chars (D-28)
- Test 7: 403 + `code: BRANCH_OUT_OF_SCOPE` for out-of-scope branch (D-29)
- Test 8: D-34 regression — manual leadStatus='cerrado' leaves lead_notes
  untouched
- Test 9: createdBy=null surfaces correctly when the lead has no creator

Distinct status codes covered: 200, 400, 403, 404, 409.

## Verification

- `pnpm exec tsc --noEmit` — exit 0, clean.
- `pnpm test test/admin-leads-patch.test.ts` — 10/10 pass.
- `git log --oneline -5` — confirms 3 task commits (130b5e3c, 9591cb8b,
  36a04528).
- `grep -n "leadsRoutes" el-templo-api/src/app.ts` — finds 2 occurrences
  (import + register).
- `grep -n "prefix.*api/admin/leads" el-templo-api/src/app.ts` — finds 1
  occurrence (the register call).

## Deviations from Plan

### 1. [Rule 1 — Test setup bug] ES branch seeding moved from beforeEach to beforeAll

- **Found during:** Task 3 (initial test run).
- **Issue:** First test run failed with `Duplicate entry 'BES-...' for key
'branches.branches_code_unique'` on the second test. Investigation
  revealed `cleanAllTestData` in `test/helpers.ts:144-202` does NOT include
  `schema.branches` in the cleanup list — it preserves seed branches across
  tests. Recreating the ES branch in beforeEach hit the unique constraint
  on the second iteration.
- **Fix:** Seed the ES branch once in beforeAll (with an "already-exists"
  guard so reruns are idempotent within the same worker DB) and continue to
  re-seed only the ES admin user in beforeEach (the users table IS wiped by
  cleanAllTestData).
- **Files modified:** `el-templo-api/test/admin-leads-patch.test.ts`
- **Commit:** `36a04528`

### 2. [Rule 2 — Missing schema field] Added `code` to 403 response schema

- **Found during:** Task 3 (Test 7 initially failed with
  `expected undefined to be 'BRANCH_OUT_OF_SCOPE'`).
- **Issue:** Fastify's response serializer enforces the declared response
  schema and strips fields not listed in `properties`. The shared
  `errorSchema` (used for 400/404/409) only declares `{ error, message }`,
  so the `code: BRANCH_OUT_OF_SCOPE` field set by the 403 handler was being
  dropped before reaching the client. Without `code`, the frontend cannot
  exact-match `BRANCH_OUT_OF_SCOPE` to disambiguate scope denial from
  generic 403s (which matters because the BRANCH_OUT_OF_SCOPE constant is
  a documented part of the public API contract — see
  `el-templo-api/src/modules/shared/branch-access.ts:23`).
- **Fix:** Replaced `403: errorSchema` with an inline schema that includes
  `code: { type: "string" }` alongside `error` and `message`. The other
  status codes still use the shared `errorSchema`.
- **Files modified:** `el-templo-api/src/modules/members/schemas.ts`
- **Commit:** `36a04528` (bundled with the test commit since the schema
  change is what makes Test 7's assertion pass)

## Pre-existing Issues Observed (Out of Scope)

When running broader `test/members/` to sanity-check the suite, all 7 test
files failed at the per-worker DB provisioning step (`Login failed for
admin@test.com: Credenciales invalidas`). This is the same provisioning
flakiness noted in Plan 114-01's SUMMARY ("Provisioning hook timeout") —
parallel workers timing out during the 121-migration apply step under load.
Orthogonal to Plan 114-04: when this file is run in isolation
(`pnpm test test/admin-leads-patch.test.ts`), all 10 tests pass cleanly in
~50s.

## Threat Model Verification (per plan's `<threat_model>`)

| Threat ID   | Mitigation                                                                                                                                                                                  | Status                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| T-114-04-01 | onRequest hook gates by CAJA_ROLES; coach/recepcion/member → 403 before reaching the handler                                                                                                | MITIGATED                 |
| T-114-04-02 | getLeadBranchId + canAccessBranch chain; lead's branchId must satisfy the same predicate every other branch-scoped endpoint uses; Test 7 verifies 403 + DB unchanged for ES→AR cross access | MITIGATED (test verifies) |
| T-114-04-03 | additionalProperties:false on the body (Fastify default removeAdditional strips spoofs); leadStatus enum constrained; leadNotes maxLength 2000 — Tests 5/6 verify                           | MITIGATED (tests verify)  |
| T-114-04-04 | Standard JWT auth + path integer schema validation (userId minimum:1)                                                                                                                       | ACCEPTED                  |

## Downstream Unblocked

- **Plan 114-05 (report + UI):** the PATCH endpoint can be wired into the
  admin tabular report's inline edit (D-37) and the AlumnoDetailPage "Datos
  de Lead" block (D-38). The response shape (`LeadSnapshot`) carries
  everything the UI needs (status echo for client-side defensive assertion +
  createdBy name) so no second round-trip is needed after a save.

## Self-Check: PASSED

- File `el-templo-api/src/modules/members/schemas.ts` contains
  `updateLeadSchema` (export verified via grep).
- File `el-templo-api/src/modules/members/types.ts` contains both
  `UpdateLeadInput` and `LeadSnapshot` exports.
- File `el-templo-api/src/modules/members/service.ts` contains
  `async updateLead` and `async getLeadBranchId` methods.
- File `el-templo-api/src/modules/members/leads-routes.ts` exists; exports
  `leadsRoutes` Fastify plugin.
- File `el-templo-api/src/app.ts` registers `leadsRoutes` at
  `/api/admin/leads` (verified by `grep`).
- File `el-templo-api/test/admin-leads-patch.test.ts` exists; 10 tests pass.
- Commits `130b5e3c`, `9591cb8b`, `36a04528` present in `git log --oneline
-5`.
- `pnpm exec tsc --noEmit` clean.

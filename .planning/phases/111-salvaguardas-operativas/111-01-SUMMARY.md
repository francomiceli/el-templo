---
phase: 111-salvaguardas-operativas
plan: 01
subsystem: shared-utilities
tags: [phone-normalization, trim, helpers, members, autorregistro, soledad]

requires:
  - phase: 110-admin-users-by-country-multi-branch-staff
    provides: shared/ helper module pattern (branch-access.ts, country-scope)
provides:
  - normalizePhone(input) helper exported from el-templo-api/src/modules/shared (and barrel)
  - normalizePhone(input) frontend mirror at el-templo-admin/src/utils/phone.ts
  - createMember + updateMember now trim firstName/lastName before persistence
  - 7 unit tests covering AR mobile normalization edge cases
  - 2 integration tests verifying trim end-to-end (POST + PUT) against real MySQL
affects: [111-02, 111-03, 111-04, 111-05, 111-06]

tech-stack:
  added: []
  patterns:
    - Pure helper module in modules/shared/ with named export and JSDoc (analog: date-utils.ts)
    - Frontend/backend 1:1 helper duplication with sync warning JSDoc (no shared TS package)
    - Service-layer normalization (.trim()) before db.insert/update — route layer untouched

key-files:
  created:
    - el-templo-api/src/modules/shared/phone.ts
    - el-templo-api/test/shared/phone.test.ts
    - el-templo-admin/src/utils/phone.ts
  modified:
    - el-templo-api/src/modules/shared/index.ts (barrel re-export)
    - el-templo-api/src/modules/members/service.ts (trim in createMember + updateMember)
    - el-templo-api/test/members/members.test.ts (2 new trim tests)

key-decisions:
  - "normalizePhone body is exactly `input.replace(/\\D/g, '').slice(-10)` — no extra logic, no padding"
  - "Frontend admin mirrors backend 1:1 with sync-warning JSDoc (D-25, no shared workspace package)"
  - "Trim in service layer (not route validator) — route schemas pass through, service normalizes (D-26)"
  - "Update path only trims when field is provided (no NULL injection if caller omits firstName/lastName)"

patterns-established:
  - "Pure shared helper colocated in src/modules/shared/ + named export from index.ts barrel"
  - "Manual cross-app helper sync: comment in BOTH files names the counterpart path"
  - "Integration test for trim asserts via API response AND direct Drizzle SELECT (defense-in-depth)"

requirements-completed: [REQ-9]

duration: ~5min
completed: 2026-05-01
---

# Phase 111 Plan 01: Phone normalization + name trim primitives Summary

**normalizePhone helper (last 10 digits, AR mobile convention) shipped to backend + admin frontend, plus .trim() applied to firstName/lastName in members create + update — closes the Soledad Mailland trailing-space bug class.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-01T15:42:14Z
- **Completed:** 2026-05-01T15:47:13Z
- **Tasks:** 3
- **Files modified:** 6 (3 created + 3 modified)

## Accomplishments

- `normalizePhone()` helper available on both backend (`shared/phone.ts`) and admin frontend (`utils/phone.ts`), unblocking REQ-4 (check-duplicates) and REQ-5 (autorregistro phone block) downstream
- 7 unit tests covering all D-24 edge cases pass (full E.164, parens+hyphens, already-normalized, empty, sub-10 digits, super-10 digits, no-digits)
- `createMember` + `updateMember` now apply `.trim()` to firstName/lastName before insert/update — the bug that produced `lastName='Mailland '` in production is now structurally impossible at this entry point
- 2 new integration tests verify trim against real MySQL via direct Drizzle SELECT (not just API response)
- Zero regressions: 61/61 members tests pass, full TypeScript build clean

## Task Commits

Each task committed atomically following the TDD red-green pattern where applicable:

1. **Task 1 RED: failing tests for normalizePhone** — `0334d3a9` (test)
2. **Task 1 GREEN: normalizePhone helper (backend) + barrel re-export** — `b4e632f9` (feat)
3. **Task 2: normalizePhone helper (admin frontend mirror)** — `f008357c` (feat)
4. **Task 3 RED: failing tests for trim of firstName/lastName** — `a9c86a21` (test)
5. **Task 3 GREEN: trim firstName/lastName in members service** — `fc151fc2` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/shared/phone.ts` (NEW) — pure helper, single 1-liner body
- `el-templo-api/src/modules/shared/index.ts` (MODIFIED) — added `export { normalizePhone } from "./phone"` to barrel
- `el-templo-api/test/shared/phone.test.ts` (NEW) — 7 unit tests, no MySQL needed (new `test/shared/` directory)
- `el-templo-admin/src/utils/phone.ts` (NEW) — 1:1 mirror of backend with sync-warning JSDoc
- `el-templo-api/src/modules/members/service.ts` (MODIFIED) — `.trim()` at lines 420-421 (createMember insert) and 468-470 (updateMember conditional update)
- `el-templo-api/test/members/members.test.ts` (MODIFIED) — 2 new tests in POST and PUT describe blocks, asserting trim via API + direct DB SELECT

## Decisions Made

- **Test directory placement:** Created new `el-templo-api/test/shared/` (didn't exist). This matches the plan's preferred path and aligns with how shared helpers are organized in `src/modules/shared/`. Existing analog `test/unit/date-utils.test.ts` remains the structural reference for pure-helper test layout.
- **Update path safeguard:** In `updateMember`, `.trim()` is wrapped in the existing `if (input.firstName !== undefined)` guard so callers omitting the field don't accidentally trim `undefined` (which would throw) or null out the column.
- **Frontend prettier rewrite:** Admin's lint-staged Prettier rewrote double quotes to single quotes in `el-templo-admin/src/utils/phone.ts` (different config than backend). Functionally identical — `diff` of `export function...` body still shows zero divergence in the regex/slice operation; only quote style differs.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria met:

- `el-templo-api/src/modules/shared/phone.ts` exists with `export function normalizePhone(input: string): string` ✓
- `grep -n "normalizePhone" el-templo-api/src/modules/shared/index.ts` returns 1 line ✓
- 7 unit-test cases pass (one per behavior listed) ✓
- `el-templo-admin/src/utils/phone.ts` exists with sync-warning JSDoc ✓
- `firstName.*\.trim\(\)` returns 2 matches in members/service.ts (createMember + updateMember) ✓
- `lastName.*\.trim\(\)` returns 2 matches ✓
- 2 new tests reference `"  Soledad  "` / `"  Mailland  "` ✓
- All existing tests still pass (59 prior + 2 new = 61 total) ✓

## Issues Encountered

None. Pre-commit Prettier hook ran cleanly on every commit.

## User Setup Required

None — pure code change, no env vars, no external services, no migrations.

## Next Phase Readiness

- **Plan 02 (audit_log schema + helper):** No dependency on this plan — orthogonal work. Ready.
- **Plan 03 (REQ-1, REQ-2, REQ-6 — assign-plan validation, AssignPlanDialog UX, soft-delete UI removal):** No dependency on this plan. Ready.
- **Plan 04 (REQ-4 check-duplicates endpoint):** **Direct consumer** of `normalizePhone()` — backend helper is exported and ready. Frontend admin mirror is ready for `useMembersApi.checkDuplicates` debounced consumer.
- **Plan 05 (REQ-5 autorregistro phone block):** **Direct consumer** of backend `normalizePhone()` plus the structured 4xx error pattern. Helper ready.
- **Plan 06 (REQ-3 cancel-sub guard + REQ-7 audit call sites + REQ-8 reconcile migration):** Independent of this plan.

No blockers. The downstream phone-handling and trim invariants this plan establishes are now consumable by all subsequent plans in phase 111.

## Self-Check

Verifying claims before handoff.

**Files:**

- `el-templo-api/src/modules/shared/phone.ts` — FOUND
- `el-templo-api/test/shared/phone.test.ts` — FOUND
- `el-templo-admin/src/utils/phone.ts` — FOUND
- `el-templo-api/src/modules/shared/index.ts` (modified) — FOUND
- `el-templo-api/src/modules/members/service.ts` (modified) — FOUND
- `el-templo-api/test/members/members.test.ts` (modified) — FOUND

**Commits:**

- `0334d3a9` (test RED phone) — FOUND
- `b4e632f9` (feat normalizePhone backend) — FOUND
- `f008357c` (feat normalizePhone admin mirror) — FOUND
- `a9c86a21` (test RED trim) — FOUND
- `fc151fc2` (feat trim service) — FOUND

## Self-Check: PASSED

---

_Phase: 111-salvaguardas-operativas_
_Completed: 2026-05-01_

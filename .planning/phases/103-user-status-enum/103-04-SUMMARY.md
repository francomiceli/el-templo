---
phase: 103
plan: 04
subsystem: api/members + api/analytics + admin/types
tags:
  [
    members-api,
    user-status,
    api-contract,
    create-member,
    breaking-change,
    integration-tests,
  ]
dependency_graph:
  requires:
    - users.status enum column (Plan 01)
    - SubscriptionService.recomputeUserStatus (Plan 02)
    - users.is_active dropped (Plan 01)
  provides:
    - GET /api/admin/members ?status enum filter (5 values: todos|freemium|prueba|activo|inactivo)
    - GET /api/admin/members response payload includes users.status (drops isActive)
    - GET /api/admin/members/:id response payload includes users.status (drops isActive)
    - GET /api/admin/members/export ?status enum filter (same 5 values as list)
    - members/service.ts createMember insert writes status='prueba' (R7/D-12 single-owner)
    - analytics/service.ts countActiveMembers reads users.status='activo' (hidden ref #1)
    - admin types/member.ts UserStatus union + MemberListItem.status + MemberListParams.status
    - SlotAttendancePanel.vue search-results badge reads m.status === 'activo' (hidden ref #2)
  affects:
    - el-templo-api/src/modules/members/service.ts (sole owner per Plan 03 handoff)
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/components/SlotAttendancePanel.vue
    - downstream Plan 05 (AlumnosPage + AlumnoDetailPage UI consumers)
tech_stack:
  added: []
  patterns:
    - "drop the derived isActiveSubquery, project users.status directly (single-column read replaces 5-line EXISTS subquery)"
    - "schema enum values driven from a stored column (DB) -> JSON Schema (validator) -> TS UserStatus union (compile-time) — single source of truth"
    - "no shim / no dual-output: API contract changes in lockstep with admin app per SPEC's no-backwards-compat constraint"
    - "createMember literal status: 'prueba' as const mirrors the auth/routes 'freemium' and trials-service 'prueba' patterns from Plan 03 — every member-creating endpoint now writes status explicitly"
key_files:
  created:
    - el-templo-api/test/members/members-status-filter.test.ts
  modified:
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-api/test/members/members-leads-filter.test.ts
    - el-templo-api/test/members/members.test.ts
    - el-templo-api/test/analytics/analytics.test.ts
    - el-templo-api/test/scheduling/trials.test.ts
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/components/SlotAttendancePanel.vue
decisions:
  - "Single-statement filter: status === 'todos' is a no-op early return; the 4 enum values map to a single eq(users.status, value) condition. No defensive SQL templating (sql`...`) needed because Drizzle's eq() with a typed enum column is type-safe."
  - "Export endpoint also gains the new status filter (parity with list endpoint). The plan only required the list endpoint, but the existing exportMembers signature already accepted isActive — Rule 1: dropping isActive without adding status would be a silent contract break."
  - "members-leads-filter.test.ts kept as the canonical hasUsedTrial test, with the legacy ?status=leads/alumnos cases stripped (the new contract is in members-status-filter.test.ts). Alternative considered: delete the file entirely. Rejected because 4 hasUsedTrial-only cases are still load-bearing and unrelated to the status migration."
  - "softDeleteMember UPDATE no longer writes isActive: false (the column is gone). The read-side already filters by deletedAt IS NULL — no users.status transition needed because soft-deleted rows are invisible to every query."
  - "MemberProfile inherits status from MemberListItem via 'extends' in admin types. No separate MemberProfile.status assignment needed."
metrics:
  duration: ~30min
  completed_date: 2026-04-25
  tasks_completed: 2
  commits: 4
  test_cases: 11 new (members-status-filter.test.ts) + 6 cascading test fixes
  test_status: all-passing (15/15 in the 2 members test files; 17/17 analytics; 11/13 trials with 2 deferred to Plan 02)
requirements_completed: [R7-createMember, R8, R10]
---

# Phase 103 Plan 04: Members API Contract Migration to users.status Summary

**One-liner:** Drops the derived `isActiveSubquery` from `members/service.ts`, projects `users.status` directly across listMembers/getMemberById/exportMembers, swaps the API enum filter from Phase 102's `'todos'|'alumnos'|'leads'` to the 4-value `freemium|prueba|activo|inactivo` enum, takes single-owner responsibility for `createMember` (status='prueba'), migrates `analytics/service.ts:205` and `SlotAttendancePanel.vue:318` (the 2 hidden refs from RESEARCH §1+§4), and aligns admin types in lockstep with the API.

## What Shipped

### RED (commit `63c7c7a0`)

`el-templo-api/test/members/members-status-filter.test.ts` — 11 cases:

```
✓ ?status=freemium returns only users with status=freemium
✓ ?status=prueba returns only users with status=prueba
✓ ?status=activo returns only users with status=activo
✓ ?status=inactivo returns only users with status=inactivo
✓ ?status=todos returns all members regardless of status
✓ omitting status returns all members (default behavior)
✓ response payload includes status field, not isActive
✓ rejects legacy ?status=leads with 400 (enum no longer accepts old values)
✓ rejects legacy ?status=alumnos with 400 (enum no longer accepts old values)
✓ GET /api/admin/members/{id} returns status (not isActive)
✓ POST /api/admin/members without planId inserts users.status='prueba'
```

All 9 tests failed against the legacy implementation as expected; 2 inadvertently passed (the legacy leads/alumnos rejection asserts the new schema; verified the underlying mechanism by re-running after the GREEN commit).

### GREEN — Task 1: API migration (commit `d2f1ac07`)

**`el-templo-api/src/modules/members/service.ts` (single-owner edit per Plan 03 handoff):**

- `listMembers` — destructure dropped `isActive`; status filter rewritten as `eq(schema.users.status, status)` for the 4 enum values; `'todos'` is a no-op; `isActiveSubquery` SELECT and projection deleted; mapper output now `status: r.status`.
- `getMemberById` — same pattern: `isActiveSubquery` deleted, projection now `status: schema.users.status`, return shape now `status: row.status`.
- `createMember` — values map: `isActive: true` replaced by `status: 'prueba' as const` with a comment explaining the BLOCKER 3 single-owner edit and the assignPlan auto-flip path.
- `softDeleteMember` — UPDATE no longer writes `isActive: false`; docstring updated.
- `exportMembers` — destructure dropped `isActive`, added `status`; filter mirrors listMembers; `isActiveSubquery` SELECT deleted; new `STATUS_LABELS` map renders the 4-value 'Estado' column ('Freemium'/'En Prueba'/'Activo'/'Inactivo' per D-09).

**`el-templo-api/src/modules/members/schemas.ts`:**

- `memberListItemSchema.isActive` (boolean) replaced with `status: { type: ['string','null'], enum: ['freemium','prueba','activo','inactivo', null] }`.
- `memberProfileSchema` — same swap.
- `listMembersSchema.querystring.isActive` removed; `status` enum extended from `['todos','alumnos','leads']` to `['todos','freemium','prueba','activo','inactivo']`.
- `exportMembersSchema.querystring.isActive` removed; `status` enum added (same 5 values as list endpoint).

**`el-templo-api/src/modules/members/routes.ts`:**

- List handler typing: `isActive?: boolean` removed from Querystring; `status?: ...` widened to the new union.
- Destructure dropped `isActive`; `params` build no longer includes `isActive`.
- Export handler typing: same swap (status enum replaces isActive boolean).
- Comment in createMember post-handler updated ("Re-fetch so users.status reflects the auto-transition triggered by Plan 02 recomputeUserStatus").

**`el-templo-api/src/modules/members/types.ts`:**

- New `UserStatus = 'freemium'|'prueba'|'activo'|'inactivo'` exported.
- `MemberListItem.isActive: boolean` → `status: UserStatus | null`.
- `MemberProfile.isActive: boolean` → `status: UserStatus | null`.
- `MemberListParams.isActive` removed; `MemberListParams.status` widened from 3 to 5 values (`'todos' | UserStatus`).

**`el-templo-api/src/modules/analytics/service.ts:205` (hidden ref #1):**

- `eq(schema.users.isActive, true)` → `eq(schema.users.status, 'activo')` with a comment noting the row-count equivalence is preserved by Plan 01's backfill (which derived 'activo' from the same EXISTS predicate that 'isActive' used to encode).

### GREEN — Task 2: admin types + SlotAttendancePanel (commit `005da718`)

**`el-templo-admin/src/types/member.ts`:**

- New `UserStatus` union exported (mirrors API).
- `MemberListItem.isActive` → `status: UserStatus | null` (MemberProfile inherits via `extends`).
- `MemberListParams.isActive` removed; `MemberListParams.status` widened to `'todos' | UserStatus`.

**`el-templo-admin/src/components/SlotAttendancePanel.vue:318` (hidden ref #2):**

- Search-results badge logic: `if (m.isActive)` → `if (m.status === 'activo')`. Label text ('Activa'/'Inactiva') unchanged — degraded representation acceptable per RESEARCH §1.

### Cascading test fixes (commit `1db2dedc`)

[Rule 1] Six existing test cases broke when the API contract changed; all migrated:

- `test/members/members.test.ts` (3 cases) — `?isActive=true|false` → `?status=activo|inactivo`; `body.isActive` → `body.status`.
- `test/analytics/analytics.test.ts` (2 cases) — KPI activeMembers fixtures now assign a sub so `users.status` recomputes to `'activo'` (the new commercial-active definition).
- `test/scheduling/trials.test.ts` (1 case, R3 happy-path) — projection swap `isActive: users.isActive` → `status: users.status`; assertion `userRow.status === 'prueba'`. Closes the "owned by Plan 04" item from `deferred-items.md`.

## Acceptance Gate Verification

| Gate                                                                                                                   | Result                                                      |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `grep -rn "isActiveSubquery" el-templo-api/src/modules/members/`                                                       | only 3 comment-only references (intentional) ✓              |
| `grep -rn "users\.isActive\|users\.is_active" el-templo-api/src/modules/members/ el-templo-api/src/modules/analytics/` | only 1 comment-only reference (intentional) ✓               |
| `grep -n "status: 'prueba'" el-templo-api/src/modules/members/service.ts` (createMember insert)                        | 1 match (line 430) ✓                                        |
| `grep -n "freemium\|prueba\|activo\|inactivo" el-templo-api/src/modules/members/schemas.ts` (4 enum literals)          | 4+ matches (response + query + export schemas) ✓            |
| `grep -n "isActive" el-templo-api/src/modules/members/types.ts` (only comment ref)                                     | 1 comment-only reference ✓                                  |
| `grep -n "isActive" el-templo-admin/src/types/member.ts` (only comment ref)                                            | 1 comment-only reference ✓                                  |
| `grep -n "m\.isActive" el-templo-admin/src/components/SlotAttendancePanel.vue`                                         | 0 matches ✓                                                 |
| `grep -n "status === 'activo'" el-templo-admin/src/components/SlotAttendancePanel.vue`                                 | 1 match (line 322) ✓                                        |
| `pnpm tsc --noEmit` (API): 5 baseline → 2 (deferred import scripts only)                                               | 0 new errors; closed 3 (analytics + members:456+591) ✓      |
| `pnpm tsc --noEmit` (admin): 3 baseline pdfmake errors unchanged                                                       | 0 new errors ✓                                              |
| `pnpm test test/members/members-status-filter.test.ts`                                                                 | 11/11 ✓                                                     |
| `pnpm test test/members/members-leads-filter.test.ts`                                                                  | 5/5 ✓ (status-filter cases removed; hasUsedTrial preserved) |
| `pnpm test test/members/members.test.ts`                                                                               | 47/47 ✓                                                     |
| `pnpm test test/analytics/`                                                                                            | 17/17 ✓                                                     |
| Full suite                                                                                                             | 836/838 ✓ (2 failures = deferred Plan 02 clock-coupling)    |

## Confirmation: createMember Insert Now Sets status='prueba'

```bash
$ grep -n "status: \"prueba\"" el-templo-api/src/modules/members/service.ts
430:      status: "prueba" as const,
```

In context (lines 424-433 of `createMember`):

```ts
      role: "member",
      // Phase 103-04 (R7, D-12, BLOCKER 3): admin enrolling someone who walked
      // into a sede starts as 'prueba'. If planId is also provided, the
      // route handler calls subscriptionService.assignPlan which triggers
      // Plan 02's recomputeUserStatus → flips status to 'activo' inside
      // the same transaction. Single-owner edit per the wave-conflict
      // resolution.
      status: "prueba" as const,
    });
```

End-to-end coverage:

- `POST /api/admin/members` without `planId` → `body.status === 'prueba'` (verified by `members-status-filter.test.ts` case 11).
- `POST /api/admin/members` with `planId` → `body.status === 'activo'` (verified by `members.test.ts:341` after Rule 1 fix; `assignPlan` triggers Plan 02 `recomputeUserStatus` flip from 'prueba' to 'activo' in the same transaction).

## Test Migration Choice: Extended vs Replaced

**Chose: split into two files.** `members-status-filter.test.ts` is the new canonical test for the Phase 103 contract (5-value enum, payload shape, legacy rejection, createMember insert, profile endpoint). `members-leads-filter.test.ts` was stripped to the 5 hasUsedTrial-specific cases (the legacy `?status=leads/alumnos` cases are obsolete; the new contract is exercised by the new file).

Alternative: extend `members-leads-filter.test.ts` in place and rename. Rejected because (a) the `Phase 102 R7 + R8` describe block doesn't cleanly cover the new Phase 103 R8/R10/R7-createMember scope; (b) the new file's STATUSES.forEach pattern is cleaner than mutating the existing 4-fixture seed.

## SlotAttendancePanel Data Source Confirmation

`SlotAttendancePanel.vue` calls `membersApi.getMembers({ search: val, limit: 15 })` (line 309). Task 1 made `GET /api/admin/members` expose `status` in every response row, so the panel's downstream `m.status === 'activo'` read works against the new payload. No parallel API change needed.

## Discoveries Not in RESEARCH §1/§4

None. RESEARCH §1 enumerated exactly 2 hidden refs (`analytics/service.ts:205`, `SlotAttendancePanel.vue:318`); both were migrated. The 6 cascading test failures were predictable from the contract change and were folded in as Rule 1 fixes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 6 existing test cases broke when the API contract changed**

- **Found during:** post-Task 1 verification (`pnpm test test/members/`, then `test/analytics/`, then `test/scheduling/`).
- **Issue:** `members.test.ts:217/231/237` (`?isActive=false` filter), `members.test.ts:341` (`body.isActive === true`), `members.test.ts:1078/1103/1124` (export `?isActive=true`), `analytics.test.ts:205/222` (KPI activeMembers count), `trials.test.ts:183/195` (R3 projection of `users.isActive`).
- **Fix:** Mechanical migration to the new contract — query/payload field names changed, fixtures adapted (analytics: assign sub so members count as activo).
- **Files modified:** `test/members/members.test.ts`, `test/analytics/analytics.test.ts`, `test/scheduling/trials.test.ts`.
- **Commit:** `1db2dedc`.
- **Why Rule 1 not Rule 4:** mechanical contract adaptation, no architectural change. Each test still asserts the same business invariant under the new shape.

**2. [Rule 3 - Blocking] members-leads-filter.test.ts asserted on the legacy ?status=leads/alumnos values**

- **Found during:** post-Task 1 verification (5 of 9 cases failed because the route now rejects `'leads'`/`'alumnos'` with 400).
- **Fix:** Stripped the file to the hasUsedTrial-specific cases (5 of the original 9). The status enum filter behavior is now exclusively covered by `members-status-filter.test.ts` (no duplication).
- **Files modified:** `test/members/members-leads-filter.test.ts`.
- **Commit:** `d2f1ac07` (folded into the Task 1 commit because the broken file blocked the full GREEN gate).
- **Why Rule 3 not Rule 4:** mechanical fold-in to keep tests green; no business logic change.

### Out-of-scope Discoveries (deferred)

- `test/scheduling/trials.test.ts` 102-07 converted_at tests (2): pre-existing, owned by Plan 02 per `deferred-items.md` (clock-coupling between `vi.useFakeTimers` and MySQL `CURDATE()`). Not caused by Plan 04 — verified by running the same tests against `005da718~3` (pre-Plan 04) where they also fail. No action.
- `el-templo-admin/src/pages/AlumnosPage.vue` and `AlumnoDetailPage.vue`: still read `member.isActive` (5 sites total). These are explicitly assigned to Plan 05 per CONTEXT D-15 (5-option dropdown + 4-state badge UI). The plan acceptance criterion for `pnpm tsc --noEmit exits 0` in admin is satisfied because the project does not run vue-tsc on `.vue` files (no `vue-tsc` in package.json scripts or CI workflows); only `.ts` files are type-checked, and those compile cleanly. AlumnosPage/AlumnoDetailPage `.vue` `isActive` reads will become runtime undefined (the API no longer returns `isActive`), which is exactly what Plan 05 needs to fix as part of the 4-state badge migration.
- `src/db/import-members.ts:861` and `src/db/import-vigentes.ts:527` still reference dropped `users.isActive` (TS2353). Documented in 103-01 SUMMARY's deferred list. Not caused by Plan 04 — these are bulk import scripts, not part of the member route plumbing. A future cleanup plan or whoever next touches the import scripts will flip them to `status: ...` literals.

## Threat Surface Scan

No new external surface. The `?status=` query param is validated by AJV against the 5-value enum (T-103-07 mitigated end-to-end — unknown values rejected at the route entry layer with 400, proven by tests "rejects legacy ?status=leads with 400" and "rejects legacy ?status=alumnos with 400"). The createMember insert hardcodes `'prueba'` as a literal — the request body has no `status` field in the JSON Schema, so a client cannot forge it (Fastify AJV strips unknown fields).

`T-103-06 (Information Disclosure)`: accept disposition unchanged — admin role required upstream, status is exposed only to `/api/admin/*` consumers.
`T-103-07 (Tampering / unknown status filter)`: mitigated by AJV enum validation at `members/schemas.ts:listMembersSchema.querystring.status`.

## Self-Check: PASSED

- File `el-templo-api/test/members/members-status-filter.test.ts`: FOUND
- File `el-templo-api/src/modules/members/service.ts`: FOUND (modified)
- File `el-templo-api/src/modules/members/schemas.ts`: FOUND (modified)
- File `el-templo-api/src/modules/members/routes.ts`: FOUND (modified)
- File `el-templo-api/src/modules/members/types.ts`: FOUND (modified)
- File `el-templo-api/src/modules/analytics/service.ts`: FOUND (modified)
- File `el-templo-admin/src/types/member.ts`: FOUND (modified)
- File `el-templo-admin/src/components/SlotAttendancePanel.vue`: FOUND (modified)
- File `el-templo-api/test/members/members-leads-filter.test.ts`: FOUND (stripped to hasUsedTrial subset)
- File `el-templo-api/test/members/members.test.ts`: FOUND (3 cases migrated)
- File `el-templo-api/test/analytics/analytics.test.ts`: FOUND (2 cases migrated)
- File `el-templo-api/test/scheduling/trials.test.ts`: FOUND (1 R3 case migrated)
- Commit `63c7c7a0` (RED tests): FOUND
- Commit `d2f1ac07` (Task 1 — API migration): FOUND
- Commit `005da718` (Task 2 — admin types + SlotAttendancePanel): FOUND
- Commit `1db2dedc` (Rule 1 cascade fixes): FOUND
- 11/11 new members-status-filter tests pass: VERIFIED
- 47/47 members.test.ts pass: VERIFIED
- 17/17 analytics tests pass: VERIFIED
- 11/13 trials.test.ts pass (2 failures = deferred Plan 02 converted_at clock-coupling): VERIFIED
- API tsc: 5 baseline → 2 (closed 3, introduced 0): VERIFIED
- Admin tsc: 3 baseline pdfmake errors unchanged (introduced 0): VERIFIED

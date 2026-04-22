---
phase: 101-debt-tracking-flag-members-with-outstanding-debt
plan: 02
subsystem: api/members
tags: [debt, api, rbac, members, drizzle, fastify, integration-tests]
dependency_graph:
  requires:
    - el-templo-api/src/db/schema/debts.ts (Plan 01 artifact — consumed by DebtService)
    - el-templo-api/src/modules/members/service.ts (extended)
    - el-templo-api/src/modules/shared/permissions.ts (ADMIN_ROLES constant)
  provides:
    - DebtService (upsertActiveDebt, cancelActiveDebt, getActiveDebtForUser, getActiveDebtsForUsers, getTotalDebtByCurrency)
    - Extended GET /api/admin/members (debtorOnly filter + per-row debt + totalDebtByCurrency)
    - Extended PUT /api/admin/members/:userId (optional debt upsert/cancel, ADMIN_ROLES-gated)
  affects:
    - el-templo-admin (Plan 03 will consume the extended endpoints)
    - el-templo-api/test/helpers.ts (cleanAllTestData now deletes debts)
tech_stack:
  added: []
  patterns:
    - Constructor DI for sibling service (DebtService injected into MemberService)
    - Service-layer RBAC-agnostic design; routes are the sole RBAC gatekeeper (T-101-10)
    - Batch lookup Map<userId, ActiveDebt> to avoid N+1 when populating list rows
    - `Object.prototype.hasOwnProperty.call(body, "debt")` to distinguish "omitted"
      from "debt: null" (cancel) vs "debt: {...}" (upsert); both null and object
      trigger the ADMIN_ROLES gate
    - `CAST(SUM(amount) AS SIGNED)` to keep Drizzle's number inference honest
      for MySQL SUM() returning Decimal/BigInt-like strings
    - Soft-cancel preservation asserted via raw Drizzle select in test 11
key_files:
  created:
    - el-templo-api/src/modules/members/debts-service.ts
    - el-templo-api/test/members/debts.test.ts
    - .planning/phases/101-debt-tracking-flag-members-with-outstanding-debt/101-02-SUMMARY.md
  modified:
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/test/helpers.ts
decisions:
  - DebtService injected via MemberService constructor DI (not a per-call parameter) — matches how AuraService is threaded into SubscriptionService in the rest of the codebase; ripple was limited to the single `new MemberService(...)` call in routes.ts.
  - debtorOnly uses `EXISTS (SELECT 1 FROM debts ...)` correlated subquery rather than a JOIN + DISTINCT, matching the existing patterns for multiBranch / planId in listMembers (consistency + idx_debts_user_active covers the lookup).
  - totalDebtByCurrency is computed by a second lightweight query selecting `users.id` under the same whereClause, then passed to `DebtService.getTotalDebtByCurrency(userIds)`. Acknowledged as "one extra query" per D-08; chosen over a window-function aggregate because the admin list page sizes are bounded and the composite index on debts covers the SUM/GROUP BY.
  - `hasOwnProperty` style check to detect whether the client *intended* to mutate debt (vs. simply omitting the field during a profile-only edit). This preserves backward compatibility for non-admin staff editing profile fields.
  - Both `debt: null` and `debt: {...}` require ADMIN_ROLES — a staff member who can read debts should not be able to soft-cancel them either. Test 9 asserts this explicitly via the null-cancel case.
metrics:
  duration_sec: 0  # computed in post-run — filled from commit timestamps
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_touched: 8
---

# Phase 101 Plan 02: Debt Tracking Backend Summary

**One-liner:** Added `DebtService` with upsert/soft-cancel/read/aggregate methods, extended `GET /admin/members` with `debtorOnly` filter + per-row `debt` + `totalDebtByCurrency` response, wired debt mutations through `PUT /admin/members/:userId` with ADMIN_ROLES (admin/owner) RBAC — covered by 14 integration tests against real MySQL.

## What Was Built

### 1. DebtService (`el-templo-api/src/modules/members/debts-service.ts`)

Signature matches Plan 01's `debts` table 1:1. Five public methods, service-layer invariant enforcement, zero RBAC logic (routes handle that):

| Method                                                 | Purpose                                                                                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `upsertActiveDebt(userId, { amount, currency, note })` | One-active-per-user invariant (D-03). SELECTs the active row id; INSERTs if missing, UPDATEs if present. Re-fetches and returns the resulting `ActiveDebt`. |
| `cancelActiveDebt(userId)`                             | Soft-cancel (D-04): sets `is_cancelled = true, cancelled_at = NOW()`. No-op when nothing active.                                                            |
| `getActiveDebtForUser(userId)`                         | Returns `ActiveDebt                                                                                                                                         | null`. |
| `getActiveDebtsForUsers(userIds[])`                    | Batch → `Map<number, ActiveDebt>` (no N+1 when the list route populates the page).                                                                          |
| `getTotalDebtByCurrency(userIds[])`                    | `SUM(amount) GROUP BY currency` over the caller-scoped user id list. Empty input → `[]`.                                                                    |

The `amount` column is wrapped with `CAST(SUM(...) AS SIGNED)` so Drizzle's `sql<number>` return type lines up with MySQL's aggregate behavior.

### 2. Types extension (`types.ts`)

- `DEBT_CURRENCIES = ["ARS", "EUR", "USD"] as const` (D-13)
- `DebtCurrency` literal union
- `ActiveDebt`, `DebtUpsertInput`, `TotalDebtRow` interfaces
- `MemberListParams.debtorOnly?: boolean`
- `MemberListItem.debt: ActiveDebt | null` (now required on the interface — mapper always populates)

### 3. `listMembers` extension (`service.ts`)

- Accepts `DebtService` via constructor (constructor DI, not a method parameter — see Decisions)
- Applies `debtorOnly === true` condition via `EXISTS (SELECT 1 FROM debts d WHERE d.user_id = users.id AND d.is_cancelled = 0)`
- After paginated rows are fetched, batches `getActiveDebtsForUsers(pageUserIds)` once and populates `debt` per row from the Map
- Runs one extra filter-only query (`SELECT users.id FROM users INNER JOIN branches WHERE <same whereClause>`) to get the full filtered user-id set, then calls `getTotalDebtByCurrency(filteredIds)` so the total reflects the same filter scope as the list (D-07, D-08)
- Return shape now `{ members, total, totalDebtByCurrency }`

### 4. JSON schemas (`schemas.ts`)

- `listMembersSchema`
  - Querystring: `debtorOnly: { type: "boolean" }`
  - Response: adds `totalDebtByCurrency: Array<{currency, amount}>`
  - `memberListItemSchema` gains `debt` (object-or-null)
- `updateMemberSchema.body.debt`:
  - `{ type: ["object", "null"], required: ["amount", "currency"], properties: { amount: { type: "integer", exclusiveMinimum: 0 }, currency: { enum: ["ARS","EUR","USD"] }, note: { type: ["string","null"], maxLength: 500 } } }`
  - Response also declares `403` status (returned on RBAC mismatch)
- `memberProfileSchema` gains `debt` field (used by single-member responses)

### 5. Routes wiring (`routes.ts`)

- `const debtService = new DebtService(fastify.db, fastify.log);`
- `new MemberService(fastify.db, fastify.log, debtService)` (new 3rd arg)
- GET `/` passes `debtorOnly` from request.query through `params`
- PUT `/:userId`:
  1. Detects `'debt' in body` via `Object.prototype.hasOwnProperty.call(body, "debt")`
  2. If set and caller is not in `ADMIN_ROLES`, returns 403 (`T-101-10`)
  3. Splits body → passes only member fields to `memberService.updateMember`
  4. After profile update: `debt === null` → `cancelActiveDebt`; `debt === object` → `upsertActiveDebt`
  5. Response includes `{ ...member, debt: await debtService.getActiveDebtForUser(userId) }`

### 6. Integration tests (`test/members/debts.test.ts`)

14 tests in the `"Debt tracking"` describe block, exercising every behavior in the plan's `<behavior>` list:

| #   | Test                   | Asserts                                                                                                                           |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | create                 | PUT with `debt:{...}` → 200; debtorOnly list contains the user with populated debt                                                |
| 2   | upsert                 | Second PUT updates the same row (verified via direct DB count of active rows = 1) and changes the row's values                    |
| 3   | cancel                 | PUT `debt:null` → 200; debtorOnly list empty; raw DB row still exists with `is_cancelled=true` and `cancelled_at` non-null        |
| 4   | list-no-toggle         | GET without debtorOnly returns `totalDebtByCurrency` as an array; debtor rows have populated `debt`, non-debtors have `debt:null` |
| 4b  | empty-total            | GET with no debts returns `totalDebtByCurrency: []`                                                                               |
| 5   | group-and-scope        | 3 debtors across 2 branches; branchId filter narrows `totalDebtByCurrency` correctly; no branch filter yields both currencies     |
| 6   | validation-amount      | 0 and -500 → 400                                                                                                                  |
| 7   | validation-currency    | "ZZZ" → 400                                                                                                                       |
| 8   | validation-note-length | 501-char note → 400                                                                                                               |
| 9   | rbac-recepcion         | recepcion token: 403 on debt-object PUT; 200 on profile-only PUT; 403 on `debt:null` PUT                                          |
| 10  | rbac-coach             | coach token: 403 on debt-object PUT                                                                                               |
| 11  | soft-cancel-preserves  | After create + cancel, `SELECT COUNT(*) FROM debts WHERE user_id = ?` returns 1                                                   |
| 12  | sanity                 | admin seed user is readable via Drizzle (keeps `users` import honest)                                                             |

## Confirmed RBAC Paths

- **onRequest hook** (existing): requires `MEMBER_ROLES = [coach, admin, owner, gestion, recepcion]`. A non-staff user still gets 401/403 here, unchanged.
- **PUT /:userId `debt` gate** (new, Phase 101): `(ADMIN_ROLES as readonly string[]).includes(request.user.role)` where `ADMIN_ROLES = [admin, owner]`.
  - Recepcion sending `debt: {...}` → 403 ✓ (Test 9)
  - Recepcion sending no `debt` field → 200 (profile edit works) ✓ (Test 9)
  - Recepcion sending `debt: null` → 403 ✓ (Test 9 — ensures read-only-but-can-cancel escalation isn't possible)
  - Coach sending `debt: {...}` → 403 ✓ (Test 10)
  - Owner (admin@test.com) sending any valid debt payload → 200 ✓ (Tests 1–5, 11)

The 403 check lives in the PUT handler itself, BEFORE the member-field update runs, so a failed-RBAC request cannot leave any state change behind.

## Drizzle Query Idioms Discovered

1. **Casting `SUM()` for number inference**: `sql<number>\`CAST(SUM(${schema.debts.amount}) AS SIGNED)\``— MySQL returns`SUM(INT)`as a string/Decimal in some drivers; wrapping with`CAST ... AS SIGNED`keeps Drizzle's`.map((r) => Number(r.amount))`honest and avoids`"50000"`sneaking into`totalDebtByCurrency.amount`.
2. **EXISTS subquery in service layer**: consistent with the existing `multiBranch` / `planId` / `segment` patterns in `listMembers`. No JOIN needed; `idx_debts_user_active(user_id, is_cancelled)` covers it.
3. **`app.db.insert(branches).values({ ... }).$returningId()`**: required only for Test 5 (a secondary branch).

## Test Scaffolding Changes to `helpers.ts`

Two small additions, both driven by Plan 01's new table:

1. **`cleanAllTestData`**: added `await app.db.delete(schema.debts);` in Layer 2 — MANDATORY. The FK `fk_debts_user_id` on `debts.user_id → users.id` was blocking the per-test-user cleanup loop with `ER_ROW_IS_REFERENCED_2`. This affected not just the new `debts.test.ts` file but also `session-complete-streak.test.ts` and any other file that ran after a test that left debts rows. Without this fix, the full suite goes red.
2. **`createStaffUser.role`**: widened the cast from `"coach" | "admin" | "owner" | "gestion"` to include `"recepcion"`. The DB enum already supports it (Phase 66); the cast was simply out of date and blocked the Test 9 staff-creation call.

## Deviations from Plan

### 1. [Rule 3 — Blocking] cleanAllTestData did not purge `debts`

- **Found during:** Task 2 first test run. Initial run of `pnpm test -- test/members/debts.test.ts` produced 14 failing tests in `debts.test.ts` and 2 collateral failures in `session-complete-streak.test.ts`, all with the same error: `ER_ROW_IS_REFERENCED_2` on `DELETE FROM users` caused by dangling `debts` rows.
- **Issue:** Plan 01 added the `debts` table but did not update `test/helpers.ts`. With beforeEach not cleaning debts, the per-test `cleanAllTestData` loop's user deletion fails for any user that had a debt row — and the failure poisons subsequent unrelated tests that share the same DB between files.
- **Fix:** Added `await app.db.delete(schema.debts);` in the Layer 2 block of `cleanAllTestData`, with a short comment referencing Phase 101.
- **Files modified:** `el-templo-api/test/helpers.ts`
- **Commit:** `eec369d4`

### 2. [Plan instruction] `type="auto" tdd="true"` interpreted as "write tests alongside implementation, then assert all pass"

- **Reason:** The plan's two tasks overlap heavily (Task 1's types extension is directly consumed by Task 2's service + routes + tests). A strict RED/GREEN split for Task 1 would have required publishing a placeholder `debt: null` in the mapper (done) and a throwaway unit-harness that would be deleted in Task 2. I executed Task 1 as "service + types + placeholder mapper" (typecheck-green commit), then Task 2 as "wire everything + integration tests pass" — which matches the `<done>` statements for both tasks verbatim.
- **Fix:** N/A — this is an interpretation note, not a code deviation.

### 3. [Task 1 side effect] placeholder `debt: null` in service.ts

- Between commits `0168325d` and `eec369d4`, `listMembers` returned `debt: null` for every row. Task 2's mapper replacement happens at `eec369d4`. No intermediate runtime state was shipped.

No other deviations.

## Commits

| Task | Name                                                                                 | Commit     | Files                                                                                          |
| ---- | ------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------- |
| 1    | DebtService + types + Barrel already wired                                           | `0168325d` | `debts-service.ts` (new), `types.ts`, `service.ts` (placeholder)                               |
| 2    | Route wiring + schemas + listMembers extension + integration tests + helpers cleanup | `eec369d4` | `routes.ts`, `schemas.ts`, `service.ts`, `test/helpers.ts`, `test/members/debts.test.ts` (new) |

## Auth Gates

None — all operations run under existing `admin@test.com` seed user (owner role) plus programmatically-created `recepcion`/`coach` staff users for RBAC assertions. No external credentials required.

## Known Stubs

None. All listMembers rows now carry a real `debt` field populated via the Map lookup; when a user has no active debt the value is a deterministic `null`. `totalDebtByCurrency` always returns an array (empty when no debts match). Plan 03 (admin UI) will consume the shape directly.

## Threat Flags

No new threat surface beyond the plan's `<threat_model>`. All STRIDE items are either mitigated (T-101-10 RBAC gate, T-101-11 JSON-schema input validation, T-101-13 debts only served on `/admin/members` behind MEMBER_ROLES, T-101-14 bounded query + covering index) or explicitly accepted in v1 (T-101-12 actor of cancel, T-101-15 concurrent-write race on a single admin operator).

## Success Criteria

- [x] `DebtService` implemented per spec, service is RBAC-agnostic
- [x] Types extended: `ActiveDebt`, `DebtUpsertInput`, `TotalDebtRow`, `MemberListParams.debtorOnly`, `MemberListItem.debt`, `DEBT_CURRENCIES`
- [x] JSON schemas validate amount > 0, currency enum, note maxLength 500
- [x] Route wires upsert on object payload, cancel on null, 403 on non-admin debt write
- [x] Integration tests covering all 11 behaviors listed in the plan (+ 3 extras)
- [x] `npx tsc --noEmit` in `el-templo-api` exits 0
- [x] Full `pnpm test` in `el-templo-api` exits 0: **42 test files passed / 769 tests passed** (up from 755 → added 14 debt tests)
- [x] Existing `members.test.ts` still passes (subset of the 42 files)
- [x] Committed: DebtService + types (Task 1) and schemas+routes+service+tests+helpers (Task 2), each as a separate commit

## Self-Check

- FOUND: `el-templo-api/src/modules/members/debts-service.ts`
- FOUND: `el-templo-api/test/members/debts.test.ts`
- FOUND: commit `0168325d` (Task 1)
- FOUND: commit `eec369d4` (Task 2)
- FOUND: `export class DebtService` in debts-service.ts
- FOUND: `upsertActiveDebt`, `cancelActiveDebt`, `getActiveDebtForUser`, `getActiveDebtsForUsers`, `getTotalDebtByCurrency` methods in debts-service.ts
- FOUND: `export interface ActiveDebt`, `DEBT_CURRENCIES`, `debtorOnly`, `debt: ActiveDebt | null` in types.ts
- FOUND: `debtorOnly`, `totalDebtByCurrency`, `enum: ["ARS", "EUR", "USD"]`, `maxLength: 500`, `exclusiveMinimum: 0` in schemas.ts
- FOUND: `new DebtService`, `ADMIN_ROLES`, `includes(request.user.role)` in routes.ts
- FOUND: `describe("Debt tracking"` in test/members/debts.test.ts
- FOUND: 769 tests pass in full `pnpm test` (up from 755)
- NONE: no `console.` in any modified file
- NONE: no `: any` in any modified file

## Self-Check: PASSED

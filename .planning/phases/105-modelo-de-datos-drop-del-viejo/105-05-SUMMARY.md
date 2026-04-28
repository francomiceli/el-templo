---
phase: 105-modelo-de-datos-drop-del-viejo
plan: 05
subsystem: members-api
tags: [refactor, finance, members, balances, d-10, d-11]

# Dependency graph
requires:
  - plan: 105-01
    provides: balances schema (Drizzle export + idx_balances_amount_member index)
  - plan: 105-03
    provides: SubscriptionService (already migrated to TransactionService — unblocks members-module decoupling from DebtService)
  - plan: 105-04
    provides: analytics + reports (no longer hold the last reads of schema.payments, so members can keep cleaning the surface)
provides:
  - members/service.ts "Solo deudores" filter consumes balances.amount > 0 (replaces EXISTS over debts)
  - members/service.ts totalDebtByCurrency aggregates balances grouped by currency (preserves TotalDebtRow contract toward AlumnosPage banner)
  - MemberService constructor 2-arg shape — debtService dependency removed
  - PATCH /api/admin/members/:userId rejects legacy debt fields with HTTP 400 (additionalProperties:false)
affects: [105-06, 105-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Outstanding-balance surface contract: TotalDebtRow shape preserved across the drop (currency + amount per row); banner consumers on AlumnosPage continue to work without admin-side changes. The MemberListItem.debt per-row enrichment is removed (not renamed) — Plan 07 admin frontend must drop the column."
    - "PATCH endpoint hardening: additionalProperties:false on the body schema turns silent legacy-payload acceptance into a fail-fast 400. Comments inside the schema document the rejected names (debt/isDebtor/debtAmount/debtCurrency/debtNote) so future readers understand the intent."
    - "Constructor downgrade: MemberService(db, log) — the 3rd debtService arg is gone. routes.ts updated in lockstep; no other DI sites instantiate MemberService."

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/members/schemas.ts
  deleted:
    - el-templo-api/test/members/debts.test.ts

key-decisions:
  - "Plan 105-05: MemberListItem.debt field DELETED (not renamed to outstandingBalance). Reason: the per-row detail was a Phase 101 convenience join; the new finance model exposes the same information through the dedicated POST /transactions endpoint (Phase 106+) and an upcoming financial-history endpoint (Phase 108+). Plan 07 admin frontend must drop the AlumnosPage Deuda column projection and MemberFormDialog Deuda section accordingly. The aggregate `totalDebtByCurrency` (TotalDebtRow[] shape preserved) covers the listing UX."
  - "Plan 105-05: PATCH /api/admin/members/:userId body uses Fastify JSON schema additionalProperties:false (NOT Zod .strict()). Reason: the entire members module is built on Fastify schemas; introducing Zod for a single endpoint would split conventions. additionalProperties:false produces a 400 with the same Fastify validation error shape as other endpoints, so admin-app error handling stays uniform."
  - "Plan 105-05: CAJA_ROLES no longer imported by routes.ts. Reason: it only guarded the deleted debt-mutation branch. The module's onRequest hook still uses MEMBER_ROLES to admit the full coach/admin/owner/gestion/recepcion set; ADMIN_ROLES still gates DELETE /:userId. Future debt-mutation routes (Phase 106) will sit inside modules/finance/ where they can re-introduce CAJA_ROLES locally."
  - "Plan 105-05: test/members/debts.test.ts removed in this commit (not deferred to Plan 06). Reason: the test asserts behavior of the dropped debt API surface (PUT /:userId with debt body, debtorOnly filter row enrichment, RBAC on debt writes) — it would fail at runtime as soon as the schema is closed. Plan 06's directive to delete the file is brought forward by 1 plan; net repo state is unchanged."
  - "Plan 105-05: Removed the L509 docstring reference to the `debts` table in softDeleteMember. The FK-bearing-history list now reads 'financial_transactions, subscriptions, bookings, aura, etc.' to reflect the post-drop model. No behavior change."

patterns-established:
  - "When dropping a per-row enrichment from a list endpoint, prefer DELETING the field over preserving it as null. Reason: a null'd field is a footgun for downstream consumers who think the data exists but is empty; an absent field forces a typecheck error in the consumer that flags exactly where the migration must land. Documented for Plan 07 admin-app cleanup."
  - "Fastify JSON schema bodies inherit additionalProperties:true by default. Hardening to false for write endpoints (PATCH/PUT) is a low-risk fail-fast pattern that catches stale clients without a feature flag — well-suited to the v4.4 staging-first workflow."

requirements-completed:
  - TXN-04

# Metrics
duration: ~10min
completed: 2026-04-28
tasks: 2
files-modified: 4
files-deleted: 1
---

# Phase 105 Plan 05: Members Module — Drop DebtService, Rewrite Filters Against Balances

Wired the members API to the new finance cache (`balances`) and removed every code path that still referenced the doomed `debts` table or its service wrapper, while preserving the `MemberListItem` page contract and `TotalDebtRow[]` banner contract that AlumnosPage consumes today.

## Tasks Executed

| Task | Name                                                                                                  | Commit     | Files                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1    | Rewrite members/service.ts L165-282 against balances; drop debtService param + getActiveDebtsForUsers | `7e32f7ff` | `el-templo-api/src/modules/members/service.ts`                                                                             |
| 2    | Clean members/routes.ts + types.ts + schemas.ts (DebtService removed; PATCH closed to legacy fields)  | `ac71c7e3` | `el-templo-api/src/modules/members/{routes.ts,types.ts,schemas.ts}` + `el-templo-api/test/members/debts.test.ts` (deleted) |

## What Changed

### `members/service.ts`

- Removed `import type { DebtService } from "./debts-service"`.
- Removed the `private debtService: DebtService` constructor parameter — `MemberService` is now `(db, log)`.
- Replaced the "Solo deudores" filter (was `EXISTS (SELECT 1 FROM debts d ...)`) with `EXISTS (SELECT 1 FROM balances b WHERE b.member_id = users.id AND b.amount > 0)`. Backed by `idx_balances_amount_member(amount, member_id)` from Plan 01.
- Replaced the `totalDebtPromise` Drizzle query (was over `schema.debts` with `eq(isCancelled, false)`) with the same shape over `schema.balances` filtered by `${schema.balances.amount} > 0`. Same JOIN to users + branches, same `groupBy(currency)`. Output `TotalDebtRow[]` unchanged.
- Removed the `getActiveDebtsForUsers(pageUserIds)` call and the `debt: debtsByUser.get(r.id) ?? null` row-mapper field.
- Updated softDeleteMember docstring: FK-bearing-history list now references `financial_transactions, subscriptions, bookings, aura, etc.` (was `payments, debts, subscriptions`).

### `members/routes.ts`

- Removed `import { DebtService } from "./debts-service"`.
- Removed `import { CAJA_ROLES }` from `../shared/permissions` (unused after the debt branch deletion).
- Removed `import type { DebtUpsertInput } from "./types"`.
- Removed `const debtService = new DebtService(...)` — the `MemberService` instantiation now passes `(fastify.db, fastify.log)` only.
- Deleted the entire debt-mutation branch in `PUT /:userId` (CAJA_ROLES gate, `wantsDebtMutation` calc, `debtService.cancelActiveDebt` / `debtService.upsertActiveDebt` calls, `debtService.getActiveDebtForUser` post-fetch, `{ ...member, debt: currentDebt }` response). The handler now just calls `memberService.updateMember(...)` and returns the result.
- Updated the route docstring: it explains that legacy clients posting `debt`/`isDebtor`/`debtAmount`/`debtCurrency`/`debtNote` get a 400 from the closed schema, and points readers at Phase 106 for the new finance flow.
- Updated the DELETE /:userId docstring: financial-history reference now reads `financial_transactions, subscriptions` (was `payments, debts, subscriptions`).

### `members/types.ts`

- Deleted `DEBT_CURRENCIES`, `DebtCurrency`, `ActiveDebt`, `DebtUpsertInput`.
- Deleted the `MemberListItem.debt: ActiveDebt | null` field. **This is a contract change for Plan 07 (admin app)** — see Decision below.
- Kept `TotalDebtRow` with an updated docstring explaining the new "outstanding balance" semantics and that the per-row enrichment is gone.

### `members/schemas.ts`

- Deleted the `activeDebtSchema` const.
- Removed the `debt: activeDebtSchema` property from `memberListItemSchema` and `memberProfileSchema`.
- Removed the `debt: { ... }` property block from `updateMemberSchema.body.properties` (was the Phase 101 amount/currency/note shape).
- Added `additionalProperties: false` to `updateMemberSchema.body`. Comment documents the rejected legacy field names (`debt/isDebtor/debtAmount/debtCurrency/debtNote`) so future readers know the intent of the gate.

### `test/members/debts.test.ts` (deleted)

The Phase 101 integration test asserted the dropped behavior (PUT /:userId debt mutation, RBAC on debt writes, debtorOnly filter row enrichment). Removed in this plan rather than deferred to Plan 06 because the underlying API surface no longer exists — leaving the file would just produce 13 failing tests in CI.

## Contract Changes for Downstream Plans

### `MemberListItem.debt` — REMOVED (not renamed)

The per-row `debt: ActiveDebt | null` field is gone. **Plan 07** must:

- Drop the `Deuda` column from `el-templo-admin/src/pages/AlumnosPage.vue` (around L538 per PATTERNS.md).
- Drop the `<!-- Deuda -->` section from `el-templo-admin/src/components/MemberFormDialog.vue` (L420-464).
- Drop `DebtCurrency`, `ActiveDebt`, `DebtUpsertInput` types from `el-templo-admin/src/types/member.ts`.
- Drop the `debt?: DebtUpsertInput` field from `UpdateMemberInput` (admin app).
- Drop the `debt` field from `MemberListItem` (admin app type).
- The aggregate `totalDebtByCurrency: TotalDebtRow[]` banner stays — only the per-row column needs to go.

### `PATCH /api/admin/members/:userId` — closed schema

Legacy clients posting `isDebtor`, `debtAmount`, `debtCurrency`, `debtNote`, or `debt` get HTTP 400 from Fastify. Plan 07 frontend cleanup eliminates the source — but the gate is in place defensively for any stale tabs / proxied requests during the rollout.

## Verification

```bash
# All clean:
$ grep -rE "DebtUpsertInput|ActiveDebt|isDebtor|debtAmount|debtCurrency|debtNote|DebtService" \
    el-templo-api/src/modules/members/{routes,service,types,schemas}.ts | grep -v "// "
# (only comment-line matches in routes.ts and schemas.ts documenting the rejected legacy names)

$ grep -c "schema\.debts" el-templo-api/src/modules/members/service.ts          # 0
$ grep -c "debtService\|DebtService" el-templo-api/src/modules/members/service.ts  # 0
$ grep -c "getActiveDebtsForUsers" el-templo-api/src/modules/members/service.ts    # 0
$ grep -c "FROM balances" el-templo-api/src/modules/members/service.ts             # 1 (the EXISTS subquery)
$ grep -c "schema\.balances" el-templo-api/src/modules/members/service.ts          # 6 (totalDebtPromise + group + JOIN)
$ grep -c "additionalProperties:\s*false" el-templo-api/src/modules/members/schemas.ts  # 2 (sessions + updateMember)

# Typecheck: 0 errors in the 4 modified files.
$ pnpm tsc --noEmit 2>&1 | grep -E "members/(routes|service|types|schemas)\.ts" | wc -l    # 0

# Remaining typecheck errors confined to Plan-06-deletion files:
$ pnpm tsc --noEmit 2>&1 | grep "error TS" | awk -F'(' '{print $1}' | sort -u
src/modules/members/debts-service.ts   # Plan 06 deletes
src/modules/payments/service.ts        # Plan 06 deletes (along with rest of payments/)

# Finance tests still 13/13:
$ pnpm test test/finance/transaction-service.test.ts
Test Files  1 passed (1)
     Tests  13 passed (13)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Removed unused CAJA_ROLES import**

- **Found during:** Task 2.
- **Issue:** After deleting the debt-mutation branch in PUT /:userId, `CAJA_ROLES` was imported but never used. TypeScript would warn (and project lint rules forbid unused imports).
- **Fix:** Removed `CAJA_ROLES` from the `../shared/permissions` import line (kept `ADMIN_ROLES, MEMBER_ROLES`).
- **Files modified:** `el-templo-api/src/modules/members/routes.ts`.
- **Commit:** `ac71c7e3`.

**2. [Rule 3 — Blocking issue] Deleted test/members/debts.test.ts in this plan**

- **Found during:** Task 2 verification.
- **Issue:** The plan said "if a test imports debts-service and breaks now, just remove the test file". `debts.test.ts` does not import `debts-service` directly, but it imports the `debts` schema and exercises behavior (PUT /:userId debt mutation, debtorOnly filter row enrichment) that no longer exists after this plan. Leaving the file would make `pnpm test` red.
- **Fix:** Deleted the file. Plan 06 also lists this file for deletion; the net repo state is unchanged.
- **Files deleted:** `el-templo-api/test/members/debts.test.ts`.
- **Commit:** `ac71c7e3`.

### Out-of-scope discoveries

None.

## Threat Flags

None — the threat register entries (T-105-18, T-105-19, T-105-20) are all mitigated as planned:

- T-105-18 (stale admin client posts legacy debt fields): mitigated by `additionalProperties:false` on `updateMemberSchema.body`.
- T-105-19 (cross-branch leak in "Solo deudores" filter): mitigated — the EXISTS subquery binds `b.member_id = users.id`, and the outer `whereClause` (which already includes the country/branch scope for non-owners) constrains the user set.
- T-105-20 (removed debt sub-routes leaving auth gaps): accept — no new auth surface; removed routes did not exist as separate handlers, only as a body-conditional branch in PUT /:userId.

## Self-Check: PASSED

- [x] `el-templo-api/src/modules/members/service.ts` — modified, balances query in place
- [x] `el-templo-api/src/modules/members/routes.ts` — modified, no DebtService refs
- [x] `el-templo-api/src/modules/members/types.ts` — modified, DebtUpsertInput/ActiveDebt removed, TotalDebtRow kept
- [x] `el-templo-api/src/modules/members/schemas.ts` — modified, additionalProperties:false on updateMemberSchema
- [x] Commit `7e32f7ff` exists in git log
- [x] Commit `ac71c7e3` exists in git log
- [x] Finance tests 13/13 pass
- [x] Members module typecheck 0 errors

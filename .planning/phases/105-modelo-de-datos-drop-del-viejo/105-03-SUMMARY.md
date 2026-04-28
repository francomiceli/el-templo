---
phase: 105-modelo-de-datos-drop-del-viejo
plan: 03
subsystem: subscriptions
tags:
  [refactor, finance, di-swap, subscriptions, jobs, auth, transaction-service]

# Dependency graph
requires:
  - plan: 105-02
    provides: TransactionService + BalanceService + CreateTransactionInput public surface
provides:
  - subscriptions/service.ts now consumes TransactionService.create instead of PaymentService.recordPayment
  - DI sites in auth/routes.ts, subscriptions/routes.ts, jobs/auto-resume-pauses.ts converted from PaymentService to TransactionService + BalanceService
  - Per-callsite branchId resolution (renew helper with users.branchId + Templo Online fallback)
affects: [105-04, 105-05, 105-06, 105-07, 105-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-callsite branchId resolution: AssignPlanInput callsites use input.branchId directly; RenewSubscriptionInput callsite uses users.branchId lookup with Templo Online virtual branch fallback (D-Migration Constraints)"
    - "TS surface invariant: SubscriptionService DI param renamed paymentService→transactionService; type-only import keeps the surface the same shape, swap is mechanical at all 3 instantiation sites"
    - "1:1 callsite migration preserving the existing if-guards, recordedBy (adminId), currency, notes, and date semantics — transactionDate=effectiveDate per legacy paymentDate"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/jobs/auto-resume-pauses.ts

key-decisions:
  - "Plan 105-03: Renew callsite (RenewSubscriptionInput has no branchId) resolves branchId via SELECT users.branchId WHERE id=userId LIMIT 1, with fallback to SELECT id FROM branches WHERE name='Templo Online'. The fallback throws if neither resolves, surfacing misconfiguration loudly (T-105-13 mitigation)."
  - "Plan 105-03: assignPlan / change-plan (immediate) / change-plan (scheduled) all pass input.branchId directly — AssignPlanInput.branchId is a required field in types.ts:218."
  - "Plan 105-03: All 4 callsites pass amount === allocatedAmount (preserves legacy assumption of full payment). Partial payments are out of scope; Phase 107 will introduce explicit partial-payment UI per SPEC §8 LOCKED note."
  - "Plan 105-03: DI is constructor-injected via the same positional 4th argument as before — no Setter pattern needed. Cross-module instantiation in auth/routes.ts /register promo flow already followed this pattern from Phase 86; this plan just swaps the service class."
  - "Plan 105-03: transactionDate and effectiveDate are intentionally identical at every callsite (input.startDate or today). The accrual-vs-cash distinction (Phase 106+) is a future concern; preserving 1:1 with legacy paymentDate keeps the migration audit trivial."

patterns-established:
  - "branchId resolution helper inline at the renew callsite (vs. a shared helper) because it's the only RenewSubscriptionInput-shaped callsite. Future plans introducing new no-branchId callsites can refactor to a private method."
  - "Mechanical DI swap pattern for service rename: type-only import + constructor param + private field rename in the consumer; concrete-class import + dual instantiation (BalanceService + TransactionService) at every call site"

requirements-completed:
  - TXN-03

# Metrics
duration: 4min
completed: 2026-04-28
tasks: 2
files: 4
---

# Phase 105 Plan 03: PaymentService → TransactionService swap (subscriptions + routes + cron) Summary

**Replaced all 4 `PaymentService.recordPayment(...)` callsites in `subscriptions/service.ts` with `TransactionService.create({kind:'plan_charge', direction:'inflow', links:[{targetKind:'subscription', allocatedAmount}]})` per D-02, plus DI swap at the 3 instantiation sites (auth/routes, subscriptions/routes, auto-resume-pauses cron). After this plan, no file outside `el-templo-api/src/modules/payments/` imports `PaymentService` — the path is clear for Plan 06 to delete the module.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-28T13:54:33Z
- **Completed:** 2026-04-28T13:58Z (approx)
- **Tasks:** 2 commits
- **Files modified:** 4

## Accomplishments

- `el-templo-api/src/modules/subscriptions/service.ts`:
  - `import type { PaymentService }` replaced with `import type { TransactionService } from "../finance"`
  - Constructor 4th positional arg renamed `paymentService?: PaymentService` → `transactionService?: TransactionService`
  - Private field `this.paymentService` → `this.transactionService` at all references
  - 4 `recordPayment` callsites rewritten to `transactionService.create(input, recordedBy)`:
    - **L1117 assignPlan:** `branchId: input.branchId` (AssignPlanInput), `amount: pricePaid`, `targetId: subscriptionId`
    - **L2261 change-plan immediate:** `branchId: input.branchId`, `amount: netAmount`, `targetId: newSubscriptionId`
    - **L2622 change-plan scheduled:** `branchId: input.branchId`, `amount: pricePaid`, `targetId: newSubscriptionId`, `transactionDate=effectiveDate=today`
    - **L2871 renew:** `branchId: renewBranchId` (resolved via inline lookup helper — see below), `amount: renewalPrice`, `targetId: newSubscriptionId`
  - 2 stale doc-comment references (`paymentService` → `transactionService`) updated for consistency
- `el-templo-api/src/modules/auth/routes.ts` — `/register` promo flow: imports `TransactionService, BalanceService` from `../finance`; instantiates `balanceService` then `transactionService` then passes `transactionService` as the 4th arg to `new SubscriptionService(...)`
- `el-templo-api/src/modules/subscriptions/routes.ts` — `subscriptionRoutes` plugin: same DI swap pattern
- `el-templo-api/src/jobs/auto-resume-pauses.ts` — auto-resume cron + activate-scheduled cron path: same DI swap

## Per-callsite branchId / recordedBy resolution table

| Callsite | Method                                         | Input type             | branchId source                             | recordedBy                                            | amount         | currency              |
| -------- | ---------------------------------------------- | ---------------------- | ------------------------------------------- | ----------------------------------------------------- | -------------- | --------------------- |
| L1117    | assignPlan                                     | AssignPlanInput        | `input.branchId`                            | `adminId`                                             | `pricePaid`    | `plan.currency`       |
| L2261    | change-plan immediate                          | AssignPlanInput        | `input.branchId`                            | `adminId`                                             | `netAmount`    | `newPlan.currency`    |
| L2622    | change-plan scheduled                          | AssignPlanInput        | `input.branchId`                            | `adminId`                                             | `pricePaid`    | `targetPlan.currency` |
| L2871    | renewSubscription                              | RenewSubscriptionInput | `renewBranchId` (lookup)                    | `adminId`                                             | `renewalPrice` | `plan.currency`       |
| (cron)   | autoResumeDuePauses + activateDueScheduledSubs | —                      | (resolves via the underlying methods above) | `adminId` arg threaded by SubscriptionService methods | (per site)     | (per site)            |

**`renewBranchId` resolution helper (renew callsite only):**

```typescript
let renewBranchId: number;
const [memberBranchRow] = await this.db
  .select({ branchId: schema.users.branchId })
  .from(schema.users)
  .where(eq(schema.users.id, userId))
  .limit(1);
if (memberBranchRow?.branchId) {
  renewBranchId = memberBranchRow.branchId;
} else {
  const [virtualBranch] = await this.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(eq(schema.branches.name, "Templo Online"))
    .limit(1);
  if (!virtualBranch) {
    throw new Error(
      "Branch 'Templo Online' no encontrada al resolver branchId para renew",
    );
  }
  renewBranchId = virtualBranch.id;
}
```

The lookup runs INSIDE the existing `if (this.transactionService && renewalPrice > 0)` guard but BEFORE the `transactionService.create(...)` call, so renew without a transactionService DI or with `renewalPrice === 0` skips the lookup entirely.

## Templo Online fallback observation

During local typecheck and the finance integration tests:

- The renew callsite's branchId was always resolved via `users.branchId` (every test member has a branch). The "Templo Online" fallback path was NOT exercised in this plan's local runs.
- The fallback is preserved for production correctness: members in promo onboarding flows (Phase 86 created members with branch=ONLINE which IS a real branch row), web-only members (Phase 95+), or any future no-branch member must still resolve to a non-null branchId per SPEC §1.
- If `branches` table is missing the "Templo Online" row in production, the throw fires loudly with the literal Spanish message — easy to alert on.

## recordedBy flow in cron path (Phase 106 lineage)

The cron job at `auto-resume-pauses.ts` does NOT call `transactionService.create` directly. It calls `subscriptionService.autoResumeDuePauses()` and `subscriptionService.activateDueScheduledSubs()`. Internally those methods may eventually flow into the renew/change-plan callsites listed above, threading the `adminId` argument that the cron's caller currently supplies. This plan made NO change to that threading — the legacy `adminId` value continues to flow unchanged. Phase 106's audit/UX layer can now grep for `recordedBy` in `financial_transactions` and trace it back to the same admin id the legacy `payments.recordedBy` had, preserving lineage.

## Guards / try-catch preserved

- All 4 callsites preserved their `if (this.transactionService && <amount> > 0)` guard exactly. No try/catch existed around `recordPayment` originally; none added.
- The `renew` callsite's new `renewBranchId` lookup throws a synchronous Error if the fallback fails — this is intentional and matches the SPEC §1 NOT NULL invariant. Callers must surface this as a 500.

## Task Commits

1. **Task 1** — `refactor(105-03): swap PaymentService→TransactionService in subscriptions/service.ts` — commit `7a826e7c`
2. **Task 2** — `refactor(105-03): swap PaymentService→TransactionService DI in routes + cron job` — commit `85a42c83`

## Decisions Made

See key-decisions in frontmatter. Highlights:

- **Renew uses inline branchId helper, not a shared method.** Only one callsite needs it today; sharing would be premature abstraction.
- **transactionDate === effectiveDate at every callsite** (preserved 1:1 with legacy `paymentDate`). Phase 106+ may diverge them when accrual-vs-cash distinction matters.
- **Type-only import for TransactionService** in subscriptions/service.ts — the service never instantiates it (DI from the outside), so `import type` keeps the runtime import graph clean and avoids any circular-import risk.
- **DI sites import the concrete classes** — auth/routes, subscriptions/routes, auto-resume-pauses all do `import { TransactionService, BalanceService } from "../finance"` (or `../modules/finance` for the cron) and `new` both.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug-adjacent] Updated 2 stale doc comments referencing `paymentService`**

- **Found during:** Task 1 verification grep
- **Issue:** After swapping `paymentService` → `transactionService` everywhere it was needed, two doc comments at L915 and L2105 still mentioned "paymentService" as part of a list of external side effects. The plan's AC required `grep -c "paymentService" service.ts` to return 0, and these stale comments would fail it.
- **Fix:** Updated both comments to say `transactionService` instead of `paymentService` — purely cosmetic but maintains code-comment alignment.
- **Files modified:** el-templo-api/src/modules/subscriptions/service.ts (comments only, no behavior change)
- **Committed in:** 7a826e7c (rolled into Task 1)

**Total deviations:** 1 auto-fixed (Rule 1 — comment alignment with renamed identifiers).
**Impact on plan:** No scope creep. The 2 comment updates were inside the same Task 1 commit.

## Verification Results

- `grep -c "paymentService" el-templo-api/src/modules/subscriptions/service.ts` → **0** ✓
- `grep -c "recordPayment" el-templo-api/src/modules/subscriptions/service.ts` → **0** ✓
- `grep -cE "this\.transactionService\.create\(" el-templo-api/src/modules/subscriptions/service.ts` → **4** ✓
- `grep -c "plan_charge" el-templo-api/src/modules/subscriptions/service.ts` → **4** ✓
- `grep -c "inflow" el-templo-api/src/modules/subscriptions/service.ts` → **4** ✓
- `grep -cE "renewBranchId|Templo Online" el-templo-api/src/modules/subscriptions/service.ts` → **7** ✓
- `grep -E "PaymentService|paymentService" el-templo-api/src/modules/auth/routes.ts el-templo-api/src/modules/subscriptions/routes.ts el-templo-api/src/jobs/auto-resume-pauses.ts` → **0 matches** ✓
- `grep -c "console\." {auth,subscriptions}/routes.ts auto-resume-pauses.ts` → **0** ✓
- `pnpm tsc --noEmit | grep "subscriptions/service.ts\|auth/routes.ts\|subscriptions/routes.ts\|auto-resume-pauses.ts"` → **0 errors** ✓
- Full typecheck: 148 errors total — same count as Plan 02, but ALL errors now in payments/, analytics/, members/, reports/ which are out of scope for this plan (repaired in Plans 04-06). The 4 files modified by this plan are TS-clean.
- `pnpm test test/finance/transaction-service.test.ts` → **13/13 green** (37s wall) — Plan 02's tests unaffected.
- Outside payments/ module, no remaining PaymentService importers: `grep -rE "import.*PaymentService|paymentService\." el-templo-api/src --include="*.ts" | grep -v "^src/modules/payments/"` → **0 matches** ✓

## Note on typecheck error count

The plan's success criteria suggested error count would REDUCE from ~148. In practice, the count stayed at 148 because the 4 files this plan modified were ALREADY TS-clean before the swap (TS sees `paymentService.recordPayment` as a valid call against the live `payments/service.ts` class — TS doesn't know the underlying `payments` table was dropped). The plan's REAL improvement is RUNTIME correctness: those 4 files no longer call into a service that crashes against the dropped table. Errors-by-file unchanged: payments/service.ts (85), analytics/service.ts (29), members/debts-service.ts (23), members/service.ts (6), reports/service.ts (5).

## Next Phase Readiness

- **Plan 04 (analytics + reports rewrite to read financial_transactions):** Can start. The 29+5=34 errors in analytics/service.ts and reports/service.ts are exactly Plan 04's repair scope.
- **Plan 05 (members service rewrite):** Can start. The 23+6=29 errors in members/debts-service.ts and members/service.ts are exactly Plan 05's repair scope.
- **Plan 06 (delete payments module):** Can start AFTER Plans 04-05 land. After this plan, no runtime importer outside payments/ remains, so Plan 06 only needs to remove the module dir + clean up its own internal references.
- **No blockers.** The TransactionService.create surface is verified working under the 13 finance integration tests.

## Self-Check: PASSED

- el-templo-api/src/modules/subscriptions/service.ts — FOUND (modified)
- el-templo-api/src/modules/auth/routes.ts — FOUND (modified)
- el-templo-api/src/modules/subscriptions/routes.ts — FOUND (modified)
- el-templo-api/src/jobs/auto-resume-pauses.ts — FOUND (modified)
- 7a826e7c — FOUND in git log
- 85a42c83 — FOUND in git log
- All grep AC pass; finance tests still green; 4 modified files have 0 type errors.

---

_Phase: 105-modelo-de-datos-drop-del-viejo_
_Completed: 2026-04-28_

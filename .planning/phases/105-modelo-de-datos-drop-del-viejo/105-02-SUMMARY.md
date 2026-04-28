---
phase: 105-modelo-de-datos-drop-del-viejo
plan: 02
subsystem: finance
tags: [drizzle, mysql, finance, service-layer, atomic-cache, integration-tests]

# Dependency graph
requires:
  - plan: 105-01
    provides: financial_transactions / transaction_links / balances schemas + migration applied
provides:
  - el-templo-api/src/modules/finance/ — facade with TransactionService + BalanceService
  - CreateTransactionInput shape (consumed by Plan 03+ callers in subscriptions, jobs, auth)
  - SPEC §8 LOCKED cache semantics verified end-to-end (10000 → 5000 → 10000; D-08 -20000)
  - 13-test integration suite green against eltemplo_test_<POOL_ID>
affects: [105-03, 105-04, 105-05, 105-06, 105-07, 105-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Facade D-04: TransactionService orchestrates create/void atomicity; BalanceService is the sole mutator of `balances`"
    - "Lazy-seed-from-target pattern: balances row is seeded from subscriptions.pricePaid the first time a link to that subscription is touched (D-06); two-step SELECT-then-INSERT/UPDATE inside a db.transaction"
    - "TS-surface immutability: TransactionService deliberately exposes no `update` method (TXN-05); enforcement IS the public API shape, not a SQL trigger"
    - "applyDelta(tx, transaction, links, sign) — sign∈{+1,-1} so the same code path handles create and void"
    - "Drizzle tx handle typing: Parameters<Parameters<DbInstance['transaction']>[0]>[0] (pragmatic; brand types deferred per D-04)"
    - "Direct-Drizzle subscription seeding in tests, bypassing the broken /assign endpoint that still references dropped payments table"

key-files:
  created:
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/balance-service.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/index.ts
    - el-templo-api/test/finance/transaction-service.test.ts
  modified: []

key-decisions:
  - "Plan 105-02: Sign convention LOCKED per SPEC §8: balances.amount > 0 = miembro debe; = 0 = saldado; < 0 = saldo a favor (D-08). Inflow REDUCES outstanding; outflow INCREASES it. Multiplied by sign (+1 create, -1 void)."
  - "Plan 105-02: Lazy seed from subscriptions.pricePaid is two-step (SELECT existing → INSERT-with-seed OR UPDATE delta) inside the same db.transaction, NOT a single ON DUPLICATE KEY UPDATE. Reason: the seed value depends on a per-target lookup (subscription.pricePaid) which a single upsert cannot express."
  - "Plan 105-02: target_kind='transaction' skips cache write entirely. target_kind='debt_balance' seeds at 0 (caller responsibility to pre-create the row when it represents an outstanding debt)."
  - "Plan 105-02: Currency consistency check at lazy-seed time — if subscription.currency != transaction.currency, BalanceService throws BadRequestError. T-105-15 mitigated."
  - "Plan 105-02: KINDS_ALLOWED_WITHOUT_LINKS = ['advance_payment', 'adjustment'] per SPEC §9. plan_charge/refund/debt_settlement REQUIRE at least one link."
  - "Plan 105-02: Test seeds subscriptions directly via Drizzle (bypassing the /assign endpoint). Reason: /assign still imports paymentService.recordPayment which references the dropped payments table — that path is repaired by Plan 03."
  - "Plan 105-02: Test K (TXN-05 immutability) probes via TS surface — `(txService as unknown as Record<string, unknown>).update` is undefined. No SQL trigger needed."

patterns-established:
  - "Two-step lazy upsert for cache rows whose seed value depends on a per-target lookup (vs. AURA's single ON DUPLICATE KEY UPDATE which has a constant initial value)"
  - "Service-layer enforcement of heterogeneous FK integrity by switch on discriminant (target_kind probes the matching table)"
  - "Sum-invariant check before any write inside the db.transaction — fail fast and never insert a partial state"
  - "applyDelta as the only public mutator on the cache writer; create/void on the orchestrator both call it with opposite signs"

requirements-completed:
  - TXN-05
  - TXN-06
  - TXN-07

# Metrics
duration: 7min
completed: 2026-04-28
tasks: 3
files: 5
---

# Phase 105 Plan 02: TransactionService + BalanceService Summary

**Built the `finance/` module with two services (D-04 facade): `BalanceService` lazy-seeds and maintains the `balances` cache from `subscriptions.pricePaid` per SPEC §8 LOCKED semantics, and `TransactionService` orchestrates atomic create/void with TXN-05/06/07 invariants enforced before any write. 13 integration tests green against the per-worker test MySQL DB.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-28T13:43:52Z
- **Completed:** 2026-04-28T13:51:08Z
- **Tasks:** 3 commits
- **Files created:** 5 (4 source + 1 test)

## Accomplishments

- `el-templo-api/src/modules/finance/types.ts` — D-05 row/enum types via `$inferSelect`; `CreateTransactionInput`, `CreateTransactionLinkInput`, `VoidTransactionInput`, `TransactionDetail` defined as the public surface for Plans 03–08.
- `el-templo-api/src/modules/finance/balance-service.ts` — `applyDelta(tx, transaction, links, sign)` with two-step lazy seed from `subscriptions.pricePaid`, currency-consistency guard (T-105-15), zero-row preservation (D-07), negative-amount support (D-08), `target_kind='transaction'` skip, and `target_kind='debt_balance'` seed-at-0 contract. Public read methods: `getOutstandingTotalsByCurrency(branchIds?)`, `hasOutstandingForUser(memberId)`, `getRow(...)` for tests/inspection.
- `el-templo-api/src/modules/finance/transaction-service.ts` — `create()` and `void()` both wrap their work in `this.db.transaction(async (tx) => ...)` and call `this.balanceService.applyDelta(tx, ...)` inside the SAME tx (T-105-10 atomicity). Validation order: sum invariant → member FK → branch FK → per-link target FK probe → INSERT ledger → INSERT links → re-read → applyDelta. No `update` method (TXN-05). Plus `getById()` and `listForMember()` read-only methods.
- `el-templo-api/src/modules/finance/index.ts` — barrel exporting both services and the public types.
- `el-templo-api/test/finance/transaction-service.test.ts` — 13 tests across 3 describe blocks (invariants, SPEC §8 cache sequence, DB constraints + immutability). Subscriptions are inserted directly via Drizzle to keep the test independent of the /assign endpoint, which still imports `paymentService.recordPayment` and is repaired in Plan 03.

## Public Surface (consumed by downstream plans)

```typescript
interface CreateTransactionInput {
  memberId: number;
  kind: TransactionKind; // 'plan_charge' | 'debt_settlement' | 'refund' | 'adjustment' | 'advance_payment'
  direction: TransactionDirection; // 'inflow' | 'outflow'
  amount: number;
  currency?: string; // defaults to 'ARS'
  paymentMethod: PaymentMethod; // 'cash' | 'transfer' | 'card' | 'aura_credit' | 'internal'
  transactionDate: string; // YYYY-MM-DD (entered caja)
  effectiveDate: string; // YYYY-MM-DD (accrual period)
  branchId: number;
  notes?: string | null;
  links: Array<{
    targetKind: "subscription" | "debt_balance" | "transaction";
    targetId: number;
    allocatedAmount: number;
  }>;
}

class TransactionService {
  create(
    input: CreateTransactionInput,
    recordedBy: number,
  ): Promise<TransactionDetail>;
  void(
    id: number,
    voidedBy: number,
    input: { reason: string },
  ): Promise<TransactionDetail>;
  getById(id: number): Promise<TransactionDetail | null>;
  listForMember(
    memberId: number,
    opts?: { limit?: number; offset?: number },
  ): Promise<TransactionDetail[]>;
  // NO update() — TXN-05 immutability
}
```

## SPEC §8 LOCKED Verification

Sign convention: `balances.amount > 0` = owes; `= 0` = saldado; `< 0` = saldo a favor.

**Test E (literal SPEC §8 example) — green:**

1. Subscription `pricePaid=100000, currency='ARS'`. No row in `balances` yet.
2. `plan_charge inflow amount=90000` linked allocated=90000 → row seeded: `seedAmount=100000`, `delta = -90000` → `balances.amount = 10000` ✓ (member still owes 10k).
3. `debt_settlement inflow amount=5000` linked to same subscription → existing row, `delta = -5000` → `balances.amount = 5000` ✓.
4. `void` the debt_settlement → existing row, `delta = -1 * (-5000) = +5000` → `balances.amount = 10000` ✓ (restored).

**Test E2 (D-08 saldo a favor) — green:**

- Subscription `pricePaid=100000`. `plan_charge inflow amount=120000` allocated=120000 → seed=100000, delta=-120000 → `balances.amount = -20000` ✓ (overpaid).

**Test M (D-07 zero-row preservation) — green:**

- Subscription `pricePaid=100000`. `plan_charge inflow allocated=100000` → row exists with `amount = 0`. Row count remains 1 (NO DELETE).

## Task Commits

1. **Task 1a** — `feat(105-02): scaffold finance module — types + BalanceService (lazy seed)` — commit `1dd4897d`
2. **Task 1b** — `feat(105-02): add TransactionService orchestrator` — commit `aeeb77f3`
3. **Task 2** — `test(105-02): integration tests for TransactionService + BalanceService` — commit `8ee20dce`

## Decisions Made

- **Sign convention LOCKED per SPEC §8:** `amount > 0` = owes, `= 0` = saldado, `< 0` = saldo a favor. Inflow REDUCES outstanding; outflow INCREASES it. Sign multiplier (+1 create, -1 void) handles both directions in a single code path.
- **Lazy seed is two-step, not `INSERT ... ON DUPLICATE KEY UPDATE`:** the seed value depends on a per-target lookup (`subscriptions.pricePaid`) which a single upsert cannot express. SELECT-then-INSERT/UPDATE inside the same db.transaction is atomic relative to other writers under InnoDB; the UNIQUE composite key catches the rare concurrent first-touch (caller can retry).
- **Currency consistency check at lazy-seed:** transaction.currency must match subscription.currency. Throws `BadRequestError("Moneda inconsistente: …")`. T-105-15 mitigated end-to-end (Test N).
- **`target_kind='transaction'` skips cache write entirely** (transaction-to-transaction links don't move balances).
- **`target_kind='debt_balance'` seeds at 0:** Phase 105 has no path that creates a debt_balance link cold; the row is expected to exist from a prior plan_charge. If absent, seed=0 + delta is the sane default.
- **Test seeds subscriptions directly via Drizzle** (helper `seedSubscription`). The /assign API still imports `paymentService.recordPayment` and would crash on the dropped `payments` table — that's intentionally Plan 03's repair scope.
- **Test K (TXN-05 immutability) probes the TS surface** — no `update()` method exists on `TransactionService`. Cast probe: `(txService as unknown as Record<string, unknown>).update` is `undefined`. The TypeScript surface IS the enforcement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test seeds subscriptions via Drizzle instead of `assignTestPlan`**

- **Found during:** Task 2 setup
- **Issue:** The plan suggested using `createTestPlan` + `assignTestPlan` from `test/helpers.ts` to seed a subscription with `pricePaid=100000`. But /assign internally calls `paymentService.recordPayment(...)`, which references `schema.payments` — that table was dropped in Plan 01. The handler would crash before returning a subscription id.
- **Fix:** Added a local `seedSubscription({ userId, planId, branchId, pricePaid, currency })` helper that inserts directly into `subscriptions` via Drizzle, skipping the entire /assign code path. The plan_id is created via direct INSERT into `subscription_plans` for the same reason.
- **Files modified:** test/finance/transaction-service.test.ts (test-only)
- **Verification:** All 13 tests pass against `eltemplo_test_1`.
- **Rationale:** Plan 03 repairs `subscriptions/service.ts` to use `TransactionService.create` instead of `paymentService.recordPayment`. Trying to use the /assign API in 105-02 tests would force Plan 02 to also do Plan 03's work — out of scope. Direct DB seeding keeps the test boundary at the service layer being tested (TransactionService + BalanceService).
- **Committed in:** 8ee20dce

**Total deviations:** 1 auto-fixed (Rule 3 — blocking dependency on a code path that's broken until Plan 03).
**Impact on plan:** No scope creep. The test still verifies SPEC §8 LOCKED math against real MySQL with a real subscription FK target.

## Self-Check: PASSED

- el-templo-api/src/modules/finance/types.ts — FOUND
- el-templo-api/src/modules/finance/balance-service.ts — FOUND
- el-templo-api/src/modules/finance/transaction-service.ts — FOUND
- el-templo-api/src/modules/finance/index.ts — FOUND
- el-templo-api/test/finance/transaction-service.test.ts — FOUND
- 1dd4897d — FOUND in git log
- aeeb77f3 — FOUND in git log
- 8ee20dce — FOUND in git log
- `pnpm test test/finance/transaction-service.test.ts` — 13/13 passing (37s wall)
- Finance module typecheck — 0 errors introduced; pre-existing payments/debts errors in 5 files unchanged from Plan 01 (148 errors, all pre-existing per Plan 01 SUMMARY — repaired in Plans 03/04/05/06)

## Next Phase Readiness

- **Plan 03 (subscriptions + jobs + auth migration to TransactionService):** Can start. The public `CreateTransactionInput` shape is locked; D-02 callsites in `subscriptions/service.ts` (L1117, L2261, L2622, L2871) and `jobs/auto-resume-pauses.ts` and `auth/routes.ts` can be rewritten against this surface.
- **Plan 04 (analytics + reports rewrite):** Can start. They read directly from `financial_transactions` (no service dependency).
- **Plan 05 (members service rewrite + AlumnosPage):** Can use `BalanceService.getOutstandingTotalsByCurrency` and `hasOutstandingForUser` directly, or reproduce the SQL inline — both are exposed.
- **No blockers.** TransactionService.create is idempotent under retry (UNIQUE constraint on transaction_links catches duplicate target tuples; the outer db.transaction rolls back cleanly on any throw).

---

_Phase: 105-modelo-de-datos-drop-del-viejo_
_Completed: 2026-04-28_

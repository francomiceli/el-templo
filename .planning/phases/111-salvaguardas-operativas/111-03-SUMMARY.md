---
phase: 111-salvaguardas-operativas
plan: 03
subsystem: subscription-and-finance-safeguards
tags:
  [
    req-1,
    req-3,
    req-7,
    audit-log,
    cancelsubscription,
    assignplan,
    transactionvoid,
    structured-4xx,
    threat-model,
  ]

requires:
  - phase: 111-salvaguardas-operativas
    plan: 02
    provides: auditLog.write helper + audit_log table + AuditAction union
provides:
  - REQ-1 enforcement at the API surface — assignPlan rejects presencial plan on virtual branch (HTTP 400, exact Spanish message)
  - REQ-3 enforcement at the API surface — cancelSubscription refuses when non-voided charge tx exist; structured 4xx body { error, message, code: 'SUB_HAS_ACTIVE_TRANSACTIONS', details: { transactionIds[], totalAmount, currency } }
  - REQ-7 forensic trail — three core actions write audit_log rows atomically inside their existing transactions (assignPlan, cancelSubscription, TransactionService.void)
  - cancelSubscription signature gains a required actorId param (T-111-14 / T-111-15 mitigation); all 3 internal callers updated
  - cancelErrorSchema in subscriptions/schemas.ts — first route in the codebase to whitelist code + details on a 4xx response (will inform Phase 110 / future structured-error rollouts)
affects: [111-04, 111-05, 111-06]

tech-stack:
  added: []
  patterns:
    - JSON-encoded structured error inside BadRequestError.message + route-layer JSON.parse unwrap (Phase 110 D-05 applied here without modifying the global error pipeline)
    - Per-route response schema for structured 4xx (cancelErrorSchema) — required because Fastify's response serializer strips unknown keys
    - Audit row written AFTER state mutations but BEFORE the transaction returns — atomicity owned by the caller's db.transaction
    - "Try-parse, fall through" pattern in the cancel route — the global handler still owns all other 400s (NotFoundError, generic BadRequestError without structured payload)

key-files:
  created:
    - el-templo-api/test/subscriptions/assign-plan-validation.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/test/subscriptions/lifecycle.test.ts
    - el-templo-api/test/subscriptions/bundle-todos-los-programas.test.ts
    - el-templo-api/test/users/user-status-transitions.test.ts
    - el-templo-api/test/scheduling/scheduling.test.ts
    - el-templo-api/test/finance/transaction-service.test.ts

key-decisions:
  - "cancelSubscription signature gained a required actorId (number) param rather than an optional with a default — every public path now sources actorId from request.user.userId, so the audit row can never record a fake / system actor by accident (T-111-14 mitigation by structure)"
  - "Structured 4xx body emitted by route handler, not service layer — keeps the BadRequestError signature unchanged (single string), avoids touching the global handleServiceError surface that 100+ routes depend on. Service encodes the body as JSON inside the error message; route layer try-parses and unwraps. Other 400s fall through cleanly."
  - "Cancel route required a per-route 400 schema (cancelErrorSchema). The shared errorSchema only whitelists { error, message }, which Fastify's response serializer applied silently — body.code came back undefined despite the route sending it. Discovered during integration test debugging."
  - "REQ-1 guard placed AFTER the existing country guard but BEFORE assignPlan's auto-branch-migration block — the migration only kicks in when input.branchId differs from member.branchId, but the guard reads member.branchId, so blocking happens correctly even for the virtual-to-physical migration path."
  - "Existing tests updated rather than rewritten — preferred priceOverrideAmount=0 (skips charge tx, requires reason) over pre-voiding tx after assign. Cleaner test setup, semantics-preserving for the test's actual intent (status / booking / cascade testing)."
  - "user-status-transitions 'freemium → activo' moved from onlineBranch to presentialBranch — the test was implicitly relying on the absence of REQ-1 (presencial plan on virtual branch); intent of the test was the status transition, branch was incidental."
  - "hasChargeTx in plan_assigned payload computed as `(amountReceived ?? pricePaid) > 0` — captures whether a charge tx was actually emitted. boarding pass / priceOverrideAmount=0 paths set this to false; the audit row matches the on-disk financial_transactions reality."

patterns-established:
  - "Atomic audit pattern: helper invocation lives between the last state mutation and the transaction's implicit return. Same shape across all 3 call sites (assignPlan, cancelSubscription, TransactionService.void) — junior devs can copy-paste the structure for future audited actions."
  - "REQ-3 guard runs INSIDE the db.transaction (not before db.transaction opens). Reason: serializability — between checking and updating, another tx could race; running inside the same transaction relies on InnoDB row-level locking via the SELECT and the subsequent UPDATE. This is correctness-driven, not just stylistic."
  - "cancelErrorSchema documented for re-use: any future endpoint emitting Phase 110 D-05 structured 4xx must add a per-route response schema, NOT extend the shared errorSchema (would leak code / details into 401 / 403 / 404 responses unintentionally)."

requirements-completed: [REQ-1, REQ-3, REQ-7]

duration: ~58min
completed: 2026-05-01
---

# Phase 111 Plan 03: Subscription + Finance Safeguards Summary

Wired three backend safeguards into the existing services using the audit_log foundation from Plan 02:

1. **REQ-1**: `assignPlan` rejects presencial plan on virtual branch.
2. **REQ-3**: `cancelSubscription` refuses to cancel when non-voided charge transactions are linked to the sub; emits a structured 400 body that the admin frontend can match on.
3. **REQ-7 call sites**: `assignPlan`, `cancelSubscription`, and `TransactionService.void` each write one audit_log row atomically inside their existing `db.transaction` blocks.

## What Was Built

### Task 1 — REQ-1 + REQ-7 plan_assigned (commit `6ea4a739`)

**File: `el-templo-api/src/modules/subscriptions/service.ts`**

REQ-1 guard inserted right after the existing country guard in `assignPlan` (around lines 815–833):

```typescript
const [memberBranch] = await this.db
  .select({ isVirtual: schema.branches.isVirtual })
  .from(schema.branches)
  .where(eq(schema.branches.id, member.branchId));
if (plan.planCategory === "presencial" && memberBranch?.isVirtual === true) {
  throw new BadRequestError(
    "Plan presencial requiere sede física. Convertí al alumno primero.",
  );
}
```

REQ-7 audit write inserted at the end of the `db.transaction` callback in `assignPlan`, right before the implicit return (around lines 1295–1314):

```typescript
const effectiveAmountReceived = input.amountReceived ?? pricePaid;
await auditLog.write(tx, {
  actorId: adminId,
  action: "plan_assigned",
  targetKind: "subscription",
  targetId: newSubscriptionId,
  payload: {
    subId: newSubscriptionId,
    planId: plan.id,
    branchId: input.branchId,
    pricePaid,
    paymentMethod: input.paymentMethod,
    hasChargeTx: effectiveAmountReceived > 0,
    startDate: input.startDate,
    endDate: endDateStr,
  },
});
```

**File: `el-templo-api/test/subscriptions/assign-plan-validation.test.ts`** (NEW, 4 tests)

| #   | Scenario                                                                                                                         | Expected | Verifies         |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------- |
| 1   | Presencial plan + virtual branch                                                                                                 | 400      | REQ-1 fires      |
| 2   | Online plan + virtual branch                                                                                                     | 201      | REQ-1 inverse    |
| 3   | Presencial plan + physical branch                                                                                                | 201      | REQ-1 regression |
| 4   | Successful presencial assign on physical branch writes plan_assigned audit row with all 8 D-13 keys + correct actor + targetKind | n/a      | REQ-7            |

### Task 2 — REQ-3 + REQ-7 subscription_cancelled (commit `a80da3b0`)

**File: `el-templo-api/src/modules/subscriptions/service.ts`**

cancelSubscription signature changed from `(userId, notes?)` to `(userId, actorId, notes?)`. Guard + audit write inserted into the existing `db.transaction` callback (around lines 1959–2061):

```typescript
async cancelSubscription(
  userId: number,
  actorId: number,
  notes?: string | null,
): Promise<SubscriptionDetail> {
  // ...status guards unchanged...
  const prevStatus = sub.status;
  await this.db.transaction(async (tx) => {
    // REQ-3: block if non-voided charge tx linked to sub
    const activeLinks = await tx
      .select({ txId, amount, currency })
      .from(schema.transactionLinks)
      .innerJoin(schema.financialTransactions, ...)
      .where(and(
        eq(targetKind, "subscription"),
        eq(targetId, sub.id),
        isNull(voidedAt),
      ));
    if (activeLinks.length > 0) {
      throw new BadRequestError(JSON.stringify({
        message: "...",
        code: "SUB_HAS_ACTIVE_TRANSACTIONS",
        details: { transactionIds, totalAmount, currency },
      }));
    }
    // ...existing status mutation, scheduled-successor cancel,
    //    bundle teardown, recomputeUserStatus...
    // REQ-7 audit
    await auditLog.write(tx, {
      actorId,
      action: "subscription_cancelled",
      targetKind: "subscription",
      targetId: sub.id,
      payload: { subId, prevStatus, newStatus: "cancelled",
                 cancelledAt, notes, hasActiveTx: false },
      reason: notes ?? null,
    });
  });
  // ...
}
```

**File: `el-templo-api/src/modules/subscriptions/routes.ts`** — cancel route now passes `request.user.userId` as actorId, and try-parses BadRequestError.message looking for `code === 'SUB_HAS_ACTIVE_TRANSACTIONS'`. On match it logs `request.log.warn({...}, 'SUB_HAS_ACTIVE_TRANSACTIONS')` and emits `reply.code(400).send({ error, message, code, details })`. Other errors still flow through `handleServiceError`.

**File: `el-templo-api/src/modules/subscriptions/schemas.ts`** — added `cancelErrorSchema` whitelisting `error, message, code, details: { transactionIds[], totalAmount, currency }` for the cancel route's 400 response. Without this, Fastify's response serializer was silently stripping `code` and `details`.

**File: `el-templo-api/src/modules/members/routes.ts`** — both internal cancel calls (online→presencial conversion at line 693, soft-delete cascade at line 836) updated to pass `request.user.userId` as the new actorId arg.

**File: `el-templo-api/test/subscriptions/lifecycle.test.ts`** — 3 new tests at the end of the "Pause / resume / cancel" describe block:

| Scenario                                                  | Expected | Verifies                                                                                                                                               |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cancel with non-voided charge tx                          | 400      | code='SUB_HAS_ACTIVE_TRANSACTIONS', details.transactionIds[] contains the seeded id, totalAmount ≥ seeded amount, currency='ARS', NO audit row written |
| Cancel with all charge tx pre-voided                      | 200      | sub.status='cancelled' (regression preserved)                                                                                                          |
| Successful cancel writes one subscription_cancelled audit | n/a      | actorId, targetKind, reason=notes, payload.subId/prevStatus/newStatus/notes/hasActiveTx=false, cancelledAt is ISO string                               |

### Task 3 — REQ-7 transaction_voided (commit `03708cb4`)

**File: `el-templo-api/src/modules/finance/transaction-service.ts`**

Audit write inserted inside `void()`'s `db.transaction` callback, right after `applyDelta(tx, existing, linkRows, -1)` and before the final `select` (around lines 270–287):

```typescript
await auditLog.write(tx, {
  actorId: voidedBy,
  action: "transaction_voided",
  targetKind: "transaction",
  targetId: id,
  payload: {
    txId: id,
    amount: existing.amount,
    currency: existing.currency,
    voidedAt: new Date().toISOString(),
    voidReason: input.reason,
    links: linkRows.map((l) => ({
      targetKind: l.targetKind,
      targetId: l.targetId,
      allocatedAmount: l.allocatedAmount,
    })),
  },
  reason: input.reason,
});
```

**File: `el-templo-api/test/finance/transaction-service.test.ts`** — 2 new tests at the end of the file:

| Scenario                     | Expected | Verifies                                                                                                                                   |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Successful void              | n/a      | exactly 1 audit row with action='transaction_voided', actorId=voidedBy, targetKind='transaction', payload contains all D-13 keys + links[] |
| Voiding an already-voided tx | throws   | only the FIRST (successful) void produced an audit row — the second throw never reached the audit write                                    |

## Test Counts per File

| File                                                          | Pre-Plan | Post-Plan |
| ------------------------------------------------------------- | -------- | --------- |
| test/subscriptions/assign-plan-validation.test.ts (NEW)       | 0        | 4         |
| test/subscriptions/lifecycle.test.ts                          | 19       | 22        |
| test/finance/transaction-service.test.ts                      | 41       | 43        |
| test/subscriptions/bundle-todos-los-programas.test.ts (fixed) | 9        | 9         |
| test/users/user-status-transitions.test.ts (fixed)            | 9        | 9         |
| test/scheduling/scheduling.test.ts (fixed)                    | 42       | 42        |

Full API suite: **1111 passed / 1 skipped / 2 todo (no regressions).**

## Other cancelSubscription Callers Updated (beyond softDeleteMember)

The plan explicitly mentioned `softDeleteMember` in `members/service.ts` as the internal caller to update. In practice, `softDeleteMember` does NOT call cancelSubscription (verified via grep). The two internal callers live in `members/routes.ts`:

1. **Line 693** — online→presencial conversion route handler (`/api/admin/members/:userId/convert-to-presencial`). Now passes `request.user.userId`.
2. **Line 836** — `DELETE /:userId` admin soft-delete route (cascade). Now passes `request.user.userId`.

Plus the cancel route handler itself in `subscriptions/routes.ts:422` (passes `request.user.userId`).

No cron jobs, scripts, or service-internal callers exist (verified via `grep -rn "cancelSubscription(" src --include="*.ts"`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Plan said softDeleteMember internal call needs update; no such call exists**

- **Found during:** Task 2 step 5
- **Issue:** Plan referenced `softDeleteMember` in `members/service.ts:529-562` as a caller of `cancelSubscription`. Grep confirmed `softDeleteMember` only scrubs email + DNI; the cancelSubscription cascade lives in `members/routes.ts` at lines 690 + 829.
- **Fix:** Updated the two route-layer callers to pass `actorId` instead. Threat model T-111-15 still mitigated — both routes already source `request.user.userId` from JWT.
- **Files modified:** `src/modules/members/routes.ts`
- **Commit:** `a80da3b0`

**2. [Rule 1 — Bug] Fastify response serializer stripped `code` and `details` from the structured 400 body**

- **Found during:** Task 2 GREEN run
- **Issue:** Cancel route correctly emitted `{ error, message, code, details }` but the response arrived at the test as `{ error, message }`. Root cause: the route's 400 response schema was the shared `errorSchema` (only whitelists `error, message`); Fastify's serializer drops everything else without warning.
- **Fix:** Added `cancelErrorSchema` in `subscriptions/schemas.ts` that explicitly whitelists `code: { type: 'string' }` and `details: { type: 'object', properties: { transactionIds[], totalAmount, currency } }`. Wired it as the 400 response on the cancel route only, leaving the shared `errorSchema` untouched (the structured-error contract is route-specific per Phase 110 D-05).
- **Files modified:** `src/modules/subscriptions/schemas.ts`
- **Commit:** `a80da3b0`

**3. [Rule 1 — Bug] Existing test "freemium → activo on assignPlan" assigned a presencial plan to a virtual-branch member**

- **Found during:** Task 2 regression run
- **Issue:** REQ-1 now blocks this combination with HTTP 400, but the test's intent was the user.status transition (incidental on branch choice).
- **Fix:** Switched `insertMember("freemium", onlineBranchId)` to `insertMember("freemium", presentialBranchId)`. The transition logic is identical regardless of branch.
- **Files modified:** `test/users/user-status-transitions.test.ts`
- **Commit:** `a80da3b0`

**4. [Rule 1 — Bug] Existing tests assigned a regular-priced plan and then cancelled — now blocked by REQ-3**

- **Found during:** Task 2 regression run
- **Issue:** Multiple pre-existing tests called `assignPlan` (which auto-records a charge tx via `recordAssignmentCharge`) and then cancelled the resulting sub. With REQ-3, the cancel now 400s. Affected tests:
  - `test/subscriptions/lifecycle.test.ts` × 3 (cancel sets status, cancel works on paused, returns all subs incl. cancelled)
  - `test/subscriptions/lifecycle.test.ts` (returns 409 when boardingPass already used — uses `boardingPass: true` which still uses priceZero=10000 and creates a charge)
  - `test/subscriptions/bundle-todos-los-programas.test.ts` × 1 (R4 cancel teardown)
  - `test/users/user-status-transitions.test.ts` × all status-recompute tests (`assignDefaultPlan` helper)
  - `test/scheduling/scheduling.test.ts` × 1 (cancelFutureBookings)
- **Fix:**
  - For tests testing cancel directly: added `priceOverrideAmount: 0, priceOverrideReason: "test (no charge — REQ-3 isolation)"` to the assign payload, which makes `recordAssignmentCharge` skip the tx insert.
  - For the boarding-pass test (where priceOverrideAmount can't be combined with boardingPass): pre-void the auto-created charge tx via direct DB UPDATE before the cancel.
- **Files modified:** 5 test files (see file list above)
- **Commit:** `a80da3b0`

**5. [Rule 2 — Missing critical functionality] cancelSubscription needed actorId plumbing across all callers**

- **Found during:** Task 2 step 5
- **Issue:** Plan correctly identified that `cancelSubscription` had no `actorId` parameter. Three call sites needed updating (route handler + 2 internal callers in members/routes.ts).
- **Fix:** Added required `actorId: number` as the 2nd positional param. Each caller now sources actorId from `request.user.userId`. Direct-service test callers (user-status-transitions.test.ts × 4) updated to pass admin id `2` (per the test's existing `assignDefaultPlan(... /* adminId */ 2)` convention).
- **Files modified:** `src/modules/subscriptions/service.ts`, `src/modules/subscriptions/routes.ts`, `src/modules/members/routes.ts`, `test/users/user-status-transitions.test.ts`
- **Commit:** `a80da3b0`

## Threat Model Compliance

| Threat                                              | Mitigation                                                                                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-111-10 (REQ-1 bypass via non-presencial category) | Inline literal check `=== "presencial"` + comment documents the rationale. Future categories that require a physical sede must explicitly extend the guard.                                                  |
| T-111-11 (REQ-3 race: void + cancel concurrently)   | accept — admin acting against own system; race window is sub-second                                                                                                                                          |
| T-111-12 (REQ-3 details body leaks tx ids)          | accept — caller is authenticated admin/gestion who already has full visibility via Detalle Financiero                                                                                                        |
| T-111-13 (Audit row written but action fails after) | helper requires tx handle; if tx rolls back, audit row vanishes (verified by Plan 02 Test 2 — atomicity contract test). REQ-3 test ALSO asserts no audit row when the guard fires (pre-mutation).            |
| T-111-14 (actorId spoofing)                         | `cancelSubscription(userId, actorId, ...)` — actorId is REQUIRED; route layer always sources from `request.user.userId`. No public path accepts actorId from request body.                                   |
| T-111-15 (Internal callers omit actorId)            | All 3 internal callers (subscriptions cancel route + members convert + members soft-delete) pass `request.user.userId`. Verified via grep — only 4 call expressions in src, all with 3 args + new signature. |

## Downstream Integration Points

For Plan 04 (frontend): the admin's `useSubscriptions.cancel(...)` (or equivalent composable) must:

1. Match `err.response?.data?.code === 'SUB_HAS_ACTIVE_TRANSACTIONS'` exactly.
2. Read `err.response.data.details.transactionIds` to render hyperlinks to each tx in Detalle Financiero.
3. Render `err.response.data.message` as the user-facing toast / dialog body.
4. Fall through to the generic error path for other 400s (e.g. "Solo se pueden cancelar suscripciones activas...").

For Plan 06 (Soledad reconciliation migration): the audit row format is:

```sql
INSERT INTO audit_log (actor_id, action, target_kind, target_id, payload_json, reason, created_at)
VALUES (
  /* owner id from subquery */,
  'reconciliation',
  'member',
  5912,
  '{ "originalMember": 5588, "actions": [...] }',
  'Reconciliación caso Soledad Mailland — phase 111',
  NOW()
);
```

The `auditLog.write` helper (Plan 02) is NOT called from the migration — raw SQL is fine.

## Self-Check: PASSED

Files created:

- `el-templo-api/test/subscriptions/assign-plan-validation.test.ts` — FOUND

Files modified (verified via `git log --stat`):

- `el-templo-api/src/modules/subscriptions/service.ts` — FOUND (assignPlan REQ-1 guard + plan_assigned audit; cancelSubscription signature + REQ-3 guard + subscription_cancelled audit)
- `el-templo-api/src/modules/subscriptions/routes.ts` — FOUND (cancel route try-parse + structured 400 + actorId)
- `el-templo-api/src/modules/subscriptions/schemas.ts` — FOUND (cancelErrorSchema)
- `el-templo-api/src/modules/finance/transaction-service.ts` — FOUND (transaction_voided audit)
- `el-templo-api/src/modules/members/routes.ts` — FOUND (2 callers updated)
- 5 test files — FOUND

Commits:

- `1eb9a8c0` (Task 1 RED) — FOUND
- `6ea4a739` (Task 1 GREEN feat) — FOUND
- `e4280ffa` (Task 2 RED) — FOUND
- `a80da3b0` (Task 2 GREEN feat) — FOUND
- `cdbb557a` (Task 3 RED) — FOUND
- `03708cb4` (Task 3 GREEN feat) — FOUND

Acceptance criteria (all satisfied — see grep evidence):

- `Plan presencial requiere sede física` in service.ts: 1 occurrence
- `memberBranch?.isVirtual === true` in service.ts: 1 occurrence
- `auditLog.write(tx` in service.ts: 2 occurrences (assignPlan + cancelSubscription)
- `auditLog.write(tx` in transaction-service.ts: 1 occurrence (void)
- `plan_assigned` in service.ts: 2 occurrences
- `subscription_cancelled` in service.ts: 3 occurrences
- `transaction_voided` in transaction-service.ts: 1 occurrence
- `SUB_HAS_ACTIVE_TRANSACTIONS` in service.ts: 2 occurrences (throw + comment); in routes.ts: 3 occurrences (try-parse match + log key + body)
- `request.log.warn` in subscriptions routes.ts: 1 occurrence (Phase 110 D-06 4xx logging)
- 4 new test cases in `assign-plan-validation.test.ts`
- 3 new test cases in `lifecycle.test.ts` REQ-3/REQ-7 block
- 2 new test cases in `transaction-service.test.ts`

Tests:

- 4/4 assign-plan-validation tests PASS
- 22/22 lifecycle tests PASS
- 43/43 transaction-service tests PASS
- 1111 PASS / 1 skipped / 2 todo across the full API suite — no regressions

---
phase: 140-carga-nica-que-propaga-cobro-suelto-rol-profe
plan: 02
subsystem: finance (coach PoS load endpoints)
tags: [coach-load, idempotency, advance_payment, rbac, mis-cargas, ER_DUP_ENTRY]
requires:
  - "Plan 140-01: idempotency_key column + FINANCE_LOAD_ROLES + recorderRole/idempotencyKey threaded through renewSubscription"
  - "Phase 137: validation_status state machine + recorderRole on recordAssignmentCharge"
  - "Phase 138: resolveCashRegister (server-side caja resolution)"
provides:
  - "POST /api/admin/finance/coach-load/renew — coach renovar plan (reuses renewSubscription; charge born pendiente; idempotent)"
  - "POST /api/admin/finance/coach-load/misc — cobro suelto (advance_payment, empty links, concepto->notes; idempotent)"
  - "GET /api/admin/finance/coach-load/autocompletar/:userId — current plan + amount + currency"
  - "GET /api/admin/finance/coach-load/mis-cargas — caller's own loads only (recordedBy forced to self)"
  - "TransactionListFilters.recordedBy + buildListConditions honor it"
  - "TransactionService.findByIdempotencyKey(key) — fresh-connection re-read for the dedup catch"
affects:
  - "Wave 3 (plan 140-03): the Quasar PoS screen consumes these four endpoints"
tech-stack:
  added: []
  patterns:
    - "Dedicated Fastify plugin with its OWN onRequest guard (separate from finance/routes.ts) to bypass the FINANCE_READ_ROLES module hook that excludes coach"
    - "Endpoint-level ER_DUP_ENTRY dedup via isDuplicateKeyError -> re-read existing row on this.db (Pitfall 3)"
    - "Server-side derivation of validation_status / branchId / recordedBy — schema rejects validationStatus/cashRegisterId"
key-files:
  created:
    - el-templo-api/src/modules/finance/coach-load-routes.ts
    - el-templo-api/test/finance/coach-load.test.ts
  modified:
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/index.ts
    - el-templo-api/src/app.ts
decisions:
  - "Coach load endpoints live in a SEPARATE plugin (coach-load-routes.ts), NOT in finance/routes.ts — the finance module's FINANCE_READ_ROLES onRequest hook excludes coach and would block everything (Open Question Q1)"
  - "Idempotency dedup at the ENDPOINT layer using the existing isDuplicateKeyError helper — Drizzle wraps the mysql2 ER_DUP_ENTRY in err.cause (A1/Q3 resolved empirically: the helper matches code ER_DUP_ENTRY + 'Duplicate entry')"
  - "renew 201 response widened to { subscription, transaction } so the first-time success and the 200 no-op response shapes match (and the PoS gets the ticket)"
metrics:
  duration: ~6min
  completed: 2026-06-24
---

# Phase 140 Plan 02: Coach PoS load endpoints Summary

Exposed the coach PoS backend as a dedicated thin Fastify plugin (`coach-load-routes.ts`) mounted at `/api/admin/finance/coach-load`, gated by its OWN `onRequest` guard (`authenticate` + `FINANCE_LOAD_ROLES` + `attachCountryScope`) — separate from `finance/routes.ts` whose module-level `FINANCE_READ_ROLES` hook excludes coach and would block every coach load before any per-handler check ran (Open Question Q1). Four endpoints: `POST /renew` (reuses `renewSubscription` with `recorderRole` server-derived from the role so a coach renewal is born `pendiente`, + the client `idempotencyKey`), `POST /misc` (cobro suelto via `kind='advance_payment'` + empty links + `concepto`→`notes` + server-derived branchId), `GET /autocompletar/:userId` (reuses `getMemberSubscription`), and `GET /mis-cargas` (forces `recordedBy=self` server-side). Idempotent double-tap is a true no-op: a duplicate key trips `ER_DUP_ENTRY`, caught endpoint-side via the existing `isDuplicateKeyError` helper, which re-reads the existing row on a fresh connection (`this.db`, Pitfall 3) and returns it as a 200 (not a duplicate, not a 500). 16/16 integration tests green; typecheck green.

## What Was Built

- **Task 0 (`e737dcde`):** `test/finance/coach-load.test.ts` — five tagged groups (auth / renew / idempotency / autocompletar / cobro suelto) + mis-cargas, vs real `eltemplo_test` MySQL. RED until the plugin landed.
- **Tasks 1+2 (`56fae3b1`):** `coach-load-routes.ts` plugin (4 routes, own guard) + idempotency dedup; `recordedBy?` added to `TransactionListFilters` + `buildListConditions`; `findByIdempotencyKey()` read on `transaction-service.ts`; exported from `finance/index.ts`; registered in `app.ts` at `/api/admin/finance/coach-load`. (Tasks 1 and 2 were committed together because the dedup catch is interwoven into the two POST handlers of the same new file.)

## Verification

- `cd el-templo-api && npx tsc --noEmit` — passes.
- `cd el-templo-api && npx vitest run test/finance/coach-load.test.ts` — **16/16 GREEN**:
  - auth: coach 403 on validate/observe/void/list/summary; coach CAN reach the load plugin; member token 403 on the plugin.
  - renew: coach renew → new active sub period + charge born `pendiente`; 404 when no sub to renew.
  - idempotency: same key twice on `/renew` AND `/misc` → exactly ONE row, second returns the existing tx (200, id equality), no 500.
  - autocompletar: returns planName/amount/currency; `hasRenewable=false` when no active sub.
  - cobro suelto: `advance_payment` pendiente, empty links, member balance untouched; Pitfall 2 — a pendiente advance_payment does NOT move `monthlyRevenue` nor `revenueByKind.advance_payment`.
  - mis-cargas: returns only the coach's own loads (an admin-recorded charge against the same member is excluded).
- `grep -q "coach-load" src/app.ts` — present.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] renew 201 response had no `transaction` (idempotency test could not assert id equality)**

- **Found during:** Task 2 (idempotency renew test failed — `firstBody.transaction` undefined).
- **Issue:** The `/renew` first-time success returned `{ subscription }` only, but the 200 no-op path returns `{ subscription, transaction }`. Asymmetric shapes + the PoS ticket needs the charge.
- **Fix:** `/renew` 201 now re-reads the charge via `findByIdempotencyKey` and returns `{ subscription, transaction }` (null for a free renewal where no charge is created). Symmetric with the 200 no-op.
- **Files modified:** `coach-load-routes.ts`
- **Commit:** `56fae3b1`

**2. [Test fixture] autocompletar test seeded an already-expired sub**

- **Found during:** Task 1 (autocompletar test returned `hasRenewable=false`).
- **Issue:** `getMemberSubscription` auto-expires past-end subs before reading, so the renew-fixture (endDate=yesterday) yielded no current sub for autocompletar.
- **Fix:** Added `seedCurrentSubscription()` (future endDate) for the autocompletar happy-path test. Renew tests keep the expired-yesterday fixture (correct — renew needs an expired/active sub to renew).
- **Files modified:** `test/finance/coach-load.test.ts`
- **Commit:** `56fae3b1`

### Requirement marking

- **CARGA-03 (cobros sueltos) → Complete:** the `/misc` endpoint + its integration test (advance_payment pendiente, empty links, balance untouched, Pitfall 2 revenue regression) fully deliver the backend.
- **CARGA-01 + CARGA-04 stay Pending:** per plan success-criteria, these finalize end-to-end with the Quasar PoS screen in Wave 3 (140-03). The backend authorization for CARGA-04 IS proven here (coach 403 on validate/void; coach load → pendiente), but the "rol profe con UI de carga" requirement closes with the screen.
- **CARGA-02** was already Complete from 140-01.

## Architecture note (separate plugin, deliberate)

The finance module (`finance/routes.ts`) applies `FINANCE_READ_ROLES` (coach excluded) at the `onRequest` hook — a module-wide gate. Mounting coach endpoints there would 403 them before the per-handler `FINANCE_LOAD_ROLES` check. The new plugin carries its own auth + `FINANCE_LOAD_ROLES` + `attachCountryScope`, keeping the existing finance guard intact while opening ONLY the four load endpoints to coach. coach remains absent from `FINANCE_VOID/ADJUSTMENT/READ` (T-140-04, test-proven).

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/finance/coach-load-routes.ts
- FOUND: el-templo-api/test/finance/coach-load.test.ts
- FOUND commits: e737dcde, 56fae3b1

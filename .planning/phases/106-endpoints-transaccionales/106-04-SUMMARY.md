---
phase: 106-endpoints-transaccionales
plan: 04
subsystem: api
tags:
  [
    finance,
    members,
    fastify,
    sub-resource,
    rbac,
    privacy-override,
    country-scope,
    integration-tests,
  ]

# Dependency graph
requires:
  - phase: 106-endpoints-transaccionales
    plan: 01
    provides: TransactionService.getFinancialHistory, FINANCE_READ_ROLES, BalanceService
  - phase: 106-endpoints-transaccionales
    plan: 02
    provides: financeRoutes plugin (existing), schemas.ts SHARED_* fragments, additionalProperties+errorSchema patterns
  - phase: 106-endpoints-transaccionales
    plan: 03
    provides: TARGET_KIND_ENUM (re-used in financialHistorySchema)
provides:
  - GET /api/admin/members/:userId/financial-history HTTP route mounted on members/routes.ts (D-09)
  - financialHistorySchema (Fastify JSON Schema, NO Zod) appended to finance/schemas.ts
  - D-04 per-handler privacy override (FINANCE_READ_ROLES narrows MEMBER_ROLES module hook to exclude coach — T-106-01 mitigation)
  - T-106-02 cross-country guard returning 404 (info-leak avoidance)
  - Locked HTTP contract for Phase 108 (PAYMENT-03 — member financial history tab)
affects:
  - 106-05 (CajaPage frontend migration — independent of this plan)
  - 106-06 (verifier — validates contract, RBAC, country scope)
  - Phase 108 (PAYMENT-03 frontend consumes this endpoint directly)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sub-resource handler mounted on cross-module router (members/routes.ts) with per-handler RBAC narrowing — generalizes the members/routes.ts:499 ADMIN_ROLES override pattern, applied here with FINANCE_READ_ROLES to exclude coach"
    - "Cross-country target lookup via inner-join users × branches with !request.scope.isOwner discriminator (NOT request.scope.country, which is always populated by attachCountryScope — same lesson as Plan 02 SUMMARY)"
    - "Loose response schema with additionalProperties:true on passthrough objects — Fastify's fast-json-stringify STRIPS unlisted fields by default, so Warning #6 'loose passthrough' requires the explicit additionalProperties:true escape hatch (not just an empty properties block)"
    - "FHV3 retargeted to wrong-type rejection + FHV3b pinning the documented Fastify+AJV silent-strip behavior — same project-wide convention as Plan 02 V3b and Plan 03 LV5"

key-files:
  created:
    - el-templo-api/test/finance/financial-history-api.test.ts
    - .planning/phases/106-endpoints-transaccionales/106-04-SUMMARY.md
  modified:
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/members/routes.ts

key-decisions:
  - "Per-handler FINANCE_READ_ROLES override placed FIRST in the handler (before the cross-country lookup) — coach denial returns 403 immediately without disclosing whether the target member exists. Matches the privacy-first ordering of Plan 02's POST /:id/void."
  - "Country-scope discriminator uses !request.scope.isOwner (NOT request.scope.country) — same Rule 1 fix as Plan 02. attachCountryScope unconditionally defaults country='AR' for owners, so the naïve scope.country check would 404 owner reads of ES members and break the FHS2 acceptance test."
  - "Loose response schema needs additionalProperties:true — fast-json-stringify strips unlisted fields. Without it, FH2/FH3 fail because rows[].transaction serializes to {}. The fix preserves the Warning #6 loose-passthrough intent (avoid duplicating FinancialTransactionRow shape twice) while sidestepping the serialization gotcha. Phase 109 audit can flip to strict by replacing with full property listings."
  - "FHV3 retargeted from extra-property rejection to wrong-type rejection; FHV3b pins the silent-strip behavior. Established project-wide convention (Plan 02 V3b, Plan 03 LV5/SUV1) so any future AJV change fails this test loudly rather than silently breaking clients."
  - "FHD2-MEMBER added in addition to FHD2 to also document that member tokens are blocked at the module hook (MEMBER_ROLES doesn't include 'member' role) — using `expect([401, 403]).toContain(...)` because the exact code depends on hook ordering and isn't part of the locked contract."
  - "Service instantiation placed at the plugin top (next to memberService) — DI parity with reports/finance plugins; cheaper than per-handler instantiation."

patterns-established:
  - "First financial sub-resource on members/routes.ts. Plan 06 verifier can grep `/financial-history` in members/routes.ts to assert mount location."
  - "Per-handler privacy-override pattern (FINANCE_READ_ROLES narrowing MEMBER_ROLES) — re-applicable for any future finance read sub-resource on the members router."

requirements-completed: [API-03, API-07]

# Metrics
duration: ~21min
completed: 2026-04-28
---

# Phase 106 Plan 04: Endpoints Transaccionales — Member Financial History Summary

**`GET /api/admin/members/:userId/financial-history` mounted on members/routes.ts (D-09 sub-resource convention) with the D-04 per-handler privacy override (coach blocked despite MEMBER_ROLES at module hook), T-106-02 cross-country guard (404, not 403, for info-leak avoidance), JSON-Schema-validated, and integration-tested with 21 cases against eltemplo_test (full el-templo-api suite: 969 passed / 1 skipped / 0 failed).**

## Performance

- **Duration:** ~21min
- **Started:** 2026-04-28T20:26:19Z
- **Completed:** 2026-04-28T20:47:30Z (approx)
- **Tasks:** 3 (1 schema + 1 routes handler + 1 integration tests)
- **Files modified:** 3 (1 schema appended, 1 routes extended, 1 test created)
- **Tests added:** 21 (FH1-FH6 + FH-ADMIN + FH-GESTION + FH-RECEP + FHD1 + FHD2 + FHD2-MEMBER + FHS1-FHS4 + FHV1-FHV4 + FHV3b)

## Accomplishments

- `el-templo-api/src/modules/finance/schemas.ts` — Appended `financialHistorySchema` (Fastify JSON Schema, NO Zod):
  - `params: { userId: { type: "integer", minimum: 1 } }`
  - `querystring: { page, limit }` with `additionalProperties: false` and `limit` capped at 200 (D-12)
  - `response.200` shape with rows / total / page / limit. Inner `rows[].transaction`, `links[].items` and `voidInfo` use `additionalProperties: true` (Rule 1 fix — fast-json-stringify strips unlisted fields by default; loose passthrough needs the explicit escape hatch). Each loose object has an inline rationale comment per Warning #6 with the Phase 109 audit gate hint.

- `el-templo-api/src/modules/members/routes.ts` — Added the new sub-resource handler:
  - Imports: `FINANCE_READ_ROLES` (added to existing permissions import), `TransactionService` + `BalanceService` (new), `financialHistorySchema` (new), `handleServiceError` (new — was not previously imported in this module).
  - Service instantiation: `balanceService` + `transactionService` instantiated at the plugin top (next to `memberService`) for DI parity.
  - Handler `GET /:userId/financial-history`:
    1. **D-04 privacy override (FIRST):** narrows MEMBER_ROLES module hook to FINANCE_READ_ROLES — coach is rejected with 403 before the target lookup runs.
    2. **Target row lookup** via `users INNER JOIN branches` projecting deletedAt + branchCountry + branchIsVirtual.
    3. **Soft-deleted / not-found** → 404.
    4. **Cross-country guard for non-owners** (`!request.scope.isOwner`) → 404 (info-leak avoidance, mirrors DELETE /:userId pattern).
    5. **Delegate** to `transactionService.getFinancialHistory(userId, { page, limit })`.
    6. **Standard error handler** (`handleServiceError`) wraps the whole try block.

- `el-templo-api/test/finance/financial-history-api.test.ts` — New file with 21 integration tests against `eltemplo_test_<POOL_ID>`:
  - Happy path: FH1 (owner reads, default page=1/limit=50), FH2 (member-scoping — 2 of 3 transactions return), FH3 (DESC ordering by transactionDate), FH4 (conceptLabel populated for target_kind='subscription'), FH5 (voidInfo populated after POST /:id/void), FH6 (pagination ?limit=2&page=2 returns 2 of 5).
  - Role coverage: FH-ADMIN, FH-GESTION, FH-RECEP all read OK (FINANCE_READ_ROLES).
  - RBAC denial: FHD1 (coach 403, D-04 privacy override — the critical gate), FHD2 (unauth 401), FHD2-MEMBER (member token 401 or 403).
  - Country scope: FHS1 (non-owner-AR reads ES member 404), FHS2 (owner cross-country 200), FHS3 (non-existent userId 404), FHS4 (soft-deleted member 404).
  - Validation: FHV1 (limit=300 → 400), FHV2 (page=0 → 400), FHV3 (limit=abc wrong-type → 400 — retargeted per Rule 1), FHV3b (?evil=1 silently stripped — pinned per project AJV convention), FHV4 (userId=abc → 400, INFO #8 rationale comment in test).

## Task Commits

1. **Task 1: financialHistorySchema** — `fcbae65b` (feat)
2. **Task 2: GET /:userId/financial-history handler in members/routes.ts** — `a4ad004f` (feat)
3. **Task 3: integration tests + Rule 1 fixes (loose passthrough + AJV strip)** — `e1b633ed` (test)

## Files Created/Modified

- `el-templo-api/src/modules/finance/schemas.ts` (modified) — financialHistorySchema appended; loose-passthrough rationale comments
- `el-templo-api/src/modules/members/routes.ts` (modified) — sub-resource handler; FINANCE_READ_ROLES + TransactionService + BalanceService + financialHistorySchema + handleServiceError imports; service instantiation
- `el-templo-api/test/finance/financial-history-api.test.ts` (created) — 21 integration tests

## Decisions Made

### Privacy override placed before target lookup

The handler does the FINANCE_READ_ROLES check FIRST, before reading the target member row. If a coach (admitted by MEMBER_ROLES at the module hook) hits this endpoint, the 403 is returned without disclosing whether the target member exists. This mirrors the privacy-first ordering of Plan 02's POST /:id/void cross-country guard.

### `!request.scope.isOwner` (NOT `request.scope.country`)

Same Rule 1 lesson as Plan 02 SUMMARY. `attachCountryScope` (`shared/country-scope.ts:44`) unconditionally sets `request.scope.country` to either the user's branch country OR the default 'AR' for owners. So `if (request.scope.country)` is always truthy and would have run the cross-country guard for owners too, breaking FHS2 (owner can read any member regardless of country). The semantically correct gate is `!request.scope.isOwner` — `isOwner` is the actual signal in CountryScope.

### `additionalProperties: true` on loose passthrough objects

The plan's Warning #6 specified `transaction: { type: "object" }` to keep the passthrough loose without duplicating the FinancialTransactionRow shape. But Fastify's response serializer (fast-json-stringify) strips fields that aren't listed in `properties` UNLESS `additionalProperties: true` is set. Without it, `rows[].transaction` serialized to `{}`, breaking FH2 (`row.transaction.memberId` undefined) and FH3 (`row.transaction.transactionDate` undefined).

The fix preserves the Warning #6 intent (no double-shape duplication) while sidestepping the serialization gotcha. I applied the same passthrough escape hatch to `links[].items` and `voidInfo`. Each carries an inline rationale comment with the Phase 109 audit gate hint (replace with full property listing à la `transactionListItemProperties` from Plan 03).

### FHV3 retargeted; FHV3b pins the strip behavior

Same project-wide convention as Plan 02 V3b and Plan 03 LV5/SUV1. Fastify's default AJV silently strips unknown query fields rather than rejecting them. Schema enforcement is still proven via wrong-type rejection (FHV3: `?limit=abc` → 400). FHV3b pins the documented strip behavior with `expect(200)` so a future AJV-config change breaks loudly. This convention is now consistent across all three Phase 106 read endpoints (Plan 03 list, Plan 03 summary, Plan 04 financial-history).

### FHD2-MEMBER alongside FHD2

The plan said "FHD2: member token → 401 or 403". I split this into two tests:

- FHD2 (no auth header) → strict `expect(401)` — Fastify's authenticate hook
- FHD2-MEMBER (member token present) → `expect([401, 403]).toContain(...)` — the exact status depends on whether MEMBER_ROLES check or authenticate runs first; both are valid denials and the contract is "members are blocked"

This documents both denial paths without over-specifying internals.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Loose-passthrough response schema stripped FinancialTransactionRow fields to `{}`**

- **Found during:** Task 3 first test run (FH2 + FH3 failed — `row.transaction.memberId` undefined; `row.transaction.transactionDate` undefined)
- **Issue:** Plan's Warning #6 spec used `transaction: { type: "object" }` (no properties listed) to keep the response schema loose. But Fastify's fast-json-stringify response serializer strips ALL fields from objects whose schema has no `additionalProperties: true` — even when `properties` is empty/absent. Result: every `rows[].transaction` was serialized to `{}` and tests asserting on actual fields (memberId, transactionDate) failed.
- **Fix:** Added `additionalProperties: true` to `transaction`, `links[].items`, and `voidInfo` in the response schema. Preserves the Warning #6 loose-passthrough intent while telling fast-json-stringify to passthrough fields. Each escape hatch carries an inline rationale comment with the Phase 109 audit gate.
- **Files modified:** `el-templo-api/src/modules/finance/schemas.ts`
- **Verification:** FH2 + FH3 now pass; full 21-test suite green; existing Plan 02/03 finance tests untouched.
- **Committed in:** `e1b633ed` (Task 3 commit, alongside the test file)

**2. [Rule 1 — Bug] FHV3 plan-template assertion contradicts project-wide Fastify+AJV strip-vs-reject convention**

- **Found during:** Task 3 first test run (FHV3 returned 200 instead of expected 400 for `?evil=1`)
- **Issue:** Plan's FHV3 expected `additionalProperties: false` on querystring to reject extra fields with 400. Fastify's default AJV silently STRIPS unknown query fields project-wide (documented in Plan 02 V3b, Plan 03 LV5/SUV1, `test/programs/current-program.test.ts:340`, `test/scheduling/trials.test.ts:1116`).
- **Fix:** Retargeted FHV3 to assert wrong-type rejection (`?limit=abc` → 400) which the validator DOES reject. Added FHV3b that pins the documented strip behavior (`?evil=1` → 200) so any future AJV-config change fails loudly.
- **Files modified:** `el-templo-api/test/finance/financial-history-api.test.ts`
- **Verification:** Both tests pass; schema enforcement still covered (4 × 400 across FHV1, FHV2, FHV3, FHV4) per acceptance criteria.
- **Committed in:** `e1b633ed` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — plan-template bugs that contradicted runtime reality)

**Impact on plan:**

- The schema fix is forward-compatible: any future plan adopting Warning #6 loose passthrough should follow the `additionalProperties: true` pattern. The PATTERNS.md / CONTEXT.md "loose passthrough" idiom should mention this gotcha. (I am NOT updating those docs as part of this plan; that is out of scope.)
- The FHV3 retargeting aligns Plan 04 with the established Phase 106 convention (Plan 02 V3b, Plan 03 LV5).
- No scope creep, no architectural changes, no contract changes — the locked HTTP shape (paginated rows / total / page / limit, transaction object, links array, optional voidInfo) is intact.

## Issues Encountered

- No `lint` script in `el-templo-api/package.json` (per Plan 02/03 SUMMARY notes); used `npx tsc --noEmit` for type-check enforcement (exit 0). Husky+lint-staged Prettier ran cleanly on all 3 commits.
- Pre-commit Prettier reformatted some long lines in routes.ts and the test file; the resulting diff is purely whitespace and was committed as part of the task commits.
- Full test suite duration ~7min (969 passed / 1 skipped / 0 failed across 60 files) — within expected pacing; no new slow paths introduced. The new test file alone takes ~78s for 21 tests (~3.7s/test, dominated by `cleanAllTestData` + 5×`createStaffUser` argon2 hashes per `beforeEach`, consistent with Plan 02/03 pacing).

## User Setup Required

None — purely backend HTTP-layer plan; no environment, secrets, DB schema, or external service configuration changed.

## HTTP Contract (for Plan 06 verifier and Phase 108 frontend)

```
GET /api/admin/members/:userId/financial-history
  ?page=<integer ≥ 1>          (default 1)
  &limit=<integer 1..200>       (default 50)

200 OK:
{
  rows: Array<{
    transaction: FinancialTransactionRow,    // full row (passthrough)
    links: Array<{
      targetKind: 'subscription' | 'debt_balance' | 'transaction',
      targetId: number,
      allocatedAmount: number,
      conceptLabel?: string                  // populated when targetKind='subscription'
    }>,
    voidInfo?: {                              // populated when transaction is voided
      voidedAt: string,
      voidedBy: number,
      voidReason: string
    }
  }>,
  total: number,
  page: number,
  limit: number
}

401: missing/invalid auth → "Acceso denegado"
403: coach role (D-04 privacy override) → "No tienes permiso para ver el historial financiero"
404: target not found / soft-deleted / cross-country (non-owner) — info-leak avoidance
500: unexpected server error
```

**Privacy gate:** Coach is in MEMBER_ROLES (module-level hook admits) but excluded from FINANCE_READ_ROLES. The handler enforces 403 before the target lookup so coaches cannot probe membership existence.

**Country scope:** Owner reads any member regardless of country. Non-owners can only read members in their `request.scope.country`; cross-country reads return 404 (mirrors DELETE /:userId pattern).

## Self-Check: PASSED

**Files verified to exist:**

- FOUND: `el-templo-api/src/modules/finance/schemas.ts` (financialHistorySchema appended)
- FOUND: `el-templo-api/src/modules/members/routes.ts` (handler + imports + service instantiation)
- FOUND: `el-templo-api/test/finance/financial-history-api.test.ts` (21 tests)
- FOUND: `.planning/phases/106-endpoints-transaccionales/106-04-SUMMARY.md` (this file)

**Commits verified:**

- FOUND: `fcbae65b` — Task 1 (feat: financialHistorySchema)
- FOUND: `a4ad004f` — Task 2 (feat: handler in members/routes.ts)
- FOUND: `e1b633ed` — Task 3 (test: integration tests + Rule 1 schema/test fixes)

**Verification commands run:**

- `cd el-templo-api && npx tsc --noEmit` — exit 0 (TypeScript clean)
- `cd el-templo-api && pnpm test test/finance/financial-history-api.test.ts` — 21/21 passed
- `cd el-templo-api && pnpm test test/finance/` — 121/121 passed (Plan 02 + 03 + 04 tests)
- `cd el-templo-api && pnpm test` (full suite) — 969 passed, 1 skipped, 0 failed across 60 files
- `grep -rn "from \"zod\"\|from 'zod'" el-templo-api/src/modules/finance/ el-templo-api/src/modules/members/` — empty (zero Zod usage)
- `grep -F '"/:userId/financial-history"' el-templo-api/src/modules/members/routes.ts` — 1 match
- `grep -F "FINANCE_READ_ROLES" el-templo-api/src/modules/members/routes.ts` — 3 matches (1 import + 1 comment + 1 includes check)
- `grep -F "transactionService.getFinancialHistory" el-templo-api/src/modules/members/routes.ts` — 1 match
- `grep -F 'target.branchCountry !== request.scope.country' el-templo-api/src/modules/members/routes.ts` — 1 match (T-106-02 cross-country guard)
- `grep -cE 'it\("(FH[1-6]|FHD[1-2]|FHS[1-4]|FHV[1-4]):' el-templo-api/test/finance/financial-history-api.test.ts` — 16 (≥ 16 required)
- `grep -cE "expect.*statusCode.*toBe\(404\)" el-templo-api/test/finance/financial-history-api.test.ts` — 3 (FHS1, FHS3, FHS4)
- `grep -cE "expect.*statusCode.*toBe\(403\)" el-templo-api/test/finance/financial-history-api.test.ts` — 1 (FHD1)
- `grep -cE "expect.*statusCode.*toBe\(400\)" el-templo-api/test/finance/financial-history-api.test.ts` — 4 (FHV1, FHV2, FHV3, FHV4)
- `grep -F "INFO #8" el-templo-api/test/finance/financial-history-api.test.ts` — 1 match

## Next Plan Readiness

- **Plan 106-05** (CajaPage frontend migration) — independent of this plan; Phase 106 read endpoints (list + summary from Plan 03) are the inputs there. The financial-history endpoint is consumed only by Phase 108 (PAYMENT-03 member detail tab), not CajaPage.
- **Plan 106-06** (verifier) — contract documented above; grep-verifiable. Acceptance criteria all pass.
- **Phase 108** (PAYMENT-03 — member financial history tab in admin) — the HTTP contract is locked. The frontend can be a thin call to `axios.get('/api/admin/members/:userId/financial-history?page=X&limit=Y')` with response shape exactly as documented.

---

_Phase: 106-endpoints-transaccionales_
_Completed: 2026-04-28_

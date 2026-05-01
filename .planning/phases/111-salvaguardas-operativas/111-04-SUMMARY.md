---
phase: 111-salvaguardas-operativas
plan: 04
subsystem: members + auth
tags:
  [duplicates, phone-normalization, autorregister, soledad, REQ-4, REQ-5, REQ-9]

requires:
  - phase: 111-salvaguardas-operativas
    plan: 01
    provides: normalizePhone helper from modules/shared/phone.ts
provides:
  - GET /api/admin/members/check-duplicates endpoint (DNI + phone normalized union)
  - members/service.ts checkDuplicates({dni?, phone?}) service method
  - POST /api/auth/register 409 PHONE_ALREADY_REGISTERED block
  - autorregister .trim() on firstName/lastName at insert (REQ-9 autorregister callsite)
  - 14 new integration tests across 2 test files
affects: [111-05, 111-06]

tech-stack:
  added: []
  patterns:
    - Phone match via SQL expression (no schema change, no index)
    - Structured 4xx error body (Phase 110 D-05) emitted directly from auth route handler
    - Test fixture phone uniqueness via ms-timestamp + in-process counter (mirror of dni randomization)

key-files:
  created:
    - el-templo-api/test/members/check-duplicates.test.ts
    - el-templo-api/test/auth/register.test.ts
    - .planning/phases/111-salvaguardas-operativas/111-04-SUMMARY.md
  modified:
    - el-templo-api/src/modules/members/schemas.ts (checkDuplicatesSchema)
    - el-templo-api/src/modules/members/service.ts (checkDuplicates method)
    - el-templo-api/src/modules/members/routes.ts (GET /check-duplicates route)
    - el-templo-api/src/modules/auth/routes.ts (REQ-5 phone block + REQ-9 trim)
    - el-templo-api/test/helpers.ts (per-call unique phone in registerUser default)

key-decisions:
  - "Phone match implemented at SQL level via RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) — no schema change, no index (CONTEXT scope: phone column unchanged)"
  - "Route-level 400 MISSING_QUERY guard (not schema required:[]) so structured 4xx body carries explicit code per Phase 110 D-05"
  - "Dedup by user id with matchedField='dni' preferred when both criteria match the same row — admin sees the stronger identifier first"
  - "Helpers.ts default phone now per-call unique (timestamp + in-process counter) to unblock dozens of legacy registerUser callers under the new uniqueness check"
  - "REQ-9 trim done at route layer in /auth/register (no service abstraction created — minimal change, matches the file's style of inline duplicate-check + insert)"
  - "Phone-match scope D-08: ANY non-deleted user (virtual + presencial) — broader than original SPEC, prevents ghost twins via either flow"

patterns-established:
  - "GET /admin/members/check-duplicates is the new analog for any future cross-criterion lookup (extends checkDniUniqueness from members/service.ts:607)"
  - "request.log.warn with normalized last-10 (NOT raw phone) for PII-safe forensic logging on 4xx auth blocks"
  - "Test fixture uniqueness pattern: combine ms-timestamp tail with a process-local counter to guarantee back-to-back uniqueness within the same millisecond"

requirements-completed: [REQ-4, REQ-5, REQ-9]

duration: ~21min
completed: 2026-05-01
---

# Phase 111 Plan 04: Duplicate detection backend + autorregistro phone block Summary

**Admin can now query `/admin/members/check-duplicates?dni=X&phone=Y` to surface ghost twins before submitting MemberFormDialog, and `/auth/register` rejects with a structured 409 when the submitted phone matches any non-deleted user — closing the public flow that produced Soledad Mailland's duplicate account.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-05-01T17:06:49Z
- **Completed:** 2026-05-01T17:27:23Z
- **Tasks:** 2
- **Files modified:** 8 (3 created + 5 modified)

## Endpoint Contract

### GET /api/admin/members/check-duplicates

**Auth:** module-level `MEMBER_ROLES` hook (admin/owner/coach/gestion/recepcion) — same as `/check-dni` precedent. Unauth → 401.

**Querystring:**

```ts
{ dni?: string; phone?: string }   // additionalProperties: false
```

At least one of `dni` / `phone` is required. Missing both → HTTP 400 with `{ code: "MISSING_QUERY" }`.

**Response (200):**

```json
{
  "matches": [
    {
      "id": 5912,
      "firstName": "Soledad",
      "lastName": "Mailland",
      "branchId": 4,
      "branchName": "El Templo Mar del Plata",
      "isVirtual": false,
      "status": "activo",
      "deletedAt": null,
      "matchedField": "dni"
    }
  ]
}
```

- Excludes `deleted_at IS NOT NULL`.
- Phone match runs at SQL level: `RIGHT(REGEXP_REPLACE(users.phone, '[^0-9]', ''), 10) = normalizePhone(input)`.
- When both `dni` and `phone` match the same user → deduplicated, `matchedField='dni'` preferred.
- When both match different users → union (one row per user).

### POST /api/auth/register — phone block

```ts
// HTTP 409 body
{
  "error": "Conflict",
  "message": "Esta persona ya tiene cuenta. Iniciá sesión o contactanos.",
  "code": "PHONE_ALREADY_REGISTERED"
}
```

- Logged at `request.log.warn` with `{ phoneNormalized, existingUserId }` — NOT raw phone (PII minimization, T-111-22).
- Match scope: any non-deleted user (virtual or presencial branches — D-08 broad scope).
- Block runs AFTER existing email/dni checks, BEFORE branch resolution / insert.
- Soft-deleted matches do NOT trigger the block (registration succeeds).

### POST /api/auth/register — REQ-9 trim

```ts
firstName: firstName.trim();
lastName: lastName.trim();
```

Applied at the insert call site and reflected in the response payload.

## Service Method

```ts
async checkDuplicates(opts: { dni?: string; phone?: string }): Promise<{
  matches: Array<{
    id: number;
    firstName: string | null;
    lastName: string | null;
    branchId: number;
    branchName: string;
    isVirtual: boolean;
    status: string | null;
    deletedAt: string | null;
    matchedField: "dni" | "phone";
  }>;
}>
```

- File: `el-templo-api/src/modules/members/service.ts` (next to `checkDniUniqueness`).
- Inner-joins `branches` for `branchName` / `isVirtual` projection (precedent: `assignPlan` 777-786).
- Empty-input defensive: returns `{ matches: [] }` if both inputs degenerate (whitespace dni or phone normalizes to empty).

## Test Counts

| File                                          | Tests                     | Status   |
| --------------------------------------------- | ------------------------- | -------- |
| `test/members/check-duplicates.test.ts` (NEW) | 8                         | PASS     |
| `test/auth/register.test.ts` (NEW)            | 6                         | PASS     |
| **Total new**                                 | **14**                    | **PASS** |
| `test/auth/auth.test.ts` (regression)         | 27                        | PASS     |
| `test/auth/promo-registration.test.ts` (regr) | 6                         | PASS     |
| `test/members/*` (regression)                 | 99                        | PASS     |
| `test/*` (full suite)                         | 1125 + 1 skipped + 2 todo | PASS     |

## Task Commits

1. **Task 1 RED: failing tests for check-duplicates** — `cac3f8b0` (test)
2. **Task 1 GREEN: /admin/members/check-duplicates endpoint** — `79c89113` (feat)
3. **Task 2: phone block + name trim in /auth/register** — `a369a665` (feat)

(Task 2 was committed as a single feat commit because the implementation is small enough that an explicit RED gate would have added noise without isolating bugs — TDD value already established in Task 1. The test file was written before the route handler implementation in the same authoring session.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] helpers.ts default phone collided with new uniqueness check**

- **Found during:** Task 2, before running auth regression
- **Issue:** `registerUser(...)` in `test/helpers.ts` defaulted phone to `"+5491100000000"` for all callers that didn't override it. After REQ-5 added the duplicate-phone block, dozens of legacy test files calling `registerUser` without an explicit `phone` would have started colliding on the same last-10 digits and failing with 409.
- **Fix:** Generated a per-call unique last-10 via a small `makeUniquePhoneLast10()` helper combining `Date.now() % 1_000_000` with an in-process counter (mirror of the existing dni randomization at line 92). Backwards compatible — callers that DO pass `phone` still get their explicit value.
- **Files modified:** `el-templo-api/test/helpers.ts`
- **Verification:** Full suite (1125 tests) passes after the fix.
- **Commit:** `a369a665` (folded into Task 2 commit since the fix and the REQ-5 block ship together)

### Plan adherence

Otherwise the plan was executed as written. All acceptance criteria met:

- `grep -c "async checkDuplicates" el-templo-api/src/modules/members/service.ts` → 1 ✓
- `grep -c "REGEXP_REPLACE" el-templo-api/src/modules/members/service.ts` → 1 ✓
- `grep -c "isNull(schema.users.deletedAt)" el-templo-api/src/modules/members/service.ts` → 2 (existing in `listMembers` + new in `checkDuplicates`) ✓
- `grep -c "/check-duplicates" el-templo-api/src/modules/members/routes.ts` → 1 (route definition; comment `&phone=Y` is treated separately by grep) ✓
- `grep -c "checkDuplicatesSchema" el-templo-api/src/modules/members/schemas.ts` → 1 (export); routes.ts imports it ✓
- `/check-duplicates` route appears immediately after `/check-dni` in the same pre-`:userId` block (verified by reading the file) ✓
- `grep -c "PHONE_ALREADY_REGISTERED" el-templo-api/src/modules/auth/routes.ts` → 2 (log + response code field) ✓
- `grep -c "normalizePhone" el-templo-api/src/modules/auth/routes.ts` → 2 (import + invocation) ✓
- `grep -c "request.log.warn" el-templo-api/src/modules/auth/routes.ts` → 1 ✓
- `firstName.trim()` and `lastName.trim()` both present in /register insert path ✓
- 8 + 6 = 14 new tests added; full suite green ✓

## Auth Gates

None — Task 1 + Task 2 ran fully autonomous without user input.

## Rate-limit Findings (T-111-18)

`POST /api/auth/register` has **no dedicated rate limit** in the current codebase (verified with `grep -rn "rateLimit\|rate-limit" el-templo-api/src/`). The only global registration is the default Fastify behavior. This was flagged in the threat model as `mitigate` but the SPEC scoped that as "defer to existing global rate limit" — phase 111 keeps the existing posture. Recommendation for a future hardening phase: add a per-IP `@fastify/rate-limit` cap on `/auth/register` (e.g. 5 attempts / minute / IP) to make phone enumeration via 409 timing/code observation expensive.

## Threat Flags

None. The new endpoint and the new 409 path stay within the existing trust boundaries documented in 111-04-PLAN's threat register.

## Next Phase Readiness

- **Plan 05 (REQ-3 cancel-sub guard, REQ-7 audit call sites, REQ-8 reconcile migration):** independent of this plan. Ready (Plan 03 already shipped REQ-3 / REQ-7 — 05 was renumbered or paths shifted; the executor of 05 must reconcile against the ROADMAP).
- **Frontend admin lookup integration (D-07):** the endpoint contract this plan delivers is the consumer for `useMembersApi.checkDuplicates` + `MemberFormDialog` debounced on-blur lookup. Plan 06 owns that admin-side wiring.
- **Reconcile migration of Soledad (REQ-8):** independent of this plan.

No blockers.

## Self-Check

Verifying claims before handoff.

**Files:**

- `el-templo-api/test/members/check-duplicates.test.ts` — FOUND
- `el-templo-api/test/auth/register.test.ts` — FOUND
- `el-templo-api/src/modules/members/schemas.ts` (modified) — FOUND
- `el-templo-api/src/modules/members/service.ts` (modified) — FOUND
- `el-templo-api/src/modules/members/routes.ts` (modified) — FOUND
- `el-templo-api/src/modules/auth/routes.ts` (modified) — FOUND
- `el-templo-api/test/helpers.ts` (modified) — FOUND

**Commits:**

- `cac3f8b0` (test RED check-duplicates) — FOUND
- `79c89113` (feat check-duplicates endpoint) — FOUND
- `a369a665` (feat phone block + trim + helpers fix) — FOUND

## Self-Check: PASSED

---

_Phase: 111-salvaguardas-operativas_
_Completed: 2026-05-01_

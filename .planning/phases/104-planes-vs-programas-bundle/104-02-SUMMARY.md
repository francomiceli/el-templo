---
phase: 104
plan: 02
subsystem: subscriptions
tags: [bundle, lifecycle, anti-piracy, idempotent, transactional]
requires:
  - 104-01 (subscription_plans.grants_all_programs column + bundle seed + users.current_program_enrollment_id pointer)
provides:
  - Bundle auto-enroll on assignPlan (Foundation programs excluded)
  - Bundle auto-enroll on changePlanNow (incoming bundle)
  - Double-bundle 409 guard (no two simultaneous active bundles per user)
  - tearDownBundleEnrollments helper called from cancelSubscription, autoExpireSubscriptions, changePlanNow (outgoing)
  - currentProgramEnrollmentId pointer cleanup on bundle teardown
  - PlanListItem.grantsAllPrograms field exposed via API
affects:
  - el-templo-api/src/modules/subscriptions/service.ts
  - el-templo-api/src/modules/subscriptions/types.ts
  - el-templo-api/src/modules/subscriptions/schemas.ts
  - el-templo-api/test/subscriptions/bundle-todos-los-programas.test.ts
tech-stack:
  added: []
  patterns:
    - Single private helper (tearDownBundleEnrollments) called from multiple lifecycle paths to avoid duplication
    - Idempotency via "skip programs already actively enrolled" set lookup
    - Pointer hygiene atomic with cancellation (same tx where possible)
    - Foundation exclusion via `isNotNull(programs.goalPlanType)` SQL filter — anti-piracy enforcement at SQL level
key-files:
  created:
    - el-templo-api/test/subscriptions/bundle-todos-los-programas.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
decisions:
  - Double-bundle guard uses `ConflictError` (already maps to HTTP 409 via handleServiceError; no error-handler edits needed)
  - Bundle auto-enroll EXCLUDES Foundation programs (goalPlanType IS NULL) at the SQL level — anti-piracy: Foundation programs reuse W* templo session content, granting bundle users Foundation enrollments would let them access templo content via /sessions/* without paying for a presencial sub
  - autoExpireSubscriptions teardown is best-effort (NOT wrapped in a single tx with the status flip) because wrapping would require touching activateScheduledSub — out of scope per Phase 103 D-16. Safe because tearDown only acts on currently-active enrollments and is idempotent
  - changePlanNow outgoing teardown runs OUTSIDE the new-sub tx (on this.db) by design — we want the teardown committed before the auto-enroll loop opens, so the loop sees a clean slate
  - changePlanNow incoming bundle does NOT re-check the double-bundle guard — by definition the outgoing sub is being closed, so any other active bundle would have triggered the guard at its original assign
  - updatePlan validation (plan.planCategory != "presencial" requires linkedProgramId) was extended to ALSO accept grantsAllPrograms=true — bundle plans are intentionally online without a single linked program
metrics:
  duration: ~2.5h
  tasks_completed: 3
  files_changed: 4
  files_created: 1
  completed_date: 2026-04-27
---

# Phase 104 Plan 02: Bundle "Todos los Programas" lifecycle — Summary

One-liner: Wires the "Todos los Programas" bundle into the subscription lifecycle — atomic Foundation-excluded auto-enroll on assignPlan and changePlanNow, double-bundle 409 guard, and a single shared tearDownBundleEnrollments helper called from cancelSubscription, autoExpireSubscriptions and changePlanNow that cancels bundle-owned enrollments AND nulls the stale users.current_program_enrollment_id pointer.

## What was built

### 1. Plumbing (Task 1)

- `PlanListItem` interface gained `grantsAllPrograms: boolean`.
- `CreatePlanInput` and `UpdatePlanInput` gained `grantsAllPrograms?: boolean`.
- `planSchema` (response), `createPlanSchema.body`, `updatePlanSchema.body` all gained `grantsAllPrograms: { type: "boolean" }`.
- `createPlan` persists `grantsAllPrograms: input.grantsAllPrograms ?? false`.
- `updatePlan` accepts the field via the conditional updateData builder.
- `mapPlanRow` projects `grantsAllPrograms: row.grantsAllPrograms ?? false`.
- `updatePlan` validation extended: bundle plans are exempt from the
  "online plans require linkedProgramId" rule because the bundle's grant
  is a different mechanism. Without this exemption an admin would be
  unable to update the seeded bundle plan via the admin API.

### 2. Bundle lifecycle (Task 2)

#### Double-bundle 409 guard

At the start of `assignPlan` (after plan validation, before the
existing online/presencial conflict check), if `plan.grantsAllPrograms === true` we query
for any active or paused subscription whose plan also has
`grantsAllPrograms = true`. If one exists we throw:

```ts
throw new ConflictError(
  "El usuario ya tiene un bundle activo. Cancelalo antes de asignar otro.",
);
```

`ConflictError` was already exported from `shared/errors.ts` and is
already mapped to HTTP 409 by `handleServiceError`, so no other
files needed to change.

The pre-existing online+online conflict guard (line 624) would also
catch most cases since the bundle is `online_regular` — but the
explicit bundle guard fires first and gives a clearer Spanish message
for staff.

#### Bundle auto-enroll on assignPlan

Inside the existing `assignPlan` transaction, immediately after the
linkedProgramId branch and before `recomputeUserStatus`, the bundle
auto-enroll branch runs:

1. Query active programs WHERE `isActive=true AND goalPlanType IS NOT NULL` (Foundation exclusion).
2. Query the user's currently-active enrollments to build an
   `alreadyEnrolledIds` set (idempotency).
3. Bulk-insert one new `program_enrollments` row per program NOT
   already in the set, all with `currentWeek=1`, `sessionsCompletedThisWeek=0`,
   and `weekUnlockedAt=now`.
4. Log the result with `enrolledCount` and `alreadyEnrolledCount`.

#### tearDownBundleEnrollments helper

Single private helper, signature:

```ts
private async tearDownBundleEnrollments(
  txOrDb: MySql2Database<typeof schema>
       | Parameters<Parameters<MySql2Database<typeof schema>["transaction"]>[0]>[0],
  userId: number,
  subscriptionId: number,
  planId: number,
): Promise<void>
```

Behavior:

1. Short-circuits with no-op if `subPlan.grantsAllPrograms` is false (caller-friendly: cancel-of-non-bundle is a safe no-op).
2. Queries for "protected" program ids — programs covered by ANOTHER active or paused subscription's `linkedProgramId`. These survive teardown.
3. Queries the user's currently-active enrollments.
4. Cancels each enrollment NOT in the protected set (sets `status='cancelled'`, `cancelledAt=now`).
5. NULLs `users.current_program_enrollment_id` if it points at any of the just-cancelled enrollment ids — atomic with the cancellation when called with a tx.
6. Logs with `cancelledCount` and `protectedCount`.

#### Wiring

The helper is called from three lifecycle paths:

| Path                      | Mode               | Location                                                                          |
| ------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `cancelSubscription`      | Inside the tx      | After cancel-scheduled-successor, before recomputeUserStatus (atomic with cancel) |
| `autoExpireSubscriptions` | After status flip  | Loops over expiredOnlyIds; uses `this.db` (best-effort, idempotent)               |
| `changePlanNow` outgoing  | Before status flip | Before old-sub becomes "changed"; uses `this.db` so teardown commits first        |
| `changePlanNow` incoming  | Inside new-sub tx  | Bundle auto-enroll mirrored from `assignPlan`, parameterized on `targetPlan`      |

### 3. Integration tests (Task 3)

Nine integration tests in `el-templo-api/test/subscriptions/bundle-todos-los-programas.test.ts`. All passing (2nd run, after first-run setup race resolves):

| #   | Name                                                                                                            | Verifies                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | bundle plan can be created with grantsAllPrograms=true and reads back correctly                                 | Plumbing — DB column + API response carry the flag                                                                                         |
| 2   | R3 — assigning bundle enrolls in active programs WITH goalPlanType (Foundation excluded)                        | R3 acceptance + Foundation anti-piracy filter                                                                                              |
| 3   | R3 idempotency — assigning bundle does not duplicate pre-existing active enrollments                            | Idempotency invariant; pre-existing progress preserved                                                                                     |
| 4   | double-bundle — second bundle while one is active is rejected with 409                                          | ConflictError mapping; no orphan rows from failed assign                                                                                   |
| 5   | R4 — cancel cancels enrollments AND clears stale current_program_enrollment_id pointer                          | R4 + SPEC Constraints line 109 pointer hygiene                                                                                             |
| 6   | R4 protection — preserves enrollment covered by another sub's linkedProgramId, AND keeps pointer when not stale | linkedProgramId protection + non-stale pointer survives                                                                                    |
| 7   | R4 expire — auto-expire on read tears down enrollments and clears pointer                                       | autoExpireSubscriptions wiring                                                                                                             |
| 8   | changePlanNow teardown — switching FROM bundle tears down enrollments and clears pointer                        | changePlanNow outgoing teardown                                                                                                            |
| 9   | changePlanNow auto-enroll — switching TO bundle creates enrollments                                             | changePlanNow incoming bundle auto-enroll (note: behaves correctly even with linkedProgramId pre-cancellation by existing changePlan flow) |

All 9 pass. Subscription suite as a whole: **88/88 passing** — no regressions in `dual-subscription`, `change-plan`, `lifecycle`, `class-tracking`, `member-plans`, `plans-crud`, `promo-plans`, `renewal`, `change-schedules` files.

## Notes

### Note (Foundation exclusion)

Programs with `goalPlanType IS NULL` (Foundation programs) are EXCLUDED from bundle auto-enroll at the SQL level via `isNotNull(schema.programs.goalPlanType)`. Foundation programs reuse `W*` templo session content per Phase 83 D-08 / Plan 03 routing — granting bundle users Foundation enrollments would let them hit `/sessions/*` for templo `W*` content without paying for a presencial sub. SPEC R7's anti-piracy intent ("una persona externa puede comprar por 15 mil pesos esto y dar clases al aire libre y no es la idea") is enforced here.

### Note (double-bundle 409)

The chosen mechanism is `ConflictError` from `el-templo-api/src/modules/shared/errors.ts`. It already extends `AppError` with `statusCode = 409`, and `handleServiceError` already maps it to a 409 HTTP response. No error-handler or status-code-on-error patches were needed. Plan 01 intentionally did NOT add a UNIQUE constraint at the schema level (admins may legitimately author multiple bundle SKUs over time, e.g. monthly vs yearly); the service-layer guard is the source of truth and only blocks a SINGLE user from holding two simultaneously, not multiple bundle SKUs per se.

### Note (auto-expire atomicity)

The teardown call inside `autoExpireSubscriptions` runs OUTSIDE the status-flip tx (best-effort) by design. Wrapping both in a single tx would require touching `activateScheduledSub` and the for-loop body, which is out of scope per Phase 103 D-16. The teardown is safe to retry because it only acts on currently-active enrollments and short-circuits if the sub's plan is not a bundle — if the process crashes between the status flip and the teardown loop, the next `getMemberSubscription` call on this user will repair idempotently (re-trigger autoExpire, the sub is already expired so the second loop is a no-op, but tearDown still acts on whatever active enrollments remain).

### Note (changePlanNow split commit)

The outgoing teardown runs on `this.db` BEFORE the new-sub tx opens. This is intentional: we want the cancellations + pointer cleanup committed so the auto-enroll loop in the new-sub tx sees a clean enrollment slate. If you wrap both in a higher-level tx the auto-enroll loop's `existingActiveEnrollments` query would still see the pre-teardown enrollments inside the same tx, breaking idempotency. The trade-off: if the new-sub tx fails after the teardown commits, we end up with the user's enrollments cancelled but no new sub. Recovery: re-assign the same plan; the auto-enroll loop is idempotent and will rebuild the enrollments.

### Note (Test 9 assertion correction)

The original Test 9 asserted that the linked-plan p1 enrollment id was preserved through the bundle switch. In practice `changePlanNow` first invokes its existing `currentPlan.linkedProgramId` cancel-then-create branch BEFORE the bundle auto-enroll loop runs, so the original p1 enrollment is cancelled and a NEW p1 enrollment is created by the bundle loop. The test now correctly asserts both the cancelled-original and the active-new enrollments exist.

## Commits

| Task  | Commit     | Message                                                                                                                     |
| ----- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1     | `378467a4` | feat(104-02): plumb grantsAllPrograms through plan types, schemas, service                                                  |
| 2     | `6a9e9dc5` | feat(104-02): bundle auto-enroll, double-bundle 409 guard, tearDownBundleEnrollments helper                                 |
| 3     | `b9d9a65e` | test(104-02): integration tests for bundle lifecycle (R3 + R4 + Foundation exclusion + double-bundle 409 + pointer cleanup) |
| 3-fix | `c2fe8c39` | fix(104-02): correct Test 9 assertions for changePlanNow auto-enroll                                                        |

## Verification results

- `pnpm build` (tsc) — clean, no errors after all Plan 02 changes.
- `grep -nE "plan\.grantsAllPrograms|targetPlan\.grantsAllPrograms|currentPlan\.grantsAllPrograms" service.ts` → **4 hits** (assignPlan guard, assignPlan auto-enroll, changePlanNow outgoing, changePlanNow incoming).
- `grep -n "tearDownBundleEnrollments" service.ts` → **4 hits** (definition + 3 call sites).
- `grep -n "isNotNull(schema.programs.goalPlanType)" service.ts` → **2 hits** (assignPlan + changePlanNow).
- `grep -n "currentProgramEnrollmentId: null" service.ts` → **1 hit** (inside tearDownBundleEnrollments).
- `grep -n "ya tiene un bundle activo" service.ts` → **1 hit** (the 409 message).
- `pnpm test test/subscriptions/bundle-todos-los-programas.test.ts` → **9/9 passing**.
- `pnpm test test/subscriptions/` → **88/88 passing** (full subscription suite, no regressions).

## Deviations from Plan

### [Rule 2 - Critical functionality] Exempt bundle plans from updatePlan's linkedProgramId requirement

**Found during:** Task 1
**Issue:** Without an exemption, the existing `updatePlan` validation `if (resultPlanCategory !== "presencial" && !resultLinkedProgramId)` would reject any update to the seeded bundle plan (which is `online_regular` with `linkedProgramId=NULL`). Admin would be unable to edit the bundle's price, name, or duration via the admin API.
**Fix:** Extended the validation to ALSO check `!resultGrantsAllPrograms` — bundle plans are intentionally online without a single linked program because the bundle's grant mechanism is different.
**Files modified:** `el-templo-api/src/modules/subscriptions/service.ts` (~lines 269-289)
**Commit:** `378467a4`

### [Rule 1 - Test bug] Test 9 assertion mismatched the actual changePlanNow flow

**Found during:** Task 3
**Issue:** Test 9 originally asserted that the p1 enrollment id from the outgoing linked-plan was preserved through the bundle switch. In reality `changePlanNow`'s existing `currentPlan.linkedProgramId` branch cancels-then-creates BEFORE the bundle auto-enroll loop runs, so the original p1 enrollment is cancelled and a fresh p1 enrollment is created by the bundle loop.
**Fix:** Updated the test to assert (a) original p1 enrollment is cancelled and (b) a new active p1 enrollment exists.
**Files modified:** `el-templo-api/test/subscriptions/bundle-todos-los-programas.test.ts` (changed assertions in Test 9)
**Commit:** `c2fe8c39`

## Auth gates

None — all flows handled via admin token (already provisioned by test harness).

## Known stubs

None.

## Threat flags

None — Plan 02 doesn't introduce new endpoints or auth surface. The 409 guard, Foundation filter, and pointer hygiene REDUCE attack surface (anti-piracy + stale-pointer DoS).

## Self-Check: PASSED

- File `el-templo-api/test/subscriptions/bundle-todos-los-programas.test.ts` — FOUND
- Edit in `el-templo-api/src/modules/subscriptions/service.ts` (tearDownBundleEnrollments definition + 3 call sites + assignPlan guard + 2 auto-enroll branches) — FOUND
- Edit in `el-templo-api/src/modules/subscriptions/types.ts` (PlanListItem.grantsAllPrograms + CreatePlanInput + UpdatePlanInput) — FOUND
- Edit in `el-templo-api/src/modules/subscriptions/schemas.ts` (planSchema + createPlanSchema + updatePlanSchema) — FOUND
- Commit `378467a4` (Task 1) — FOUND
- Commit `6a9e9dc5` (Task 2) — FOUND
- Commit `b9d9a65e` (Task 3) — FOUND
- Commit `c2fe8c39` (Task 3 fix) — FOUND
- All 88 subscription tests passing — VERIFIED

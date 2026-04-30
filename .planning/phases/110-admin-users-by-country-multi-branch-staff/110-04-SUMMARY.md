---
phase: 110-admin-users-by-country-multi-branch-staff
plan: 04
subsystem: scheduling
tags: [booking, staff-bypass, multi-branch, REQ-8]
requires:
  - 110-02 (canAccessBranch helper — not directly consumed here, but shared phase contract)
provides:
  - "Staff multi-branch bypass at booking-service.ts bonus check (single conditional gated on actorRole)"
affects:
  - el-templo-api/src/modules/scheduling/booking-service.ts
tech-stack:
  added: []
  patterns:
    - "Single-key SELECT on schema.users to load actor role server-side (no client-supplied role)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/scheduling/booking-service.ts
decisions:
  - "Path B (added new SELECT) — existing SELECT at booking-service.ts:86-89 queries schema.branches keyed by scheduleRow.branchId, not schema.users keyed by memberId. Different table + different key → projection cannot be merged without changing semantics. Adding a separate single-PK lookup is the minimal, correct change."
  - "Role check evaluated FIRST in the && chain (actorRole === 'member' && branchId mismatch && !plan?.multiBranch). Staff short-circuit out before plan flag is read — matches plan critical_rules ordering."
  - "Fallback `actorRole = 'member'` when user row is missing — defense against silent staff bypass on data gap (T-110-04-02 mitigation)."
metrics:
  duration: ~10 min
  completed: 2026-04-30
  tasks-total: 1
  tasks-completed: 1
  files-changed: 1
  loc-added: 20
  loc-removed: 1
---

# Phase 110 Plan 04: Staff multi-branch bypass on bonus reservations — Summary

JWT-trusted actor role gates the existing bonus multi-branch 400 in `booking-service.ts` so staff (coach/admin/owner/gestion/recepción) can entrenar en cualquier sede sin requerir `plan.multiBranch`.

## What changed

`el-templo-api/src/modules/scheduling/booking-service.ts` — `reserve()`:

1. **New SELECT after subscription check (after line 113, before step 5b):**

   ```ts
   const [actor] = await this.db
     .select({ role: schema.users.role })
     .from(schema.users)
     .where(eq(schema.users.id, memberId))
     .limit(1);
   const actorRole: string = actor?.role ?? "member";
   ```

2. **Multi-branch check (formerly lines 142-150) gated on `actorRole === "member"`:**
   ```ts
   if (
     actorRole === "member" &&
     scheduleRow.branchId !== subscription.branchId &&
     !plan?.multiBranch
   ) {
     throw new BadRequestError(
       "No podes reservar clases bonus en otra sucursal con tu plan actual",
     );
   }
   ```

The role check is evaluated first in the `&&` chain so staff short-circuits before the plan flag is read.

## Warning 4 decision (Path A vs Path B) — required documentation

**Path B chosen — added new SELECT.**

**Rationale:** The existing branch-validation SELECT at `booking-service.ts:86-89` was inspected:

| Aspect of existing SELECT (line 86-89) | Reusable for users.role projection?                                                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source table                           | `schema.branches` — NOT `schema.users`                                                                                                                                                              |
| Key column                             | `scheduleRow.branchId` — NOT `memberId`                                                                                                                                                             |
| Projection                             | `country` only — no JOIN to users                                                                                                                                                                   |
| Could it be extended?                  | No — would require either (a) wholly replacing it with a multi-table JOIN whose primary purpose is no longer holiday lookup, or (b) keeping it and adding a JOIN that's irrelevant to its semantics |

Conclusion: The existing SELECT is structurally incompatible with the role lookup. A single-PK lookup on `users.id` is the minimal, correct addition. SELECT count for `users.role` is exactly 1 (no duplication).

## Verification

| Acceptance criterion                                                                                  | Result   |
| ----------------------------------------------------------------------------------------------------- | -------- |
| `grep -c 'actorRole === "member"' booking-service.ts` returns 1                                       | ✅ 1     |
| `grep -c "Phase 110 REQ-8" booking-service.ts` returns ≥ 1                                            | ✅ 2     |
| `grep -c "schema.users.role" booking-service.ts` returns 1                                            | ✅ 1     |
| Original error message "No podes reservar clases bonus en otra sucursal con tu plan actual" preserved | ✅ 1     |
| `pnpm tsc --noEmit` passes                                                                            | ✅ clean |

Behaviors covered (integration tests deferred to Plan 07 per plan output spec):

- Test 1 (regression): Member with fixed plan + `multiBranch=false` reserving bonus on different branch → existing 400.
- Test 2-4 (REQ-8): Staff (coach/admin/owner/gestion/recepción) with same plan/state → no longer blocked at this gate (200 once Plan 07 wires the integration test).
- Test 5 (defense): Missing user row → `actorRole = "member"` fallback → existing 400 still fires (no silent bypass).

## Threat model coverage

| Threat ID   | Mitigation status                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| T-110-04-01 | Mitigated — role read from `schema.users` keyed by `memberId` (JWT-trusted), never from client-supplied payload    |
| T-110-04-02 | Mitigated — `actor?.role ?? "member"` fallback ensures missing/unreadable user row keeps the existing 400 in place |
| T-110-04-03 | Accepted — role is already on JWT and surfaced via `/me`; no new disclosure                                        |
| T-110-04-04 | Accepted — single PK lookup; negligible cost                                                                       |

## Deviations from Plan

None — plan executed exactly as written. The plan offered Path A (preferred when feasible) and Path B (fallback); inspection of lines 86-89 showed Path A was infeasible, so Path B was taken with rationale documented above.

## Commits

- `2cec4fad` — feat(110-04): staff bypass plan.multiBranch on bonus reservations

## Self-Check: PASSED

- ✅ `el-templo-api/src/modules/scheduling/booking-service.ts` — modified (verified via `git status` clean post-commit).
- ✅ Commit `2cec4fad` exists in `git log`.
- ✅ `pnpm tsc --noEmit` clean.
- ✅ All grep acceptance criteria satisfied.
- ✅ Path A vs Path B decision documented (Path B with explicit rationale).

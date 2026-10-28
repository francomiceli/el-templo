---
phase: 177-paquete-de-clases-alta-de-corto-plazo-a-medida-por-formula
reviewed: 2026-08-14T23:14:56Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - el-templo-api/src/db/schema/subscription-plans.ts
  - el-templo-api/src/db/migrations/0205_paquete_clases_matrix.sql
  - el-templo-api/src/modules/subscriptions/types.ts
  - el-templo-api/src/modules/subscriptions/service.ts
  - el-templo-admin/src/types/subscription.ts
  - el-templo-admin/src/pages/CobrosPage.vue
  - el-templo-admin/src/components/AssignPlanDialog.vue
  - el-templo-api/test/subscriptions/paquete-clases.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 177: Code Review Report

**Reviewed:** 2026-08-14T23:14:56Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 177 adds a "Paquete de clases" plan category: a new enum value, a
hand-written migration seeding a 36-row price matrix (18 AR/ARS + 18 ES/EUR),
DRY discount-exclusion predicates (`excludedFromReferrals`/`excludedFromAura`)
threaded through every charge path, and two admin UI surfaces (CobrosPage,
AssignPlanDialog) that replace the raw 36-row grid with a 2-selector
(semanas × frecuencia) picker.

The migration data is internally consistent (verified all 36 rows
programmatically against name, duration, classesPerWeek, and both price
columns — no typos), the EUR values correctly follow the project's
whole-currency-unit convention (confirmed against migration 0092's
cents→euros correction), and the discount-exclusion guard for AURA/referrals
is applied consistently across all five charge paths in `service.ts`
(assignPlan, changePlanNow, changePlanAfterCurrent, renewSubscription,
previewPricing). The 36-row copy in the integration test file is byte-for-byte
faithful to the migration's price grid, and no user IDs are hardcoded.

However, one concrete functional regression was found: the shared
`assertScheduleSelectionForPlan` schedule-anchor guard was not updated for
the new category, so a `paquete` plan assignment/renewal that supplies any
partial fixed-schedule anchors — a flow the AssignPlanDialog UI actively
offers, since `paquete` is `bookingMode: 'flexible'` — is rejected by the
backend with a wrong "online plans can't have turnos fijos" error. Two
frontend state-management issues and one category-consistency gap (missing
virtual-branch enforcement for `paquete`) round out the findings.

## Critical Issues

### CR-01: `assertScheduleSelectionForPlan` rejects `paquete` schedule anchors that the UI actively offers

**File:** `el-templo-api/src/modules/subscriptions/service.ts:5518-5556` (called from `assignPlan` at line 1535 and `renewSubscription` at line 4084)

**Issue:** The shared helper that validates `scheduleIds` for flexible plans
uses a literal category check:

```ts
if (scheduleIds.length === 0) return;
if (plan.planCategory !== "presencial") {
  throw new BadRequestError("Los planes online no pueden tener turnos fijos");
}
```

`paquete` plans are always `bookingMode: 'flexible'` (D-02) and are
explicitly treated as presencial-flexible everywhere else touched by this
phase (`categoryGroup`, `isOnlinePlan`, `AssignPlanDialog`'s
`showScheduleStep`/`isFixedMode`). Concretely, `AssignPlanDialog.vue` shows
the schedule step for a selected `paquete` plan (`showScheduleStep` is true
because `bookingMode === 'flexible'`) and renders `FixedSchedulePicker` with
`allow-partial="!isFixedMode"` (true for paquete), letting the admin pick
0..classesPerWeek anchors. If the admin picks even one anchor, the submit
payload includes a non-empty `scheduleIds`, and `assignPlan`
(service.ts:1535) calls `assertScheduleSelectionForPlan(plan, scheduleIds)`,
which — since `plan.planCategory` is `"paquete"`, not `"presencial"` — throws
`BadRequestError("Los planes online no pueden tener turnos fijos")`. The same
happens on renewal when `input.scheduleIds` is provided (service.ts:4084).

This is a direct regression of a feature the phase's own UI exposes: any
admin who assigns/renews a `paquete` plan with partial fixed anchors gets a
confusing, incorrect rejection (the plan isn't "online" at all). The
integration test suite (`paquete-clases.test.ts`) never exercises
`scheduleIds` for a paquete plan, so this was not caught.

**Fix:** Use the same category-group helper already imported into
`service.ts` instead of the literal string compare:

```ts
import { categoryGroup } from "./types"; // already imported

// ...
if (scheduleIds.length === 0) return;
if (categoryGroup(plan.planCategory as PlanCategory) !== "presencial") {
  throw new BadRequestError("Los planes online no pueden tener turnos fijos");
}
```

(Note `assertScheduleSelectionForPlan`'s `plan` parameter is currently typed
with `planCategory: string`, not `PlanCategory` — tighten that too so this
class of bug is caught by the compiler next time a category is added.)

## Warnings

### WR-01: Browsing the "Paquete de clases" tab/toggle silently overwrites a previously selected plan

**File:** `el-templo-admin/src/pages/CobrosPage.vue:1613-1624`, `el-templo-admin/src/components/AssignPlanDialog.vue:1852-1877` (watch block, `showPaqueteToggle`)

**Issue:** Both admin surfaces auto-select a default paquete plan (1 semana ×
1/sem) as soon as the paquete UI becomes active — not when the admin
explicitly picks a plan:

```ts
// CobrosPage.vue
watch(
  [resolvedPaquetePlan, planGroupFilter],
  ([plan, group]) => {
    if (group !== 'paquete') return;
    if (plan) {
      selectPlan(plan);   // <-- fires just from switching tabs
    } else { ... }
  },
  { immediate: true }
);
```

```ts
// AssignPlanDialog.vue
watch(
  [resolvedPaquetePlan, paqueteMode],
  ([plan, active]) => {
    if (!active) return;
    if (plan) {
      void selectPlan(plan);  // <-- fires just from flipping the toggle
    } else { ... }
  },
  { immediate: true }
);
```

`selectPlan()` is not a cosmetic no-op: in `CobrosPage.vue` it resets
`scheduleIds`/`currentIdempotencyKey`; in `AssignPlanDialog.vue` it resets
`assignForm` (priceType, boardingPass, auraSpend, override fields),
`selectedScheduleIds`, and — in `change` mode — fires a network request
(`subsApi.getChangePlanPreview`). Concretely: an admin who has already
selected a normal plan (e.g. a presencial tile) and then clicks the "Paquete
de clases" tab/toggle just to look at the price grid gets their previous
selection silently replaced by the paquete default (1 sem × 1/sem), with no
explicit click on a plan. Toggling back to "Plan normal" does not restore the
prior selection either — there's no reset-on-deactivate branch, only
reset-on-activate. Nothing in the non-paquete list highlights as `active`
after this happens (its `id` won't match), so the UI gives no visual signal
that the selection changed. Since this is a checkout/PoS flow that ends in a
real charge, this is a real risk of confirming the wrong plan/price.

**Fix:** Only invoke `selectPlan` on this watch in response to an explicit
user interaction with the semanas/frecuencia selectors (e.g. track "has the
admin touched the paquete selectors" with a separate flag, or require an
explicit "usar este paquete" button click) rather than tying it to
`planGroupFilter`/`paqueteMode` becoming true. At minimum, restore/clear
`selectedPlan` when leaving the paquete tab/toggle so a stale selection can't
survive a tab switch unnoticed.

### WR-02: `paquete` plans bypass the physical-branch (virtual-branch) requirement enforced for `presencial`

**File:** `el-templo-api/src/modules/subscriptions/service.ts:1269-1285`

**Issue:** The REQ-1 (Phase 111) guard that blocks assigning a
physical-attendance plan to a member on a virtual branch is written as a
literal category check, not updated for the new category:

```ts
if (plan.planCategory === "presencial" && memberBranch?.isVirtual === true) {
  throw new BadRequestError(
    "Plan presencial requiere sede física. Convertí al alumno primero.",
  );
}
```

`paquete` is explicitly documented (D-02, `types.ts:41-46`) as
"presencial-flexible — se reserva y asiste en sede como un mensual
presencial", i.e. it should be subject to the same physical-branch
requirement. The frontend actually encodes this intent for
`AssignPlanDialog.vue`: `showPaqueteToggle` (line ~1852) is gated on
`!props.memberBranchIsVirtual`, explicitly mirroring "Phase 111 REQ-2 —
[virtual-branch members] no pueden recibir planes presenciales" per its own
comment. But the backend check this frontend gate is meant to backstop does
NOT cover `paquete`, so:

- A direct API call (bypassing the AssignPlanDialog UI) can assign a
  `paquete` plan to a virtual-branch member without any block.
- `CobrosPage.vue`'s paquete tab has no equivalent `memberBranchIsVirtual`
  check at all (grep confirms no `isVirtual` reference near the paquete
  branch of that file), so even the front-end-only mitigation the
  AssignPlanDialog has is absent on that second surface.

This is inconsistent with the explicit design intent stated in `types.ts` and
with the one frontend surface that does try to enforce it, and it is a
different code path from the overlap-conflict gap Franco already scoped out
of phase 177 (that note only covers the `categoryGroup` literal at
service.ts:1343-1351, not this REQ-1 check).

**Fix:** Change the condition to use `categoryGroup(plan.planCategory) ===
"presencial"` (already imported in this file) instead of the literal
`"presencial"` comparison, and add the equivalent check/guard to
`CobrosPage.vue`'s paquete tab (or verify at the branch-selector level that a
virtual-branch member can't reach the paquete tab at all).

### WR-03: One-shot boarding pass can be silently "burned" on a paquete purchase for no discount

**File:** `el-templo-api/src/modules/subscriptions/service.ts:1449-1468` (and mirrored at renewSubscription/changePlan code paths)

**Issue:** `input.boardingPass` is accepted for any plan category, including
`paquete`. It marks `member.boardingPassUsed = true` (a one-shot flag that
can never be reset) and charges `plan.priceZero`. Since the migration sets
`price_zero = price_regular` for every paquete row (D-14: "no hay Precio Zero
... para paquetes por ahora"), using the boarding pass on a paquete plan
consumes the member's single lifetime boarding pass for **zero actual
discount** — a silent trap if it's ever exposed in a UI that offers boarding
pass alongside paquete (unlike AURA and referrals, D-13 does not mention
boarding pass, and no guard analogous to `excludedFromAura` exists for it).
Not currently reachable from the two reviewed UI surfaces (neither exposes a
boarding-pass control in `paquete` mode), so this is a latent risk rather
than an active one, but the backend has no defense-in-depth guard the way it
now does for AURA (which explicitly rejects an untrusted `auraSpend` payload
on a paquete plan per T-177-04's own rationale — "el payload es untrusted").

**Fix:** Either explicitly exclude `paquete` from `input.boardingPass` (mirror
the `excludedFromAura` throw pattern), or confirm this is accepted product
behavior and leave a one-line comment recording that decision so it isn't
mistaken for an oversight later.

## Info

### IN-01: `assertScheduleSelectionForPlan`'s `plan` parameter loses type safety on `planCategory`

**File:** `el-templo-api/src/modules/subscriptions/service.ts:5518-5525`

**Issue:** The helper's parameter type declares `planCategory: string`
rather than the `PlanCategory` union. This is what let CR-01 slip through
undetected by the compiler — adding `"paquete"` to the `PlanCategory` union
in `types.ts` had zero effect on this function's type checking, since a bare
`string` accepts any category (including future ones) silently.

**Fix:** Type it as `PlanCategory` (import from `./types`) so any category
literal comparison here participates in exhaustiveness/typo checking.

### IN-02: Follow-up already tracked — `assignPlan`'s group-overlap check literal `eq(planCategory,'presencial')`

**File:** `el-templo-api/src/modules/subscriptions/service.ts:1343-1351`

Per the reviewer's brief, this is explicitly scoped OUT of phase 177 by
Franco (2026-08-14) and already documented in `types.ts:48-62` as a known
gap: the overlap-conflict SQL condition still special-cases `'presencial'`
literally instead of using `categoryGroup(...)`, so it detects
paquete→presencial conflicts but not presencial→paquete or paquete→paquete
double-booking. Restating here only as a pointer for whichever future plan
picks it up — not counted as a new defect of this phase.

---

_Reviewed: 2026-08-14T23:14:56Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

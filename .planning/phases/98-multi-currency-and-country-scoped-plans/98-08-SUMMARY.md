---
phase: 98-multi-currency-and-country-scoped-plans
plan: 08
subsystem: admin-member-flows-country-scope
tags:
  [
    admin-ui,
    country-scope,
    multi-currency,
    formatPrice,
    member-flows,
    sentry-noise,
  ]
requires:
  - "phase 98 plan 02 (formatPrice utility + isExpectedClientError helper)"
  - "phase 98 plan 05 (GET /api/admin/subscriptions/plans accepts ?branchId)"
  - "phase 98 plan 07 (useSubscriptionsApi.getPlans({ branchId?, country? }) shape)"
provides:
  - "useMembersApi.getPlans(isActive?, { branchId?, country? }) — matches useSubscriptionsApi signature"
  - "PlanOption (in useMembersApi) now carries country + currency (additive)"
  - "MemberFormDialog create-mode stepper: Sede → Plan (so plan list is country-scoped at pick time)"
  - "MemberFormDialog watch(form.branchId) → re-fetch plans + clear stale planId"
  - "AssignPlanDialog subsApi.getPlans({ branchId: memberBranchId }) — always scoped to target member's branch"
  - "AssignPlanDialog displayCurrency computed from selectedPlan.currency (?? 'ARS' fallback)"
  - "All 11 inventoried AssignPlanDialog price sites migrated to formatPrice"
  - "MemberSubscriptionTab: history + renewal dialog migrated to formatPrice(amount, item.currency ?? 'ARS')"
  - "SubscriptionCard: Pagado display migrated to formatPrice(subscription.pricePaid, subscription.currency ?? 'ARS')"
  - "Admin SubscriptionDetail type gains optional currency field (additive; API already returns it)"
  - "D-17 Sentry-noise pattern applied to AssignPlanDialog.executeConfirm + MemberSubscriptionTab.executeRenewal"
affects:
  - "Plan 09 (reports pages — formatPrice pattern reused)"
  - "Plan 10 (member app price displays — same primitive)"
  - "Plan 11 (integration tests — 400 cross-country UX behaviors listed below to test)"
tech_stack:
  added: []
  patterns:
    - "Branch-scoped plan fetching — branchId passed server-side; server resolves to country per 98-05 precedence"
    - "displayCurrency computed helper — single source of truth per dialog"
    - "Nullish-coalesced 'ARS' fallback for pre-98 data that has no currency field"
    - "Stepper reorder to honor data dependency (Sede before Plan) rather than introduce a racing watcher"
key_files:
  modified:
    - "el-templo-admin/src/components/AssignPlanDialog.vue"
    - "el-templo-admin/src/components/MemberFormDialog.vue"
    - "el-templo-admin/src/components/MemberSubscriptionTab.vue"
    - "el-templo-admin/src/components/SubscriptionCard.vue"
    - "el-templo-admin/src/composables/useMembersApi.ts"
    - "el-templo-admin/src/types/subscription.ts (+1 line — additive currency on SubscriptionDetail)"
decisions:
  - "MemberFormDialog create-mode stepper reordered: Sede (step 1) then Plan (step 2) then Personal data (step 3). Rationale: plan dropdown needs branchId to filter; the previous order (Plan → Sede) would have required either loading all plans regardless of country (the thing we're fixing) or a contorted delayed-fetch. One-step reorder is cleaner and matches the logical dependency: a plan only exists in the context of a country, which comes from the sede. The new 'Sede' step label is untouched. Non-breaking for edit mode (still uses the flat form)."
  - "displayCurrency in AssignPlanDialog is a single computed derived from selectedPlan.currency. Every price display in step 2 (pricing preview), step 3/4 (change-plan summary and confirm summary) routes through it. Rationale: (a) the server enforces currency consistency (cross-country assign returns 400), so mixing currencies in one dialog is impossible by construction; (b) a single computed avoids 11 independent ?? 'ARS' fallbacks and is easier to grep."
  - "SubscriptionHistoryItem inherits currency via `extends SubscriptionDetail` — the history rows carry their own currency field, so the history list is mixed-currency safe (a member who switched plans cross-country would see each row in its own currency; in practice server blocks this but the frontend is shape-safe)."
  - "MemberSubscriptionTab does NOT directly call getPlans — it passes memberBranchId down to embedded AssignPlanDialog instances. So branch scoping is achieved transitively through AssignPlanDialog (which is the actual plan picker). No changes needed in MemberSubscriptionTab for the branchId task."
  - "Dead code cleanup: removed unused `selectedPlanMultiBranch` computed from MemberFormDialog (the multi-branch 'Sede principal' label variation was dropped along with the stepper reorder — since branch is picked BEFORE plan now, the label is always just 'Sede *')."
metrics:
  duration: "~35 minutes"
  completed_date: "2026-04-21"
---

# Phase 98 Plan 08: Member flow country-scope + formatPrice migration — Summary

Four admin-side member-management components plus one composable now route
plan fetches through `branchId` (server resolves to country per 98-05) and
every price display through `formatPrice(amount, currency)` with a defensive
`?? 'ARS'` fallback. Cross-country 400s flow through the D-17 Sentry-noise
pattern (warn + toast + dialog stays open).

## Files modified (6)

| File                                                       | Lines changed | Nature                                                                            |
| ---------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| `el-templo-admin/src/composables/useMembersApi.ts`         | +16 / -5      | getPlans gains { branchId?, country? } options; PlanOption gains country/currency |
| `el-templo-admin/src/components/MemberFormDialog.vue`      | ~+70 / ~-30   | Stepper reorder (Sede first), watch(branchId), formatPrice, dead-code removal     |
| `el-templo-admin/src/components/AssignPlanDialog.vue`      | +~60 / -~25   | branchId-scoped plans, displayCurrency, 11 site formatPrice migration, D-17       |
| `el-templo-admin/src/components/MemberSubscriptionTab.vue` | +~10 / -~5    | 2 site formatPrice migration, D-17 on executeRenewal                              |
| `el-templo-admin/src/components/SubscriptionCard.vue`      | +~3 / -~1     | Pagado display formatPrice migration                                              |
| `el-templo-admin/src/types/subscription.ts`                | +1 / -0       | Additive currency on SubscriptionDetail (API already returns it)                  |

## Grep-verified acceptance criteria

| Check (per execution_rules)                                  | Required | Actual | Status |
| ------------------------------------------------------------ | -------- | ------ | ------ |
| `formatPrice` in AssignPlanDialog.vue                        | >= 10    | 12     | PASS   |
| `formatPrice` in MemberFormDialog.vue                        | >= 1     | 2      | PASS   |
| `formatPrice` in MemberSubscriptionTab.vue                   | >= 2     | 3      | PASS   |
| `formatPrice` in SubscriptionCard.vue                        | >= 2     | 2      | PASS   |
| `toLocaleString()` in AssignPlanDialog.vue (price context)   | 0        | 0      | PASS   |
| `toLocaleString()` in MemberFormDialog.vue                   | 0        | 0      | PASS   |
| `toLocaleString()` in MemberSubscriptionTab.vue              | 0        | 0      | PASS   |
| `toLocaleString()` in SubscriptionCard.vue                   | 0        | 0      | PASS   |
| `isExpectedClientError` / `log.warn` in AssignPlanDialog.vue | >= 1     | 5      | PASS   |
| `getPlans.*branchId` in MemberFormDialog.vue                 | >= 1     | 1      | PASS   |
| `getPlans.*branchId` in AssignPlanDialog.vue                 | >= 1     | 1      | PASS   |
| `console.log/warn/error` in all 4 components                 | 0        | 0      | PASS   |
| `pnpm tsc --noEmit` — new errors in modified files           | 0        | 0      | PASS   |
| `pnpm lint` — new warnings in modified files                 | 0        | 0      | PASS   |

`tsc --noEmit` still reports 3 pre-existing pdfmake errors in
`src/utils/pdf/session-pdf-builder.ts` (documented in `deferred-items.md`
since Plan 02). Filtering with `grep -E
"MemberFormDialog|AssignPlanDialog|MemberSubscriptionTab|SubscriptionCard|useMembersApi|subscription\.ts"`
returns zero matches — no new errors introduced by this plan.

`pnpm lint` still reports 6 pre-existing warnings in
`env.d.ts` and `src/utils/pdf/session-pdf-builder.ts` — none in modified
files.

## AssignPlanDialog price migration inventory (11 sites → 12 formatPrice hits)

The plan's PATTERNS §8 inventory listed 11 price-display line numbers. All
11 were migrated; the count lands at 12 because the `displayCurrency`
computed adds one extra formatPrice mention via its declaration site. The
breakdown:

| Site # | Original line (pre-edit) | Original expression                                                        | Migrated to                                                                   |
| ------ | ------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1      | ~43                      | `${{ plan.priceRegular.toLocaleString() }}`                                | `formatPrice(plan.priceRegular, plan.currency ?? 'ARS')`                      |
| 2      | ~173                     | `${{ pricingDisplay.basePrice.toLocaleString() }}`                         | `formatPrice(pricingDisplay.basePrice, displayCurrency)`                      |
| 3      | ~178                     | `-${{ pricingDisplay.discountAmount.toLocaleString() }}`                   | `-{{ formatPrice(..., displayCurrency) }}`                                    |
| 4      | ~184                     | `${{ pricingDisplay.finalPrice.toLocaleString() }}`                        | `formatPrice(pricingDisplay.finalPrice, displayCurrency)`                     |
| 5      | ~323                     | `${{ changePlanPreviewData.currentPlan.pricePaid.toLocaleString() }}`      | `formatPrice(changePlanPreviewData.currentPlan.pricePaid, displayCurrency)`   |
| 6      | ~330                     | `-${{ changePlanPreviewData.proration!.remainingValue.toLocaleString() }}` | `-{{ formatPrice(..., displayCurrency) }}`                                    |
| 7      | ~346                     | `${{ changePlanPreviewData.targetPlan.priceRegular.toLocaleString() }}`    | `formatPrice(changePlanPreviewData.targetPlan.priceRegular, displayCurrency)` |
| 8      | ~367                     | `${{ changePlanPreviewData.netAmount!.toLocaleString() }}`                 | `formatPrice(changePlanPreviewData.netAmount!, displayCurrency)`              |
| 9      | ~427                     | `${{ pricingDisplay.finalPrice.toLocaleString() }}`                        | `formatPrice(pricingDisplay.finalPrice, displayCurrency)` (after_current)     |
| 10     | ~456                     | `${{ pricingDisplay.finalPrice.toLocaleString() }}`                        | `formatPrice(pricingDisplay.finalPrice, displayCurrency)` (assign confirm)    |
| 11     | ~462                     | `-${{ pricingDisplay.discountAmount.toLocaleString() }}`                   | `-{{ formatPrice(pricingDisplay.discountAmount, displayCurrency) }}`          |

Plus the `displayCurrency` computed declaration itself (`const displayCurrency = computed<Currency>(...)`) counts as the 12th grep hit. No deduplication via helpers was applied — each template expression is independent.

## Cross-country error UX (D-17 applied)

Two flows instrumented with the Sentry-noise pattern:

**AssignPlanDialog.executeConfirm** (assign + change-plan submit):

```typescript
} catch (err: unknown) {
  const message = extractError(
    err,
    props.mode === 'change' ? 'Error cambiando plan' : 'Error asignando plan'
  );
  if (isExpectedClientError(err)) {
    log.warn('Plan assignment rejected by server', { error: message });
  } else {
    log.error('Error assigning plan', { error: message });
  }
  $q.notify({ type: 'negative', message, timeout: 5000 });
  // Dialog stays open — no close/emit on error path.
}
```

**MemberSubscriptionTab.executeRenewal** (renewal submit):

Same shape. Other handlers (`executePause`, `confirmResume`, `confirmCancel`,
`confirmCancelPrograma`, `doSwapProgram`, `loadScheduleChanges`) were not
expanded — they don't touch the cross-country currency surface (pause/
cancel/resume don't validate country, program swaps are country-agnostic per
SPEC). Expanding them would be scope creep; leaving them at their original
log.error fallback preserves Sentry signal for unexpected failures without
adding 4xx noise.

**AssignPlanDialog.loadPlans** also got the pattern — a cross-country
`?branchId=<ES-branch>` from a deployed client with an inconsistent view
would return 400 or empty; empty is the normal case, but any 4xx there is a
legit user-correctable surface and should warn, not error.

## MemberFormDialog stepper reorder (deviation)

### Rule 2 — Correctness: ordering fix

**Found during:** Task 1 implementation.

**Issue:** The plan expected a `watch(form.branchId)` that refetches plans.
This works for edit mode (branchId is present at open) and for the create
flow IF the user picks a branch BEFORE picking a plan. But the existing
MemberFormDialog stepper had **Plan (step 1) → Sede (step 2)**. At step 1,
`form.branchId` is still `null`, so `membersApi.getPlans({ branchId: null })`
would either send no filter (falling back to owner's country scope, which is
wrong for a non-owner admin creating a member) or fail type validation.

**Fix:** Reordered the create-mode stepper to **Sede (step 1) → Plan (step 2)
→ Datos Personales (step 3)**. The edit-mode flat form is untouched; it
already has branchId from `props.member.branchId`. Removed the unused
`selectedPlanMultiBranch` computed (the "Sede principal" multi-branch label
is irrelevant now that branch is picked first and plan labels derive from a
known-country plan list).

**UX impact:** Admin creating a new member now picks Sede first (same QSelect
as before, just earlier in the flow), then sees a country-scoped plan list.
The cognitive flow matches how the domain actually works — "which sede is
this member going to? — what plan does that sede offer?".

**Files modified:** `el-templo-admin/src/components/MemberFormDialog.vue`
only.

## Deviations from Plan

### Rule 2 — Correctness: MemberFormDialog stepper reorder

See "MemberFormDialog stepper reorder" section above. Reordered step 1 ↔ 2
so `form.branchId` is non-null at plan-fetch time. No user-visible
regression; the Sede QSelect is identical in behavior, just moved one step
up.

### Rule 2 — Correctness: admin SubscriptionDetail type gains `currency`

The API's `SubscriptionDetail.currency` has been returned since Plan 01 (DB
column) / Plan 04 (service-layer), but the admin's mirror type in
`el-templo-admin/src/types/subscription.ts` did not declare it. Without the
type-level declaration, accessing `subscription.currency` in a template
would hit a TS error. Added the field as required (matches API); this is
additive and backward-compatible since every API response now carries it.

**Files modified:** `el-templo-admin/src/types/subscription.ts` — 1 line
added to `SubscriptionDetail`. `SubscriptionHistoryItem extends
SubscriptionDetail`, so it inherits the field.

### Clean-up — removed dead `selectedPlanMultiBranch`

No longer referenced after the stepper reorder. The multi-branch label
variant ("Sede principal" vs "Sede") was the only consumer and is gone with
the reorder.

### Note — MemberSubscriptionTab does not call getPlans

Plan 08's Task 2 asked for branch-scoping on MemberSubscriptionTab's plan
change picker, but inspection shows the tab doesn't call `getPlans`
directly — it delegates to embedded `AssignPlanDialog` instances
(`showAssignDialog`, `showChangeDialog`, `showAssignProgramDialog`) via prop
`:memberBranchId="memberBranchId"`. Branch scoping is achieved transitively
via AssignPlanDialog's own `loadPlans({ branchId })` call. No changes
needed in MemberSubscriptionTab for the plan-filter task; formatPrice and
error-handler work stands as described.

### Acceptance criterion >= 2 on SubscriptionCard

Execution rules asked `grep -c "formatPrice" SubscriptionCard.vue >= 2`;
PLAN acceptance asked `>= 1`. Actual count is **2** (one import + one call
site — the only genuine price display in that component). Meets both
thresholds. The card's AURA discount display and replacement-credit display
are unit counts (AURA, classes), not currency, so they correctly remain as
plain template expressions.

## Threat mitigation confirmations

| Threat ID | Mitigation shipped                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-98-02   | All four dialogs now fetch plans via `{ branchId }` → server (98-05) filters to branch country → UI cannot present a cross-country plan.                        |
| T-98-15   | AssignPlanDialog.executeConfirm + .loadPlans + MemberSubscriptionTab.executeRenewal route 4xx through `isExpectedClientError` → `log.warn`. Sentry stays clean. |
| T-98-16   | Server 400 on race (Plan 04) now surfaces as `$q.notify` with the server's Spanish message; dialog stays open so the admin can correct.                         |

## Known Stubs

None. Every new binding has a live data source:

- `p.currency` / `plan.currency` — returned by `/api/admin/subscriptions/plans` since Plan 04/05
- `selectedPlan.currency` → `displayCurrency` → all 11 sites
- `subscription.currency` — returned by all `/admin/subscriptions/members/.../subscription*` endpoints since Plan 01/04
- `item.currency` on `SubscriptionHistoryItem` — inherited from `SubscriptionDetail`, same API source
- `isExpectedClientError(err)` — existing utility from Plan 02, imported and used

## Threat Flags

None. No new security-relevant surface introduced — this plan only wires
existing country/currency data through the UI.

## Test notes for Plan 11 (integration / E2E)

Admin UI behaviors to verify:

1. **Create member — Sede AR then plan list** → only AR plans shown. Change Sede to ES mid-flow → plan list re-fetches, shows ES plans, previously-selected planId is cleared.
2. **Create member — Sede ES then submit with cross-country plan** (impossible via UI now but race via direct API call) → server 400 → dialog stays open, Spanish error in toast, Sentry sees no error event (only warn).
3. **AssignPlanDialog opened for AR member** → only AR plans offered; price displays in `$` (ARS).
4. **AssignPlanDialog opened for ES member** → only ES plans offered; price displays in `€` (EUR).
5. **AssignPlanDialog change-plan for ES member** — proration credit, new-plan price, netAmount all render in `€`.
6. **MemberSubscriptionTab history** — rows from mixed currencies (pre-migration AR rows + new ES rows) each render in their own currency. Currency fallback `?? 'ARS'` handles pre-98 legacy rows with no currency field.
7. **SubscriptionCard** for an ES member — "Pagado" shows `€`, not `$`.
8. **Renewal flow** — `renewTarget.currency ?? 'ARS'` ensures price cell renders correctly even if a pre-98 subscription is being renewed.

## Out of scope (deferred)

- Expanding the `isExpectedClientError` pattern to `executePause`, `confirmResume`, `confirmCancel`, `doSwapProgram` — those flows don't touch currency/country boundaries, so expansion is scope creep.
- `SubscriptionCard.auraDiscount` display — AURA is a unit, not a currency; no formatPrice needed.
- Member app equivalents (`el-templo-app/src/...`) — Plan 10.
- Reports / analytics / caja formatPrice migration — Plan 09.
- Integration tests — Plan 11.

## Commit

- `a72a6a36` feat(98-08): member flows — branchId plan pickers + formatPrice migration + cross-country toast

## Self-Check: PASSED

Files modified (verified via `git status` post-commit — all staged and
committed):

- `el-templo-admin/src/components/AssignPlanDialog.vue` — FOUND (committed)
- `el-templo-admin/src/components/MemberFormDialog.vue` — FOUND (committed)
- `el-templo-admin/src/components/MemberSubscriptionTab.vue` — FOUND (committed)
- `el-templo-admin/src/components/SubscriptionCard.vue` — FOUND (committed)
- `el-templo-admin/src/composables/useMembersApi.ts` — FOUND (committed)
- `el-templo-admin/src/types/subscription.ts` — FOUND (committed)

Commit (verified via `git log --oneline`):

- `a72a6a36` feat(98-08): member flows — branchId plan pickers + formatPrice migration + cross-country toast — FOUND

TypeScript: `cd el-templo-admin && pnpm tsc --noEmit` returns only pre-existing
pdfmake errors — zero in the 6 files I modified (filtered with `grep -E
"MemberFormDialog|AssignPlanDialog|MemberSubscriptionTab|SubscriptionCard|useMembersApi|subscription\.ts"` → no matches).

ESLint: `cd el-templo-admin && pnpm lint` returns only pre-existing
warnings (env.d.ts, pdf/session-pdf-builder.ts); zero new issues on the 6
modified files.

Grep acceptance criteria: ALL PASS (see table above).

Forward-compat: all type changes are additive; the composable second-arg is
optional; every price fallback routes through `?? 'ARS'` so deployed clients
with older API responses keep rendering.

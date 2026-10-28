# Phase 177 Gap-Fix: Paquete de clases — cierre de brechas del verifier/reviewer

**Type:** Direct scoped fix (no GSD plan file, approved by Franco 2026-08-14/15).
**Scope:** Close the 1 blocking gap from `177-VERIFICATION.md` (D-11 unreachable) and the
CR-01/WR-01/WR-02/WR-03 findings from `177-REVIEW.md`, under a hard product decision:
**paquete is FLEXIBLE-PURO — it never offers fixed-turno anchors, not even partial ones.**

## Commits

| Commit     | Task                                  | Files                                                                       |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `8648e344` | 1 — backend guards                    | `service.ts`, `types.ts`                                                    |
| `7ae749c7` | 2 — AssignPlanDialog flexible-puro    | `AssignPlanDialog.vue`                                                      |
| `99195b84` | 3 — MemberSubscriptionTab card + D-11 | `MemberSubscriptionTab.vue`, `SubscriptionCard.vue`, `AssignPlanDialog.vue` |
| `ca250970` | 4 — WR-01 watcher clobber guard       | `CobrosPage.vue`, `AssignPlanDialog.vue`                                    |
| `e7103be6` | 5 — WR-02 PoS virtual-branch gate     | `CobrosPage.vue`                                                            |

## Task 1 — Backend (`service.ts`, `types.ts`)

- **REQ-1 (Phase 111) guard, `service.ts:~1279`:** was `plan.planCategory === "presencial"`.
  Now `categoryGroup(plan.planCategory) === "presencial"` — a member on a virtual branch can
  no longer be assigned a `paquete` (closes WR-02's backend half; paquete is
  presencial-flexible per D-02 and must require a physical sede same as presencial).
- **`assertScheduleSelectionForPlan` message:** the flexible-branch rejection
  (`plan.planCategory !== "presencial"` → throw) is now category-neutral: `"Este plan no
admite turnos fijos"` instead of `"Los planes online no pueden tener turnos fijos"`. The
  **guard condition itself was left untouched** per explicit instruction — this is the
  correct behavior now that paquete is flexible-puro (CR-01 from the review assumed paquete
  would offer partial anchors; Franco's final product decision overrides that — paquete never
  offers anchors, so rejecting any non-empty `scheduleIds` for paquete is exactly right, only
  the message was wrong since paquete isn't "online" either).
- **WR-03 (boardingPass):** new predicate `excludedFromBoardingPass(c)` in `types.ts`, same
  idiom as `excludedFromAura`. Guarded at all 3 callsites where the one-shot boarding pass
  is applied (`assignPlan`, `changePlanNow`, `changePlanAfterCurrent`) — `renewSubscription`
  has no `boardingPass` field in `RenewSubscriptionInput` so there was no 4th site. Since
  paquete's `priceZero === priceRegular` for all 36 rows (D-14), applying the boarding pass
  would burn the member's lifetime pass for zero real discount; now it throws
  `"Los paquetes de clases no aceptan boarding pass"` (defense-in-depth — neither UI surface
  exposes a boarding-pass control in paquete mode today).

`npx tsc --noEmit` → exit 0.

**DO_NOT_TOUCH verified untouched** (confirmed via `git diff 7c207913..HEAD` before/after):

- `sameGroupCategoryCondition` (~line 1348, `eq(planCategory, "presencial")` literal in the
  assignPlan overlap-conflict block) — unchanged.
- `service.ts:1400` and `service.ts:4091` ("pase Socio requires active presencial",
  `s.planCategory === "presencial"`) — unchanged.
- `assignPlan`'s signature and assignment logic — unchanged.

## Task 2 — AssignPlanDialog.vue (CR-01, flexible-puro)

`showScheduleStep` now returns `false` whenever `selectedPlan.value.planCategory === 'paquete'`,
before any other check. The whole schedule-anchor step (`q-step name=3`, including
`FixedSchedulePicker`) is `v-if="showScheduleStep"`, so it's fully hidden for paquete in both
alta and change/renewal. The submit payload's `scheduleIds` is already gated on
`showScheduleStep.value`, so no anchors are ever sent for paquete — the backend guard from
Task 1b is now unreachable-by-the-UI defense-in-depth, not a live rejection path.

This implements the FLEXIBLE-PURO decision, which supersedes CR-01's original proposal
(accept 0..classesPerWeek partial anchors for paquete) — Franco's call: paquete never offers
turno selection at all.

## Task 3 — MemberSubscriptionTab.vue (D-11 / D-02 blocker)

- `programaSub` now explicitly excludes `planCategory === 'paquete'` — an active paquete
  subscription no longer falls into "Suscripción Online" (closes the D-02 mislabeling).
- New `paqueteSub` computed, same shape/precedence as `especialSub` (active/paused first,
  falls back to scheduled).
- New dedicated card "Paquete de clases" (`show-category-badge`, wired to
  `@renew`/`@change`/`@edit-start-date`/`@cancel`), mirroring the `especialSub` card. No
  "vender paquete" alternate state was added (deliberate — see Deviations below).
- **D-11 reachability:** the Change Plan Dialog (`AssignPlanDialog mode="change"`) was
  hardcoded to `presencialSub`. Generalized via a new `changeTarget` ref +
  `openChangeDialog(sub)` function; both the presencial card and the new paquete card call
  `openChangeDialog(<their sub>)`. The dialog's `currentSubEndDate`/`currentPlanId` now read
  from `changeTarget` instead of `presencialSub`. `currentScheduleIds` stays sourced from
  `classUsage` only when `changeTarget.planCategory === 'presencial'` (paquete never has
  turnos, so it's `[]` otherwise).
- New `confirmCancelPaquete`, mirror of `confirmCancelEspecial` (explicit `subscriptionId` —
  paquete can run in parallel with other category groups per the known overlap-conflict gap
  documented in `types.ts`).
- **`SubscriptionCard.vue` (was NOT in the task's explicit file list, added under Rule 1/2 —
  see Deviations):** the "Cambiar Plan" button was gated by `v-if="isPresencial"`
  (`planCategory === 'presencial'` literally), so even after wiring `@change` on the paquete
  card, the button would never have rendered. Added a new `canChangePlan` computed
  (`isPresencial || planCategory === 'paquete'`) and switched only the two "Cambiar Plan"
  button `v-if`s to it — `isPresencial` itself, and the Pausar/Compensar/Reanudar/Cambiar
  turnos buttons, are untouched (paquete does not support pause/compensate/turnos, no
  decision says otherwise).
- **`AssignPlanDialog.vue` (also touched here, beyond Task 2 — see below):** new
  `currentPlanCategory` prop. When `mode === 'change'` and `currentPlanCategory === 'paquete'`,
  the dialog now opens directly in `paqueteMode = true` instead of always resetting to
  `false` — without this, D-11 would require the admin to know to click the "Paquete de
  clases" toggle by hand after opening; now the "reabre el selector de paquete" behavior
  D-11 asks for is automatic.

`npx vue-tsc --noEmit` → 19 errors total (same as the documented pre-existing baseline), zero
in any touched file.

## Task 4 — WR-01 (CobrosPage.vue, AssignPlanDialog.vue)

Both files had a single watch combining `[resolvedPaquetePlan, planGroupFilter|paqueteMode]`
with `{ immediate: true }`. Because `planGroupFilter`/`paqueteMode` were watch **sources**,
merely switching to the paquete tab/toggle (not touching the semanas/frecuencia selectors)
fired the callback and called `selectPlan(default)`, silently overwriting whatever plan the
admin had already selected on another tab, resetting form/schedule state, and — in
`AssignPlanDialog` `mode='change'` — firing a network `getChangePlanPreview` call the admin
never asked for.

Fix (same pattern in both files): split into two watches.

1. `watch(planGroupFilter|paqueteMode, ...)` — fires only on tab/toggle activation. Guards
   against clobbering: if there's already a selected plan of a **different** category, it
   does nothing (no silent overwrite). If nothing was selected, or the existing selection was
   already a paquete, it auto-selects the resolved default — preserving the intended "select
   while on the paquete tab" behavior for the common case (empty start, or the admin is
   already mid-paquete-selection).
2. `watch(resolvedPaquetePlan, ...)` — fires whenever the admin explicitly changes
   semanas/frecuencia while already in paquete mode/tab; always pushes the new resolved plan
   (this is an unambiguous, explicit user action — no clobber guard needed here).

`{ immediate: true }` was dropped from both — the internal guards already make the initial
state a safe no-op (default tab/mode is never paquete on open).

`npx vue-tsc --noEmit` → same 19-error baseline, zero new.

## Task 5 — WR-02 PoS gate (CobrosPage.vue)

The member/branch virtual-branch context **is** readily available in `CobrosPage.vue`:
`branchOptions` (loaded with `isVirtual` per branch) and `sucursalId` (the sede del cobro,
CR-CAJA-editable, defaults to the member's home branch). Added a `sucursalIsVirtual` computed
and filtered `planGroupTabs` to drop the `'paquete'` entry when the target sede is virtual —
same criterion as `AssignPlanDialog`'s `showPaqueteToggle` (`!memberBranchIsVirtual`). The
existing `watch(planGroupTabs, ...)` fallback (falls to `tabs[0]` when the active tab
disappears) already handles an admin switching `sucursalId` to a virtual branch while the
paquete tab is active.

**Deliberately left as-is:** `presencial` itself has no equivalent gate in this file (no
`isVirtual` check anywhere near `planGroupTabs`/`plansByTier` before this change) — that is a
pre-existing gap, out of scope for this paquete-focused cluster. The Task 1a server-side guard
(`categoryGroup(...) === "presencial"` + virtual branch → 400) is the actual last line of
defense for both categories, in both UI surfaces, regardless of any frontend gate.

## Deviations from Plan

### Auto-fixed / auto-added (Rule 1/2)

**1. [Rule 1/2 — bug/missing functionality] `SubscriptionCard.vue` "Cambiar Plan" gate**

- **Found during:** Task 3.
- **Issue:** Not in the task's explicit `<files_to_read>`/instructions list, but wiring
  `@change` on the new paquete card in `MemberSubscriptionTab.vue` would have been a no-op —
  the button that emits `change` only rendered when `isPresencial` (literal
  `planCategory === 'presencial'`) was true, so it would never appear on a paquete
  subscription's card, making D-11 unreachable exactly the way the verifier's gap described.
- **Fix:** Added `canChangePlan` computed (`isPresencial || planCategory === 'paquete'`),
  applied only to the two "Cambiar Plan" `v-if`s. Pause/Compensar/Reanudar/Cambiar-turnos
  stayed gated on `isPresencial` alone (no decision authorizes those for paquete).
- **Files modified:** `el-templo-admin/src/components/SubscriptionCard.vue`
- **Commit:** `99195b84`

**2. [Rule 1 — bug] `AssignPlanDialog.vue` `paqueteMode` not auto-activated in change mode**

- **Found during:** Task 3, while wiring D-11's reachability.
- **Issue:** The component-level paqueteMode toggle existed and worked, but reopening the
  dialog in `mode='change'` always reset `paqueteMode` to `false` (per the existing
  "Fase 177: reset del modo paquete al reabrir el dialog" comment) — so even with a working
  `@change` handler pointed at a paquete subscription, the admin would land on the normal tier
  grid (which never lists paquete rows) and would have to know to click the toggle by hand.
  D-11 explicitly says "la renovación **reabre** el selector de paquete" (implies automatic).
- **Fix:** New `currentPlanCategory` prop; the open-watcher now sets
  `paqueteMode.value = props.mode === 'change' && props.currentPlanCategory === 'paquete'`
  instead of always `false`.
- **Files modified:** `el-templo-admin/src/components/AssignPlanDialog.vue`
- **Commit:** `99195b84`

No other deviations — Tasks 1, 2, 4, 5 were implemented exactly as scoped.

### Explicit no-ops / decisions documented (not deviations, but flagged per task instructions)

- **Task 3:** No "vender paquete" alternate state was added to the new card (unlike
  `especialSub`'s `v-else` "Vender pase" button). Reasoning: a first-time paquete sale is
  already reachable via the existing "Gestionar Plan" button (shown only when
  `!presencialSub`), which opens the generic `AssignPlanDialog` in `mode='assign'` — Task 2's
  fix already makes that dialog offer the paquete toggle. Additionally, per the (out-of-scope,
  DO_NOT_TOUCH) overlap-conflict condition in `service.ts`, a member with an active presencial
  cannot be assigned a paquete (both are in the `categoryGroup === 'presencial'` bucket and
  the literal `eq(planCategory, 'presencial')` check blocks it), so there's no legitimate
  "buy an additional paquete while presencial is active" path to expose a button for.
- **Task 5:** `presencial` is not gated by virtual-branch in `CobrosPage.vue` (pre-existing
  gap, not introduced or fixed by this cluster — documented above).

## Known Stubs

None — no hardcoded empty/placeholder data introduced by this cluster.

## Threat Flags

None — this cluster only tightens existing guards (categoryGroup instead of literal string,
new boardingPass exclusion, virtual-branch tab gate) and reaches previously-orphaned UI code
(D-11). No new network endpoints, auth paths, or schema changes.

## Verification

- `cd el-templo-api && npx tsc --noEmit` → exit 0 (after every backend task, and again at the
  end).
- `cd el-templo-admin && npx vue-tsc --noEmit` → 19 errors total after every frontend task and
  at the end, identical to the documented pre-cluster baseline (`177-VERIFICATION.md`); zero
  errors in any file touched by this cluster (`AssignPlanDialog.vue`, `CobrosPage.vue`,
  `MemberSubscriptionTab.vue`, `SubscriptionCard.vue`).
- `git diff 7c207913..HEAD` confirms the 3 DO_NOT_TOUCH regions in `service.ts` are
  byte-identical to before this cluster.
- No `console.log`/`console.*` or `any`/`as any` introduced (grepped the full diff).
- Vitest suite was **not** run locally per instructions (shared MySQL test DB collision with a
  live worktree) — CI is the verification gate for `paquete-clases.test.ts` and the rest of
  the subscriptions suite against these changes.

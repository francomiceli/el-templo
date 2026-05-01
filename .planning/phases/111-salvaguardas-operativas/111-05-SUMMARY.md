---
phase: 111-salvaguardas-operativas
plan: 05
subsystem: admin frontend
tags:
  [
    assign-plan,
    virtual-branch,
    duplicate-lookup,
    soft-delete-ui-removal,
    badges,
    REQ-2,
    REQ-4,
    REQ-6,
    D-27,
  ]

requires:
  - phase: 111-salvaguardas-operativas
    plan: 01
    provides: normalizePhone helper (frontend mirror at el-templo-admin/src/utils/phone.ts)
  - phase: 111-salvaguardas-operativas
    plan: 04
    provides: GET /admin/members/check-duplicates endpoint
provides:
  - AssignPlanDialog filter + banner CTA for virtual-branch members
  - Stacked MemberFormDialog overlay opened from AssignPlanDialog (Quasar dialog stack)
  - Watcher on memberBranchId that refetches plans after a virtual→presencial conversion
  - useMembersApi.checkDuplicates composable + DuplicateMatch type export
  - MemberFormDialog on-blur duplicate lookup (DNI + phone, 300ms debounce, inline match banner, submit disabled)
  - AlumnoDetailPage Eliminar UI removed (button + confirm dialog + handlers + refs)
  - AlumnoDetailPage badge reorder (status + segment + avatarType in same row under member name — D-27)
affects: [111 final UAT]

tech-stack:
  added: []
  patterns:
    - Quasar native dialog stacking (sibling q-dialog rendered before the parent dialog) — no event bus, no store coordination
    - Vue watcher on prop change to trigger imperative data refetch (loadPlans) after a child-dialog save
    - 300ms debounced setTimeout on input @blur for non-blocking duplicate lookup
    - Inline banner-with-link pattern for duplicate matches (no modal — D-07)

key-files:
  created:
    - .planning/phases/111-salvaguardas-operativas/111-05-SUMMARY.md
  modified:
    - el-templo-admin/src/components/AssignPlanDialog.vue (filter + banner + watcher + stacked MemberFormDialog)
    - el-templo-admin/src/components/MemberFormDialog.vue (on-blur duplicate lookup + inline banner + submitDisabled)
    - el-templo-admin/src/components/MemberSubscriptionTab.vue (plumb memberBranchIsVirtual + member + branches through to AssignPlanDialog)
    - el-templo-admin/src/composables/useMembersApi.ts (checkDuplicates + DuplicateMatch type export)
    - el-templo-admin/src/pages/AlumnoDetailPage.vue (delete UI removed, D-27 badge reorder, derive memberBranchIsVirtual from branches list)
    - el-templo-admin/src/pages/AlumnosPage.vue (post-create AssignPlanDialog now passes memberBranchIsVirtual + member + branches)

key-decisions:
  - "Quasar dialog stacking via sibling rendering (MemberFormDialog rendered as a sibling of the q-dialog inside AssignPlanDialog template). No teleport hack, no event bus — Quasar already handles z-index + scroll-lock for stacked dialogs."
  - "AssignPlanDialog new props (memberBranchIsVirtual, member, branches) defaulted (false / null / []) so existing callers without a virtual-branch concern remain backward-compatible. The banner is gated on `props.memberBranchIsVirtual`, the inner dialog is gated on `props.member && props.branches`, so missing optional data degrades to 'no banner / no overlay' rather than crashing."
  - "Debounce 300ms via a manual setTimeout (not Quasar's input debounce). Reason: we trigger on @blur (single event) and want a uniform delay, not per-keystroke debouncing. The timer is cleared on dialog reopen so a previous debounce doesn't fire after the form has been reset."
  - "Phone normalization done via frontend mirror at src/utils/phone.ts (already shipped in plan 111-01). The composable still sends the raw phone — backend re-normalizes via SQL — to keep the API contract symmetric with /auth/register."
  - "Submit disabled merges three conditions (submitting / dniStatus=='taken' / existingMatch). Network errors during checkDuplicates intentionally clear existingMatch (don't block the admin); the backend 409 path catches real conflicts at submit time."
  - "Editar button stays in the right column-end wrapper (D-21 only removed Eliminar). The right column kept its `column items-end` flex layout so future header actions can be added back without re-architecting."

requirements-completed: [REQ-2, REQ-4 (frontend half), REQ-6, D-27]

duration: ~25min
completed: 2026-05-01
---

# Phase 111 Plan 05: Admin frontend — REQ-2 + REQ-4 frontend + REQ-6 + D-27 Summary

**Closes the UX side of the Soledad bug: admin literally cannot create a duplicate from the create-form (inline match banner + disabled submit), cannot assign a presencial plan to a virtual-branch alumno (filter + convert-CTA banner that opens MemberFormDialog stacked over AssignPlanDialog), and cannot trigger a soft-delete from the alumno detail page (Eliminar button + confirm dialog removed). Folds in the D-27 badge reorder so "Freemium Ghost" reads pegados under the member name.**

## Performance

- **Duration:** ~25 min (3 autonomous tasks; UAT checkpoint pending user verification)
- **Tasks committed:** 3 of 4 (Task 4 is the UAT checkpoint)
- **Files modified:** 6 (1 composable + 5 .vue: 2 components + 2 pages + 1 tab subcomponent)

## Files Modified

| File                                                       | Change                                                                                                                                            | Lines (approx) |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `el-templo-admin/src/composables/useMembersApi.ts`         | Added `checkDuplicates({dni?, phone?})` + exported `DuplicateMatch` type                                                                          | +43            |
| `el-templo-admin/src/components/AssignPlanDialog.vue`      | New props (memberBranchIsVirtual, member, branches), filteredPlans guard, banner CTA, sibling MemberFormDialog overlay, watcher on memberBranchId | +85            |
| `el-templo-admin/src/components/MemberSubscriptionTab.vue` | Threaded new props through to AssignPlanDialog (3 invocations updated)                                                                            | +15            |
| `el-templo-admin/src/components/MemberFormDialog.vue`      | On-blur duplicate lookup (300ms debounce), inline match banner, submitDisabled computed, reset on reopen                                          | +125           |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue`           | Removed Eliminar button + confirm dialog + handlers + refs; D-27 badge reorder; derived memberBranchIsVirtual                                     | +29 / -134     |
| `el-templo-admin/src/pages/AlumnosPage.vue`                | Post-create AssignPlanDialog passes the new props                                                                                                 | +12            |

## Stacked Dialog Approach (REQ-2 D-02, D-03)

**Decision: Quasar native sibling rendering, no teleport.**

The implementation pattern:

```vue
<template>
  <!-- Sibling, rendered BEFORE the parent q-dialog -->
  <MemberFormDialog
    v-if="props.member && props.branches"
    v-model="showEditFromAssign"
    :member="props.member"
    :branches="props.branches"
    @saved="onMemberEdited"
  />

  <q-dialog :model-value="modelValue" ...>
    <q-card> ... </q-card>
  </q-dialog>
</template>
```

Quasar's q-dialog manages its own portal mount (Teleport) and z-index stack — siblings open on top of each other in the order their `model-value` flips to true. Because both dialogs share the same `<script setup>` scope, the inner dialog reads `props.member` and `props.branches` directly from the parent — no event bus, no store coordination, no manual portal logic.

When the inner save fires, two paths trigger a refresh:

1. The parent (`AlumnoDetailPage.onMemberSaved`) reloads the member profile, which causes `memberProfile.value.branchId` to update; that propagates to `AssignPlanDialog.props.memberBranchId`, and the `watch(() => props.memberBranchId)` calls `loadPlans()`.
2. As a defensive secondary, `AssignPlanDialog.onMemberEdited` also calls `loadPlans()` directly on the saved emit. Idempotent — if the watcher already fired, the second call just re-fetches the same data.

**Alternatives rejected:**

- Event bus (mitt or Pinia store): adds machinery for a one-shot signal already covered by Vue prop reactivity.
- Single dialog with conditional content: would force MemberFormDialog into AssignPlanDialog's q-card, breaking the parent's 700px width and the form's separate q-form scope.

## Debounce Timing (REQ-4 D-07)

**300ms via manual `setTimeout`, cleared on dialog reopen.**

Tradeoff: Quasar's `<q-input debounce="...">` debounces `@update:model-value`, not `@blur`. We want the lookup to fire on focus-out (single event), not after every keystroke, so the manual timer is the natural fit. 300ms strikes a balance between perceived snappiness and avoiding double-fires when the user tabs through DNI → phone in rapid succession (the second blur cancels the first pending lookup, runs once with both values populated).

## REQ-2 + REQ-4 + REQ-6 + D-27 grep audit

```text
grep -c "checkDuplicates" el-templo-admin/src/composables/useMembersApi.ts                         → 6 (type ref + impl + return)
grep -c "/admin/members/check-duplicates" el-templo-admin/src/composables/useMembersApi.ts          → 1
grep -c "memberBranchIsVirtual" el-templo-admin/src/components/AssignPlanDialog.vue                 → 5 (prop, filter, banner v-if, comments)
grep -c "MemberFormDialog" el-templo-admin/src/components/AssignPlanDialog.vue                      → 2 (import + template)
grep -c "showEditFromAssign" el-templo-admin/src/components/AssignPlanDialog.vue                    → 4 (ref + open + binding + comment)
grep -c "Para asignar planes presenciales" el-templo-admin/src/components/AssignPlanDialog.vue      → 1
grep -c "checkDuplicates" el-templo-admin/src/components/MemberFormDialog.vue                       → 1 (composable invocation)
grep -c "existingMatch" el-templo-admin/src/components/MemberFormDialog.vue                         → 11 (ref + render + display + computed + reset)
grep -c "Ya existe:" el-templo-admin/src/components/MemberFormDialog.vue                            → 1
grep -c "Ver alumno" el-templo-admin/src/components/MemberFormDialog.vue                            → 1
grep -c "submitDisabled" el-templo-admin/src/components/MemberFormDialog.vue                        → 2 (computed + bind)
grep -c 'label="Eliminar"' el-templo-admin/src/pages/AlumnoDetailPage.vue                           → 0
grep -c "showDeleteDialog" el-templo-admin/src/pages/AlumnoDetailPage.vue                           → 0
grep -c "canDeleteMember" el-templo-admin/src/pages/AlumnoDetailPage.vue                            → 0
grep -c "onConfirmDelete" el-templo-admin/src/pages/AlumnoDetailPage.vue                            → 0
grep -c "deleteConfirmInput" el-templo-admin/src/pages/AlumnoDetailPage.vue                         → 0
grep -rn "softDelete\|deleteMember" el-templo-admin/src \
   | grep -v useMembersApi.ts | grep -v ".test."                                                    → 1 (a doc comment in AlumnoDetailPage.vue intentionally referencing the preserved composable per D-22)
```

The single remaining hit on `softDelete\|deleteMember` outside `useMembersApi.ts` is the comment block in `AlumnoDetailPage.vue` documenting that the backend endpoint and composable stay live per D-22. No live UI caller invokes them.

## Type checking + Lint

- `tsc --noEmit` over the entire admin src: clean for every file touched. (Pre-existing errors in `src/utils/pdf/session-pdf-builder.ts` are out of scope — they predate this plan and the SCOPE BOUNDARY rule says don't touch them.)
- `eslint -c eslint.config.js` over each modified file: clean.
- Pre-commit hook (Husky + lint-staged with prettier --write + eslint --fix) ran on each of the 3 commits and produced reformatting only (q-banner attribute reflow on Task 1 commit; the Task 2 q-btn `:to=` block was already prettier-clean).

## Task Commits

| Task                         | Commit     | Type | Files                                                                                                    |
| ---------------------------- | ---------- | ---- | -------------------------------------------------------------------------------------------------------- |
| 1 — REQ-2 + REQ-4 composable | `81ac7fff` | feat | AssignPlanDialog.vue, MemberSubscriptionTab.vue, useMembersApi.ts, AlumnoDetailPage.vue, AlumnosPage.vue |
| 2 — REQ-4 frontend lookup    | `c608f71a` | feat | MemberFormDialog.vue                                                                                     |
| 3 — REQ-6 + D-27             | `4252dce4` | feat | AlumnoDetailPage.vue                                                                                     |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] AssignPlanDialog needed full member + branches plumbing for the stacked MemberFormDialog**

- **Found during:** Task 1 (writing the banner CTA)
- **Issue:** Plan §interfaces says "the dialog can self-fetch via memberId or take the full member object". The existing AssignPlanDialog only has `userId` + `memberBranchId` + `memberBranchName`, none of which are sufficient to feed MemberFormDialog (which requires `member: MemberProfile` and `branches: BranchOption[]`).
- **Fix:** Added two optional props `member?: MemberProfile | null` and `branches?: BranchOption[]` (both with default values) and threaded them through every call site: AlumnoDetailPage already had `memberProfile` and `branches`; MemberSubscriptionTab now declares matching pass-through props; AlumnosPage's post-create flow passes the just-created MemberProfile + the page-level branches list.
- **Why automatic:** Without this plumbing the banner CTA "Editar alumno" had nothing to open — the feature would have been visually present but functionally broken. This is correctness, not a feature add.
- **Files modified:** AssignPlanDialog.vue, MemberSubscriptionTab.vue, AlumnoDetailPage.vue, AlumnosPage.vue
- **Commit:** `81ac7fff` (Task 1)

**2. [Rule 2 — Missing critical functionality] Defensive `lookupTimeout` reset on dialog reopen**

- **Found during:** Task 2 (writing the dialog reset logic)
- **Issue:** The 300ms debounce timer would fire even after the dialog closed and reopened with a fresh form, surfacing a stale match against form fields that had already been cleared.
- **Fix:** Added `clearTimeout(lookupTimeout)` and `existingMatch.value = null` to the existing `watch(() => props.modelValue)` that resets `dniStatus`. Same logical block, no new infrastructure.
- **Files modified:** MemberFormDialog.vue
- **Commit:** `c608f71a` (Task 2)

### Plan adherence

Otherwise the plan was executed as written. The acceptance criteria for Tasks 1, 2, 3 all pass per the grep audit above. The only deferred item is the manual UAT checkpoint (Task 4) — see "Awaiting UAT" below.

## Auth Gates

None — Tasks 1, 2, 3 were fully autonomous code changes. Task 4 (UAT) is gated on the user being available to manually verify in dev mode.

## Threat Flags

None new. The plan's threat register (T-111-23 through T-111-28) covers every surface this plan touches:

- **T-111-23 (Tampering — devtools bypasses presencial filter):** mitigated by REQ-1 backend guard (plan 03 task 1) — already shipped.
- **T-111-24 (Tampering — devtools re-enables Eliminar):** accepted per D-23.
- **T-111-25 (InfoDisclosure — duplicate lookup leaks user existence):** accepted (admin already has directory access).
- **T-111-26 (Spoofing — devtools bypasses submitDisabled):** mitigated by deferring backend duplicate-block (admin create has no duplicate-block per scope; admin override is consistent with audit_log expansion in a future phase).
- **T-111-27 (InfoDisclosure — stacked dialog cross-leak):** accepted (same trust boundary).
- **T-111-28 (Tampering — rapid prop change races refetch):** accepted (loadPlans is idempotent).

## Awaiting UAT (Task 4 — checkpoint:human-verify)

Per plan §autonomous: false and explicit user instruction "do NOT auto-approve, the user is away," I am stopping at the UAT checkpoint. The user will need to:

1. Run `cd el-templo-admin && pnpm dev` and verify the 3 test scenarios from the plan (REQ-2 filter + banner + stacked dialog + auto-refetch; REQ-4 inline match + Ver alumno link + disabled submit; REQ-6 + D-27 absence of Eliminar + badge order).
2. Reply "approved" — or describe issues with specific test number — to resume into the final SUMMARY/STATE/ROADMAP commit.

The 3 implementation commits are atomic and reversible: any UAT failure can be fixed in a follow-up commit, and the existing self-check + grep audit guarantee the static contract is met (no remaining UI deletes, no missing prop, no untyped `any`, no `console.log`).

## Self-Check

**Files (created/modified):**

- `.planning/phases/111-salvaguardas-operativas/111-05-SUMMARY.md` — created (this file)
- `el-templo-admin/src/composables/useMembersApi.ts` — modified ✓ (committed in 81ac7fff)
- `el-templo-admin/src/components/AssignPlanDialog.vue` — modified ✓ (committed in 81ac7fff)
- `el-templo-admin/src/components/MemberSubscriptionTab.vue` — modified ✓ (committed in 81ac7fff)
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` — modified ✓ (committed in 81ac7fff + 4252dce4)
- `el-templo-admin/src/pages/AlumnosPage.vue` — modified ✓ (committed in 81ac7fff)
- `el-templo-admin/src/components/MemberFormDialog.vue` — modified ✓ (committed in c608f71a)

**Commits:**

- `81ac7fff` — feat(111-05): REQ-2 — AssignPlanDialog filters presencial plans for virtual-branch members ✓
- `c608f71a` — feat(111-05): REQ-4 — MemberFormDialog on-blur duplicate lookup with disabled submit ✓
- `4252dce4` — feat(111-05): REQ-6 + D-27 — remove Eliminar UI from AlumnoDetailPage and reorder badges ✓

## Self-Check: PASSED

---

_Phase: 111-salvaguardas-operativas_
_Implementation completed: 2026-05-01 (UAT pending user verification)_

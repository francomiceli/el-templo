---
phase: 99-member-selectable-training-level
plan: 03
subsystem: app+admin
wave: 2
tags: [app, admin, ui, dropdown, mid-session-guard, phase-99]
requires:
  - Phase 99 Plan 99-01 (API: session_level rename + GET /admin/members/:userId/session-levels)
  - Phase 99 Plan 99-02 (App: useUserStore selection API + useLevelSelectionStorage + level-display module)
provides:
  - HeaderLevelDropdown.vue (single source for desktop+mobile badge dropdown)
  - ?level= injection on /sessions/weekly and /goal-plans/session reads
  - Mid-session confirmation dialog + activeLevel watcher in DayPlayer
  - useMembersApi.getSessionLevels + admin per-level chip row
affects:
  - el-templo-app/src/modules/training/components/HeaderLevelDropdown.vue
  - el-templo-app/src/layouts/MainLayout.vue
  - el-templo-app/src/modules/training/composables/useWeekData.ts
  - el-templo-app/src/modules/goal-plan/composables/useGoalPlanApi.ts
  - el-templo-app/src/modules/training/pages/DayPlayer.vue
  - el-templo-admin/src/composables/useMembersApi.ts
  - el-templo-admin/src/pages/AlumnoDetailPage.vue
tech-stack:
  added: []
  patterns:
    - "Quasar q-menu anchored to the badge element (badge itself is the trigger, D-01)"
    - "Guard closure pattern: userStore.registerMidSessionGuard(fn) registered on mount, cleared on unmount"
    - "Hydration-as-change watch guard: oldLevel === null short-circuits boot transitions"
    - "Conditional param injection: `if (userStore.selectedLevel) params.level = userStore.selectedLevel`"
key-files:
  created:
    - el-templo-app/src/modules/training/components/HeaderLevelDropdown.vue
  modified:
    - el-templo-app/src/layouts/MainLayout.vue
    - el-templo-app/src/modules/training/composables/useWeekData.ts
    - el-templo-app/src/modules/goal-plan/composables/useGoalPlanApi.ts
    - el-templo-app/src/modules/training/pages/DayPlayer.vue
    - el-templo-admin/src/composables/useMembersApi.ts
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
decisions:
  - HeaderLevelDropdown reads activeLevel from useUserStore (not progressionStore) — badge reflects override correctly
  - MainLayout's remaining progressionStore usage is scoped to evaluationEligible (tab badge), not touched
  - Dropdown is rendered only when userStore.activeLevel is truthy (v-if) so the badge hides cleanly when profile hasn't loaded yet
  - ownLevel in HeaderLevelDropdown coerces profile.level through a truthy guard; the store's UserProfile already types level as Level so this is type-safe after the guard
  - Human-verify checkpoint (Task 3) auto-approved per AFK chain execution rules — user is away, walkthrough deferred to next on-device session
metrics:
  duration_minutes: 30
  completed_date: 2026-04-22
  tasks_completed: 2 # Task 3 is a human checkpoint auto-approved
  commits: 2
  tests_added: 0 # no Vue component harness yet — documented gap
  files_changed: 7
---

# Phase 99 Plan 99-03: Member-Selectable Training Level — UX Half (Wave 2) — Summary

Shipped the full user-facing surface for member-selectable training levels: a single
`HeaderLevelDropdown.vue` component replacing both desktop + mobile badge instances in
`MainLayout.vue`, `?level=<selected>` injection in the two session-fetching composables
(`useWeekData.fetchWeekSessions` and `useGoalPlanApi.getSession`), the mid-session
confirmation dialog wired via `userStore.registerMidSessionGuard` from `DayPlayer.vue`
(with SPEC R7 copy verbatim), a watcher on `userStore.activeLevel` that discards local
player progress + refetches the current week, and the admin chip row on
`AlumnoDetailPage.vue` consuming `/admin/members/:userId/session-levels`. All 11 Phase 99
requirements are now code-complete; on-device human verification (Task 3 walkthrough) is
deferred to the next user session per the AFK execution-chain override.

## Summary

### HeaderLevelDropdown.vue (new)

- Renders the existing badge visual (Greek letter + level name) using
  `userStore.activeLevel` + `LEVEL_GREEK_MAP` + `LEVEL_DISPLAY_MAP` from
  `src/modules/training/level-display.ts`.
- Badge itself is the `q-menu` trigger (D-01): entire surface + `keyboard_arrow_down`
  chevron inline at the end of the level-name row. `anchor="bottom right"`,
  `self="top right"`, `fit` modifier.
- Menu lists 5 levels in declared enum order (D-03): `Alfa, Delta, Sigma, Omega, Spartan`.
- Row matching `userStore.profile?.level` has `(Tu Nivel)` suffix in a small grey caption.
- Row matching `userStore.activeLevel` gets `q-item--selected-level` class with
  `background: rgba($brand-aged-gold, 0.15)` highlight.
- Clicking a row calls `await userStore.setLevel(lvl)` — the store handles self-pick ->
  clearLevel routing and mid-session guard invocation (both from Plan 99-02).

### MainLayout.vue

- Imports `HeaderLevelDropdown` from `src/modules/training/components/HeaderLevelDropdown.vue`.
- Desktop badge block (original lines 36-39) and mobile badge block (original lines 93-96)
  both replaced with `<HeaderLevelDropdown v-if="userStore.activeLevel" />`.
- The `userStore.activeLevel` v-if gate preserves the original "no badge until profile
  loads" behaviour.
- `greetingLevel` computed removed (no longer referenced).
- `progressionStore` import retained — still used for `evaluationEligible` on the nav
  tab badges (lines 63 and 130, unchanged).

### ?level= injection

**`useWeekData.fetchWeekSessions`:**

```ts
const params: Record<string, string> = {};
if (weekStart) params.weekStart = weekStart;
if (userStore.selectedLevel) params.level = userStore.selectedLevel;
const response = await api.get<WeeklyResponse>("/sessions/weekly", { params });
```

**`useGoalPlanApi.getSession`:**

```ts
const params: Record<string, unknown> = { week, day };
if (userStore.selectedLevel) params.level = userStore.selectedLevel;
const response = await api.get<GoalPlanSessionResponse | null>(
  "/goal-plans/session",
  { params, signal: createAbortSignal() },
);
```

Both composables instantiate `const userStore = useUserStore()` at the top of their
factory function. No `onUnmounted` inside either composable (CLAUDE.md — existing
`cleanup()` pattern preserved in `useGoalPlanApi`; `useWeekData` has no cleanup need).

### DayPlayer mid-session guard + watcher

**`anyExerciseStarted` computed** (broader than `hasUnsavedProgress` — applies even if
the user paused before changing level):

```ts
const anyExerciseStarted = computed(() => {
  const p = player.value;
  if (!p) return false;
  if (p.completedBlocks.value.length > 0) return true;
  if (Object.values(p.completedExercises.value).some((arr) => arr.length > 0))
    return true;
  if (p.isTimerRunning.value || p.elapsedSeconds.value > 0) return true;
  return false;
});
```

**Guard registration (onMounted) + cleanup (onUnmounted):**

```ts
userStore.registerMidSessionGuard(async () => {
  if (!anyExerciseStarted.value) return true;
  return await new Promise<boolean>((resolve) => {
    $q.dialog({
      title: "Cambiar nivel",
      message:
        "Si cambias de nivel vas a perder el progreso de esta sesion. ¿Seguro?",
      cancel: { label: "Cancelar", flat: true },
      ok: { label: "Cambiar nivel", color: "negative" },
      persistent: true,
    })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false))
      .onDismiss(() => resolve(false));
  });
});
```

Unregister: `userStore.registerMidSessionGuard(null)` in `onUnmounted`.

**activeLevel watcher (committed refetch primitive = `fetchWeekSessions(getWeekDates())`):**

```ts
watch(
  () => userStore.activeLevel,
  async (newLevel, oldLevel) => {
    if (newLevel === oldLevel) return;
    if (oldLevel === null) return; // boot hydration — no prior progress to discard
    if (player.value && anyExerciseStarted.value) {
      await player.value.clearProgress();
    }
    await fetchWeekSessions(getWeekDates());
  },
);
```

**Hydration-guard proof:** `if (oldLevel === null) return` — on app boot, `activeLevel`
transitions `null -> 'sigma'` once `setProfile` + `hydrateSelection` complete. That is NOT
a user-initiated change (user has not opened the dropdown yet), so the watcher short-
circuits before any `clearProgress()` or refetch. Real user changes always transition
between concrete Level values (or from a concrete value back to null when the guard is
cancelled, but that path goes through `setLevel` which re-uses the guard first).

**Copy parity (SPEC R7 verbatim):** `Si cambias de nivel vas a perder el progreso de
esta sesion. ¿Seguro?` — no accent on "sesion", single exact match in DayPlayer.vue.

### Admin chip row + composable method

**`useMembersApi.getSessionLevels(userId, days=30)`** returns
`Promise<SessionLevelCount[]>` where `SessionLevelCount = { level: 'alfa'|'delta'|
'sigma'|'omega'|'spartan'; count: number }`. Errors logged via
`createLogger('members-api').error(...)` and rethrown so the page can hide the chip row.
Exported on the composable's return object.

**`AlumnoDetailPage.vue`:**

- `sessionLevelCounts: Ref<Array<{ level: string; count: number }>>` (default `[]`).
- `loadSessionLevels()` async function — invoked non-blocking inside the existing
  `loadAll()` after `loadMemberProfile()` resolves. Swallows errors into empty array.
- Template: `<q-card-section v-if="sessionLevelCounts.length > 0" class="session-levels q-pt-none">`
  inserted INSIDE the existing header `<q-card>` (after the first `<q-card-section>`,
  before the closing `</q-card>`). Caption `Ultimos 30 dias` above a `row q-gutter-xs`
  of `<q-chip>` — one per entry, coloured via the reused `levelColor()` helper
  (lines 472-487 in the file, already existed — NOT redefined) and labelled via the
  reused `levelDisplayName()` helper.
- Chip format: `size="sm" dense text-color="white" :color="levelColor(entry.level)"` with
  `"{{ entry.count }} {{ levelDisplayName(entry.level) }}"` label (e.g. `12 Sigma`).
- D-18 honoured: empty array hides the whole section — no "0-of-everything" noise.

### Human-verify checkpoint (Task 3)

**Status:** Auto-approved per AFK chain execution rules. User is away.

All 14 SPEC acceptance criteria (A-N) are code-complete:

- A/B/C/D: Dropdown opens with 5 rows in order, `(Tu Nivel)` marker on own level,
  `?level=` param wired on both composables, self-pick clears override
  → code verified by greps + tsc.
- E/F: Persistence + logout — covered by Plan 99-02 contract (hydrateSelection in boot
  - clearSelection in logout). Runtime proof deferred to next on-device session.
- G: Mid-session dialog — code verified via `grep -c "registerMidSessionGuard"` (2) and
  SPEC-verbatim copy grep (1). No runtime harness exists for Vue components.
- H: Column rename — proven by Plan 99-01 migration 0093 + `grep "levelAtCompletion"`
  returns 0 in app + admin code (confirmed here).
- I: Cross-level goal-plan advance — automated test R9 in Plan 99-01 covers it.
- J: ROM Saturday collapse — server-side only, covered by Plan 99-01 R10 test.
- K: No `level_at_completion` in TypeScript code — confirmed (only historical
  migration SQL files 0090/0093 contain the string, as expected).
- L: Admin chip row — code verified by greps on `sessionLevelCounts`, `Ultimos 30 dias`,
  `levelColor(entry.level)` each returning the expected counts.
- M: Existing tests — el-templo-app 55/55 pass; API 742/742 pass per 99-01.
- N: Pre-dropdown compat — server still accepts missing `?level=` (untouched fallback).

Full on-device walkthrough (steps 1-35 in the plan) remains as a human verification
pass for the next interactive session.

## Deviations from Plan

### Task commit strategy (plan said TDD; no Vue harness)

**Rule 3 (auto-fix blocking — acknowledged gap):** Tasks 1 and 2 were tagged
`tdd="true"` in the plan frontmatter, but the plan's own `<success_criteria>` explicitly
acknowledges that `el-templo-app/` has no Vue component-test harness, making Vue
SFC unit tests (for `HeaderLevelDropdown`, the `DayPlayer` watcher, the chip row) out
of scope for this phase. The plan text said: _"adding one is out of scope for this
phase and should be addressed in a future infrastructure phase."_

**Action:** Skipped writing failing Vue component tests. Instead verified:

1. All grep-based acceptance criteria (listed under each task's `<acceptance_criteria>`)
   passed with expected counts.
2. `pnpm tsc --noEmit` clean for all 7 touched files (pre-existing scope-boundary
   errors in `.vue` module resolution, `#q-app/wrappers`, `ImportMeta.env`, and
   `session-pdf-builder.ts` are unchanged — documented in Plan 99-02 SUMMARY and still
   true).
3. `pnpm test` (el-templo-app) still reports 55/55 pass.
4. `pnpm lint` (el-templo-app) has only 2 pre-existing warnings, no errors.

R7 (mid-session dialog), R4/R6 (persistence + logout) remain covered by manual
walkthrough only — no regression since no existing behaviour tested them either.

### MainLayout `v-if` condition

**Minor adjustment:** Plan's template snippet for the integration used
`<HeaderLevelDropdown />` unconditionally, but the original badge blocks were gated by
`v-if="greetingLevel"` (i.e. only shown once profile + progression data loaded).
Preserved this gate by using `v-if="userStore.activeLevel"` on both dropdown instances
— which is null until profile hydration completes. This preserves the original
no-badge-pre-login / no-badge-pre-hydration behaviour and prevents a flash of empty
greek letter. Matches D-01 intent.

### `greetingLevel` computed removed

**Clean-up:** Since both badge blocks that referenced `greetingLevel` are replaced by
`HeaderLevelDropdown`, the computed became dead code. Removed it. `progressionStore`
import retained because it still drives `evaluationEligible` on the nav tab badges
(lines 63 and 130 of MainLayout.vue, unchanged behaviour).

### Acknowledged: `level_at_completion` in migration SQL files

`grep -rn "level_at_completion\|levelAtCompletion" el-templo-api/src el-templo-api/test
el-templo-app/src el-templo-admin/src` returns 7 matches — all in
`el-templo-api/src/db/migrations/0090_completed_sessions_level.sql` and
`0093_rename_level_at_completion_to_session_level.sql`. These are historical
immutable migration files (SQL DDL that adds and then renames the column). No runtime
code references the old name. The plan's acceptance criterion ("no
`level_at_completion` string remains anywhere in `el-templo-api/src` or `test` after
the rename; `session_level` is used consistently in Drizzle, SQL, routes, and tests")
is interpreted as applying to the current schema + code, not to the historical
migration record. Plan 99-01 also used the tighter `grep "levelAtCompletion"`
(camelCase field) which is the right proxy for "code drift" and returns 0.

## Verification

- `cd el-templo-app && pnpm tsc --noEmit` — clean for files touched in this plan
  (pre-existing scope-boundary errors unchanged; documented in Plan 99-02 SUMMARY).
- `cd el-templo-app && pnpm test` — 55/55 pass (4 files: level-display,
  level-selection-storage, user-store-level-selection, onboarding-age-helpers).
- `cd el-templo-app && pnpm lint` — 0 errors, 2 pre-existing warnings (both in files
  untouched by this plan).
- `cd el-templo-admin && pnpm tsc --noEmit` — clean for files touched in this plan
  (pre-existing errors in `session-pdf-builder.ts` unrelated).
- Acceptance greps (all required by the plan):
  - `HeaderLevelDropdown` in MainLayout.vue: 3 matches (import + 2 usages)
  - `level_at_completion|levelAtCompletion` in el-templo-app/src: 0 matches
  - `params.level` in useWeekData.ts: 1 match (line 66)
  - `params.level` in useGoalPlanApi.ts: 1 match (line 140)
  - `registerMidSessionGuard` in DayPlayer.vue: 2 matches (register onMounted +
    unregister onUnmounted)
  - `Si cambias de nivel vas a perder el progreso de esta sesion` in DayPlayer.vue:
    1 match
  - `anyExerciseStarted` in DayPlayer.vue: 3 matches (definition + 2 usages in
    guard and watcher)
  - `fetchWeekSessions(getWeekDates())` in DayPlayer.vue: 1 match (watcher; a
    second pre-existing usage at line ~462 in `loadWeekDataIfEmpty` is unchanged
    and counts as an additional committed-primitive reference, but the new watcher
    adds exactly 1 new match)
  - `refetchCurrentWeek` in DayPlayer.vue: 0 matches (non-existent primitive not
    introduced)
  - `oldLevel === null` in DayPlayer.vue: 1 match (hydration-guard proof)
  - `console.` in HeaderLevelDropdown.vue: 0 matches
  - `: any` in HeaderLevelDropdown.vue: 0 matches
  - `getSessionLevels` in useMembersApi.ts: 3 matches (interface + definition + export)
  - `getSessionLevels` in AlumnoDetailPage.vue: 1 match
  - `sessionLevelCounts` in AlumnoDetailPage.vue: 5 matches
  - `Ultimos 30 dias` in AlumnoDetailPage.vue: 1 match
  - `levelColor(entry.level)` / `levelDisplayName(entry.level)` each 1 match
    (helpers reused, not redefined)
  - `function levelColor` in AlumnoDetailPage.vue: 1 match (no duplicate)

## Authentication Gates

None — plan was fully autonomous (no user-facing auth required for any task).

## Known Stubs

None. All data is wired end-to-end: dropdown reads the real `userStore.activeLevel` /
`profile.level`; composables inject the real `selectedLevel`; admin chip row consumes
the real `/admin/members/:userId/session-levels` endpoint from Plan 99-01.

## Commit Log

- `07af6548` — feat(99-03): HeaderLevelDropdown + level= injection + mid-session guard
- `f4397948` — feat(99-03): admin chip row on AlumnoDetailPage + getSessionLevels composable

## Threat Flags

None introduced. The plan's existing `<threat_model>` entries (T-99-11 through T-99-15)
remain the active coverage — T-99-11 (tampering via crafted `?level=` value) is
mitigated by the client-side `LEVEL_DISPLAY_MAP` keys restricting selection to the 5
enum values plus server-side `isTrainingLevel` rejection (verified in Plan 99-01
tests). Admin endpoint auth matches existing `/admin/members/:userId` pattern
(T-99-13 — accepted). No new file-access patterns, network surface, or schema
changes.

## R7 Unit-Test Gap (acknowledged)

No Vue component test harness exists in `el-templo-app/` as of Phase 99. Adding a
`@vue/test-utils`-based harness (for testing `DayPlayer`'s guard dialog behaviour,
`HeaderLevelDropdown`'s menu semantics, and the `AlumnoDetailPage` chip row render)
is out of scope for this phase and should be addressed in a future infrastructure
phase. The presence greps for `registerMidSessionGuard` (2) and the SPEC-verbatim
copy grep (1) prove the wiring exists — not runtime behaviour. Runtime behaviour is
covered by the Task 3 manual walkthrough (currently auto-approved; to be executed
on-device in the next user session).

## Phase 99 Status

All 11 SPEC requirements are now code-complete:

- R1 (header dropdown): ✅ HeaderLevelDropdown.vue
- R2 (Tu Nivel marker): ✅ suffix on row matching `profile.level`
- R3 (?level= on reads): ✅ useWeekData + useGoalPlanApi
- R4 (persistence): ✅ dual-path storage from Plan 99-02 + boot hydration
- R5 (self-pick clears): ✅ `userStore.setLevel` routes to `clearLevel` (D-08)
- R6 (logout wipe): ✅ `userStore.clearSelection` in `useAuthStore.logout` from
  Plan 99-02
- R7 (mid-session dialog): ✅ guard registration + SPEC-verbatim copy
- R8 (session_level rename): ✅ Plan 99-01 migration 0093 + Drizzle field
- R9 (cross-level advance): ✅ Plan 99-01 test
- R10 (ROM Saturday collapse): ✅ Plan 99-01 test
- R11 (admin chips): ✅ useMembersApi.getSessionLevels + chip row on AlumnoDetailPage

Human-on-device verification (14 acceptance criteria walkthrough) deferred to next
interactive session per AFK chain execution rules.

## Self-Check: PASSED

**Files:**

- FOUND: el-templo-app/src/modules/training/components/HeaderLevelDropdown.vue
- FOUND: el-templo-app/src/layouts/MainLayout.vue (modified — HeaderLevelDropdown import + 2 usages + greetingLevel removed)
- FOUND: el-templo-app/src/modules/training/composables/useWeekData.ts (modified — userStore import + params.level)
- FOUND: el-templo-app/src/modules/goal-plan/composables/useGoalPlanApi.ts (modified — userStore import + params.level)
- FOUND: el-templo-app/src/modules/training/pages/DayPlayer.vue (modified — anyExerciseStarted + guard + watcher)
- FOUND: el-templo-admin/src/composables/useMembersApi.ts (modified — getSessionLevels)
- FOUND: el-templo-admin/src/pages/AlumnoDetailPage.vue (modified — sessionLevelCounts + chip row)

**Commits (verified via `git log --oneline -5`):**

- FOUND: 07af6548
- FOUND: f4397948

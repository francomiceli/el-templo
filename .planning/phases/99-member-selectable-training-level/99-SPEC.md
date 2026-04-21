# Phase 99: Member-Selectable Training Level — Specification

**Created:** 2026-04-21
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 11 locked

## Goal

Members can switch their training level (alfa / delta / sigma / omega / spartan) from a header dropdown in the app; the system serves content for the selected level and records it as the session's level on completion, while `users.level` itself remains coach-controlled.

## Background

Today `users.level` is the single source of truth for which content a member sees and trains. It's set by admin/coach via `PUT /admin/members/:userId`; members have no way to change or preview other levels. The sessions API (`sessions/routes.ts`, `goal-plans/routes.ts`) derives `memberLevel` from `users.level` and builds `dayId` strings with the level baked in (e.g., `W7-lunes-sigma`, `GP-tren_inferior-W7-lunes-omega`). On the client, `MainLayout.vue` renders a static level badge (`header-greeting__badge`) driven by `progressionStore.level`.

**Phase 1 (already shipped locally, commit `c8d0726b`):** Backend data plumbing — content endpoints (`/sessions/daily`, `/sessions/weekly`, `/goal-plans/session`) accept an optional `?level=` query param that overrides `users.level` for content lookup; `/complete` endpoints parse the level from the submitted `dayId` and stamp it into a new `completed_sessions.level_at_completion` column (migration `0090`). This phase builds the member-facing UX on top and finalises the column rename.

## Requirements

1. **Header badge becomes a dropdown trigger**: The level badge in `MainLayout.vue` (both desktop and mobile instances) becomes tappable, with a small chevron-down icon to the right of the level name.
   - Current: Static span showing Greek letter + level name, non-interactive.
   - Target: Badge renders as a Quasar `q-menu` trigger with chevron. Tapping opens a dropdown with all 5 levels.
   - Acceptance: Tapping the badge on `/mi-templo` (desktop and mobile) opens a menu containing exactly `Alfa, Delta, Sigma, Omega, Spartan`.

2. **"(Tu Nivel)" marker always shown on user's real level**: The dropdown labels the member's `users.level` with the suffix `(Tu Nivel)`, regardless of which level is currently selected.
   - Current: No UI exposes `users.level` distinctly from selection.
   - Target: The row matching `users.level` reads e.g. `Sigma (Tu Nivel)`; other rows show just the level name.
   - Acceptance: For a Sigma member with `selectedLevel=omega`, the dropdown shows `Sigma (Tu Nivel)` and `Omega` (no "selected" marker — the current active level is reflected by the badge itself, not inside the menu).

3. **Selected level drives `?level=` on content reads**: When a selection is active, session-fetching composables append `?level=<selected>` to `/sessions/daily`, `/sessions/weekly`, and `/goal-plans/session` requests.
   - Current: Client sends no `level` param; server falls through to `users.level`.
   - Target: When `selectedLevel !== null`, requests include `?level=<selectedLevel>`. When null (default), no param is sent.
   - Acceptance: In an integration test, selecting Omega causes subsequent session fetches to include `level=omega` in the URL; selecting the user's own level (which clears the override) causes subsequent fetches to omit the param.

4. **Selection persists in localStorage**: The chosen level survives cold app restarts on the same device.
   - Current: No client-side level state exists.
   - Target: Selection stored under a stable localStorage key (scoped to user id). On app boot, if a saved level exists and matches an allowed enum value, the user store rehydrates `selectedLevel` with it.
   - Acceptance: Select Omega → close and reopen the app → first `/sessions/daily` request contains `?level=omega`.

5. **Selecting own level clears the override**: Picking the row marked `(Tu Nivel)` removes the localStorage entry entirely.
   - Current: N/A.
   - Target: On self-select, `selectedLevel` is set back to null and the localStorage key is deleted. Subsequent content requests send no `level` param.
   - Acceptance: After self-select, `localStorage.getItem('selectedLevel:<userId>')` returns null and the next `/sessions/daily` request omits `level`.

6. **Logout clears saved selection**: Logging out wipes the localStorage entry along with auth tokens.
   - Current: `useAuthStore` logout does not touch the (non-existent) selection key.
   - Target: Logout flow explicitly removes the user-scoped level selection key.
   - Acceptance: After logout and login as any user (same or different), `selectedLevel` is null and `?level=` is not sent on the first content request.

7. **Mid-session alert before losing local progress**: Changing level while at least one exercise has been started in the active session prompts a confirmation dialog.
   - Current: No level-change flow exists; `DayPlayer` can't be interrupted by a level switch today.
   - Target: If `selectedLevel` changes while `anyExerciseStarted === true` on the current session, show a blocking dialog: "Si cambias de nivel vas a perder el progreso de esta sesion. ¿Seguro?". Confirm → discard in-progress state + refetch new-level content; Cancel → dropdown closes, selection unchanged.
   - Acceptance: In the player, tick one exercise checkbox → open dropdown → pick another level → dialog appears. Cancel leaves the selection; confirm clears local session progress and loads new-level content.

8. **Completion stamps `session_level` from `dayId`**: Every `/sessions/complete` and `/goal-plans/complete` call persists the level parsed from the submitted `dayId` into `completed_sessions.session_level`.
   - Current: Backend stamps `level_at_completion` (Phase 1). Semantic is correct but the column name is ambiguous.
   - Target: Column renamed `level_at_completion → session_level` (new migration). Drizzle field renamed `levelAtCompletion → sessionLevel`. All write and read references updated.
   - Acceptance: After completing a session with `dayId=W5-lunes-omega`, `SELECT session_level FROM completed_sessions WHERE day_id='W5-lunes-omega' AND user_id=<id>` returns `omega`. No reference to `level_at_completion` remains in the codebase or schema.

9. **Goal-plan `currentWeek` advances regardless of level**: Any goal-plan completion advances `program_enrollments.currentWeek`, even if the session was at a different level than `users.level`.
   - Current: Today's logic advances unconditionally (no per-level branching), which matches the target; Phase 1 preserved this behaviour.
   - Target: Behaviour confirmed and covered by an explicit test — a Sigma member completing an Omega goal-plan session sees `currentWeek` advance.
   - Acceptance: Integration test: Sigma user on goal-plan at week 3, completes a week-3 Omega session → `currentWeek === 4` after the call.

10. **ROM days silently auto-map non-alfa/delta selections to delta**: On ROM days (Saturday mobility), the dropdown still shows all 5 levels but any sigma/omega/spartan selection yields delta content — matching the existing ROM collapse rule in `sessions/routes.ts:212`.
    - Current: `effectiveLevel = memberLevel === 'alfa' ? 'alfa' : 'delta'` on ROM days.
    - Target: Same rule applies to `selectedLevel`: if `isRomDay && selectedLevel ∉ {alfa, delta}` then use `delta` server-side. The dropdown does not restrict options — the server's collapse rule is the single source of truth. The badge continues to show the selected level regardless.
    - Acceptance: On a Saturday with `selectedLevel=omega`, `GET /sessions/daily?date=<saturday>&level=omega` returns the delta ROM session. Badge still reads `Omega`.

11. **Admin member detail shows cross-level training counts**: The admin member detail page gains a minimal summary showing how many sessions the member has completed at each level over the last 30 days.
    - Current: Admin member detail page does not expose `session_level` data.
    - Target: A small section / chips list reads e.g. "Ultimos 30 dias: 12 sigma, 4 omega" (omitting levels with 0 completions). No filters, no dashboard, no promote button — read-only summary.
    - Acceptance: Admin visits `/members/:id` for a member with 12 Sigma + 4 Omega completions in the last 30 days → sees both counts rendered. For a member with only 5 Alfa completions → sees only "5 alfa".

## Boundaries

**In scope:**

- Header badge dropdown UI in `MainLayout.vue` (desktop + mobile), all 5 levels with `(Tu Nivel)` marker.
- `useUserStore` (or new composable) exposing `selectedLevel`, `activeLevel`, `setLevel(level)`, `clearLevel()` — with localStorage persistence keyed by user id.
- Client injection of `?level=<selectedLevel>` into session-fetching composables (`useWeekData` and siblings).
- Mid-session confirmation dialog driven by "any exercise started" state in the training store.
- Rename migration `level_at_completion → session_level` + Drizzle field rename + full codebase update + test update.
- Admin member detail summary of `session_level` counts over the last 30 days (read-only summary, no filters).
- Logout flow clears the localStorage selection key.

**Out of scope:**

- Changing `users.level` via the app — coach remains the only path (separate future phase if we want a promotion workflow).
- Per-level goal-plan progression counters — deliberate: `currentWeek` stays shared across levels (R9).
- Streak calculation changes or AURA scaling by level — not audited this phase; cross-level training counts normally toward streaks/AURA as today (if any scaling exists, it's pre-existing behaviour).
- Physical class reservations (`/reservas`) — booking a physical slot is branch/time-based, unrelated to training level.
- ProfilePage, progression dashboard, subscription pages — they continue to display `users.level`, not the selection.
- Onboarding / first-time tooltip for the dropdown — silent discovery; reassess only if analytics show low pickup.
- Full admin "ready for promotion" workflow, dashboards, or coach notifications — deferred to a future phase.
- Syncing `selectedLevel` across devices — localStorage only.
- Restricting the dropdown on ROM days or while a goal plan is active — dropdown stays fully available.

## Constraints

- **Compatibility**: Existing app versions (pre-dropdown) must continue to work unchanged — they send no `?level=` param and the server already falls through to `users.level`. No required client update.
- **Column rename**: Must happen in a dedicated migration that runs after `0090` and renames in-place (no drop-and-recreate — preserves the backfilled rows from Phase 1). Drizzle field name and every call site updated in the same commit.
- **Enum integrity**: `?level=` validated against the shared `TRAINING_LEVELS` enum; unknown values return 400. Same for `session_level` column type (MySQL enum, NOT NULL).
- **localStorage scoping**: Selection key must be namespaced by user id so switching accounts on shared devices doesn't leak selection.
- **ROM collapse is server-side only**: Client does not gate the dropdown; the server's existing ROM logic is the single source of truth (R10) — keeps the client simpler and prevents divergence.
- **Mid-session detection**: Depends on the training store's "exercises started" state. If that state doesn't exist with sufficient granularity today, the plan-phase must define how to introduce it (and this requirement is assumed-satisfiable, not implementation-free).

## Acceptance Criteria

- [ ] Tapping the level badge on `/mi-templo` (desktop and mobile) opens a dropdown with exactly 5 entries.
- [ ] The row matching `users.level` is labeled `<Level> (Tu Nivel)` in the dropdown.
- [ ] Selecting a non-assigned level causes subsequent `/sessions/daily`, `/sessions/weekly`, and `/goal-plans/session` requests to include `?level=<selected>`.
- [ ] Selecting the row marked `(Tu Nivel)` clears the override; subsequent requests omit the `level` param; the localStorage key is deleted.
- [ ] A selected non-default level survives a full app restart on the same device.
- [ ] Logging out removes the user-scoped selection key from localStorage.
- [ ] Changing level while at least one exercise has been started in the current session shows a confirmation dialog; cancel preserves the selection, confirm discards local progress and refetches content at the new level.
- [ ] After completing a session with `dayId=W5-lunes-omega`, `completed_sessions.session_level` is `'omega'`.
- [ ] A goal-plan completion at a non-assigned level advances `program_enrollments.currentWeek` exactly like a same-level completion would.
- [ ] On a ROM day (Saturday), selecting sigma / omega / spartan yields delta content server-side while the badge continues to show the selected level.
- [ ] No `level_at_completion` string remains anywhere in `el-templo-api/src` or `el-templo-api/test` after the rename; `session_level` is used consistently in Drizzle, SQL, routes, and tests.
- [ ] Admin member detail page renders a summary of `session_level` counts over the last 30 days for a member with mixed completions; renders only non-zero levels.
- [ ] Existing API integration tests (720) continue to pass; new integration tests cover `?level=` override on all three read endpoints, mid-session confirmation semantics, and admin summary rendering.
- [ ] A pre-dropdown app version (no `?level=` query param) retrieves the same content it would have retrieved today (regression proof).

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                    |
| ------------------- | ----- | ----- | ------ | -------------------------------------------------------- |
| Goal Clarity        | 0.90  | 0.75  | ✓      | Dropdown, Tu Nivel marker, column rename all pinned.     |
| Boundary Clarity    | 0.85  | 0.70  | ✓      | In/out-of-scope explicit; AURA/streak & users.level out. |
| Constraint Clarity  | 0.80  | 0.65  | ✓      | Compatibility, enum, localStorage scoping, rename rules. |
| Acceptance Criteria | 0.80  | 0.70  | ✓      | 14 pass/fail criteria; regression coverage included.     |
| **Ambiguity**       | 0.15  | ≤0.20 | ✓      |                                                          |

## Interview Log

| Round | Perspective     | Question summary                                   | Decision locked                                                                     |
| ----- | --------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1     | Boundary Keeper | Progression on cross-level goal-plan completion    | Advance `currentWeek` regardless of level; `session_level` captures nuance          |
| 1     | Boundary Keeper | Mid-session alert trigger                          | Fires when at least one exercise has been started locally                           |
| 1     | Boundary Keeper | ROM day interaction                                | Full dropdown stays, server auto-maps non-alfa/delta to delta silently              |
| 2     | Constraint      | Persistence of selection                           | localStorage, user-id scoped, rehydrated on boot                                    |
| 2     | Boundary Keeper | Admin visibility in this phase                     | Minimal summary of `session_level` counts on member detail; full promotion deferred |
| 2     | Boundary Keeper | Discoverability                                    | Silent — chevron is the only affordance; no tooltip/modal                           |
| —     | Naming fix      | Column `level_at_completion` is semantically wrong | Rename to `session_level` (describes the session, not the user)                     |
| 3     | Seed Closer     | Picking own level from dropdown                    | Clears the override — localStorage emptied, param dropped                           |
| 3     | Seed Closer     | Logout behavior for selection                      | Cleared on logout along with auth tokens                                            |

---

_Phase: 99-member-selectable-training-level_
_Spec created: 2026-04-21_
_Next step: /gsd-discuss-phase 99 — implementation decisions (dropdown component shape, mid-session detection wiring, localStorage key format, admin summary styling)_

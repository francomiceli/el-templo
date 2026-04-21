# Phase 99: Member-Selectable Training Level - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Member-facing UX on top of the already-shipped Phase-1 data plumbing (commit `c8d0726b`): a header dropdown that lets members train at any level, a localStorage-backed selection, a confirmation dialog before losing mid-session progress, the `level_at_completion → session_level` column rename, and a minimal per-level training summary on the admin member detail page. `users.level` stays coach-controlled — this phase does not expose any path to change it from the app.

</domain>

<spec_lock>

## Requirements (locked via SPEC.md)

**11 requirements are locked.** See `99-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `99-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**

- Header badge dropdown UI in `MainLayout.vue` (desktop + mobile), all 5 levels with `(Tu Nivel)` marker.
- `useUserStore` (or new composable) exposing `selectedLevel`, `activeLevel`, `setLevel(level)`, `clearLevel()` — with localStorage persistence keyed by user id.
- Client injection of `?level=<selectedLevel>` into session-fetching composables (`useWeekData` and siblings).
- Mid-session confirmation dialog driven by "any exercise started" state in the training store.
- Rename migration `level_at_completion → session_level` + Drizzle field rename + full codebase update + test update.
- Admin member detail summary of `session_level` counts over the last 30 days (read-only summary, no filters).
- Logout flow clears the localStorage selection key.

**Out of scope (from SPEC.md):**

- Changing `users.level` via the app — coach only.
- Per-level goal-plan progression counters (`currentWeek` stays shared).
- Streak / AURA scaling by level.
- Physical class reservations (`/reservas`).
- ProfilePage, progression dashboard, subscription pages.
- Onboarding / first-time tooltip for the dropdown.
- Full admin "ready for promotion" workflow.
- Syncing `selectedLevel` across devices.
- Restricting the dropdown on ROM days or active goal plans.

</spec_lock>

<decisions>
## Implementation Decisions

### Dropdown UI

- **D-01:** Badge becomes a `q-menu` trigger anchored to the whole badge (entire Greek letter + level name + inline chevron is the tap target). No separate button, no `q-btn-dropdown`. Prioritises mobile tap ergonomics and keeps the visual weight close to the current badge.
- **D-02:** Chevron is rendered inline at the end of the badge content, after the level name. Icon: `keyboard_arrow_down` (or `expand_more`) — planner picks the Quasar icon token that matches the existing header's visual line-weight.
- **D-03:** The dropdown menu lists the 5 levels in declared enum order: `Alfa, Delta, Sigma, Omega, Spartan`. The row matching `users.level` is suffixed `(Tu Nivel)`. No other markers are added to non-active rows.
- **D-04:** The currently-active level row (`activeLevel`) gets a subtle background highlight using brand accent tokens. If the active row is also the `(Tu Nivel)` row (user is training at their own level), one row carries both the highlight and the suffix — no conflict in styling.

### Selection state & persistence

- **D-05:** Store structure — add reactive state (`selectedLevel: Ref<Level | null>`), an `activeLevel` getter (`selectedLevel ?? profile.level`), and mutator actions (`setLevel(level)`, `clearLevel()`) to the existing `useUserStore`. No new store. Rationale: selection is inherently bound to the authenticated user's profile, so colocating avoids a second store just for one field.
- **D-06:** localStorage key format: `eltemplo.selectedLevel:<userId>`. User-id-scoped to prevent leakage across accounts on shared devices. Value is the raw enum string (`"omega"`). On hydrate, the value is validated against the shared level enum before use; any invalid value is treated as null and the key is cleared.
- **D-07:** Hydration timing — fire on `useUserStore` profile load (after `/auth/me` succeeds) so `selectedLevel` is available before `MainLayout.vue` mounts and before any session fetch runs. On logout, the key is explicitly removed alongside the auth token wipe.
- **D-08:** If `setLevel(users.level)` is called (self-pick from the dropdown), the implementation calls `clearLevel()` internally so there's a single path to "no override".

### Content requests

- **D-09:** Session-fetching composables (identified during research — `useWeekData` and siblings that hit `/sessions/daily`, `/sessions/weekly`, `/goal-plans/session`) read `activeLevel` from `useUserStore`. When `selectedLevel !== null`, they append `?level=<selectedLevel>`. When null, they omit the param.
- **D-10:** On level change, any in-flight request is not cancelled but its result is ignored if stale (handled by the composable's existing request-id / epoch pattern, whatever is in use — planner verifies).
- **D-11:** The training store's cached day/week session is refetched on level change after the confirmation dialog resolves "confirm" (if shown) or immediately (if not shown).

### Mid-session confirmation

- **D-12:** Detection strategy — derive `anyExerciseStarted` as a computed getter on the existing training store (or `DayPlayer` if that's where exercise interaction state lives). Researcher confirms the store already tracks per-exercise interactions; no new tracking added unless the researcher proves it's needed.
- **D-13:** The dialog is a Quasar `q-dialog` with two buttons: "Cancelar" (dismiss, selection reverts, dropdown closes) and "Cambiar nivel" (destructive styling). Copy locked in SPEC R7: _"Si cambias de nivel vas a perder el progreso de esta sesion. ¿Seguro?"_.
- **D-14:** On confirm, the training store discards local session progress (reset to "not started") and triggers the refetch at the new level. The session the user was on gets re-loaded from scratch at the new level.

### Column rename (level_at_completion → session_level)

- **D-15:** New migration `0091_rename_level_at_completion_to_session_level.sql` that performs `ALTER TABLE completed_sessions CHANGE COLUMN level_at_completion session_level ENUM('alfa','delta','sigma','omega','spartan') NOT NULL` (MySQL 8+ supports this in a single DDL, the production DB runs MySQL 8.0.45). Single-migration rename — simplest path, atomic, preserves the Phase-1 backfilled rows.
- **D-16:** Drizzle schema field renamed `levelAtCompletion → sessionLevel` in the same commit. All references updated: `sessions/routes.ts`, `goal-plans/routes.ts`, test file, anywhere else a grep surfaces.
- **D-17:** The Phase-1 commit (`c8d0726b`) that introduced `level_at_completion` is NOT amended — it is history. The rename is a forward-moving migration. Commit message explicitly references `c8d0726b` and the Phase 99 SPEC for future archaeology.

### Admin member-detail summary

- **D-18:** Format — colored chip row rendered next to the existing member level badge on the admin member detail page. Each chip: "{count} {LevelName}" for levels with `count > 0` over the last 30 days. Empty list hidden entirely (no "0 of everything" noise).
- **D-19:** Chip colors — one chip per level, colored using the existing level palette if one is already defined in the admin app's brand tokens; otherwise a neutral/primary variant. Researcher documents what palette exists and the planner decides whether to introduce per-level colors or keep neutral.
- **D-20:** Query — an admin endpoint (new route or extension of the existing member-detail endpoint) returns `{ level: string, count: number }[]` for the target user over the last 30 days. Planner picks the cleanest shape (reuse vs new route).

### Claude's Discretion

- Exact Quasar icon name for the chevron (`keyboard_arrow_down` vs `expand_more`) — whichever matches existing header icons.
- Q-menu placement props (`anchor`, `self`) — planner/executor pick based on breakpoint behaviour in desktop vs mobile rendering.
- Chip component shape (`q-chip` vs custom) — `q-chip` is almost certainly right.
- Timer-discarding mechanics on confirm — whatever the existing "reset player state" function does, if any.
- CSS accent token for the subtle highlight on the active menu row.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 99 spec (locked requirements — MUST read before planning)

- `.planning/phases/99-member-selectable-training-level/99-SPEC.md` — 11 falsifiable requirements, explicit in/out-of-scope lists, 14 acceptance criteria checkboxes, and the Ambiguity Report. Do not re-litigate.

### Phase 1 data plumbing (already shipped, local commit)

- `el-templo-api/src/db/migrations/0090_completed_sessions_level.sql` — Phase-1 migration that added the column to rename.
- `el-templo-api/src/db/schema/completed-sessions.ts` — Drizzle field `levelAtCompletion` to rename to `sessionLevel`.
- `el-templo-api/src/modules/sessions/routes.ts` — `/sessions/daily`, `/sessions/weekly`, `/sessions/complete`. Source of truth for `?level=` handling + `levelAtCompletion` stamping.
- `el-templo-api/src/modules/goal-plans/routes.ts` — `/goal-plans/session`, `/goal-plans/complete`. Same pattern.
- `el-templo-api/src/modules/goal-plans/service.ts` — `getGoalPlanSession(..., levelOverride)` signature already accepts override.
- `el-templo-api/src/modules/shared/training-constants.ts` — `TRAINING_LEVELS` enum and `isTrainingLevel` type guard. All client/server validation should route through these.
- `el-templo-api/test/sessions/sessions.test.ts` — stamp own/other/invalid tests that must pass after the column rename.

### Member app (Vue/Quasar)

- `el-templo-app/src/layouts/MainLayout.vue` — badge rendered at lines 36-39 (desktop) and 93-96 (mobile). Both instances become dropdown triggers.
- `el-templo-app/src/stores/useUserStore.ts` — primary target for `selectedLevel` state + localStorage hydration.
- `el-templo-app/src/modules/progression/stores/progressionStore.ts` — feeds `greetingLevel` on the badge today; may need a read-path adjustment if badge reflects `activeLevel` instead of real level.
- `el-templo-app/src/modules/training/pages/DayPlayer.vue` — primary mid-session detection site.
- `el-templo-app/src/modules/training/composables/useWeekData.ts` — primary integration for `?level=` injection on session fetches.

### ROM day interaction (Phase 97 artifact)

- `.planning/phases/97-rom-mode-saturday-mobility/97-CONTEXT.md` — `day_modes` table, `session_mode='rom'` semantics, the alfa/delta collapse rule. SPEC R10 defers to this logic — do not redesign.
- `el-templo-api/src/modules/sessions/routes.ts:204-214` — current ROM collapse implementation. Effective level computed server-side after the `?level=` override is applied, so the collapse still wins on Saturdays.

### Admin app

- `el-templo-admin/src/...` — admin member detail page (researcher locates exact file). New chip row lives adjacent to the existing level badge on that page.

### Shared project conventions

- `CLAUDE.md` (project root) — logging (Pino/createLogger, no `console.*`), TypeScript rules (no `any`), Sentry integration, test requirements for new API routes.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`useUserStore` (Pinia composition API)** — already holds `profile.level`, `profile.branchIsVirtual`, `profile.firstName`, etc. Extension site for `selectedLevel` + `activeLevel`.
- **`progressionStore.level`** — drives the current badge's Greek-letter + display-name rendering. Mid-migration, the badge in `MainLayout.vue` will need to reflect `activeLevel` (for the letter + name) while the `(Tu Nivel)` marker inside the menu reflects `users.level`. Researcher confirms whether `progressionStore` exposes the data we need or whether we build a new getter on top of `useUserStore`.
- **`MainLayout.vue` header-greeting\_\_badge** (lines 36-39 and 93-96) — two occurrences (desktop and mobile). A new `<HeaderLevelDropdown>` component should replace both to avoid duplication.
- **Quasar `q-menu` + `q-list` + `q-item`** — idiomatic stack for the dropdown menu.
- **`TRAINING_LEVELS` and `isTrainingLevel`** (server-side) — mirrored client-side to validate enum values before sending `?level=` and before rehydrating from localStorage.
- **`useOnboardingApi` pattern** — the app already has API composables that read auth headers via shared axios setup; session composables follow the same pattern and are the injection points for `?level=`.

### Established Patterns

- **Pinia composition-style stores** (per CLAUDE.md) — `defineStore('name', () => { ... })`. `selectedLevel` extension follows this.
- **Composables expose `cleanup()`**; no `onUnmounted` inside composables — hydration-on-profile-load hook follows this.
- **Structured logging** — any client-side diagnostics about level changes go through `createLogger` (no `console.*`).
- **No `any` types** — `Level` is typed from `TRAINING_LEVELS[number]`.
- **Two-path header (desktop + mobile)** — any visual change to the badge must be validated at both breakpoints.

### Integration Points

- **`/auth/me` profile load** → triggers `selectedLevel` hydration from localStorage.
- **`/auth/logout` flow** → wipes the localStorage key.
- **Session-fetching composables** (`useWeekData`, `useDaySession`, goal-plan equivalent) → append `?level=` when `activeLevel !== profile.level`.
- **Training store / DayPlayer** → exposes `anyExerciseStarted` for the confirmation dialog.
- **Admin member detail page** → reads the new per-level-count endpoint and renders chips.

</code_context>

<specifics>
## Specific Ideas

- "The dropdown is on the header badge section, with a small down arrow" — user's original framing; drives the inline-chevron-in-badge decision.
- "The options should be all the levels but always mention your level with `(Tu Nivel)`" — locked verbatim in SPEC R2.
- "The level is always the same UNLESS a coach promotes them" — the north star for the whole phase; `users.level` writes from the app are explicitly out of scope.
- "A user can complete in any level and that stamps the session's level" — the semantic that drove the column rename to `session_level`.
- "Alert if mid-session saying you will lose progress if you change level mid-session" — dialog copy locked in SPEC R7.

</specifics>

<deferred>
## Deferred Ideas

- **Full coach "ready for promotion" workflow** — dashboard of members training above their users.level with signals + one-click promote. Deferred to a future phase; SPEC explicitly scopes this out.
- **Per-level goal-plan progression counters** — separate `currentWeek` per level trained. Deferred; shared counter stays (SPEC R9).
- **Streak / AURA scaling by level** — audit whether any existing scaling exists; if so, decide whether to update. Deferred — this phase preserves whatever today does.
- **Onboarding / coachmark for the new dropdown** — silent discovery this phase. Revisit only if analytics show low pickup.
- **Syncing `selectedLevel` across devices** — would require server storage. Deferred; localStorage-only this phase.
- **Restricting the dropdown on ROM days or during active goal plans** — not done; server's ROM collapse rule handles the correctness (SPEC R10). Revisit only if members report confusion.

</deferred>

---

_Phase: 99-member-selectable-training-level_
_Context gathered: 2026-04-21_

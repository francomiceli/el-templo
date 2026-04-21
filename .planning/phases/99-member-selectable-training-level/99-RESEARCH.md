# Phase 99: Member-Selectable Training Level — Research

**Researched:** 2026-04-21
**Domain:** Vue 3 / Pinia composable store extension, Fastify route touch-ups, Drizzle column rename
**Confidence:** HIGH

## Summary

All ten research questions are answered directly against the committed code. The good news: the existing app already has everything we need as seams — the granular exercise state for `anyExerciseStarted`, a single weekly fetch composable for `?level=` injection, a well-scoped `useUserStore` for the `selectedLevel` field, and a `q-menu` pattern already in use in the training module. The column rename is contained (4 code call sites + 6 test assertions). The admin member detail page is `AlumnoDetailPage.vue` and already renders the level badge in a clear spot for the per-level summary chip row.

**Primary recommendation:** Ship as scoped. Extend `useUserStore` with `selectedLevel` state (not a new store), inject `?level=` only in `useWeekData.fetchWeekSessions` (the ONLY session-fetching composable — `/sessions/daily` is unused from the client) and in `useGoalPlanApi.getSession`, add a new `GET /admin/members/:userId/session-levels?days=30` endpoint (cleaner than extending the heavily-shaped `getMemberById`), and do the column rename in a single `0091` migration with MySQL 8's `CHANGE COLUMN` in place.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dropdown UI**

- **D-01:** Badge becomes a `q-menu` trigger anchored to the whole badge (entire Greek letter + level name + inline chevron is the tap target). No separate button, no `q-btn-dropdown`.
- **D-02:** Chevron rendered inline at the end of the badge content. Icon: `keyboard_arrow_down` or `expand_more` — planner picks.
- **D-03:** Dropdown lists the 5 levels in declared enum order: `Alfa, Delta, Sigma, Omega, Spartan`. Row matching `users.level` suffixed `(Tu Nivel)`.
- **D-04:** Currently-active level row (`activeLevel`) gets subtle background highlight using brand accent tokens. Active + own-level row carries both highlight and suffix — no conflict.

**Selection state & persistence**

- **D-05:** Add state to existing `useUserStore`: `selectedLevel: Ref<Level | null>`, `activeLevel` getter = `selectedLevel ?? profile.level`, actions `setLevel(level)` / `clearLevel()`. No new store.
- **D-06:** localStorage key format: `eltemplo.selectedLevel:<userId>`. Value is raw enum string. On hydrate, validate against shared enum; invalid → treated as null and key cleared.
- **D-07:** Hydration timing — fire on profile load (after `/auth/me` succeeds), before any session fetch. On logout, the key is explicitly removed alongside auth token wipe.
- **D-08:** `setLevel(users.level)` internally calls `clearLevel()` — single path to "no override".

**Content requests**

- **D-09:** Session-fetching composables read `activeLevel` from `useUserStore`. When `selectedLevel !== null`, append `?level=<selectedLevel>`. When null, omit.
- **D-10:** In-flight requests not cancelled on level change; stale results ignored via existing request-id/epoch pattern (planner verifies — see Q2).
- **D-11:** Training store's cached day/week session refetched on level change after confirmation dialog "confirm" (if shown) or immediately (if not).

**Mid-session confirmation**

- **D-12:** Derive `anyExerciseStarted` as a computed getter on the existing training store / DayPlayer. No new tracking unless proven needed.
- **D-13:** Quasar `q-dialog` with "Cancelar" (revert, close dropdown) and "Cambiar nivel" (destructive styling). Copy locked: "Si cambias de nivel vas a perder el progreso de esta sesion. ¿Seguro?"
- **D-14:** On confirm, training store discards local session progress (reset to "not started") and triggers refetch at new level.

**Column rename**

- **D-15:** Migration `0091_rename_level_at_completion_to_session_level.sql`: `ALTER TABLE completed_sessions CHANGE COLUMN level_at_completion session_level ENUM(...) NOT NULL`. MySQL 8 supports this single DDL.
- **D-16:** Drizzle field renamed `levelAtCompletion → sessionLevel` in same commit. All references updated.
- **D-17:** Phase-1 commit `c8d0726b` NOT amended — forward-moving migration. Commit message references `c8d0726b` + Phase 99 SPEC.

**Admin summary**

- **D-18:** Colored chip row adjacent to existing member level badge. Each chip: "{count} {LevelName}" for levels with `count > 0` over last 30 days. Empty list hidden.
- **D-19:** Chip colors — use existing level palette if defined; otherwise neutral/primary variant. Researcher documents (see Q9).
- **D-20:** Query — new route or extension of existing member-detail endpoint returns `{ level, count }[]` for target user over last 30 days. Planner picks shape.

### Claude's Discretion

- Exact Quasar icon name for chevron (`keyboard_arrow_down` vs `expand_more`).
- `q-menu` placement props (`anchor`, `self`).
- Chip component shape (`q-chip` vs custom).
- Timer-discarding mechanics on confirm.
- CSS accent token for the subtle active-row highlight.

### Deferred Ideas (OUT OF SCOPE)

- Full coach "ready for promotion" workflow.
- Per-level goal-plan progression counters.
- Streak / AURA scaling by level.
- Onboarding / coachmark for the new dropdown.
- Syncing `selectedLevel` across devices.
- Restricting the dropdown on ROM days or during active goal plans.

## Phase Requirements

| ID  | Description                                              | Research Support                                                                                                                                                                                 |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | Header badge becomes dropdown trigger (desktop + mobile) | MainLayout.vue:36-39 (desktop) and :93-96 (mobile) — both render identical badge structure; share via new component (Q3, Q10)                                                                    |
| R2  | `(Tu Nivel)` marker on user's real level                 | `useUserStore.profile.level` is the source of truth (Q3)                                                                                                                                         |
| R3  | Selected level drives `?level=` on content reads         | ONLY two composables make level-sensitive fetches: `useWeekData` (weekly) and `useGoalPlanApi.getSession`. `/sessions/daily` is **not called from the frontend** (Q2)                            |
| R4  | Selection persists in localStorage                       | Auth uses Capacitor Preferences on native + localStorage on web. Follow same dual-path wrapper (Q6)                                                                                              |
| R5  | Selecting own level clears override                      | `setLevel(users.level) → clearLevel()` per D-08                                                                                                                                                  |
| R6  | Logout clears saved selection                            | `useAuthStore.logout` already calls `userStore.clearProfile()` — hook selection wipe here (Q8)                                                                                                   |
| R7  | Mid-session confirmation dialog                          | `useSessionPlayer` exposes `completedBlocks.value`, `completedExercises.value`, `elapsedSeconds.value`, `isTimerRunning.value` — all reactive. `anyExerciseStarted` derivable as a computed (Q1) |
| R8  | Completion stamps `session_level` from `dayId`           | Rename in sessions/routes.ts:521,540 and goal-plans/routes.ts:306,324 plus schema + migration (Q5 for admin summary, Q below for rename sites)                                                   |
| R9  | `currentWeek` advances regardless of level               | `programsService.recordSessionForProgram` (sessions/routes.ts:578) has no per-level branching today — add a regression test                                                                      |
| R10 | ROM day auto-map                                         | Server collapse at sessions/routes.ts:212-220 (daily) and :320-324 (weekly) already applies the ROM rule to `effectiveLevel` which includes `?level=` override. No client change needed.         |
| R11 | Admin member detail shows cross-level counts             | Member detail at `AlumnoDetailPage.vue`, header card at line 22-106, chip row slots adjacent to `q-badge` at line 32-39 (Q4)                                                                     |

## Architectural Responsibility Map

| Capability                        | Primary Tier                                                    | Secondary Tier          | Rationale                                                                |
| --------------------------------- | --------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| Dropdown UI + `(Tu Nivel)` marker | Browser / Client (Quasar)                                       | —                       | Pure presentational; no server involvement                               |
| `selectedLevel` persistence       | Browser / Client (Capacitor Preferences + localStorage)         | —                       | Device-local per SPEC "localStorage only, no cross-device sync"          |
| `?level=` injection               | Browser / Client (axios composable)                             | API (reads query param) | Client decides when to send; server validates and honours                |
| ROM day level collapse            | API / Backend (sessions/routes.ts)                              | —                       | R10 explicit: server is single source of truth, client does not gate     |
| Mid-session detection             | Browser / Client (session player state)                         | —                       | State lives entirely client-side (Capacitor Preferences scoped to dayId) |
| Column rename                     | Database / Storage (migration) + API (Drizzle + routes + tests) | —                       | Forward-only DDL, atomic CHANGE COLUMN                                   |
| Admin per-level counts            | API / Backend (new route)                                       | Admin frontend (chips)  | Needs DB aggregation; purely read-only summary                           |

## Standard Stack

All libraries already installed — no new dependencies needed.

### Core (existing, already on project)

| Library                   | Version  | Purpose                                                       | Why Standard                                                                                        |
| ------------------------- | -------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Quasar                    | existing | `q-menu`, `q-list`, `q-item`, `q-dialog`, `q-chip`, `q-badge` | Already the UI framework; all needed components are first-class                                     |
| Pinia (composition API)   | existing | `useUserStore` extension                                      | Established pattern per CLAUDE.md                                                                   |
| `@capacitor/preferences`  | existing | Native storage (parallel with localStorage for web)           | Already used by `useTokenStorage` (app/src/composables/useTokenStorage.ts) and `sessionPlayerStore` |
| Drizzle ORM + drizzle-kit | existing | Schema rename + migration generation                          | Project standard                                                                                    |

### Installation

**None.** This phase uses only existing dependencies.

## Research Questions — Answers

---

### Q1. Training store granularity for `anyExerciseStarted`

**Answer: Granular state already exists on the per-session composable `useSessionPlayer`. No new tracking needed.**

**Where the state lives:**

- `el-templo-app/src/modules/training/composables/useSessionPlayer.ts:47-54` — `currentBlockIndex`, `elapsedSeconds`, `isTimerRunning`, `deuterosChoice`, `completedBlocks`, `completedExercises` (Record<blockRole, prescriptionId[]>).
- Persisted via `sessionPlayerStore` → `@capacitor/preferences` keyed by `session_progress_<userId>_<dayId>` (file: `sessionPlayerStore.ts:29,44-47`).

**DayPlayer already derives "unsaved progress":**

```ts
// el-templo-app/src/modules/training/pages/DayPlayer.vue:233-242
const hasUnsavedProgress = computed(() => {
  if (!player.value) return false;
  const p = player.value;
  return (
    p.isTimerRunning.value &&
    (p.completedBlocks.value.length > 0 ||
      p.currentBlockIndex.value > 0 ||
      p.elapsedSeconds.value > 0)
  );
});
```

**Recommended `anyExerciseStarted` computed (covers SPEC R7's literal trigger — "at least one exercise has been started"):**

```ts
// Preferred: true when ANY exercise ticked OR any block completed OR timer started
const anyExerciseStarted = computed(() => {
  const p = player.value;
  if (!p) return false;
  if (p.completedBlocks.value.length > 0) return true;
  if (Object.values(p.completedExercises.value).some((arr) => arr.length > 0))
    return true;
  // Timer started (splash dismissed) without any tick — still "mid-session"
  if (p.isTimerRunning.value || p.elapsedSeconds.value > 0) return true;
  return false;
});
```

**Where to place the dialog trigger:** The dropdown component (header) is outside the `DayPlayer` route. Two options — both viable:

1. **Global state on `useUserStore` or a new `useActiveSession` composable.** When the user is on `/training/:date`, the DayPlayer registers a `confirmLevelChange()` callback + `anyExerciseStarted` getter into a global ref. The dropdown reads it before committing `setLevel`. Cleanest; isolates the concern.
2. **Route-based check.** The dropdown checks `route.path.startsWith('/training/')`; if so, emits an event that the DayPlayer listens for via a provide/inject pair.

**Recommendation:** Option 1 — add a `registerMidSessionGuard(guard: () => Promise<boolean>)` helper on `useUserStore` (or a tiny standalone composable `useMidSessionGuard`). DayPlayer registers on mount, unregisters on unmount. `setLevel` awaits the guard if registered. Clean, testable, no router coupling.

**What "discard local progress" means on confirm (D-14):** Call `player.value.clearProgress()` (useSessionPlayer.ts:394-403) — it already resets all in-memory state AND clears the Capacitor Preferences entry for the dayId.

**Confidence: HIGH** — all state is reactive + persisted; `clearProgress` already exists as the exact primitive we need. [VERIFIED: file reads]

---

### Q2. Session-fetching composables

**Answer: There is exactly ONE weekly fetch and ONE goal-plan session fetch in the client. `/sessions/daily` is NOT called by the frontend.**

**Sites that need `?level=`:**

1. **`el-templo-app/src/modules/training/composables/useWeekData.ts:62-64`** — the weekly call:

   ```ts
   const response = await api.get<WeeklyResponse>("/sessions/weekly", {
     params: { weekStart },
   });
   ```

   Already uses `params`. Add `level` conditionally:

   ```ts
   const userStore = useUserStore();
   const params: Record<string, string> = { weekStart };
   if (userStore.selectedLevel) params.level = userStore.selectedLevel;
   const response = await api.get<WeeklyResponse>("/sessions/weekly", {
     params,
   });
   ```

2. **`el-templo-app/src/modules/goal-plan/composables/useGoalPlanApi.ts:142-149`** — the goal-plan session call:
   ```ts
   const response = await api.get<GoalPlanSessionResponse | null>(
     "/goal-plans/session",
     { params: { week, day }, signal: createAbortSignal() },
   );
   ```
   Same pattern — append `level` when `selectedLevel !== null`.

**`/sessions/daily` is a dead path on the client.** Grep for `/sessions/daily` in `el-templo-app/src` returns only a type comment. `DayPlayer.vue` consumes `weekStore.weekDays[].session` populated by `useWeekData` (DayPlayer.vue:138-139). No daily fetch.

**Implication for R3:** SPEC R3 mentions `/sessions/daily` explicitly, but the client doesn't call it. Two options:

- (a) Leave the server-side `?level=` plumbing for `/sessions/daily` in place (already there from Phase 1) — useful for future clients. No client work.
- (b) Drop `/sessions/daily` from R3's test scope on the client side; still keep the server-side integration test.

**Recommendation (b):** Add a note to the plan that R3's client-side assertion applies only to `/sessions/weekly` and `/goal-plans/session`. Server-side integration tests should cover `?level=` on all three endpoints per SPEC R3 wording.

**Request-id / epoch pattern (D-10):** `useWeekData` does NOT cancel in-flight requests — it just clears `sessions.value.clear()` at the start (useWeekData.ts:56) and overwrites on success. `useGoalPlanApi` uses an `AbortController` (useGoalPlanApi.ts:38-43) that is reset on every call — so a newer call aborts the previous. **Recommendation:** Add a simple `AbortController` to `useWeekData` following the same pattern; then level changes naturally abort the stale fetch. Or — simpler — rely on the fact that `fetchWeekSessions` is called by the page, and the page re-invokes it after level change; the stale result just gets overwritten by the fresh one. Either works. Planner picks.

**Confidence: HIGH** [VERIFIED: grep across el-templo-app/src]

---

### Q3. `progressionStore.level` vs `useUserStore.profile.level` on the badge

**Answer: `progressionStore.level` is a derived bundle from `GET /progression`. Safer to compute a local `activeGreetingLevel` from `useUserStore.activeLevel` + the shared Greek-letter map.**

**Current flow:**

- `MainLayout.vue:179-185` reads `progressionStore.level?.greekLetter` and `progressionStore.level?.displayName`.
- `progressionStore.level` is of type `ProgressionLevel | null` and is populated by `setProgressionData(response)` from the `/progression` API. (progressionStore.ts:25, :74-81)
- The server computes `displayName` + `greekLetter` at `el-templo-api/src/modules/progression/routes.ts:170-175` using `getLevelDisplayName` / `getGreekLetter` from `progression/service.ts:4-10,85-97`.
- The full `ProgressionLevel` type (see `el-templo-app/src/modules/progression/types.ts:10`) also carries `current`, progression progress fields, etc. — not just the two display strings.

**The trap:** `progressionStore.level.greekLetter` + `displayName` are for `users.level`, not `selectedLevel`. For R2 (the badge reflects `activeLevel`), we must not rely on `progressionStore` — the backend built those strings from `users.level`, so they'd always show the real level even if the user picked Omega.

**Recommended fix:** Mirror the Greek-letter + display-name table client-side (they're already hard-coded in 3 places: admin's `AlumnoDetailPage.vue:448-470`, app's `progression/service.ts` imports via the API, and implicitly in `onboarding/types.ts`). Create a single client-side helper module:

```ts
// el-templo-app/src/modules/training/level-display.ts (new)
import type { Level } from "src/stores/useUserStore";

export const TRAINING_LEVELS = [
  "alfa",
  "delta",
  "sigma",
  "omega",
  "spartan",
] as const;

export const LEVEL_GREEK_MAP: Record<Level, string> = {
  alfa: "α", // α
  delta: "Δ", // Δ
  sigma: "Σ", // Σ
  omega: "Ω", // Ω
  spartan: "Ω", // Ω
};

export const LEVEL_DISPLAY_MAP: Record<Level, string> = {
  alfa: "Alfa",
  delta: "Delta",
  sigma: "Sigma",
  omega: "Omega",
  spartan: "Spartan",
};

export function isTrainingLevel(v: unknown): v is Level {
  return (
    typeof v === "string" && (TRAINING_LEVELS as readonly string[]).includes(v)
  );
}
```

Then `MainLayout.vue` badge reads from `userStore.activeLevel` via this helper:

```ts
const activeGreetingLevel = computed(() => {
  const lvl = userStore.activeLevel;
  if (!lvl) return null;
  return {
    greekLetter: LEVEL_GREEK_MAP[lvl],
    levelName: LEVEL_DISPLAY_MAP[lvl],
  };
});
```

`progressionStore.level` keeps its other responsibilities (ProfilePage, progression dashboard — both explicitly out of scope per SPEC). Don't touch it.

**Confidence: HIGH** [VERIFIED: file reads + type definitions]

---

### Q4. Admin member detail page location + current shape

**Answer: `el-templo-admin/src/pages/AlumnoDetailPage.vue` (631 lines). The level badge lives in the header card.**

**Key coordinates:**

- **Route:** `/alumnos/:id` (inferred from filename + `AlumnosPage.vue` sibling).
- **Header card:** `AlumnoDetailPage.vue:22-106` — `q-card` containing photo + level badge + name + status + segment + avatar + action buttons.
- **Existing level badge:** lines 32-39:
  ```html
  <q-badge
    rounded
    floating
    :color="levelColor(memberProfile.level)"
    :label="greekLevel(memberProfile.level)"
    ...
  />
  ```
- **Right-hand row with `q-badge`s:** lines 52-79 — this is where status/segment/avatar chips already live. **Adjacent chip row slot (D-18) belongs here or on a second row immediately below.**

**Existing quasar components in use on the header:** `q-card`, `q-card-section`, `q-badge`, `q-btn` — no `q-chip` yet on the header, but used elsewhere.

**Existing level helpers on this page** (lines 448-487) already provide `levelColor(level)`, `greekLevel(level)`, `levelDisplayName(level)`. Chip row can directly reuse these.

**Tabs underneath** (lines 111-124): `perfil`, `entrenamiento`, `notas`, `suscripcion`, `asistencia`. D-18 says "adjacent to the existing member level badge" — confirmed the right place is the header card, not a tab panel.

**Confidence: HIGH** [VERIFIED: file read]

---

### Q5. Admin API shape for "session_level counts last 30d"

**Answer: Recommend a NEW focused endpoint. Don't extend `getMemberById`.**

**Current member-detail endpoint:** `el-templo-api/src/modules/members/routes.ts:244-300`. It returns `{ ...member, segment, segmentUpdatedAt, avatarType, onboardingProfile }` — a member profile bundle. Shape is contract-stable and shared by member listing + profile tab. Wedging a new `levelCounts: [...]` field into this adds work to the member service's `MemberProfile` type + `getMemberByIdSchema` + the admin frontend's member type — all for a concern (cross-level training analytics) that's unrelated to member identity.

**Parallel precedent:** `el-templo-api/src/modules/goal-plans/routes.ts:516-655` defines `GET /admin/goal-plans/members/:userId` — a separate admin endpoint for goal-plan-specific member detail data. Same pattern fits perfectly here.

**Recommended endpoint:**

```
GET /admin/members/:userId/session-levels?days=30
Auth: admin/coach (MEMBER_ROLES — see goal-plans/routes.ts:523)
Response: { counts: Array<{ level: 'alfa'|'delta'|'sigma'|'omega'|'spartan', count: number }> }
```

**Implementation sketch (place in members/routes.ts alongside `/:userId`):**

```ts
fastify.get<{ Params: { userId: number }; Querystring: { days?: number } }>(
  "/:userId/session-levels",
  { schema: getMemberSessionLevelsSchema },
  async (request) => {
    const days = request.query.days ?? 30;
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const rows = await fastify.db
      .select({
        level: schema.completedSessions.sessionLevel, // post-rename name
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.completedSessions)
      .where(
        and(
          eq(schema.completedSessions.userId, request.params.userId),
          gte(schema.completedSessions.date, sinceDate),
        ),
      )
      .groupBy(schema.completedSessions.sessionLevel);
    return { counts: rows };
  },
);
```

**Why not reuse `/admin/goal-plans/members/:userId`?** That endpoint is goal-plan specific and already does a lot (cycle calc, streak calc, 50-row completion list). Our need is a single aggregation query — doesn't belong there.

**Confidence: HIGH** [VERIFIED: all three member-detail endpoints read]

---

### Q6. localStorage + Pinia persistence pattern

**Answer: Dual-path wrapper following `useTokenStorage` — Capacitor Preferences on native, localStorage on web.**

**Established pattern:** `el-templo-app/src/composables/useTokenStorage.ts` (35 lines):

```ts
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export function useTokenStorage() {
  const isNative = Capacitor.isNativePlatform();
  async function getToken() {
    /* Preferences.get or localStorage.getItem */
  }
  async function setToken(t) {
    /* Preferences.set or localStorage.setItem */
  }
  async function removeToken() {
    /* Preferences.remove or localStorage.removeItem */
  }
  return { getToken, setToken, removeToken };
}
```

**`sessionPlayerStore.ts` follows the same philosophy** — Capacitor Preferences with user-scoped key prefix.

**No `pinia-plugin-persistedstate`** in use; persistence is always hand-rolled via the wrapper.

**Recommended pattern for Phase 99:**

```ts
// el-templo-app/src/composables/useLevelSelectionStorage.ts (new)
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const KEY_PREFIX = "eltemplo.selectedLevel:"; // per D-06

export function useLevelSelectionStorage() {
  const isNative = Capacitor.isNativePlatform();
  const key = (userId: number) => `${KEY_PREFIX}${userId}`;

  async function get(userId: number): Promise<string | null> {
    if (isNative) {
      const { value } = await Preferences.get({ key: key(userId) });
      return value;
    }
    return localStorage.getItem(key(userId));
  }
  async function set(userId: number, value: string): Promise<void> {
    /* ... */
  }
  async function remove(userId: number): Promise<void> {
    /* ... */
  }
  return { get, set, remove };
}
```

Then `useUserStore` imports this wrapper and calls it from `setLevel`, `clearLevel`, and a `hydrateSelection(userId)` action triggered from `boot/auth.ts` right after `userStore.setProfile(response.data)` (auth.ts:26).

**SPEC note on "localStorage":** SPEC R4/R5/R6 say "localStorage" — the intent is device-local persistence, not literally only `window.localStorage`. Using Capacitor Preferences on native is consistent with the project's established pattern for cross-platform "device storage" and is how every other persisted value on this app is stored. Flag for the planner, but proceed with Preferences + localStorage dual-path. (This is a **minor spec-reconsideration note**, not a scope change — see bottom.)

**Confidence: HIGH** [VERIFIED: file reads]

---

### Q7. Level display name / Greek letter table

**Answer: Currently mirrored in 3 places; one source-of-truth module is the right move.**

**Current drift risk:**

- **Server:** `el-templo-api/src/modules/progression/service.ts:4-10` + `:85-97` (`GREEK_LETTER_MAP`, `getLevelDisplayName`, `getGreekLetter`).
- **Admin:** `AlumnoDetailPage.vue:448-487` (duplicated as `LEVEL_GREEK_MAP`, `LEVEL_NAMES`, `levelColor`).
- **App:** Currently pulled from the server via `GET /progression` response (no local mirror).

**For Phase 99**, the badge needs to reflect `activeLevel` which can be different from `users.level`, so we need these names/letters client-side. Introduce the single source of truth (the `level-display.ts` module sketched in Q3).

**Don't refactor admin/server in this phase** — that's unrelated scope. Flag as a follow-up. Just create the app-side mirror, matching the existing values exactly.

**Confidence: HIGH** [VERIFIED: all 3 sites read]

---

### Q8. Logout flow

**Answer: `useAuthStore.logout` at `el-templo-app/src/stores/useAuthStore.ts:101-107`.**

```ts
async function logout() {
  await removeToken();
  token.value = null;
  user.value = null;
  const userStore = useUserStore();
  userStore.clearProfile();
}
```

**Hook site for D-07 / R6:** Inside `logout()`, call `await userStore.clearSelection()` (new action) before or after `clearProfile()`. `clearSelection` should remove the storage key for the current `user.value.id` and reset `selectedLevel.value = null`.

**Watch out:** The order matters — read `user.value.id` BEFORE setting `user.value = null`. Either (a) do `clearSelection(user.value?.id)` first, or (b) have `clearSelection` reach into `userStore.profile?.id` which might still be set.

**Recommendation:** Make `clearSelection` read `useAuthStore().user?.id ?? useUserStore().profile?.id` defensively and no-op if both null. Simpler + more robust.

**Confidence: HIGH** [VERIFIED: file read]

---

### Q9. Level palette for chips (admin)

**Answer: Admin has a per-level colour map already; app has no per-level colours (only two brand tokens).**

**Admin — already defined** at `AlumnoDetailPage.vue:472-487`:

```ts
function levelColor(level: string): string {
  switch (level.toLowerCase()) {
    case "alfa":
      return "amber-8";
    case "delta":
      return "deep-orange-7";
    case "sigma":
      return "brown-8";
    case "omega":
      return "red-9";
    case "spartan":
      return "grey-9";
  }
}
```

Also used for the existing level badge. For D-19, **reuse this function** — it's already in the same file as the chip row we're adding.

**App — no per-level palette.** `el-templo-app/src/css/_brand.scss`:

```scss
$brand-terracotta: #96593a;
$brand-aged-gold: #7d5d42;
$brand-cream: #f2ede5;
```

No `$level-alfa`, `$level-sigma`, etc. The app's badge today has a flat `#fff` on a gradient background (MainLayout.vue:342-353) — no per-level differentiation in the app.

**Recommendation for app dropdown:**

- Keep the badge itself using current brand tokens (no per-level coloring for the badge — stays consistent with today's visual).
- The active-row highlight inside the dropdown (D-04) uses `$brand-aged-gold` at low opacity (e.g., `rgba($brand-aged-gold, 0.15)`) — matches the header gradient without introducing a new palette.
- Keep the `(Tu Nivel)` suffix in a subtle typographic style (smaller, lower-opacity) — no color needed.

**For admin chips (D-19):** Reuse `levelColor()` from AlumnoDetailPage.vue to produce one distinct color per level — consistent with the existing level badge on the page.

**Confidence: HIGH** [VERIFIED: file reads]

---

### Q10. Existing q-menu / dropdown patterns

**Answer: Yes — there's an in-app precedent.**

**Location:** `el-templo-app/src/modules/training/components/BlockProgressionView.vue:26-37`:

```html
<q-btn flat round dense icon="more_vert" color="white">
  <q-menu>
    <q-list style="min-width: 150px">
      <q-item v-close-popup clickable @click="emit('restart')">
        <q-item-section avatar>
          <q-icon name="refresh" />
        </q-item-section>
        <q-item-section>Reiniciar</q-item-section>
      </q-item>
    </q-list>
  </q-menu>
</q-btn>
```

**Pattern is idiomatic Quasar:**

- `q-menu` nested inside the trigger element (here `q-btn`, for us the badge `div`).
- Uses `q-list` + `q-item` with `v-close-popup` + `clickable`.
- `q-item-section avatar` slot for icons.
- `style="min-width: 150px"` for width control.

**For the badge trigger:** The trigger is a `div` (MainLayout.vue:36), not a `q-btn`. This is fine — `q-menu` nests inside any element. Add `clickable class="cursor-pointer"` to the badge wrapper or wrap it in `<div>` hosting the `q-menu`. Example:

```html
<div class="header-greeting__badge cursor-pointer">
  <span class="header-greeting__symbol"
    >{{ activeGreetingLevel.greekLetter }}</span
  >
  <span class="header-greeting__level"
    >{{ activeGreetingLevel.levelName }}</span
  >
  <q-icon name="keyboard_arrow_down" size="xs" />
  <q-menu fit anchor="bottom right" self="top right">
    <q-list style="min-width: 180px">
      <q-item
        v-for="lvl in TRAINING_LEVELS"
        :key="lvl"
        v-close-popup
        clickable
        :class="{ 'selected-level': lvl === userStore.activeLevel }"
        @click="onSelectLevel(lvl)"
      >
        <q-item-section>
          {{ LEVEL_DISPLAY_MAP[lvl] }}
          <span
            v-if="lvl === userStore.profile.level"
            class="text-caption q-ml-xs"
          >
            (Tu Nivel)
          </span>
        </q-item-section>
      </q-item>
    </q-list>
  </q-menu>
</div>
```

**Placement props (D-claim: Claude's Discretion):** `anchor="bottom right" self="top right"` keeps the menu right-aligned with the badge — works for both desktop (badge in header greeting) and mobile (badge in mobile-greeting block). Planner can test both breakpoints.

**Confidence: HIGH** [VERIFIED: file read + Quasar standard pattern]

---

## Standard Stack — Additional Notes

**Dropdown component naming / location:**

- Place in `el-templo-app/src/modules/training/components/HeaderLevelDropdown.vue` (owned by the training module since level selection is a training concern).
- Import into `MainLayout.vue` and replace both badge instances (lines 36-39 and 93-96) — this also DRYs up the duplication that exists today.

**Mid-session guard component:**

- `el-templo-app/src/modules/training/components/LevelChangeConfirmDialog.vue` (or inline in `HeaderLevelDropdown.vue`; dialog copy is short).

## Column Rename — Call Site Inventory

Based on `grep "level_at_completion\|levelAtCompletion" el-templo-api/`:

| File                                                                                   | Lines                        | What                                                                                                    |
| -------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/completed-sessions.ts`                                    | 25                           | Drizzle field — rename `levelAtCompletion → sessionLevel`, column `level_at_completion → session_level` |
| `el-templo-api/src/db/migrations/0090_completed_sessions_level.sql`                    | —                            | **Do NOT edit** (historical migration per D-17)                                                         |
| `el-templo-api/src/modules/sessions/routes.ts`                                         | 479, 521, 540                | Variable name `levelAtCompletion` + two `.set`/`.values` assignments                                    |
| `el-templo-api/src/modules/goal-plans/routes.ts`                                       | 255, 306, 324                | Variable name + two assignments                                                                         |
| `el-templo-api/test/sessions/sessions.test.ts`                                         | 192, 225, 234, 237, 272, 281 | Test names + select column + expect assertions (6 spots)                                                |
| `el-templo-api/src/db/migrations/0091_rename_level_at_completion_to_session_level.sql` | —                            | **New migration to write**                                                                              |

**Migration SQL (per D-15):**

```sql
-- Rename level_at_completion → session_level. Semantic: the level describes
-- the SESSION (which level it was trained at), not a promotion/downgrade event.
-- Preserves Phase-1 backfilled rows (single DDL on MySQL 8+).
-- Originally introduced in migration 0090 / commit c8d0726b.
-- Phase 99 SPEC: .planning/phases/99-member-selectable-training-level/99-SPEC.md R8.
ALTER TABLE completed_sessions
  CHANGE COLUMN level_at_completion session_level
    ENUM('alfa','delta','sigma','omega','spartan') NOT NULL;
```

Verify the DB matches MySQL 8 (CLAUDE.md + D-15 confirm production is 8.0.45). [VERIFIED: D-15 explicit]

**Drizzle `pnpm db:generate` vs hand-authored SQL:** Because this is a rename (which `drizzle-kit generate` tends to ask interactively whether the column is renamed or dropped+re-added), hand-write the SQL and place it as `0091_*.sql`. Per CLAUDE.md, the `_migrations` table is the single source of truth; `drizzle-kit generate` can still be run to keep `meta/_journal.json` in sync but it's not blocking (CLAUDE.md explicitly warns against `drizzle-kit migrate`).

## Project Constraints (from CLAUDE.md)

- **Logging:** Pino (`request.log`, `app.log`) on API; `createLogger` in app. No `console.*`.
- **TypeScript:** No `any` — use `unknown` + narrowing or proper interfaces.
- **API tests:** New routes (incl. `/admin/members/:userId/session-levels`) require integration tests in `el-templo-api/test/`.
- **DB workflow:** `pnpm db:generate` for Drizzle SQL (but hand-author rename SQL here), `pnpm db:migrate` to apply. Never `drizzle-kit migrate`.
- **Pre-commit:** Husky + lint-staged will format on commit; if it fails, new commit (don't amend).
- **Plan mode:** Not applicable here (phase research already framed by SPEC + CONTEXT).
- **Error monitoring:** Sentry via `createLogger().error()` in frontend, automatic.

## Architecture Patterns

### Pinia Composition-API Store Extension

**Pattern:** `defineStore('name', () => { state refs + computed + actions; return all })`. `useUserStore.ts:74-206` is the canonical example.

**Extension for Phase 99:**

```ts
// el-templo-app/src/stores/useUserStore.ts (additions)
import { useLevelSelectionStorage } from "src/composables/useLevelSelectionStorage";
import { isTrainingLevel } from "src/modules/training/level-display";

// State
const selectedLevel = ref<Level | null>(null);
const storage = useLevelSelectionStorage();
let midSessionGuard: (() => Promise<boolean>) | null = null;

// Getters
const activeLevel = computed<Level | null>(
  () => selectedLevel.value ?? profile.value?.level ?? null,
);

// Actions
async function hydrateSelection(): Promise<void> {
  const userId = profile.value?.id;
  if (!userId) return;
  const raw = await storage.get(userId);
  if (raw && isTrainingLevel(raw)) {
    selectedLevel.value = raw;
  } else if (raw) {
    // Invalid value — clear it
    await storage.remove(userId);
    selectedLevel.value = null;
  }
}

async function setLevel(lvl: Level): Promise<void> {
  // Self-pick clears the override (D-08)
  if (profile.value?.level === lvl) {
    await clearLevel();
    return;
  }
  // Mid-session guard (D-12)
  if (midSessionGuard) {
    const proceed = await midSessionGuard();
    if (!proceed) return;
  }
  selectedLevel.value = lvl;
  const userId = profile.value?.id;
  if (userId) await storage.set(userId, lvl);
}

async function clearLevel(): Promise<void> {
  if (midSessionGuard) {
    const proceed = await midSessionGuard();
    if (!proceed) return;
  }
  selectedLevel.value = null;
  const userId = profile.value?.id;
  if (userId) await storage.remove(userId);
}

async function clearSelection(): Promise<void> {
  // Called from logout — no mid-session guard (session is ending)
  const userId = profile.value?.id ?? useAuthStore().user?.id;
  selectedLevel.value = null;
  if (userId) await storage.remove(userId);
}

function registerMidSessionGuard(fn: (() => Promise<boolean>) | null): void {
  midSessionGuard = fn;
}
```

### Hydration Hook Placement

Add to `el-templo-app/src/boot/auth.ts` after line 26:

```ts
userStore.setProfile(response.data);
await userStore.hydrateSelection(); // new — before any session fetch
```

Also in `useAuthStore.login` (:54) and `.register` (:90) — but those are followed by route navigation to `/mi-templo` which triggers `fetchWeekSessions`; call `hydrateSelection` before the navigation.

### DayPlayer Mid-Session Guard Registration

```ts
// In DayPlayer.vue setup()
onMounted(() => {
  userStore.registerMidSessionGuard(async () => {
    if (!anyExerciseStarted.value) return true; // no progress to lose
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
        .onCancel(() => resolve(false));
    });
  });
});

onUnmounted(() => {
  userStore.registerMidSessionGuard(null);
});

// Watch activeLevel — refetch + discard on change
watch(
  () => userStore.activeLevel,
  async () => {
    if (player.value && anyExerciseStarted.value) {
      await player.value.clearProgress();
    }
    // Refetch current week with new level
    const dates = /* current week dates */ await fetchWeekSessions(dates);
  },
);
```

## Don't Hand-Roll

| Problem                       | Don't Build                       | Use Instead                                                                                | Why                                                     |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Device storage (native + web) | Manual `if (isNative)` everywhere | Dual-path wrapper `useLevelSelectionStorage` (same shape as `useTokenStorage`)             | Project-consistent; testable in isolation               |
| Confirm dialog                | Raw Vue modal component           | `$q.dialog` (Quasar plugin) with `onOk`/`onCancel`                                         | Already used elsewhere; native-feeling on iOS + Android |
| Dropdown menu                 | Custom CSS positioning            | `q-menu` with `anchor` / `self` props                                                      | Handles backdrop, edge-detection, keyboard dismiss      |
| Stale request detection       | Epoch counter                     | `AbortController` (pattern in `useGoalPlanApi`)                                            | Already in use for goal-plan fetches                    |
| Level enum                    | Re-declare                        | Shared `TRAINING_LEVELS` constant in app + mirror of server's (`training-constants.ts:18`) | Single source client-side                               |

## Common Pitfalls

### Pitfall 1: Badge reflects `progressionStore.level` instead of `activeLevel`

**What goes wrong:** User selects Omega, badge still shows Sigma (their real level).
**Why:** `progressionStore.level.greekLetter` / `displayName` are server-computed from `users.level`.
**How to avoid:** Compute badge display from `userStore.activeLevel` using client-side map (Q3).
**Warning signs:** Manual test — select Omega, badge should switch to Ω / "Omega".

### Pitfall 2: Hydration race — first session fetch sent before `selectedLevel` hydrates

**What goes wrong:** App boots → `/auth/me` → router navigates to `/mi-templo` → WeeklyView mounts → `fetchWeekSessions` fires BEFORE `hydrateSelection` resolves → first request omits `?level=`.
**Why:** Async hydration after `setProfile` runs in parallel with route navigation.
**How to avoid:** `await userStore.hydrateSelection()` in `boot/auth.ts` AFTER `setProfile`, BEFORE the boot function returns. Boot files are awaited before routing.
**Warning signs:** Integration test: select Omega, kill the app, reopen — first `/sessions/weekly` call must include `level=omega`.

### Pitfall 3: `user.value.id` nulled before `clearSelection` reads it

**What goes wrong:** `logout` sets `user.value = null` then tries to compute user-scoped storage key → removes nothing.
**Why:** Order-of-operations bug in the logout flow.
**How to avoid:** Call `await userStore.clearSelection()` BEFORE setting `user.value = null` in `useAuthStore.logout`. See Q8 for the hook.

### Pitfall 4: Column rename migration includes `meta/_journal.json` edits

**What goes wrong:** Devs run `pnpm db:generate` which modifies `meta/_journal.json` out of sync with the custom runner.
**Why:** CLAUDE.md explicitly warns that `meta/_journal.json` is NOT the source of truth.
**How to avoid:** Hand-author `0091_rename_*.sql`. If `pnpm db:generate` runs, commit only the `.sql` file; `meta/_journal.json` is auxiliary.

### Pitfall 5: ROM day client-side confusion

**What goes wrong:** Dev "optimizes" by collapsing `activeLevel` to delta client-side on Saturdays to match the server.
**Why:** Feels redundant to send `?level=omega` if server collapses to delta anyway.
**How to avoid:** R10 + D-mention are explicit — client sends the USER's selected level always; server is sole source of truth. Client stays simpler and prevents divergence. [VERIFIED: SPEC R10]

### Pitfall 6: Mid-session guard triggered on cross-device hydration

**What goes wrong:** User switches devices; `hydrateSelection` on Device B sets `selectedLevel = omega` and a watcher interprets this as "user changed level" and triggers the dialog on a device with no active session.
**Why:** Hydration looks like a change from a watcher's perspective.
**How to avoid:** Only the `setLevel` / `clearLevel` actions run the guard — hydration bypasses it by mutating the ref directly without going through `setLevel`. The store sketch above is written this way.

## Runtime State Inventory

Rename-driven state checklist (per Step 2.5):

| Category                | Items Found                                                                                                                                    | Action Required                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Stored data**         | `completed_sessions.level_at_completion` column (prod + test DBs; 11 prod rows verified in migration 0090)                                     | DDL rename in migration 0091 — preserves rows via `CHANGE COLUMN` |
| **Live service config** | None — verified: no external service references `level_at_completion` (API is internal).                                                       | None                                                              |
| **OS-registered state** | None — verified: no systemd/pm2/Task Scheduler references this column.                                                                         | None                                                              |
| **Secrets/env vars**    | None — verified: `.env.example` contains no reference.                                                                                         | None                                                              |
| **Build artifacts**     | Drizzle `meta/_journal.json` will be updated by `drizzle-kit` if run (optional; `_migrations` table is the real source of truth per CLAUDE.md) | Commit `.sql` file; `meta/_journal.json` update optional          |

**The canonical question — "After every file is updated, what runtime systems still reference the old name?":** Nothing. The column rename is atomic DDL; no caches or external systems hold `level_at_completion` as a key. [VERIFIED: grep across `/home/franco/projects/el-templo`]

## Code Examples

### Example 1: `?level=` injection in `useWeekData`

```ts
// el-templo-app/src/modules/training/composables/useWeekData.ts (modified)
import { useUserStore } from 'src/stores/useUserStore'

export function useWeekData(): UseWeekDataReturn {
  const userStore = useUserStore()
  // ...

  async function fetchWeekSessions(dates: string[]): Promise<void> {
    loading.value = true; error.value = null; sessions.value.clear()
    try {
      const weekStart = dates[0]
      const params: Record<string, string> = { weekStart }
      if (userStore.selectedLevel) params.level = userStore.selectedLevel
      const response = await api.get<WeeklyResponse>('/sessions/weekly', { params })
      // ... rest unchanged
    }
  }
}
```

### Example 2: Admin session-levels endpoint

```ts
// el-templo-api/src/modules/members/routes.ts (addition)
fastify.get<{ Params: { userId: number }; Querystring: { days?: number } }>(
  "/:userId/session-levels",
  { schema: getMemberSessionLevelsSchema },
  async (request, reply) => {
    const { userId } = request.params;
    const days = Math.max(1, Math.min(365, request.query.days ?? 30));
    const since = new Date(Date.now() - days * 86400000)
      .toISOString()
      .slice(0, 10);

    const rows = await fastify.db
      .select({
        level: schema.completedSessions.sessionLevel,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.completedSessions)
      .where(
        and(
          eq(schema.completedSessions.userId, userId),
          gte(schema.completedSessions.date, since),
        ),
      )
      .groupBy(schema.completedSessions.sessionLevel);

    return {
      counts: rows.map((r) => ({ level: r.level, count: Number(r.count) })),
    };
  },
);
```

### Example 3: Admin chip row in AlumnoDetailPage

```html
<!-- el-templo-admin/src/pages/AlumnoDetailPage.vue (inside header card, after line 106) -->
<q-card-section v-if="sessionLevelCounts.length > 0" class="q-pt-none">
  <div class="text-caption text-grey-7 q-mb-xs">Ultimos 30 dias</div>
  <div class="row q-gutter-xs">
    <q-chip
      v-for="entry in sessionLevelCounts"
      :key="entry.level"
      :color="levelColor(entry.level)"
      text-color="white"
      size="sm"
    >
      {{ entry.count }} {{ levelDisplayName(entry.level) }}
    </q-chip>
  </div>
</q-card-section>
```

## State of the Art

| Old Approach                                                   | Current Approach                                                            | When Changed    | Impact                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------- |
| Client assumes `users.level` is trained level                  | Client distinguishes `activeLevel` (training) vs `profile.level` (assigned) | Phase 99 (this) | Badge must read `activeLevel`; data fetches must send `activeLevel` via `?level=` |
| Column name `level_at_completion` (event-flavoured, ambiguous) | `session_level` (describes the session, not an event)                       | Phase 99 (this) | Semantic consistency with session-focused model                                   |

## Environment Availability

| Dependency                              | Required By                                    | Available      | Version                                                    | Fallback      |
| --------------------------------------- | ---------------------------------------------- | -------------- | ---------------------------------------------------------- | ------------- |
| MySQL 8+                                | Migration D-15 (`CHANGE COLUMN` in single DDL) | ✓ (production) | 8.0.45 per D-15                                            | None required |
| `@capacitor/preferences`                | D-06 / R4 native storage                       | ✓              | Already installed (used by token storage + session player) | —             |
| Quasar `q-menu` / `q-dialog` / `q-chip` | UI components                                  | ✓              | Already in use                                             | —             |

## Validation Architecture

### Test Framework

| Property           | Value                                                                           |
| ------------------ | ------------------------------------------------------------------------------- |
| Framework          | Vitest (API integration tests against real MySQL `eltemplo_test`) per CLAUDE.md |
| Config file        | `el-templo-api/vitest.config.ts` (inferred from existing tests)                 |
| Quick run command  | `cd el-templo-api && pnpm test`                                                 |
| Full suite command | `cd el-templo-api && pnpm test`                                                 |

**Frontend unit testing:** App/admin do NOT have a Vitest harness set up for Vue components today (inferred — no `*.test.ts`/`*.spec.ts` files seen under `el-templo-app/src`). Manual + on-device smoke testing per existing practice. New composables (`useLevelSelectionStorage`, `useMidSessionGuard`) could get light unit tests if the planner wants to stand one up, but not required by current conventions.

### Phase Requirements → Test Map

| Req ID            | Behavior                                                      | Test Type                        | Automated Command                     | File Exists?                   |
| ----------------- | ------------------------------------------------------------- | -------------------------------- | ------------------------------------- | ------------------------------ |
| R3                | `?level=omega` override on weekly fetch returns omega content | integration (API)                | `pnpm test sessions/sessions.test.ts` | extend existing                |
| R3                | `?level=` override on goal-plans/session                      | integration (API)                | `pnpm test goal-plans/`               | extend existing                |
| R8                | Completion stamps `session_level` (post-rename)               | integration (API)                | `pnpm test sessions/sessions.test.ts` | rename assertions in 6 spots   |
| R9                | Goal-plan `currentWeek` advances on cross-level completion    | integration (API) — **new test** | `pnpm test goal-plans/`               | **Wave 0 gap**                 |
| R10               | Saturday + `?level=omega` returns delta content               | integration (API) — **new test** | `pnpm test sessions/sessions.test.ts` | **Wave 0 gap**                 |
| R11               | `/admin/members/:id/session-levels` returns correct counts    | integration (API) — **new test** | `pnpm test members/`                  | **Wave 0 gap**                 |
| R1/R2/R4/R5/R6/R7 | Dropdown UI + localStorage + dialog                           | manual smoke                     | —                                     | Manual on-device + desktop-web |

### Sampling Rate

- **Per task commit:** `cd el-templo-api && pnpm test` (~720 tests today; add ~6 new).
- **Per wave merge:** Full API test suite + manual smoke of dropdown on desktop + Android.
- **Phase gate:** Full API suite green + manual checklist of all 14 SPEC acceptance criteria.

### Wave 0 Gaps

- [ ] `el-templo-api/test/sessions/sessions.test.ts` — add R9 (cross-level goal-plan advance), R10 (ROM Saturday collapse).
- [ ] `el-templo-api/test/members/session-levels.test.ts` — new file for R11 endpoint.
- [ ] Rename-safety: all existing `level_at_completion`/`levelAtCompletion` test references renamed in same commit as schema change (tests green = migration correct).

## Assumptions Log

| #   | Claim                                                                                                                         | Section                  | Risk if Wrong                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| A1  | `AlumnoDetailPage.vue` is reached via `/alumnos/:id` (router config not read)                                                 | Q4                       | Low — file-based Vue-Router pattern; file name + `AlumnosPage` sibling match                                     |
| A2  | The frontend uses Vitest (no test files seen for the Vue apps)                                                                | Validation Architecture  | Low — affects only "frontend tests" bullet; API tests are Vitest-confirmed via CLAUDE.md and existing test files |
| A3  | "(Tu Nivel)" suffix should inherit `activeLevel` styling — SPEC doesn't specify whether the suffix itself is colored or plain | Q3 / D-03 interpretation | Low — if wrong, 1-line CSS fix                                                                                   |

No claims tagged `[ASSUMED]` are blocking.

## Open Questions

1. **Should the mid-session guard also block route navigation away from DayPlayer, or only level changes?**
   - What we know: SPEC R7 only covers level-change guarding. DayPlayer today doesn't appear to have a navigation guard (no `onBeforeRouteLeave` use seen in the first 300 lines; a `hasUnsavedProgress` computed exists at line 233 but isn't wired to a router guard in that slice).
   - What's unclear: Whether an existing navigation guard would interfere with the new dialog.
   - Recommendation: Read the full `DayPlayer.vue` during planning to confirm no conflict; otherwise keep scope tight — only wire the guard to level changes.

2. **Admin authentication scope for `/admin/members/:userId/session-levels`:**
   - SPEC R11 says "admin" visits. Existing `/admin/members/:userId` uses `MEMBER_ROLES` (goal-plans/routes.ts:523); the main admin route file has an auth preHandler at the plugin level (inferred from similar endpoints).
   - Recommendation: Match the existing `getMemberById` auth convention — whatever role check that endpoint has, use the same one.

## Spec-reconsideration Notes (not scope changes)

**Minor — not blockers:**

1. **"localStorage" wording in SPEC R4/R5/R6/D-06/D-07:** The established pattern on this app uses Capacitor Preferences on native and localStorage on web via a dual-path wrapper (`useTokenStorage`). Using `window.localStorage` only would fail on native (iOS/Android) because Capacitor WebViews have scoped storage semantics that are unreliable for persistence. Recommend the planner interpret "localStorage" as "device-local storage using the established wrapper pattern". No behavior change; just the storage primitive.

2. **SPEC R3 includes `/sessions/daily` in the endpoint list** but the client doesn't call that endpoint — it fetches sessions for the week in bulk via `/sessions/weekly`. The server-side `?level=` plumbing on `/sessions/daily` (from Phase 1) is still useful for future clients, and server-side integration tests should still cover it. The client-side assertion of R3 effectively narrows to `/sessions/weekly` + `/goal-plans/session`. Planner should note this in acceptance criteria wording.

## Sources

### Primary (HIGH confidence) — all verified from project files

- `el-templo-app/src/layouts/MainLayout.vue` — badge locations, header structure
- `el-templo-app/src/stores/useUserStore.ts` — extension site for `selectedLevel`
- `el-templo-app/src/stores/useAuthStore.ts` — logout hook site
- `el-templo-app/src/boot/auth.ts` — hydration timing site
- `el-templo-app/src/composables/useTokenStorage.ts` — storage wrapper pattern
- `el-templo-app/src/modules/training/composables/useWeekData.ts` — `?level=` injection site
- `el-templo-app/src/modules/training/composables/useSessionPlayer.ts` — `anyExerciseStarted` derivation
- `el-templo-app/src/modules/training/stores/sessionPlayerStore.ts` — Capacitor Preferences persistence precedent
- `el-templo-app/src/modules/training/pages/DayPlayer.vue` — mid-session state integration
- `el-templo-app/src/modules/training/components/BlockProgressionView.vue` — existing `q-menu` pattern
- `el-templo-app/src/modules/goal-plan/composables/useGoalPlanApi.ts` — `/goal-plans/session` fetch site + AbortController precedent
- `el-templo-app/src/modules/progression/stores/progressionStore.ts` — badge data source today
- `el-templo-app/src/css/_brand.scss` — brand tokens (no per-level palette)
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` — admin target page + existing `levelColor`/`greekLevel`/`levelDisplayName` helpers
- `el-templo-api/src/modules/sessions/routes.ts` — rename call sites + ROM collapse + `?level=` override
- `el-templo-api/src/modules/goal-plans/routes.ts` — rename call sites + goal-plan admin detail precedent
- `el-templo-api/src/modules/members/routes.ts` — new endpoint placement
- `el-templo-api/src/modules/members/service.ts` — `getMemberById` shape
- `el-templo-api/src/modules/shared/training-constants.ts` — `TRAINING_LEVELS`, `isTrainingLevel`, `parseDayId`
- `el-templo-api/src/modules/progression/service.ts` — `GREEK_LETTER_MAP`, `getLevelDisplayName` (server-side source of truth for Greek letters)
- `el-templo-api/src/db/schema/completed-sessions.ts` — schema rename target
- `el-templo-api/src/db/migrations/0090_completed_sessions_level.sql` — Phase 1 historical migration (do not edit)
- `el-templo-api/test/sessions/sessions.test.ts` — 6 test-site renames
- `CLAUDE.md` — project standards

### Secondary — none (no WebSearch needed)

### Tertiary — none

## Planner Guidance

**Key decisions the planner should lock:**

1. **Pick `q-menu` icon:** `keyboard_arrow_down` — matches mobile/material conventions; `expand_more` is the alias.
2. **Active-row highlight token:** `rgba($brand-aged-gold, 0.15)` as background on the selected `q-item`.
3. **Shared-component extraction:** Replace both badge instances in `MainLayout.vue` with a new `<HeaderLevelDropdown>` component. DRY + single mid-session integration point.
4. **Endpoint choice for admin counts:** NEW route `GET /admin/members/:userId/session-levels?days=30` (do NOT extend `getMemberById`).
5. **Column rename migration:** Hand-author `0091_rename_level_at_completion_to_session_level.sql` with `CHANGE COLUMN` single DDL. Commit with updated schema file + all 4 call sites + 6 test spots IN ONE COMMIT so CI stays green.
6. **Hydration:** `await userStore.hydrateSelection()` in `boot/auth.ts:26` (after `setProfile`) AND in `useAuthStore.login/register` right after `setProfile`.
7. **Mid-session guard:** `userStore.registerMidSessionGuard(fn)` — registered in DayPlayer `onMounted`, cleared in `onUnmounted`. `setLevel`/`clearLevel` await the guard; `clearSelection` (from logout) bypasses it.
8. **Client-side level-display module:** Create `el-templo-app/src/modules/training/level-display.ts` with `TRAINING_LEVELS`, `LEVEL_GREEK_MAP`, `LEVEL_DISPLAY_MAP`, `isTrainingLevel` — mirror of server's `progression/service.ts`. Don't refactor the other sites in this phase.

**File/API touchpoints (comprehensive):**

| Area       | File                                                                                       | Change                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Member app | `src/layouts/MainLayout.vue`                                                               | Replace 2 badge blocks with `<HeaderLevelDropdown>`                                                                           |
| Member app | `src/modules/training/components/HeaderLevelDropdown.vue`                                  | **New** — q-menu dropdown                                                                                                     |
| Member app | `src/modules/training/components/LevelChangeConfirmDialog.vue` OR use `$q.dialog()` inline | Inline is simpler                                                                                                             |
| Member app | `src/modules/training/level-display.ts`                                                    | **New** — shared enum + display maps                                                                                          |
| Member app | `src/composables/useLevelSelectionStorage.ts`                                              | **New** — dual-path storage wrapper                                                                                           |
| Member app | `src/stores/useUserStore.ts`                                                               | Add `selectedLevel`, `activeLevel`, `setLevel`, `clearLevel`, `clearSelection`, `hydrateSelection`, `registerMidSessionGuard` |
| Member app | `src/stores/useAuthStore.ts:101-107`                                                       | Insert `await userStore.clearSelection()` in `logout`                                                                         |
| Member app | `src/boot/auth.ts:26`                                                                      | Insert `await userStore.hydrateSelection()`                                                                                   |
| Member app | `src/modules/training/composables/useWeekData.ts:62-64`                                    | Append `level` to params when `selectedLevel` set                                                                             |
| Member app | `src/modules/goal-plan/composables/useGoalPlanApi.ts:142-149`                              | Same treatment                                                                                                                |
| Member app | `src/modules/training/pages/DayPlayer.vue`                                                 | Register mid-session guard; watch `activeLevel` to discard + refetch                                                          |
| API        | `src/db/schema/completed-sessions.ts:25`                                                   | Rename field `levelAtCompletion → sessionLevel`, column `level_at_completion → session_level`                                 |
| API        | `src/db/migrations/0091_rename_level_at_completion_to_session_level.sql`                   | **New migration**                                                                                                             |
| API        | `src/modules/sessions/routes.ts:479,521,540`                                               | Rename variable + assignments                                                                                                 |
| API        | `src/modules/goal-plans/routes.ts:255,306,324`                                             | Rename variable + assignments                                                                                                 |
| API        | `src/modules/members/routes.ts`                                                            | **New route** `GET /:userId/session-levels`                                                                                   |
| API        | `src/modules/members/schemas.ts`                                                           | Add `getMemberSessionLevelsSchema`                                                                                            |
| API        | `test/sessions/sessions.test.ts:192,225,234,237,272,281`                                   | Rename all `levelAtCompletion → sessionLevel` / `level_at_completion → session_level`                                         |
| API        | `test/sessions/sessions.test.ts`                                                           | **New tests:** R9 (cross-level currentWeek advance), R10 (ROM Saturday collapse with `?level=omega`)                          |
| API        | `test/members/session-levels.test.ts`                                                      | **New test file** for R11                                                                                                     |
| Admin app  | `src/pages/AlumnoDetailPage.vue`                                                           | Add `<q-card-section>` chip row after header card; fetch counts via new endpoint                                              |
| Admin app  | `src/composables/` (new or extend `useMembersApi`)                                         | Fetch `/admin/members/:id/session-levels`                                                                                     |

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — everything already installed; no new deps.
- Architecture: HIGH — all seams verified in source; no speculation.
- Pitfalls: HIGH — derived from actual code paths + established project patterns.
- Admin endpoint design: HIGH — precedent exists (`/admin/goal-plans/members/:userId`).
- Column rename: HIGH — 4 code + 6 test call sites enumerated; MySQL 8 DDL confirmed by D-15.

**Research date:** 2026-04-21
**Valid until:** ~2026-05-21 (30 days for stable project; no external dep versions that could drift)

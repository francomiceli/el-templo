---
phase: 99-member-selectable-training-level
plan: 02
subsystem: app
tags: [app, pinia, persistence, phase-99, tdd]
requires:
  - Phase 99 Plan 99-01 (API: session_level rename + admin session-levels endpoint)
  - Existing useUserStore profile state
  - Existing useTokenStorage dual-path pattern
provides:
  - Level type + TRAINING_LEVELS tuple + LEVEL_GREEK_MAP + LEVEL_DISPLAY_MAP + isTrainingLevel (client-side source of truth)
  - useLevelSelectionStorage() composable (get/set/remove, user-id-scoped key, dual-path)
  - useUserStore.selectedLevel + activeLevel + setLevel + clearLevel + clearSelection + hydrateSelection + registerMidSessionGuard
  - Hydration wired into boot/auth.ts, useAuthStore.login, useAuthStore.register
  - Logout storage wipe wired into useAuthStore.logout
affects:
  - el-templo-app/src/stores/useUserStore.ts
  - el-templo-app/src/stores/useAuthStore.ts
  - el-templo-app/src/boot/auth.ts
tech-stack:
  added: []
  patterns:
    - "Dual-path storage (Capacitor Preferences on native, localStorage on web) mirroring useTokenStorage"
    - "User-id-scoped storage key: 'eltemplo.selectedLevel:<userId>'"
    - "Lazy dynamic import (await import(...)) to break Pinia top-level circular import"
    - "isTrainingLevel type-guard narrowing in computed — no unchecked `as Level` cast"
    - "Try/catch + createLogger.warn inside storage wrapper (swallows storage errors, no user-visible crash)"
key-files:
  created:
    - el-templo-app/src/modules/training/level-display.ts
    - el-templo-app/src/composables/useLevelSelectionStorage.ts
    - el-templo-app/test/level-display.test.ts
    - el-templo-app/test/level-selection-storage.test.ts
    - el-templo-app/test/user-store-level-selection.test.ts
  modified:
    - el-templo-app/src/stores/useUserStore.ts
    - el-templo-app/src/stores/useAuthStore.ts
    - el-templo-app/src/boot/auth.ts
decisions:
  - Kept the existing utility file src/modules/training/utils/levelDisplay.ts untouched; new level-display.ts lives at src/modules/training/level-display.ts per plan. The utility file provides case-insensitive lookup helpers; the new module is the strict enum + type guard consumed by the selection store.
  - Re-exported `Level` from useUserStore for backward compatibility with existing imports (`export type { Level }`). The type now originates from level-display.ts and is imported into useUserStore.
  - Used the dynamic `await import('src/stores/useAuthStore')` form inside clearSelection (the safest guard against Pinia store-init cycles). Not benchmarked against a top-level import because dynamic import works and the plan explicitly recommended it when in doubt.
  - Kept the existing composables/ directory (no nested subdirs) because the plan path was flat.
metrics:
  duration_minutes: 20
  completed_date: 2026-04-21
  tasks_completed: 2
  commits: 4
  tests_added: 39
  files_changed: 8
---

# Phase 99 Plan 99-02: Client-side Selection Plumbing (Wave 1 App Half) — Summary

Shipped the client-side level-display enum/guard, the dual-path `useLevelSelectionStorage`
composable, and the full selection API on `useUserStore` (`selectedLevel`, `activeLevel`,
`setLevel`, `clearLevel`, `clearSelection`, `hydrateSelection`, `registerMidSessionGuard`).
Wired hydration into boot/auth.ts + login + register, and logout cleanup into useAuthStore —
39 new TDD tests pass (55/55 overall). No UI yet; Plan 99-03 will build on this contract.

## Summary

### New API surface

**`src/modules/training/level-display.ts`:**

```ts
export const TRAINING_LEVELS = [
  "alfa",
  "delta",
  "sigma",
  "omega",
  "spartan",
] as const;
export type Level = (typeof TRAINING_LEVELS)[number];
export const LEVEL_GREEK_MAP: Record<Level, string>; // α Δ Σ Ω Ω
export const LEVEL_DISPLAY_MAP: Record<Level, string>; // Alfa Delta Sigma Omega Spartan
export function isTrainingLevel(v: unknown): v is Level;
```

Greek letters verified byte-for-byte against `el-templo-api/src/modules/progression/service.ts` GREEK_LETTER_MAP:
`alfa -> α (U+03B1)`, `delta -> Δ (U+0394)`, `sigma -> Σ (U+03A3)`, `omega -> Ω (U+03A9)`,
`spartan -> Ω (U+03A9, same as omega per server)`.

**`src/composables/useLevelSelectionStorage.ts`:**

```ts
export function useLevelSelectionStorage(): {
  get(userId: number): Promise<string | null>;
  set(userId: number, value: string): Promise<void>;
  remove(userId: number): Promise<void>;
};
```

- Key format: `eltemplo.selectedLevel:<userId>` (D-06 — user-id-scoped to prevent shared-device leakage).
- Mirrors `useTokenStorage` exactly: `Capacitor.isNativePlatform()` branch writes via `@capacitor/preferences`, otherwise `localStorage`.
- All ops wrapped in try/catch; errors logged via `createLogger('level-storage').warn(...)` and swallowed (no user-visible crash per T-99-09).
- No `console.*`, no `any`.

**`src/stores/useUserStore.ts` additions:**

```ts
selectedLevel: Ref<Level | null>          // null = no override
activeLevel: ComputedRef<Level | null>    // uses isTrainingLevel narrowing
setLevel(lvl: Level): Promise<void>       // self-pick routes through clearLevel (D-08)
clearLevel(): Promise<void>               // guard-gated
clearSelection(): Promise<void>           // logout path; bypasses guard; lazy useAuthStore()
hydrateSelection(): Promise<void>         // boot path; bypasses guard; rejects invalid values
registerMidSessionGuard(fn: (() => Promise<boolean>) | null): void
```

`Level` is re-exported from the store for backward compatibility with existing imports
(the type now originates from `level-display.ts`).

### Hydration hook sites (line-order verified)

| File                                       | Line | Context                                                                                                                                                                                     |
| ------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-app/src/boot/auth.ts`           | 30   | After `userStore.setProfile(response.data)`; awaited before boot returns. Quasar awaits the boot function, so first `MainLayout` render + first session fetch see hydrated `selectedLevel`. |
| `el-templo-app/src/stores/useAuthStore.ts` | 58   | `login()` — after `setProfile(userData)` (line 54), before the try-block exits. No `router.push` calls inside the store (nav happens in callers).                                           |
| `el-templo-app/src/stores/useAuthStore.ts` | 97   | `register()` — after `setProfile(userData)` (line 94), before `return { promoApplied }`.                                                                                                    |

### Logout hook site (line-order verified)

| File                                       | Line | Context                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-app/src/stores/useAuthStore.ts` | 115  | `logout()` — `await userStore.clearSelection()` runs AFTER `removeToken()` but BEFORE `token.value = null`, `user.value = null`, `userStore.clearProfile()`. Both `userStore.profile.id` and `authStore.user.id` are still resolvable when the storage key is wiped (Pitfall 3). |

### Storage key format + dual-path strategy

- Format: `eltemplo.selectedLevel:<userId>` (e.g. `eltemplo.selectedLevel:42`). Value is the raw enum string (`"omega"`).
- Web: `localStorage.getItem/setItem/removeItem`.
- Native (iOS/Android): `@capacitor/preferences` `Preferences.get/set/remove`.
- Branch chosen per call via `Capacitor.isNativePlatform()`.
- All three methods wrap in try/catch and degrade gracefully: `get` returns `null` on throw; `set`/`remove` swallow silently. Logged via `createLogger('level-storage').warn`.

### Circular-import resolution

`useAuthStore` is NOT imported at the top of `useUserStore.ts`. The only call site is
an inline lazy dynamic import inside `clearSelection`:

```ts
async function clearSelection(): Promise<void> {
  const { useAuthStore } = await import("src/stores/useAuthStore");
  const authStore = useAuthStore();
  const userId = profile.value?.id ?? authStore.user?.id;
  selectedLevel.value = null;
  if (userId) await levelStorage.remove(userId);
}
```

This form guarantees no module-evaluation-order cycle with
`useAuthStore`'s top-level `import { useUserStore } from './useUserStore'`.

### `activeLevel` narrowing

```ts
const activeLevel = computed<Level | null>(() => {
  if (selectedLevel.value) return selectedLevel.value;
  const p = profile.value?.level;
  return isTrainingLevel(p) ? p : null;
});
```

No `profile.value?.level as Level` cast anywhere in the new code (grep: 0 matches).
This defends against a drifted profile value (e.g. a future server change that adds a
new enum member before the client knows about it) leaking through as a typed `Level`.

### Verified Greek-letter values (byte-for-byte server parity)

Verified by reading `el-templo-api/src/modules/progression/service.ts` lines 4-10 at
execution time:

| Level   | Server (progression/service.ts) | Client (level-display.ts) |
| ------- | ------------------------------- | ------------------------- |
| alfa    | `α` (α)                         | `α`                       |
| delta   | `Δ` (Δ)                         | `Δ`                       |
| sigma   | `Σ` (Σ)                         | `Σ`                       |
| omega   | `Ω` (Ω)                         | `Ω`                       |
| spartan | `Ω` (Ω — same as omega)         | `Ω`                       |

## Deviations from Plan

None material. The executor used the recommended dynamic `await import('src/stores/useAuthStore')`
form (plan noted the top-level import MAY be used after verification; the executor defaulted to the
safer dynamic form per the plan's explicit guidance). Backward-compat `export type { Level }` was
added to useUserStore so pre-existing imports of `Level` from `useUserStore` keep compiling.

## Verification

- `cd el-templo-app && pnpm vitest run` — 55/55 tests pass (4 files: onboarding-age-helpers, level-display, level-selection-storage, user-store-level-selection).
- `cd el-templo-app && pnpm tsc --noEmit` — clean for new files. Pre-existing errors (Vue SFC `.vue` module resolution, `#q-app/wrappers`, `ImportMeta.env`) are scope-boundary and unchanged. No new errors attributable to this plan.
- `grep -n ": any"` returns 0 in modified files.
- `grep -n "console\\."` returns 0 in modified files.
- `grep -n "^import.*useAuthStore" src/stores/useUserStore.ts` returns 0 matches (lazy-import rule honoured).
- `grep -n "profile.value?.level as Level" src/stores/useUserStore.ts` returns 0 matches (narrowing rule honoured).
- Line-order proof in useAuthStore: setProfile@54 < hydrateSelection@58 (login); setProfile@94 < hydrateSelection@97 (register); no router.push calls inside store (vacuously satisfies "before any router.push" constraint).

Runtime flows (persistence survives cold restart, logout wipes key) are not device-exercised in this plan — the DayPlayer walkthrough in Plan 99-03 Task 3 steps E + F will verify them end-to-end. All behavioural invariants are pinned by the 39 unit tests shipped here.

## Authentication Gates

None — fully autonomous plan, no user-facing auth required.

## Commit Log

- `11dcc024` — test(99-02): add failing tests for level-display + level-selection-storage
- `5c9ec239` — feat(99-02): add level-display module and useLevelSelectionStorage composable
- `49588176` — test(99-02): add failing tests for useUserStore selection API
- `322c8545` — feat(99-02): wire level-selection state into useUserStore + boot + auth flows

## Threat Flags

None introduced beyond the plan's `<threat_model>` (T-99-07, T-99-08, T-99-09, T-99-10 — all mitigated).
The storage wrapper never reads pre-authentication (T-99-10: `hydrateSelection` no-ops when
`profile.value?.id` is null). Invalid stored values are rejected and wiped (T-99-07). Key is
user-id-scoped (T-99-08). Storage throws are swallowed and logged (T-99-09).

## TDD Gate Compliance

- RED commits: `11dcc024`, `49588176` (both `test(99-02):` prefix, both landed before their GREEN counterparts).
- GREEN commits: `5c9ec239`, `322c8545` (both `feat(99-02):` prefix, each landed AFTER its RED).
- REFACTOR: not needed — implementations were written at the minimum level to pass and no separate cleanup pass was warranted.

## Self-Check: PASSED

**Files:**

- FOUND: el-templo-app/src/modules/training/level-display.ts
- FOUND: el-templo-app/src/composables/useLevelSelectionStorage.ts
- FOUND: el-templo-app/src/stores/useUserStore.ts (modified — new API surface)
- FOUND: el-templo-app/src/stores/useAuthStore.ts (modified — hydrate in login/register, clear in logout)
- FOUND: el-templo-app/src/boot/auth.ts (modified — hydrate after setProfile)
- FOUND: el-templo-app/test/level-display.test.ts
- FOUND: el-templo-app/test/level-selection-storage.test.ts
- FOUND: el-templo-app/test/user-store-level-selection.test.ts

**Commits (verified via `git log --oneline`):**

- FOUND: 11dcc024
- FOUND: 5c9ec239
- FOUND: 49588176
- FOUND: 322c8545

---
phase: 131-ajuste-de-dificultad-in-session-registro-de-dominado-bajado
plan: 03
subsystem: el-templo-app / training (in-session player)
tags: [exercise-adjustments, player, composable, skill-tree, capstone]
requires:
  - "Plan 01 POST /api/exercise-adjustments (member-scoped, returns neighbor + message)"
  - "DayPlayer session state (session.blocks[*].exercises[i]) + useSessionPlayer playableBlocks computed"
provides:
  - "useExerciseAdjustment composable (adjustExercise + isSubmitting + cleanup)"
  - "Per-exercise 'más fácil' / 'más difícil' buttons in the in-session player"
  - "Local neighbor swap into the source session block (identity-only, dose preserved)"
affects:
  - "Closes ADJUST-01 (player buttons) + ADJUST-02 visual half (swap)"
  - "Capstone of milestone v5.1 Nuevo Sistema de Entrenamiento (last plan, phase 131)"
tech-stack:
  added: []
  patterns:
    - "axios composable (api from src/boot/axios, createLogger, isExpectedClientError, no console.log/any)"
    - "composable cleanup() no-op, NO onUnmounted inside (CLAUDE.md composable contract)"
    - "parent owns swap: composable returns neighbor, DayPlayer mutates source session.blocks"
key-files:
  created:
    - el-templo-app/src/modules/training/composables/useExerciseAdjustment.ts
  modified:
    - el-templo-app/src/modules/training/components/BlockProgressionView.vue
    - el-templo-app/src/modules/training/pages/DayPlayer.vue
decisions:
  - "Swap replaces exerciseId/exerciseName/contraction and clears videoUrl (endpoint serves no video; refetched on next session load); reps/seconds/format/dose/sortOrder/rest preserved (D-03)"
  - "Buttons live in the BlockProgressionView detail row (not ExerciseCard) — that is the active per-slide action surface; shown only for a real (non-mobility, non-reviewing) slide"
  - "isSubmitting guard in the composable + :disable in the buttons enforces one-tap-one-step (no multi-jump)"
  - "Chain end (neighbor null) → q.notify info with the server message, no mutation (D-03)"
metrics:
  duration: ~20m
  completed: 2026-06-05
---

# Phase 131 Plan 03: In-session difficulty adjustment buttons + neighbor swap Summary

Member-facing surface of the in-session difficulty adjustment and the **capstone of milestone v5.1**. Adds per-exercise "↓ más fácil" / "más difícil ↑" buttons to the in-session player, a `useExerciseAdjustment` composable that calls the Plan 01 endpoint, and the swap wiring in `DayPlayer` that replaces ONLY the exercise identity in the current block with the served tree neighbor — preserving the block's route/contraction/format/dose. One step per tap; graceful chain-end message.

## What was built (commit `863ba4f2`)

### `useExerciseAdjustment.ts` (new composable)

- `adjustExercise(exerciseId, direction, dayId, date)` POSTs to `/exercise-adjustments` (axios `api` already prefixes `/api`) and returns the `{ neighbor, message }` payload (Plan 01 contract), or `null` on transport/server failure.
- `isSubmitting` ref + an in-flight guard (re-entrancy → early `null`) enforce one request at a time.
- Error handling via `createLogger` + `isExpectedClientError` (expected 4xx logged as `warn`, not Sentry-error; no Notify spam — the parent decides UI).
- `cleanup()` no-op (no timers/listeners held), **no `onUnmounted` inside** — honors the CLAUDE.md composable contract. No `console.log`, no `any`. Typed `AdjustDirection`, `AdjustmentNeighbor`, `AdjustmentResponse`.

### `BlockProgressionView.vue` (player buttons)

- Two compact outlined buttons in the detail action row, below "Completar": "↓ más fácil" (icon `south`, `secondary`) and "más difícil ↑" (icon-right `north`, `primary`) — warm palette tokens, no blue, no hardcoded hex.
- `canAdjustCurrentSlide` gate: shown only for a real exercise slide (`!isMobilitySlide && !isReviewingPrevious && currentSlideExercise !== null`).
- On click emits the new `adjust` event with `{ exerciseId: currentSlideExercise.exerciseId, direction }` — the exercise's catalog node id (D-02).
- New `isAdjusting?: boolean` prop (default false) disables both buttons while a request is in flight. `adjust` added to the `Emits` interface.

### `DayPlayer.vue` (swap wiring)

- Instantiates `useExerciseAdjustment` (`isAdjusting` passed down as `:is-adjusting`, `@adjust="onAdjustExercise"`, `cleanup()` added to the existing `onUnmounted`).
- `onAdjustExercise` calls `adjustExercise(exerciseId, direction, session.dayId, dateParam)`.
  - On success with a neighbor: finds the exercise by `exerciseId` in the **SOURCE** `session.blocks[*].exercises[i]` and replaces ONLY `exerciseId`/`exerciseName`/`contraction` (and clears `videoUrl`), spreading the rest so `reps/repsMax/seconds/secondsMax/increment/rest/sortOrder/notes` and the block format/dose stay intact (D-03). One match, then `break` (one tap = one swap). The `playableBlocks` computed in `useSessionPlayer` re-derives from `session.blocks`, so the swap reflects through to the player.
  - On `neighbor === null`: `$q.notify` info with the returned message ("ya estás en el extremo de la cadena"), changes nothing.
  - On `null` result (transport/server error): no change (already logged in the composable).
- Never touches level/SPOM (D-06) — only swaps the exercise and shows messages.

## Contract consumed (Plan 01)

`POST /api/exercise-adjustments` body `{ exerciseId, direction: 'up'|'down', dayId, date }` → `200 { neighbor: { id, name, dificultadLineal, contraction, position } | null, message: string | null }`. `up` = más difícil (dominado), `down` = más fácil (bajado).

## Deviations from Plan

None functionally. Two notes:

- The endpoint response carries no `videoUrl`, so the swap **clears** `videoUrl` (the stale clip would otherwise show the previous exercise); it is refetched on the next session load. This is within the plan's "refetch/clear videoUrl as needed" instruction (D-03).
- `pnpm typecheck` is not a defined script in `el-templo-app` (only `lint`/`build`/`test`). The local gate run was **ESLint** (the project's CI type+lint gate) which passed with 0 errors. A bare `vue-tsc --noEmit` reports only pre-existing environmental errors (missing Quasar tsconfig `import.meta.env` / `#q-app/wrappers` / SFC shims) across many unrelated files — **none** reference the three files in this plan.

## Verification

- `pnpm run lint` (el-templo-app): 0 errors (2 pre-existing warnings in `boot/axios.ts` and `useSessionPlayer.ts`, both out of scope).
- `vue-tsc --noEmit`: no errors in `useExerciseAdjustment.ts`, `BlockProgressionView.vue`, or `DayPlayer.vue` (confirmed by grep).
- Composable: `grep` confirms `exercise-adjustments` + `cleanup` present; no `onUnmounted` / `console.` inside.
- BlockProgressionView: `más fácil` / `más difícil` buttons + `adjust` emit present.
- DayPlayer: `adjustExercise` + `onAdjustExercise` swap present, mutates `session.blocks`.
- Committed atomically on `staging` (`863ba4f2`). Nothing pushed; master untouched.

## Deferred: human-verify checkpoint (Task 2 — BLOCKING)

Task 2 is a `checkpoint:human-verify` (visual end-to-end player UAT). This was an **unattended overnight run**, so the checkpoint is **DEFERRED** — implementation + local gate are complete. Pending manual visual UAT (requires Plan 01 backend + migration 0142 applied in CI/staging):

1. As a member with an active presencial session, enter the player (DayPlayer).
2. On a real exercise slide, confirm the "↓ más fácil" / "más difícil ↑" buttons appear (warm palette, no blue).
3. Tap "más difícil ↑": exercise name/contraction swaps to the next harder neighbor; reps/seconds/format/dose unchanged; one step only.
4. Tap "↓ más fácil": swaps to the easier neighbor.
5. Keep tapping one direction to the chain end: confirm the "ya estás en el extremo de la cadena" message and no change.
6. In admin → Alumno detail, confirm the dominado/bajado records (Plan 02) and that a dominado node counts toward the tree % (Plan 02 seam).

Resume signal: "approved" or describe issues (wrong neighbor, dose changed, no chain-end message, record not visible to coach, % not updated).

## Milestone capstone note

This is the **last plan of milestone v5.1 Nuevo Sistema de Entrenamiento** (Eje 3 — ajuste in-session). With Plans 01 (registry + endpoint) and 02 (tree % enrichment + coach view) shipped, the full in-session adjustment loop is wired end to end (player → endpoint → record → % → coach). Out of scope per D-06: no automatic level/SPOM change.

## Known Stubs

None. The composable is fully wired to the Plan 01 endpoint; the swap mutates real session state. `videoUrl` is intentionally cleared on swap (refetched on next session load) — not a stub.

## Self-Check: PASSED

- File created: `el-templo-app/src/modules/training/composables/useExerciseAdjustment.ts` — present.
- Files modified: `BlockProgressionView.vue`, `DayPlayer.vue` — present, contain the buttons / swap.
- Commit `863ba4f2` present on branch `staging`.

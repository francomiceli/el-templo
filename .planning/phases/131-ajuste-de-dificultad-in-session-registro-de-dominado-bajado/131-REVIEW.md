---
phase: 131-ajuste-de-dificultad-in-session-registro-de-dominado-bajado
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - el-templo-api/src/db/schema/exercise-adjustments.ts
  - el-templo-api/src/db/migrations/0142_create_exercise_adjustments.sql
  - el-templo-api/src/modules/exercise-adjustments/service.ts
  - el-templo-api/src/modules/exercise-adjustments/routes.ts
  - el-templo-api/src/modules/exercise-adjustments/schemas.ts
  - el-templo-api/src/modules/exercise-adjustments/coach-service.ts
  - el-templo-api/src/modules/exercise-adjustments/coach-routes.ts
  - el-templo-api/src/modules/exercise-adjustments/index.ts
  - el-templo-api/src/plugins/exercise-adjustments.ts
  - el-templo-api/src/plugins/exercise-adjustments-coach.ts
  - el-templo-api/src/modules/tree-progress/service.ts
  - el-templo-api/test/exercise-adjustments.test.ts
  - el-templo-api/test/exercise-adjustments-coach.test.ts
  - el-templo-app/src/modules/training/composables/useExerciseAdjustment.ts
  - el-templo-app/src/modules/training/components/BlockProgressionView.vue
  - el-templo-app/src/modules/training/pages/DayPlayer.vue
  - el-templo-admin/src/composables/useExerciseAdjustmentsApi.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: clean
fix_status: all_warnings_fixed
fix_note: >-
  WR-01/WR-02/WR-03 fixed in the player swap (commits 25b8b966, ee1f244a,
  10b4949c). The 4 Info items (IN-01 date/dayId pattern, IN-02 FK RESTRICT
  doc-only, IN-03 unused errorResponseSchema, IN-04 loose contraction typing)
  were intentionally NOT fixed — they are non-blocking and out of scope for
  this fix pass.
---

# Phase 131: Code Review Report

**Reviewed:** 2026-06-05
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Phase 131 wires the in-session difficulty adjustment end-to-end: a new
`exercise_adjustments` log table + member-scoped `POST /api/exercise-adjustments`
(Plan 01), the 127 tree-% "reached" seam augmentation + a `TRAINING_ROLES`-gated
coach read endpoint (Plan 02), and the player swap UI (Plan 03).

The **backend security posture is strong and matches the threat model**:

- The member POST derives `memberId` from `request.user.userId` ONLY; the body
  schema is `additionalProperties:false` and carries no member/user id (verified
  in `routes.ts` and asserted by Test 4 — spoofed body id → 400, victim row never
  written). No member can write another member's record.
- The coach GET lives in a SEPARATE plugin under `/api/admin/exercise-adjustments`
  with a plugin-wide `authenticate`-then-`TRAINING_ROLES` `onRequest` hook,
  byte-for-byte mirroring the Phase 128 tree-editor gate. A member token → 403
  (Test 3). Keeping it off the member POST plugin correctly prevents the role
  gate from ever locking out the member's own endpoint.
- `getNeighbor` is reused, not reimplemented; `up→dominado`, `down→bajado`;
  chain-end `null` is a graceful no-op with NO row written (Tests 3 & 5); effort
  is never crossed (enforced inside the 126 primitive). No `users.level`/SPOM
  write exists anywhere in the diff (confirmed by grep + read of the service and
  seam).
- The 127 seam AUGMENTS rather than replaces: `dl <= ceiling || completed.has ||
dominated.has`. Latest-per-node wins via a JS reduce (MAX `created_at`, `id`
  tie-break); a later `bajado` un-counts an earlier `dominado` (Test B asserts
  this on an above-ceiling node). The dominated query is member-scoped on
  `member_id = userId`. Both extra reads are added to the existing `Promise.all`
  (no N+1).
- Migration 0142 is additive-only, enum values match the Drizzle `mysqlEnum`
  first-arg + values, and no `;` appears inside a comment line (project invariant
  respected).

The three WARNINGs are all in the **player swap (Plan 03)**, which is the least
guarded surface: the swap targets the wrong block when an exercise repeats across
blocks, it orphans local completion state keyed by `exerciseId`, and it nulls the
video URL on swap. None are security or data-loss issues, but all degrade
in-session correctness/UX. No Critical issues found.

## Warnings

### WR-01: Player swap mutates the FIRST matching block, not the tapped block

**File:** `el-templo-app/src/modules/training/pages/DayPlayer.vue:375-389`
**Issue:** `onAdjustExercise` iterates `s.blocks` and swaps the first block whose
`exercises[].exerciseId === payload.exerciseId`, then `break`s. The tap event from
`BlockProgressionView` (`BlockProgressionView.vue:509-513`, `onAdjust`) emits ONLY
`{ exerciseId, direction }` — it does not carry the block/role the slide belongs
to. The same catalog exercise can legitimately appear in more than one block of a
session (`Session.blocks` is an ordered list; a movement can recur across
NUCLEUS / DEUTEROS / a ROM block). When it does, the swap mutates the wrong block
— the member taps "más difícil" on the exercise in NUCLEUS but the occurrence in
an earlier block is replaced instead, while the slide they are looking at is
unchanged. The persisted `exercise_adjustments` row is still correct (origin id),
so the data layer is fine; this is a UI-state correctness bug only.
**Fix:** Pass the block identity through the event so the swap targets the exact
occurrence the member tapped:

```ts
// BlockProgressionView.vue — include the viewed block id
emit("adjust", {
  exerciseId: exercise.exerciseId,
  direction,
  blockId: viewingBlock.value?.blockId ?? null,
});

// DayPlayer.vue — match block first, then the exercise within it
const block = s.blocks.find((b) => b.blockId === payload.blockId);
if (!block) return;
const idx = block.exercises.findIndex(
  (ex) => ex.exerciseId === payload.exerciseId,
);
if (idx === -1) return;
// ...swap block.exercises[idx] as before
```

### WR-02: Swap orphans local completion state keyed by `exerciseId`

**File:** `el-templo-app/src/modules/training/pages/DayPlayer.vue:375-389`
**Issue:** Exercise completion is tracked by `exerciseId` (the catalog id), not by
`sortOrder`/slot: `BlockProgressionView.onSlideComplete` emits
`{ prescriptionId: exercise.exerciseId }` and `useSessionPlayer.toggleExerciseComplete`
stores that value in `completedExercises[role]` (`useSessionPlayer.ts:309-331`).
The swap rewrites `block.exercises[idx].exerciseId` to `neighbor.id` but leaves the
`completedExercises` array untouched. Two consequences: (1) if the member had
already marked the origin complete, that completion record now references an
`exerciseId` no longer present in the block — it is orphaned and the swapped-in
exercise shows as not-completed (arguably acceptable, since it is a different
exercise); (2) the orphaned id is still sent at session completion in
`exercisesCompleted` (`DayPlayer.vue:452` → sessions route), so the server-side
"completed" set the tree-% branch (b) reads can include an exercise the member
never actually performed under this session's block. This is a quiet data-quality
drift, not a crash.
**Fix:** When swapping, migrate the completion entry alongside the identity (or
clear it). After locating the block + index:

```ts
// In useSessionPlayer, expose a remap; or in the swap, re-key completion:
const role = block.role;
const completed = player.value.completedExercises.value[role] ?? [];
if (completed.includes(payload.exerciseId)) {
  // either drop the stale id, or move it to neighbor.id to preserve "done"
  await player.value.toggleExerciseComplete(payload.exerciseId); // un-complete origin
}
```

Decide intentionally whether a swapped exercise should inherit "completed" — but
do not leave the array pointing at an id the block no longer contains.

### WR-03: Swap nulls `videoUrl` with no in-session refetch, breaking the clip until reload

**File:** `el-templo-app/src/modules/training/pages/DayPlayer.vue:379-388`
**Issue:** The swap sets `videoUrl: null` on the new prescription because the
adjustment endpoint does not return a video URL, with the comment "it is refetched
on the next session load." But there is no in-session refetch — `playableBlocks`
re-derives from the mutated `session.blocks`, so for the remainder of the current
session the swapped exercise has `videoUrl === null`. The player's
`StoryExerciseCard` and the prefetch logic in `BlockProgressionView.vue:332-356`
consume `videoUrl`; a null means the member sees a missing/blank clip for the very
exercise they just chose, immediately after tapping, which defeats the point of the
swap (they want to see the harder/easier movement). This is a UX regression on the
happy path, not an error.
**Fix:** Have the adjustment endpoint return the neighbor's `videoUrl` (the
`exercises` row already has it; add it to the `ExerciseCandidate`/response and the
`neighborSchema`) and assign it in the swap, OR trigger a targeted refetch of the
day's session after a successful swap instead of nulling the field. Returning the
URL is the cheaper, race-free option since the neighbor row is already loaded by
`getNeighbor`.

## Info

### IN-01: `date`/`dayId` body fields are unvalidated, attacker-controlled log context

**File:** `el-templo-api/src/modules/exercise-adjustments/schemas.ts:21-22`
**Issue:** `date` is constrained only to length 10 (not a `YYYY-MM-DD` pattern) and
`dayId` to 1–50 chars; both are persisted verbatim from the body and are not tied
to any real session record (no FK, no cross-check against the member's actual
session for that day). A member can POST an arbitrary `date`/`dayId`. There is no
integrity impact (these are advisory log context shown to the coach), but the
coach view will faithfully display whatever the client sent.
**Fix:** Add a `pattern` to `date` (`"^\\d{4}-\\d{2}-\\d{2}$"`) to at least reject
malformed dates, and treat `dayId`/`date` as untrusted display strings in the coach
UI (they already are — `formatDate` is defensive). No server trust should rest on
them.

### IN-02: `to_exercise_id` FK is RESTRICT but exercises are "never hard-deleted" — assumption only

**File:** `el-templo-api/src/db/migrations/0142_create_exercise_adjustments.sql:71-72`
**Issue:** All three FKs default to RESTRICT. The migration comment justifies this
by asserting exercises are never hard-deleted (soft-merged via
`canonical_exercise_id`). That holds today, but if a future migration ever does
hard-delete an exercise that an adjustment row references, the DELETE will fail
with a FK error rather than degrade gracefully. The coach service already tolerates
a missing join (`exerciseName ?? '#id'`), so the data layer is more conservative
than the read layer needs.
**Fix:** None required now — documenting the coupling. If exercise hard-deletes are
ever introduced, revisit to `ON DELETE SET NULL` for `to_exercise_id` (and decide a
policy for `exercise_id`).

### IN-03: `errorResponseSchema` declared on the member POST but the route never emits `{ error }`

**File:** `el-templo-api/src/modules/exercise-adjustments/routes.ts:43-46`,
`el-templo-api/src/modules/exercise-adjustments/schemas.ts:47-52`
**Issue:** The POST registers a `401: errorResponseSchema` response, but the handler
has no try/catch and a thrown service error (e.g. the DB insert failure re-thrown at
`service.ts:116`) becomes a Fastify 500 with the default error shape, not the
declared `{ error }`. The 401 path is produced by the `authenticate` hook, not the
handler, so the declared schema is only partially exercised. Harmless, but the
response schema implies an error contract the route does not actively shape.
**Fix:** Either add a 500 response schema + a try/catch that routes through
`handleServiceError` (as the coach route does), or drop the unused `errorResponseSchema`
import from the member route to avoid implying a contract that isn't enforced.

### IN-04: `AdjustmentResponse.neighbor.contraction`/`position` typed loosely as plain strings

**File:** `el-templo-app/src/modules/training/composables/useExerciseAdjustment.ts:12-18`
**Issue:** The frontend `AdjustmentNeighbor.contraction` is `string` (not the
`'CON'|'EXC'|'ISO'` union) and `position` is `string | null`. The backend
`ExerciseCandidate` constrains `contraction` to the `Contraction` union; the wire
contract is looser on the client. The swap then assigns `neighbor.contraction` into
`Prescription.contraction` (also `string`), so it type-checks, but the narrowing is
lost. Low risk since the contraction is fixed by `getNeighbor` and never rendered as
anything but a label.
**Fix:** Narrow `contraction` to `'CON' | 'EXC' | 'ISO'` in the composable's
`AdjustmentNeighbor` to keep the client contract aligned with the server's, matching
CLAUDE.md's "define proper interfaces" preference.

---

_Reviewed: 2026-06-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---
phase: 096-full-body-goal-plan-equipment-tagging
reviewed: 2026-04-08T15:52:01Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - el-templo-admin/src/composables/useExercisesApi.ts
  - el-templo-admin/src/pages/ExercisesPage.vue
  - el-templo-admin/src/pages/SessionEditPage.vue
  - el-templo-admin/src/types/exercise.ts
  - el-templo-admin/src/types/goal-plan.ts
  - el-templo-api/src/db/migrations/0078_exercise_equipment.sql
  - el-templo-api/src/db/schema/exercises.ts
  - el-templo-api/src/modules/admin/exercise-service.ts
  - el-templo-api/src/modules/admin/routes.ts
  - el-templo-api/src/modules/admin/video-schemas.ts
  - el-templo-api/src/modules/goal-plans/constants.ts
  - el-templo-api/src/modules/goal-plans/schemas.ts
  - el-templo-api/src/modules/goal-plans/types.ts
  - el-templo-api/test/admin/exercises-equipment.test.ts
  - el-templo-api/test/goal-plans/goal-plans.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 096: Code Review Report

**Reviewed:** 2026-04-08T15:52:01Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

This phase adds an `equipment` enum column to the exercises table and wires up the full tagging workflow: DB migration, Drizzle schema, admin CRUD endpoints (PATCH + bulk), frontend filter/inline-edit in ExercisesPage, and an equipment auto-tagging splash dialog in SessionEditPage triggered after approving a `full_body` goal plan day.

The migration, schema, and CRUD endpoints are clean and correct. The main risk is in `SessionEditPage.vue`: the splash dialog collects exercise IDs from `sessions.value` before the post-approve refresh resolves, and it overwrites equipment on exercises that are already correctly tagged. There are also two smaller quality issues in the test suite.

---

## Warnings

### WR-01: Equipment tagging splash uses stale session data after approve

**File:** `el-templo-admin/src/pages/SessionEditPage.vue:399-412`

**Issue:** `handleApproveDay` calls `refreshDay()` (async, not awaited) and then immediately calls `showEquipmentTaggingSplash()`. At the point `showEquipmentTaggingSplash()` runs, `sessions.value` still holds the pre-refresh data because `refreshDay()` has not resolved. If the refresh ever mutates session exercise data (e.g., a server-side re-render of blocks), the splash will show a stale exercise list and the subsequent bulk-update will target the wrong IDs.

More concretely: right now `refreshDay()` is non-destructive in terms of exercise IDs, so the stale snapshot is effectively the same as the fresh one. But the ordering is fragile — if `refreshDay()` is ever extended to replace sessions, the race will silently tag the wrong exercises.

```typescript
// Current (fragile):
refreshDay();                        // starts async, not awaited
adminStore.fetchPendingCount();
adminStore.checkSessionCoverage();
if (goalPlanType.value === 'full_body') {
  showEquipmentTaggingSplash();      // reads sessions.value before refreshDay resolves
}

// Fix — await the refresh first, then show the splash:
await refreshDay();
adminStore.fetchPendingCount();
adminStore.checkSessionCoverage();
if (goalPlanType.value === 'full_body') {
  showEquipmentTaggingSplash();
}
```

---

### WR-02: Bulk equipment tagging overwrites already-tagged exercises

**File:** `el-templo-admin/src/pages/SessionEditPage.vue:446-461`

**Issue:** `confirmEquipmentTagging` sends ALL exercise IDs from the day to `bulkUpdateEquipment`, including exercises that already have a non-null `equipment` value (e.g. `barras`, `anillas`). The backend `POST /admin/exercises/bulk-update-equipment` has no "skip if already tagged" guard — it unconditionally sets the field to the requested value. Pressing "Marcar como Ninguno" on a day that contains a barras exercise will silently flip it to `ninguno`.

This is a data correctness bug: the intent of the splash is to tag *untagged* exercises, not overwrite existing data.

```typescript
// Fix — filter to only exercises with no equipment before sending:
async function confirmEquipmentTagging() {
  taggingInProgress.value = true;
  try {
    // Only tag exercises that haven't been tagged yet
    const untaggedIds = splashExercises.value
      .filter((e) => e.equipment === null)   // requires adding equipment field to splashExercises
      .map((e) => e.exerciseId);

    if (untaggedIds.length === 0) {
      showEquipmentSplash.value = false;
      return;
    }

    const result = await exercisesApi.bulkUpdateEquipment(untaggedIds, 'ninguno');
    // ...
  }
}
```

To implement this fix, `splashExercises` needs to carry the current `equipment` value. Update `showEquipmentTaggingSplash` to include it:

```typescript
// In showEquipmentTaggingSplash — read equipment from block exercises:
exerciseMap.set(ex.exerciseId, { name: ex.exerciseName, equipment: ex.equipment ?? null });
// ...
splashExercises.value = Array.from(exerciseMap.entries()).map(
  ([exerciseId, { name, equipment }]) => ({ exerciseId, exerciseName: name, equipment }),
);
```

Note: this also requires `SessionExercise` type to expose the `equipment` field, which it currently does not. The simplest short-term fix is to apply the filter server-side by adding a `skipAlreadyTagged: true` option to the bulk endpoint.

---

### WR-03: Stale comment in goal-plans test — "8 types" vs actual 9

**File:** `el-templo-api/test/goal-plans/goal-plans.test.ts:179`

**Issue:** The `it` description reads `"returns all 8 goal plan types with correct structure"` but the assertion on line 189 checks `toHaveLength(9)`. `full_body` was added as the 9th type. The mismatch does not affect test execution but will mislead anyone reading the test output or failure messages.

```typescript
// Current:
it("returns all 8 goal plan types with correct structure", async () => {
  // ...
  expect(body.goalPlans).toHaveLength(9);

// Fix:
it("returns all 9 goal plan types with correct structure", async () => {
```

Additionally, the comment on line 205 `// Verify all 8 types are present` only asserts 8 of the 9 types — `full_body` is never asserted:

```typescript
// Add assertion for full_body:
expect(types).toContain("full_body");
```

---

## Info

### IN-01: `SessionExercise` type does not expose `equipment` field

**File:** `el-templo-admin/src/types/exercise.ts` and `el-templo-admin/src/pages/SessionEditPage.vue`

**Issue:** The `SessionExercise` interface (not in scope of this review, but referenced here) does not carry an `equipment` field. This prevents the splash dialog from knowing whether an exercise is already tagged without a separate API call. The current implementation always shows all exercises as candidates for tagging, even those already marked as `barras` or `anillas`. Adding the field to `SessionExercise` (and the underlying session detail API response) would enable WR-02's fix without a new endpoint.

**Fix:** Add `equipment: string | null` to `SessionExercise` and include it in the session detail query in the admin service.

---

### IN-02: `bulk-upload-urls` validates exercise IDs via full-table scan

**File:** `el-templo-api/src/modules/admin/routes.ts:1131-1134`

**Issue:** The `POST /admin/exercises/bulk-upload-urls` endpoint fetches all exercises from the DB with no WHERE clause (`fastify.db.select({ id }).from(schema.exercises)`) to build a set for validating the incoming IDs. As the exercise table grows this performs a full table scan on every bulk upload request.

This is pre-existing and unrelated to this phase, but the phase touches the same file. The fix is to use `inArray` to fetch only the IDs being validated:

```typescript
// Fix:
const existingExercises = await fastify.db
  .select({ id: schema.exercises.id })
  .from(schema.exercises)
  .where(inArray(schema.exercises.id, exerciseIds));
```

---

_Reviewed: 2026-04-08T15:52:01Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

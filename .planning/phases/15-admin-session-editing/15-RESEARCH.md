# Phase 15: Admin Session Editing - Research

**Researched:** 2026-02-06
**Domain:** Quasar Vue 3 Admin Session Editor, Exercise Swap, Prescription Editing, Format Change, Audit Trail
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Exercise Swap Experience
- Smart filtered list: show only exercises matching the slot's constraints (contraction type, scope)
- Filter by contraction type, sort by closest linear difficulty -- coach sees more options, best matches first
- Swap pool respects cross-route logic from 13-08: pattern_2 exercises included for non-INITIUM blocks based on intensity
- Each exercise in swap list shows: name, CON/EXC/ISO badge, linear difficulty number
- Pattern badge on each exercise indicating which pattern it comes from (e.g., pattern_1, pattern_2)
- One exercise swap at a time -- swap, see result, decide on next
- Inline swap button on each exercise card (no separate edit mode)
- Swap picker opens as a centered dialog/modal
- Swapped exercise gets re-prescribed by the algorithm within the block's budget (not inherited from original)

#### Edit Constraints & Validation
- Soft warnings throughout -- system shows warnings but allows coach override
- Contraction mix: display live contraction breakdown badge, turns red if mix violates intensity rules -- coach can override
- Exercise count: soft cap at 3 for non-INITIUM blocks with warning, coach can add more
- Format change: dropdown shows only compatible formats (compatibility score > 0) for the block/level/intensity, sorted by score
- Format change triggers automatic re-prescription of all exercises in the block
- Live validation: warnings update in real-time as coach makes changes
- Editing an approved session automatically reverts it to pending (needs re-approval)
- Full prescription editing: reps, sets, rest, tempo, notes, and format-specific rounds

#### Edit History & Audit Trail
- Simple log: record "Coach X edited session Y at time Z" -- no field-level detail
- Backend only -- stored in database for debugging/auditing, not surfaced in admin UI
- No manual "edited" flag -- log entries implicitly track this
- Full revert capability: "Reset to algorithm" button restores original generated state
- Original algorithm output stored as snapshot when first generated -- revert restores from snapshot

#### Member Preview
- Preview button in sessions list actions column AND in the edit page
- Opens a modal with simplified read-only representation of the session
- Not pixel-identical to member app -- shows same data (blocks, exercises, reps, format info) in clean layout
- Level-specific preview: dropdown to select which member level to preview

#### Format Handling & Reps Budget
- Visual budget bar showing current total reps vs original budget per block
- Single bar (no distinction between algorithm vs coach-modified reps)
- Color thresholds: green (within budget), yellow (within 10% over), red (more than 10% over)
- No auto-adjust when coach changes individual exercise reps -- budget bar reflects changes passively
- Format-specific parameters are fully editable: EMOM interval, AMRAP time cap, Complex rounds, etc.
- Format change auto-applies re-prescription with toast notification (no confirmation dialog)
- New exercises added to a block start with blank prescription -- coach fills in manually

### Claude's Discretion
- Exact modal layout and sizing for swap picker
- Search/filter UX within the swap dialog
- Snapshot storage mechanism (JSON column, separate table, etc.)
- Budget bar visual design and positioning
- Toast notification styling and duration
- Validation warning icon/color design

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Summary

This research covers implementing session editing capabilities on top of the existing Phase 14 admin session review UI. The admin app (`el-templo-admin/`) is a Quasar Vue 3 SPA communicating with the Fastify API (`el-templo-api/`). Phase 14 already established block-level swap from a pool of approved sessions. Phase 15 adds granular exercise-level editing: swapping individual exercises, modifying prescriptions (reps, seconds, rest, notes), changing block formats with automatic re-prescription, adding/removing exercises, budget visualization, validation warnings, edit audit logging, snapshot-based revert, and member preview.

The existing codebase provides strong foundations: the `session_prescriptions` table stores per-exercise data (reps, seconds, rest, notes, difficulty, sortOrder), the `format-prescribers.ts` module has format-specific prescription logic that can be extracted into a reusable service, the `format_compatibility` table drives format selection, the `contraction_rules` table defines valid contraction mixes per intensity, and the `exercises` table contains the full exercise database with contraction types (effort field), route, pattern, and linear difficulty (dificultadLineal). The admin service already handles session status transitions and block-level operations.

**Primary recommendation:** Extend the existing admin API with exercise-level CRUD endpoints and a prescribe-exercise service that reuses the pipeline's prescription logic. Add a `session_snapshots` table (JSON column) and a `session_edit_logs` table for audit trail. On the frontend, evolve the `BlockCard` and `ExerciseRow` components from read-only to editable, with inline edit controls and a swap dialog for exercise replacement.

## Standard Stack

### Core (Already in Place -- No New Dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Quasar Framework | ^2.18.x | UI components (QDialog, QLinearProgress, QSelect, QInput, QTooltip) | Already the project UI framework |
| Vue 3 | ^3.5+ | Reactivity, computed properties for live validation | Project standard |
| TypeScript | ^5.5+ | Type safety for complex edit state | Project standard |
| Pinia | ^2.2+ | Admin store for session edit state | Already used for auth + admin store |
| Axios | ^1.7+ | API communication | Already configured with auth interceptor |
| Drizzle ORM | mysql2 | Database operations | Project standard ORM |
| Fastify | ^4.x | API server | Project standard |

### Key Quasar Components for This Phase
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| QDialog | Exercise swap picker modal, member preview modal | User decided: centered dialog/modal |
| QLinearProgress | Reps budget bar per block | Budget visualization with color thresholds |
| QSelect | Format dropdown, contraction filter in swap dialog | Format change, swap filtering |
| QInput | Reps, seconds, rest, notes editing | Inline prescription editing |
| QBadge | Contraction mix indicator, pattern badges | Live validation display |
| QBtn (flat/dense) | Inline swap, edit, delete buttons per exercise | Exercise-level actions |
| QTooltip | Warning details, button labels | Soft warning explanations |
| QBanner/QChip | Validation warnings that persist | Contraction mix violations |
| Notify plugin | Toast notifications for format change, save success | User decided: toast for format re-prescription |

### No New NPM Dependencies Required
The existing Quasar component library and Drizzle ORM cover all needs. No additional packages needed.

## Architecture Patterns

### Backend: New API Endpoints Needed

Phase 14 established the pattern. Phase 15 extends with these new admin endpoints:

```
API Routes (extend el-templo-api/src/modules/admin/routes.ts):

Exercise Operations:
  GET    /admin/exercises/pool          # Exercise swap pool (filtered by contraction, route, pattern)
  POST   /admin/sessions/:id/blocks/:blockId/exercises/:exId/swap   # Swap single exercise
  POST   /admin/sessions/:id/blocks/:blockId/exercises              # Add exercise to block
  DELETE /admin/sessions/:id/blocks/:blockId/exercises/:exId        # Remove exercise from block

Prescription Editing:
  PATCH  /admin/sessions/:id/blocks/:blockId/exercises/:exId        # Update prescription fields
  POST   /admin/sessions/:id/blocks/:blockId/prescribe              # Re-prescribe all exercises in block

Block Operations:
  PATCH  /admin/sessions/:id/blocks/:blockId/format                 # Change block format (triggers re-prescribe)
  GET    /admin/formats/compatible                                  # Get compatible formats for block/level/intensity

Snapshot & Revert:
  POST   /admin/sessions/:id/reset                                  # Reset to algorithm snapshot
  GET    /admin/sessions/:id/snapshot                               # Get original snapshot (for comparison)

Preview:
  GET    /admin/sessions/:id/preview?memberLevel=sigma              # Get member-facing preview data
```

### Backend: Service Architecture

```
el-templo-api/src/modules/admin/
  service.ts           # Existing - extend with exercise-level methods
  edit-service.ts      # NEW: Session editing business logic
  prescribe-service.ts # NEW: Extracted prescription logic (reuses pipeline prescribers)
  routes.ts            # Existing - add new route handlers
  schemas.ts           # Existing - add new validation schemas
  types.ts             # Existing - extend with edit types
```

### Pattern 1: Prescribe Service (Extract from Pipeline)

**What:** Reusable prescription service that wraps the pipeline's format-prescribers for on-demand re-prescription.
**When to use:** Exercise swap (re-prescribe single exercise within budget), format change (re-prescribe all), adding new exercise.

The existing pipeline's `prescribeByFormat()` function in `format-prescribers.ts` and `generatePrescriptions()` in `stage-7-prescription.ts` contain the core logic. Extract this into a standalone service callable outside the full 7-stage pipeline.

```typescript
// el-templo-api/src/modules/admin/prescribe-service.ts
import { prescribeByFormat } from '../sessions/pipeline/format-prescribers';
import {
  roundToNearest5,
  calculateInverseDifficultyWeights,
  MIN_REPS_PER_EXERCISE,
} from '../sessions/pipeline/utils/reps-calculator';
import { REST_TIMES, ISO_SECONDS } from '../sessions/pipeline/utils/constants';
import type { SelectedExercise, ExercisePrescription } from '../sessions/types';

interface PrescribeBlockInput {
  exercises: SelectedExercise[];
  repsBudget: number;
  intensity: number;
  formatName: string;
}

/**
 * Re-prescribe exercises for a block using the algorithm's logic.
 * Reuses format-prescribers from the generation pipeline.
 * Called when: exercise swap, format change, "reset to algorithm" with new exercises.
 */
export function prescribeBlock(input: PrescribeBlockInput): ExercisePrescription[] {
  const restTime = calculateRest(input.intensity);

  // Try format-specific prescription first
  const formatResult = prescribeByFormat(input.formatName, {
    exercises: input.exercises,
    repsBudget: input.repsBudget,
    intensity: input.intensity,
    restTime,
  });

  if (formatResult) return formatResult;

  // Fall back to standard inverse difficulty distribution
  // (same logic as stage-7-prescription.ts)
  const weights = calculateInverseDifficultyWeights(input.exercises);
  // ... standard allocation logic
}

function calculateRest(intensity: number): number {
  if (intensity <= 30) return REST_TIMES.WARMUP;
  if (intensity <= 50) return REST_TIMES.SHORT;
  if (intensity <= 70) return REST_TIMES.MEDIUM;
  if (intensity <= 85) return REST_TIMES.LONG;
  return REST_TIMES.MAX;
}
```

### Pattern 2: Exercise Pool Query (Swap Candidates)

**What:** Query exercises matching a slot's constraints for the swap picker.
**When to use:** When coach clicks swap button on an exercise.

The pool must respect:
1. Same contraction type as the exercise being replaced (or filter by contraction in UI)
2. Same route as the block (unless cross-route from pattern_2 for non-INITIUM blocks)
3. Linear difficulty sorted by proximity to original exercise
4. Exclude exercises already in the block

```typescript
// el-templo-api/src/modules/admin/edit-service.ts
import { exercises } from '../../db/schema';
import { eq, and, notInArray, ne, asc } from 'drizzle-orm';

interface ExercisePoolQuery {
  route: string;                    // Block's route
  contraction?: string;             // Filter by contraction type (CON/EXC/ISO)
  memberLevel: string;              // For difficulty range
  excludeExerciseIds: number[];     // Already in the block
  pattern2?: string | null;         // Cross-route pattern for non-INITIUM
  blockRole: string;                // INITIUM has no cross-route
  intensity: number;                // For cross-route inclusion rules
  targetDifficulty?: number;        // Sort by proximity to this difficulty
}

async function getExercisePool(query: ExercisePoolQuery) {
  // 1. Query exercises from block's route matching constraints
  // 2. If non-INITIUM and pattern2 exists, also include cross-route exercises
  // 3. Sort by |dificultadLineal - targetDifficulty| ASC (closest first)
  // 4. Each result includes: id, name, contraction, dificultadLineal, pattern, route
}
```

### Pattern 3: Snapshot for Revert

**What:** Store original algorithm output as JSON snapshot when session is first generated.
**When to use:** "Reset to algorithm" button restores from snapshot.

**Recommendation: JSON column on sessions table** (Claude's discretion area).

Rationale: A separate table adds join complexity for a 1:1 relationship. A JSON column on `sessions` is simpler -- the snapshot is only read when reverting. The snapshot stores the complete session structure (blocks + prescriptions) as generated by the algorithm.

```typescript
// DB schema addition: add snapshot_json column to sessions table
// sessions.ts
snapshotJson: json('snapshot_json'), // Stores original algorithm output

// When generating a session (in admin/service.ts generateWeek):
// After saving, store the snapshot
await db.update(sessions)
  .set({ snapshotJson: serializeSessionSnapshot(session) })
  .where(eq(sessions.id, sessionId));
```

Alternative considered: separate `session_snapshots` table. This is cleaner from a normalization perspective but adds an unnecessary join for a simple feature. JSON column is the better choice for a 1:1 optional blob.

### Pattern 4: Edit Audit Log Table

**What:** Simple audit log recording who edited what session and when.
**When to use:** Every edit operation (swap, prescription change, format change, add/remove exercise, revert).

```typescript
// New schema: el-templo-api/src/db/schema/session-edit-logs.ts
export const sessionEditLogs = mysqlTable('session_edit_logs', {
  id: int('id').primaryKey().autoincrement(),
  sessionId: int('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  userId: int('user_id').notNull().references(() => users.id),
  action: varchar('action', { length: 50 }).notNull(),
  // action values: 'exercise_swap', 'prescription_edit', 'format_change',
  //   'exercise_add', 'exercise_remove', 'reset_to_algorithm', 'status_change'
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('session_edit_logs_session_idx').on(table.sessionId),
]);
```

Per CONTEXT.md: simple log, no field-level detail, backend only, not surfaced in UI.

### Pattern 5: Auto-Revert to Pending on Edit

**What:** When an approved session is edited, automatically change status back to `pending_review`.
**When to use:** Any edit operation on an approved session.

```typescript
// In edit service, wrap every edit operation:
async function withAutoRevert(sessionId: number, userId: number, action: string, editFn: () => Promise<void>) {
  // Get current status
  const [session] = await db.select({ status: sessions.status }).from(sessions).where(eq(sessions.id, sessionId));

  // Execute the edit
  await editFn();

  // If was approved, revert to pending
  if (session?.status === 'approved') {
    await db.update(sessions)
      .set({ status: 'pending_review', approvedAt: null, approvedBy: null, approvedBySystem: false })
      .where(eq(sessions.id, sessionId));
  }

  // Log the edit
  await db.insert(sessionEditLogs).values({ sessionId, userId, action });
}
```

### Pattern 6: Live Validation (Frontend)

**What:** Computed properties that derive validation warnings from current session state.
**When to use:** Real-time feedback as coach makes changes.

```typescript
// composables/useBlockValidation.ts
export function useBlockValidation(block: Ref<SessionBlock>) {
  // Contraction mix validation
  const contractionBreakdown = computed(() => {
    const counts = { CON: 0, EXC: 0, ISO: 0 };
    for (const ex of block.value.exercises) {
      const type = ex.contraction?.toUpperCase();
      if (type in counts) counts[type as keyof typeof counts]++;
    }
    return counts;
  });

  // Compare against contraction_rules for this intensity
  const contractionWarning = computed(() => {
    // Fetch expected mix from API or local cache
    // Return warning text if mismatch
  });

  // Exercise count warning
  const exerciseCountWarning = computed(() => {
    if (block.value.role !== 'INITIUM' && block.value.exercises.length > 3) {
      return `${block.value.exercises.length} ejercicios (recomendado: 3)`;
    }
    return null;
  });

  // Budget status
  const budgetStatus = computed(() => {
    const totalReps = block.value.exercises.reduce((sum, ex) => sum + (ex.reps || 0), 0);
    const budget = block.value.repsBudget;
    const ratio = totalReps / budget;
    if (ratio <= 1.0) return 'green';
    if (ratio <= 1.1) return 'yellow';
    return 'red';
  });

  return { contractionBreakdown, contractionWarning, exerciseCountWarning, budgetStatus };
}
```

### Frontend Component Structure

```
el-templo-admin/src/
  components/sessions/
    BlockCard.vue              # EXTEND: add format dropdown, budget bar, add-exercise button
    ExerciseRow.vue            # EXTEND: add swap, edit, delete buttons, inline editing
    ExerciseSwapDialog.vue     # NEW: centered modal for exercise swap picker
    PrescriptionEditor.vue     # NEW: inline fields for reps/seconds/rest/notes editing
    BudgetBar.vue              # NEW: QLinearProgress with color thresholds
    ContractionBadge.vue       # NEW: live contraction breakdown display
    MemberPreviewDialog.vue    # NEW: modal showing member-facing session view
    ValidationWarnings.vue     # NEW: displays soft warnings for block
  composables/
    useSessionsApi.ts          # EXTEND: add exercise CRUD, format change, prescribe APIs
    useBlockValidation.ts      # NEW: computed validation for contraction mix, count, budget
    useEditSession.ts          # NEW: reactive session edit state management
  pages/
    SessionDetailPage.vue      # EXTEND: add edit capabilities, preview button, reset button
```

### Anti-Patterns to Avoid

- **Full page reload after each edit:** Use optimistic UI updates. After a successful API call, update local reactive state directly rather than refetching the entire session. Only reload on error or complex operations (format change, reset).

- **Mixing view and edit state:** Keep edit state separate from display state. Use a composable like `useEditSession` that wraps the session data and tracks dirty state.

- **Running full pipeline for single exercise re-prescription:** Extract and reuse only the prescription logic (stage 7 + format-prescribers). Do not run stages 1-6 just to re-prescribe.

- **Storing snapshots redundantly:** The `traceJson` column already captures generation decisions but NOT the final prescription values. The snapshot must store the actual blocks + prescriptions, not just the trace.

- **Hard validation blocking saves:** Per CONTEXT.md, all validations are soft warnings. Never prevent a save based on validation -- always allow coach override.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Budget bar visualization | Custom div/progress bar | QLinearProgress | Built-in color, size, label support |
| Exercise filter/search in swap dialog | Custom list filtering | QSelect with filter + QInput search | Quasar autocomplete handles debounce, highlight |
| Format dropdown with scores | Custom dropdown | QSelect with option-label slot | Show format name + compatibility score |
| Toast notifications | Custom notification | Quasar Notify plugin | Already used in Phase 14, consistent styling |
| Confirmation dialogs | Custom modal | Quasar Dialog plugin | Promise-based, already used in Phase 14 |
| Prescription reps distribution | Custom math | Reuse `prescribeByFormat` + `calculateInverseDifficultyWeights` | Algorithm's own logic, handles all 15+ formats |
| Contraction rule lookup | Custom contraction logic | Query `contraction_rules` table | Rules are data-driven, already in DB |
| Format compatibility filtering | Hardcoded format lists | Query `format_compatibility` table | Rules are data-driven, already in DB |

**Key insight:** The existing pipeline's prescription logic and DB-driven rules (contraction_rules, format_compatibility, intensity_rules) must be reused, not reimplemented. The admin editing layer is a thin wrapper around these same rules with soft validation instead of hard enforcement.

## Common Pitfalls

### Pitfall 1: Snapshot Not Created on Generation
**What goes wrong:** "Reset to algorithm" has nothing to restore from because snapshot was never saved.
**Why it happens:** Snapshot storage is added to the edit phase but generation happens in the generate phase -- easy to forget the snapshot capture on the generation path.
**How to avoid:** Add snapshot storage to `AdminSessionService.generateWeek()` immediately after `sessionService.saveSession()`. This must be done in a migration task early in the phase.
**Warning signs:** Reset button throws 404 or returns empty data.

### Pitfall 2: Re-Prescription Drift from Algorithm
**What goes wrong:** The `prescribeBlock` service produces different prescriptions than the original pipeline for the same inputs.
**Why it happens:** Duplicating prescription logic instead of importing from the pipeline. Over time, the two diverge.
**How to avoid:** Import `prescribeByFormat` and `generatePrescriptions` directly from the pipeline modules. The prescribe service should be a thin wrapper, not a reimplementation.
**Warning signs:** "Reset to algorithm" produces different results than original generation.

### Pitfall 3: Stale Format Compatibility Cache
**What goes wrong:** Format dropdown shows incompatible formats, or misses newly added formats.
**Why it happens:** Caching format compatibility data on the frontend without invalidation.
**How to avoid:** Always fetch format compatibility from the API when opening the dropdown. The `format_compatibility` table is small (query is fast). No client-side caching needed.
**Warning signs:** Coach selects format not in compatibility table.

### Pitfall 4: Race Conditions on Concurrent Edits
**What goes wrong:** Two coaches editing the same session overwrite each other's changes.
**Why it happens:** No optimistic concurrency control -- last write wins silently.
**How to avoid:** While CONTEXT.md does not require locking, use `updatedAt` timestamp comparison on the session. Return 409 Conflict if session was modified since the client loaded it. This is simple and prevents data loss.
**Warning signs:** Coach saves changes but refreshing shows different data.

### Pitfall 5: Budget Bar Calculation Ignoring Seconds-Based Exercises
**What goes wrong:** Budget bar shows incorrect totals because ISO/time-based exercises have 0 reps.
**Why it happens:** Budget bar sums `reps` field but ISO exercises use `seconds`, AMRAP/Tabata have 0 reps.
**How to avoid:** Budget bar should only count non-ISO exercise reps (same as the pipeline's budget allocation logic which skips ISO exercises). Display a note that time-based exercises are excluded from budget calculation.
**Warning signs:** Budget bar shows red even when reps match budget exactly (due to including 0-rep entries).

### Pitfall 6: Format Change Without Re-Prescription Feedback
**What goes wrong:** Coach changes format, prescriptions change silently, coach doesn't notice.
**Why it happens:** Per CONTEXT.md, format change triggers auto-prescription with toast (no dialog). If the toast is too subtle, coaches miss the represcription.
**How to avoid:** Make the toast informative: "Formato cambiado a AMRAP. Prescripciones recalculadas." Show the budget bar updating. Briefly highlight changed fields.
**Warning signs:** Coaches reporting "my changes disappeared" after format change.

### Pitfall 7: Missing Pattern Badge Data
**What goes wrong:** Exercise swap dialog cannot show which pattern an exercise belongs to.
**Why it happens:** The `exercises` table has a `pattern` column but it contains the full pattern string (e.g., "Empuje Horizontal"), not a simple "pattern_1" / "pattern_2" label. The block context's `pattern` and `pattern2` fields define which patterns are in play.
**How to avoid:** When building the swap pool, compare each exercise's `pattern` against the block's `pattern` (primary) and `pattern2` (cross-route). Label exercises accordingly. Exercises from `pattern2` get a "pattern_2" badge.
**Warning signs:** All exercises show the same pattern badge or no badge at all.

## Code Examples

### Budget Bar Component
```vue
<!-- components/sessions/BudgetBar.vue -->
<template>
  <div class="budget-bar q-mb-sm">
    <div class="row items-center q-gutter-xs text-caption">
      <span>Reps:</span>
      <strong>{{ currentReps }}</strong>
      <span class="text-grey">/</span>
      <span class="text-grey">{{ budget }}</span>
    </div>
    <q-linear-progress
      :value="ratio"
      :color="barColor"
      size="8px"
      rounded
      class="q-mt-xs"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  currentReps: number;
  budget: number;
}>();

const ratio = computed(() =>
  props.budget > 0 ? Math.min(props.currentReps / props.budget, 1.5) : 0
);

const barColor = computed(() => {
  const r = props.budget > 0 ? props.currentReps / props.budget : 0;
  if (r <= 1.0) return 'positive';  // green: within budget
  if (r <= 1.1) return 'warning';   // yellow: within 10% over
  return 'negative';                 // red: more than 10% over
});
</script>
```

### Exercise Swap Dialog Structure
```vue
<!-- components/sessions/ExerciseSwapDialog.vue -->
<template>
  <q-dialog v-model="modelValue" persistent>
    <q-card style="width: 600px; max-width: 90vw; max-height: 80vh">
      <q-card-section class="row items-center">
        <div class="text-h6">Cambiar Ejercicio</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <!-- Current exercise info -->
      <q-card-section class="q-pt-none">
        <div class="text-caption text-grey">Reemplazando:</div>
        <div class="text-body2">
          {{ currentExercise.exerciseName }}
          <q-badge :color="contractionColor(currentExercise.contraction)">
            {{ currentExercise.contraction }}
          </q-badge>
          <span class="text-caption q-ml-sm">Dif: {{ currentExercise.dificultadLineal }}</span>
        </div>
      </q-card-section>

      <!-- Filters -->
      <q-card-section class="q-pt-none">
        <div class="row q-gutter-sm">
          <q-select
            v-model="contractionFilter"
            :options="['Todos', 'CON', 'EXC', 'ISO']"
            label="Tipo"
            dense
            outlined
            style="min-width: 120px"
          />
          <q-input
            v-model="searchText"
            label="Buscar ejercicio"
            dense
            outlined
            clearable
            class="col"
          />
        </div>
      </q-card-section>

      <!-- Exercise pool list -->
      <q-card-section class="scroll" style="max-height: 400px">
        <q-list separator>
          <q-item
            v-for="ex in filteredPool"
            :key="ex.id"
            clickable
            @click="selectExercise(ex)"
          >
            <q-item-section>
              <q-item-label>{{ ex.exercise }}</q-item-label>
              <q-item-label caption>
                <q-badge :color="contractionColor(ex.effort)" class="q-mr-xs">
                  {{ contractionLabel(ex.effort) }}
                </q-badge>
                <q-badge outline color="grey" class="q-mr-xs">
                  {{ ex.patternSource }}
                </q-badge>
                Dif: {{ ex.dificultadLineal }}
              </q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>
```

### Format Change with Re-Prescription
```typescript
// composables/useSessionsApi.ts -- new method
async function changeBlockFormat(
  sessionId: number,
  blockId: number,
  formatId: number
): Promise<SessionBlock> {
  const { data } = await api.patch<SessionBlock>(
    `/admin/sessions/${sessionId}/blocks/${blockId}/format`,
    { formatId }
  );
  return data; // Returns block with re-prescribed exercises
}
```

```typescript
// Backend: admin/edit-service.ts
async changeBlockFormat(sessionId: number, blockId: number, formatId: number, userId: number) {
  // 1. Get block with exercises
  const block = await this.getBlockWithExercises(blockId);

  // 2. Get format name from formats table
  const [format] = await this.db.select().from(schema.formats).where(eq(schema.formats.id, formatId));

  // 3. Build exercise list for re-prescription
  const selectedExercises = block.exercises.map(ex => ({
    exerciseId: ex.exerciseId,
    name: ex.exerciseName,
    contraction: ex.contraction as 'CON' | 'EXC' | 'ISO',
    difficulty: ex.difficulty ?? 1,
  }));

  // 4. Re-prescribe using extracted pipeline logic
  const prescriptions = prescribeBlock({
    exercises: selectedExercises,
    repsBudget: block.repsBudget,
    intensity: block.intensity,
    formatName: format.name,
  });

  // 5. Update block format
  await this.db.update(schema.sessionBlocks)
    .set({ formatId, formatName: format.name })
    .where(eq(schema.sessionBlocks.id, blockId));

  // 6. Replace prescriptions
  await this.replacePrescriptions(blockId, prescriptions);

  // 7. Auto-revert to pending if approved + log edit
  await this.withAutoRevert(sessionId, userId, 'format_change');

  return this.getBlockWithExercises(blockId);
}
```

### Snapshot Creation (During Generation)
```typescript
// In admin/service.ts generateWeek, after saveSession:
interface SessionSnapshot {
  blocks: Array<{
    blockId: string;
    role: string;
    route: string;
    pattern: string;
    intensity: number;
    repsBudget: number;
    formatId: number;
    formatName: string;
    exerciseCount: number;
    exercises: Array<{
      exerciseId: number;
      exerciseName: string;
      contraction: string;
      reps: number;
      seconds: number;
      rest: number;
      notes: string | null;
      difficulty: number | null;
      sortOrder: number;
    }>;
  }>;
}

// After saving session:
const snapshot: SessionSnapshot = {
  blocks: session.blocks.map((block, blockIdx) => ({
    blockId: block.blockId,
    role: block.role,
    route: block.route,
    pattern: block.pattern,
    intensity: block.intensity,
    repsBudget: block.repsBudget,
    formatId: block.format.formatId,
    formatName: block.format.name,
    exerciseCount: block.exercises.length,
    exercises: block.exercises.map((ex, exIdx) => ({
      exerciseId: ex.exerciseId,
      exerciseName: ex.name,
      contraction: ex.contraction,
      reps: ex.reps,
      seconds: ex.seconds,
      rest: ex.rest,
      notes: ex.notes ?? null,
      difficulty: ex.dificultadLineal ?? null,
      sortOrder: exIdx,
    })),
  })),
};

await db.update(sessions)
  .set({ snapshotJson: snapshot })
  .where(eq(sessions.id, sessionId));
```

### Member Preview Data Structure
```typescript
// The preview endpoint returns a simplified view of the session
// organized the way the member app displays it
interface MemberPreview {
  day: string;
  blocks: Array<{
    name: string;          // Block role display name
    format: string;        // Format name
    formatNotes: string;   // e.g., "AMRAP - complete max rounds"
    exercises: Array<{
      name: string;
      prescription: string;  // "15 reps" or "30 segundos"
      rest: string;          // "60s descanso"
      notes: string | null;
    }>;
  }>;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 14: Block-level swap only | Phase 15: Exercise-level editing | This phase | Granular control for coaches |
| No snapshot storage | JSON snapshot on generation | This phase | Enables full revert capability |
| No edit audit trail | session_edit_logs table | This phase | Debugging/auditing capability |
| Read-only BlockCard | Editable BlockCard with inline controls | This phase | Evolve existing component |

## Open Questions

1. **Existing sessions lack snapshots**
   - What we know: Sessions generated before Phase 15 will have no `snapshot_json` data
   - What's unclear: Should "Reset to algorithm" regenerate the session if no snapshot exists?
   - Recommendation: For sessions without snapshots, either hide the reset button or offer "Regenerate from algorithm" which runs the full pipeline. Migration could backfill snapshots by re-running generation, but this is fragile if SPOM rules changed. Simplest: show reset button only when snapshot exists.

2. **Session prescription columns: `sets` and `tempo` are not in the schema**
   - What we know: CONTEXT.md mentions "reps, sets, rest, tempo, notes" editing. Current `session_prescriptions` table only has: reps, seconds, rest, notes, difficulty, sortOrder. No `sets` or `tempo` columns.
   - What's unclear: Whether `sets` and `tempo` need to be added to the schema or if "sets" is handled differently (e.g., rounds in format params).
   - Recommendation: Add `sets` (int, default 1) and `tempo` (varchar, nullable) columns to `session_prescriptions` via migration. Sets defaults to 1 for single-set formats, coach can edit for multi-set work. Tempo is a string like "3-1-2" (eccentric-pause-concentric).

3. **Format-specific parameters storage**
   - What we know: CONTEXT.md requires editing "EMOM interval, AMRAP time cap, Complex rounds." These are currently not stored as separate fields -- they are implicit in the format name and prescription notes.
   - What's unclear: Whether to add structured format parameter columns to `session_blocks` or store as JSON.
   - Recommendation: Add `format_params` JSON column to `session_blocks`. Store as `{ "timeCap": 12, "interval": 60, "rounds": 4 }`. This is flexible for all format variations without adding many nullable columns.

4. **Level-specific preview mechanics**
   - What we know: CONTEXT.md wants a dropdown to select which member level to preview. But each session is already generated for a specific member level (e.g., W1-lunes-sigma).
   - What's unclear: Whether "level-specific preview" means viewing the same session but with different level display, or actually loading a different level's session.
   - Recommendation: The dropdown switches between sessions of different member levels for the same week/day/levelGroup. For example, for a sigma session, the preview dropdown might show sigma as current and also allow viewing omega (from the same levelGroup). This is just loading a different session by dayId.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `el-templo-api/src/modules/admin/service.ts` - Admin service patterns
- Existing codebase: `el-templo-api/src/modules/admin/routes.ts` - Admin API route patterns
- Existing codebase: `el-templo-api/src/modules/sessions/pipeline/format-prescribers.ts` - All 15+ format prescribers
- Existing codebase: `el-templo-api/src/modules/sessions/pipeline/stage-7-prescription.ts` - Prescription generation logic
- Existing codebase: `el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts` - Exercise selection with cross-route logic
- Existing codebase: `el-templo-api/src/db/schema/` - All table schemas (sessions, session_blocks, session_prescriptions, exercises, formats, format_compatibility, contraction_rules, intensity_rules)
- Existing codebase: `el-templo-admin/src/` - Admin app components, composables, types
- Phase 14 RESEARCH.md - Quasar component patterns, architecture decisions

### Secondary (MEDIUM confidence)
- Quasar QLinearProgress documentation - Budget bar component
- Quasar QDialog documentation - Modal patterns for swap picker and preview
- Quasar Notify plugin - Toast notification patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Same stack as Phase 14, no new dependencies
- Architecture: HIGH - Direct extension of existing codebase patterns, all code reviewed
- Prescription reuse: HIGH - Pipeline code inspected, extraction path is clear
- Database schema extensions: HIGH - Schema structure understood, migration path clear
- Frontend patterns: HIGH - Existing components reviewed, extension path is clear
- Pitfalls: HIGH - Identified from actual codebase review (snapshot gap, ISO budget, format params)

**Research date:** 2026-02-06
**Valid until:** 60 days (stable Quasar/Drizzle patterns, internal codebase)

# Phase 17: Per-Block Mobility Exercises - Research

**Researched:** 2026-02-12
**Domain:** Full-stack feature — session generation pipeline, DB schema, API, admin UI, member app, PDF
**Confidence:** HIGH

## Summary

Phase 17 adds one mobility exercise ("Descanso Activo") per non-INITIUM block. This is a well-scoped full-stack feature that touches six layers: (1) the session generation pipeline adds a mobility selection stage, (2) the DB adds an `exercise_type` discriminator column to `session_prescriptions`, (3) the API response includes mobility exercises separately from main exercises, (4) the admin panel shows mobility in a labeled section with swap-only editing, (5) the member app displays a non-interactive "Descanso Activo" section, and (6) the PDF replaces hardcoded mobility text with real data.

The existing codebase already has strong foundations: `ROUTE_TO_MOBILITY_ROUTES` mapping exists, `mobilityRelated` column on exercises provides route context, the PDF builder already renders a `MOVILIDAD` row per block, and the exercises table contains `MOVILIDAD` pattern exercises. The main work is wiring these pieces together through the pipeline and adding the `exercise_type` discriminator to separate mobility from main exercises at every layer.

**Primary recommendation:** Add an `exercise_type` enum column (`'main' | 'mobility'`) to `session_prescriptions`, add a post-pipeline mobility selection step in the session generation service, and use the discriminator to split exercises in all downstream consumers (API, admin, member app, PDF).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Member App Display
- "Descanso Activo" appears as a **separate section at the end of each block**, after the last main exercise, before block-complete action
- Uses the same exercise card style as main exercises, with a "Descanso Activo" label above
- Reuses the **existing video placeholder** component for showing exercise demonstration
- **Display only** — no completion tracking, no checkmark, no interaction. Member sees it and does it on their own
- Does NOT block auto-advance or block completion

#### Admin Editing Rules
- **Exactly 1 mobility exercise per non-INITIUM block** — pipeline generates 1, coach can swap but NOT add a second
- **Not removable** — every non-INITIUM block must always have exactly 1 mobility exercise, coach can only swap it
- Admin block cards show "Descanso Activo" section with **same visual treatment as member app** (labeled section at bottom of block card)
- Swap dialog shows **route-relevant mobility exercises first**, with option to see all mobility exercises

#### Prescription Defaults
- Prescription style determined by **contraction type**: ISO = seconds, CON = reps (validated against examples.txt)
- Default values **inferred from examples.txt data** (e.g., 20'' for time-based, 6-10 for rep-based)
- **Intensity does NOT affect mobility prescription** — same prescription regardless of block intensity (mobility is active rest)
- **Same mobility for all levels** — not level-specific, universal across Alfa/Delta/Sigma/Omega/Spartan

#### PDF Mobility Rendering
- PDF already has a **hardcoded "movilidad" row** correctly placed in each block — replace hardcoded text with actual mobility exercise name and prescription
- No structural PDF changes needed, just data substitution

#### Mobility Exercise Selection Logic
- Mobility exercises identified by **pattern = 'MOVILIDAD'** in exercises table
- Route-to-mobility mapping uses `mobilityRelated` column as starting point, but **examples.txt provides ground truth** for edge cases
- The SPOM route for each block determines which mobility exercises are relevant
- Existing `ROUTE_TO_MOBILITY_ROUTES` mapping should be **validated and refined** using examples.txt + exercises table cross-reference
- When multiple valid mobility exercises exist for a route: **random selection** from the valid pool
- Coaches can then swap to any related mobility exercise in admin panel

### Claude's Discretion
- PDF mobility row text format (exercise name + prescription representation)
- Exact swap dialog filtering UX (reuse existing ExerciseSwapDialog with mode/filter, or separate component)
- How to handle routes with no mapped mobility exercises (fallback strategy)
- Internal pipeline stage placement (where in the 9-stage pipeline mobility selection occurs)

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

## Standard Stack

### Core (Already in Use)
| Library | Version | Purpose | Already Used |
|---------|---------|---------|--------------|
| Drizzle ORM | 0.45.1 | DB schema, migrations, queries | Yes - all DB operations |
| Fastify | 5.7.1 | API routes and responses | Yes - session routes |
| Vue 3 + Quasar | Latest | Admin + member app UI | Yes - all frontend |
| pdfmake | Latest | Client-side PDF generation | Yes - session-pdf-builder.ts |

### No New Libraries Needed
This phase uses exclusively existing stack components. No new npm packages required.

## Architecture Patterns

### Pattern 1: Exercise Type Discriminator Column
**What:** Add `exercise_type` column to `session_prescriptions` to distinguish main exercises from mobility exercises at the data layer.

**Why this approach:** The system currently treats all prescriptions in a block as equivalent. The mobility exercise is fundamentally different (no completion tracking, different editing rules, different display treatment). A discriminator column is the cleanest way to separate them at every layer without restructuring.

**Schema change:**
```sql
ALTER TABLE session_prescriptions
ADD COLUMN exercise_type VARCHAR(10) NOT NULL DEFAULT 'main';
-- Values: 'main' or 'mobility'
```

**Drizzle schema:**
```typescript
// session-prescriptions.ts
export const sessionPrescriptions = mysqlTable('session_prescriptions', {
  // ... existing columns ...
  exerciseType: varchar('exercise_type', { length: 10 }).notNull().default('main'),
  // Values: 'main' | 'mobility'
}, /* ... */);
```

**Why not a separate table:** The mobility exercise shares the exact same structure as main exercises (exerciseId, name, contraction, reps, seconds, rest, notes). A separate table would duplicate the schema and complicate joins. The discriminator keeps the single-table simplicity while enabling filtering.

### Pattern 2: Post-Pipeline Mobility Selection
**What:** Add mobility selection AFTER the 7-stage pipeline completes, as a separate step in `SessionGeneratorService.generateDailySession()`.

**Why this approach:**
- The 7-stage pipeline is designed for main exercise selection (route-based, budget-driven, difficulty-weighted)
- Mobility selection uses completely different logic (pattern='MOVILIDAD', route-based filtering, random pick from pool, fixed prescription)
- Adding it as a pipeline stage would complicate the context types and violate the stage contract
- The service already orchestrates block generation; adding a post-pipeline step per block is natural

**Implementation sketch:**
```typescript
// In SessionGeneratorService.generateDailySession()
for (const role of blockRoles) {
  // ... existing pipeline run ...
  const blockPlan = await runBlockPipeline(initialContext, ...);

  // Add mobility exercise for non-INITIUM blocks
  if (role !== 'INITIUM') {
    const mobilityExercise = await this.selectMobilityExercise(
      blockPlan.route, // block's SPOM route
      db
    );
    blockPlan.mobilityExercise = mobilityExercise; // or add to exercises array with type discriminator
  }

  blocks.push(blockPlan);
}
```

### Pattern 3: API Response Separation
**What:** The API response includes mobility exercises in a distinct field per block, separate from the main `exercises` array.

**Approach options:**
1. **Add `mobilityExercise` field to block response** (recommended) — Clean separation, clients know exactly what is mobility
2. **Keep in `exercises` array with `exerciseType` field** — Requires client-side filtering but simpler API change

**Recommendation: Option 1** — Add a `mobilityExercise` field to the block response. This makes it impossible for clients to accidentally render mobility as main exercise or vice versa. Both admin and member app can consume it directly.

```typescript
// In sessionToResponse()
blocks: session.blocks.map((block, idx) => ({
  // ... existing fields ...
  exercises: block.exercises.filter(e => e.exerciseType !== 'mobility').map(...),
  mobilityExercise: block.exercises.find(e => e.exerciseType === 'mobility')
    ? { /* mobility fields */ }
    : null,
})),
```

### Pattern 4: Admin Mobility Swap Dialog
**What:** Reuse the existing `ExerciseSwapDialog` component with a `mobility` mode that filters exercises by `pattern = 'MOVILIDAD'`.

**Why reuse:** The ExerciseSwapDialog already supports filtering by category, contraction type, and search. For mobility mode:
- Override the pool fetch to query `pattern = 'MOVILIDAD'` exercises
- Sort route-relevant exercises first (using ROUTE_TO_MOBILITY_ROUTES)
- Keep the same UI (click to swap, contraction filter, search)
- Hide "add" and "remove" actions (mobility is swap-only)

**Implementation:** Add a `mobilityMode` prop to ExerciseSwapDialog. When true:
- fetchPool queries `pattern = 'MOVILIDAD'` from exercises table instead of the normal route-based pool
- Exercises related to block route appear first
- All other MOVILIDAD exercises appear below (option to see all)

### Pattern 5: PDF Data Substitution
**What:** Replace the hardcoded `'ASSISTED SPAGAT DELTA 20"'` fallback in `session-pdf-builder.ts` with real mobility data from the block.

**Current code (lines 371-373 of session-pdf-builder.ts):**
```typescript
const mobilityText = block.mobility || 'ASSISTED SPAGAT DELTA 20"';
content.push({
  text: `MOVILIDAD  ·  ${mobilityText}`,
  // ...
});
```

**The `PdfBlockPage.mobility` field already exists** (line 28 of pdf-types.ts):
```typescript
mobility?: string; // e.g., "ASSISTED SPAGAT DELTA 20\""
```

**Fix:** The `session-data-transformer.ts` needs to populate `mobility` from the block's mobility exercise data. Currently it doesn't set this field. The format should be: `"EXERCISE_NAME PRESCRIPTION"` (e.g., `"COUCH STRETCH 20\""` or `"PCK AROUND THE WORLD 10"`).

### Anti-Patterns to Avoid
- **Don't add mobility to the SPOM pipeline stages:** The 7-stage pipeline is for main exercises. Mobility has different selection logic (no budget, no difficulty weighting).
- **Don't store mobility in a separate table:** Same structure as prescriptions; a discriminator column is simpler.
- **Don't make mobility exercises interactive in member app:** User decision: display only, no completion tracking.
- **Don't allow adding/removing mobility in admin:** User decision: exactly 1 per non-INITIUM block, swap only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mobility exercise pool query | Custom SQL join | Drizzle query with `pattern = 'MOVILIDAD'` filter on `exercises` table | Consistent with existing exercise queries |
| Route-to-mobility mapping | New mapping table | Existing `ROUTE_TO_MOBILITY_ROUTES` + `mobilityRelated` column | Already implemented in Phase 13-04 |
| Random selection from pool | Custom randomization | `Math.random()` with `Math.floor` on the valid pool array | Simple, matches context decision for randomness |
| Mobility prescription defaults | Complex prescription engine | Hardcoded defaults from examples.txt analysis (20'' for ISO, 6-10 for CON) | Mobility is active rest, doesn't need the full budget/difficulty system |

## Common Pitfalls

### Pitfall 1: Migration Breaks Existing Sessions
**What goes wrong:** Adding `exercise_type` column with `NOT NULL DEFAULT 'main'` works for new rows, but existing sessions loaded from DB need to correctly set all existing rows as 'main'.
**Why it happens:** The migration applies DEFAULT for new inserts but existing rows need explicit UPDATE.
**How to avoid:** Migration SQL should include both ALTER TABLE and UPDATE:
```sql
ALTER TABLE session_prescriptions ADD COLUMN exercise_type VARCHAR(10) NOT NULL DEFAULT 'main';
-- All existing rows are already 'main' via DEFAULT, but be explicit:
UPDATE session_prescriptions SET exercise_type = 'main' WHERE exercise_type = '';
```
**Warning signs:** Existing sessions showing mobility sections with no data, or mobility exercises appearing in main exercise list.

### Pitfall 2: Algorithm Snapshot Doesn't Include Mobility
**What goes wrong:** The "Reset to Algorithm" feature restores from `sessions.algorithmSnapshot` JSON. If the snapshot doesn't include mobility exercises, resetting would lose them.
**Why it happens:** The snapshot is captured in `saveSession()`. Mobility exercises must be included in the snapshot with their `exercise_type` discriminator.
**How to avoid:** When saving session, include mobility exercises in the algorithmSnapshot with `exerciseType: 'mobility'`. When restoring, re-insert them with the correct type.

### Pitfall 3: ROUTE_TO_MOBILITY_ROUTES Mapping Gaps
**What goes wrong:** Some block routes may not have entries in `ROUTE_TO_MOBILITY_ROUTES`, resulting in no mobility exercise being selected.
**Why it happens:** The mapping was built for INITIUM contextual selection, not exhaustive per-block mobility selection.
**How to avoid:** Validate the mapping against examples.txt data. Implement a fallback: if no route-specific mobility exercises found, pick from the full MOVILIDAD pool randomly. Trace the fallback for visibility.

### Pitfall 4: Exercise Swap Dialog Pool Fetch Conflict
**What goes wrong:** The existing ExerciseSwapDialog fetches exercise pool via `editApi.fetchExercisePool()` which queries by route/pattern. Mobility exercises use a completely different query (pattern='MOVILIDAD').
**Why it happens:** The existing pool fetch is designed for main exercises, not mobility.
**How to avoid:** Add a separate API endpoint or mode parameter for mobility pool fetch. The endpoint should query exercises where `pattern = 'MOVILIDAD'`, sorted with route-relevant ones first.

### Pitfall 5: PDF Mobility Text Not Populated in Transformer
**What goes wrong:** The PDF shows "ASSISTED SPAGAT DELTA 20\"" (the hardcoded fallback) instead of the actual mobility exercise.
**Why it happens:** `session-data-transformer.ts` builds `PdfBlockPage` objects but never sets the `mobility` field.
**How to avoid:** In `buildGridPage()` and related transformer functions, extract the mobility exercise from the block data and format it as `"EXERCISE_NAME PRESCRIPTION"`.

### Pitfall 6: Sort Order Collision
**What goes wrong:** Mobility exercises inserted with sortOrder that conflicts with main exercises, causing display order issues.
**Why it happens:** Main exercises use sortOrder 0, 1, 2, etc. If mobility is inserted with the same numbering, sorting becomes ambiguous.
**How to avoid:** Give the mobility exercise a high sortOrder (e.g., 999) to ensure it always appears last. The `exercise_type` discriminator provides the primary separation; sortOrder within type is secondary.

## Code Examples

### Example 1: Mobility Exercise Selection Function
```typescript
// New file: el-templo-api/src/modules/sessions/pipeline/utils/mobility-selection.ts

import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, like, or } from 'drizzle-orm';
import * as schema from '../../../../db/schema';
import { ROUTE_TO_MOBILITY_ROUTES } from './mobility-routes';

interface MobilityExercise {
  exerciseId: number;
  name: string;
  contraction: string; // CON or ISO
  reps: number;
  seconds: number;
}

// Defaults derived from examples.txt analysis
const MOBILITY_DEFAULTS = {
  ISO_SECONDS: 20,  // Most ISO mobility exercises use 20''
  CON_REPS_MIN: 6,
  CON_REPS_MAX: 15,
  CON_REPS_DEFAULT: 10,
};

export async function selectMobilityExercise(
  blockRoute: string,
  db: MySql2Database<typeof schema>,
): Promise<MobilityExercise | null> {
  // 1. Get related mobility routes for this block route
  const relatedRoutes = ROUTE_TO_MOBILITY_ROUTES[blockRoute] || [];

  // 2. Query MOVILIDAD exercises, preferring route-related ones
  let pool = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.exercise,
      effort: schema.exercises.effort,
      mobilityRelated: schema.exercises.mobilityRelated,
    })
    .from(schema.exercises)
    .where(eq(schema.exercises.pattern, 'MOVILIDAD'));

  // 3. Filter to route-relevant exercises first
  let relevantPool = pool.filter(ex => {
    if (!ex.mobilityRelated) return false;
    return relatedRoutes.some(route =>
      ex.mobilityRelated!.includes(route)
    );
  });

  // 4. Fallback to full pool if no route-relevant exercises
  if (relevantPool.length === 0) {
    relevantPool = pool;
  }

  if (relevantPool.length === 0) return null;

  // 5. Random selection from valid pool
  const selected = relevantPool[Math.floor(Math.random() * relevantPool.length)];

  // 6. Prescription based on contraction type
  const isISO = selected.effort?.toUpperCase() === 'ISO';

  return {
    exerciseId: selected.id,
    name: selected.name,
    contraction: isISO ? 'ISO' : 'CON',
    reps: isISO ? 0 : MOBILITY_DEFAULTS.CON_REPS_DEFAULT,
    seconds: isISO ? MOBILITY_DEFAULTS.ISO_SECONDS : 0,
  };
}
```

### Example 2: Mobility Prescription Defaults (from examples.txt analysis)

```
ROUTE  EXERCISE                              TYPE  PRESCRIPTION
-----  ------------------------------------  ----  ------------
HT     ASSISTED SPAGAT DELTA                 ISO   20''
QC     COUCH STRETCH KNEE SPAGAT             ISO   20''
SS     COUCH STRETCH KNEE SPAGAT             ISO   20''
HSPU   ELBOW BRIDGE                          CON   6 reps
MN/RP  CAT COW                               CON   10 reps
DS     90-90 GLUTE STRETCH                   CON   10 reps
SU     90-90 GLUTE STRETCH                   CON   10 reps
HSPU   PCK AROUND THE WORLD                  CON   10 reps
PS     COUCH STRETCH                         ISO   20''
FL     DIAGONAL STRETCH                      ISO   20''
OAPU   DIAGONAL STRETCH                      ISO   20''
TTB    JEFFERSON CURL                        CON   6 reps
OAPU   TABLE                                 CON   6 reps
LS     ASSISTED SPAGAT OMEGA                 ISO   20''
NC     PCK SIDE W                            ISO   15''
PL     TABLE                                 ISO   20''
PHS    ELBOW BRIDGE                          CON   6 reps
HT     BENT PCK SIDE W.                      CON   12 reps
SU     COUCH STRETCH                         ISO   20''
FLR    ELEVATED FRONT LEG DIAGONAL STRETCH   ISO   20''

Summary:
- ISO exercises: 20'' (most common), 15'' (one case: PCK SIDE W)
- CON exercises: 6 reps (ELBOW BRIDGE, JEFFERSON CURL, TABLE),
                 10 reps (CAT COW, 90-90 GLUTE STRETCH, PCK AROUND THE WORLD),
                 12 reps (one case: BENT PCK SIDE W),
                 15'' (one case treated as seconds - PCK SIDE W is ISO not CON)

Recommended defaults:
- ISO exercises: 20 seconds
- CON exercises: 10 reps (middle ground)
```

### Example 3: ROUTE_TO_MOBILITY_ROUTES Validation Against examples.txt

Current mapping accuracy check:
```
examples.txt route -> Expected mobility route -> Current mapping has it?

HT  -> maps to ['MN', 'FL']
  - ASSISTED SPAGAT DELTA (likely LS route) -- PARTIAL MATCH (need to verify mobilityRelated)
  - BENT PCK SIDE W (likely MN route) -- MATCH via MN

QC  -> maps to ['LS ( LUNGES )', 'PL']
  - COUCH STRETCH KNEE SPAGAT -- LIKELY MATCH (stretching, LS area)

SS  -> maps to ['LS ( LUNGES )', 'PL']
  - COUCH STRETCH KNEE SPAGAT -- LIKELY MATCH

HSPU -> maps to ['FL', 'MN']
  - ELBOW BRIDGE, PCK AROUND THE WORLD -- Need to check mobilityRelated

PS  -> maps to ['LS ( LUNGES )', 'PL']
  - COUCH STRETCH -- LIKELY MATCH

FL  -> maps to ['PL', 'MN']
  - DIAGONAL STRETCH -- Need to check mobilityRelated

OAPU -> maps to ['FL', 'MN']
  - DIAGONAL STRETCH, TABLE -- Need to check mobilityRelated

TTB -> maps to ['TTB / HF', 'MN']
  - JEFFERSON CURL -- Need to check mobilityRelated

MN/RP -> maps to ['MN', 'FL']
  - CAT COW -- MATCH (MN area)

DS  -> maps to ['FL', 'PL']
  - 90-90 GLUTE STRETCH -- Need to check mobilityRelated

SU  -> maps to ['LS ( LUNGES )', 'PL']
  - 90-90 GLUTE STRETCH, COUCH STRETCH -- Partial (SU maps to LS/PL, but gets hip exercises)

NC  -> maps to ['TTB / HF', 'MN']
  - PCK SIDE W -- Need to check mobilityRelated

PL  -> maps to ['FL', 'MN']
  - TABLE -- Need to check mobilityRelated

PHS -> maps to ['FL', 'MN']
  - ELBOW BRIDGE -- Need to check mobilityRelated

LS  -> NO ENTRY in current mapping
  - ASSISTED SPAGAT OMEGA -- MISSING! Need to add LS mapping

FLR -> maps to ['PL', 'MN']
  - ELEVATED FRONT LEG DIAGONAL STRETCH -- Need to check mobilityRelated
```

**Key finding:** The route `LS` (Lunges) is missing from `ROUTE_TO_MOBILITY_ROUTES`. It appears in examples.txt mapping to ASSISTED SPAGAT OMEGA. This should be added. The actual matching relies heavily on the `mobilityRelated` column in the exercises table -- the mapping just narrows which mobility routes to search.

### Example 4: Session Save with Mobility Exercise Type
```typescript
// In SessionGeneratorService.saveSession()
// When inserting prescriptions, include exerciseType
const prescriptionValues = block.exercises.map((ex, exIdx) => ({
  blockId,
  exerciseId: ex.exerciseId,
  exerciseName: ex.name,
  contraction: ex.contraction,
  reps: ex.reps,
  seconds: ex.seconds,
  rest: ex.rest,
  notes: ex.notes ?? null,
  difficulty: ex.dificultadLineal ?? null,
  sortOrder: exIdx,
  exerciseType: ex.exerciseType ?? 'main', // New field
}));
```

### Example 5: PDF Mobility Text Format
```typescript
// In session-data-transformer.ts, when building grid pages:
function buildGridPage(role, displayRole, sessionsByLevel) {
  // ... existing code ...

  // Extract mobility from any level's block (same for all levels)
  let mobilityText: string | undefined;
  for (const level of LEVEL_ORDER) {
    const session = sessionsByLevel.get(level);
    if (!session) continue;
    const block = findBlock(session.blocks, role);
    if (!block) continue;

    // Find mobility exercise in block
    const mobilityEx = block.exercises.find(e => e.exerciseType === 'mobility');
    if (mobilityEx) {
      // Format: "EXERCISE_NAME PRESCRIPTION"
      const prescription = mobilityEx.seconds
        ? `${mobilityEx.seconds}"`
        : `${mobilityEx.reps}`;
      mobilityText = `${mobilityEx.exerciseName} ${prescription}`;
      break;
    }
  }

  return {
    role: displayRole,
    formatName,
    mobility: mobilityText,  // Populates the existing PdfBlockPage.mobility field
    levelBlocks,
  };
}
```

## Codebase Cross-Reference

### Files That Need Modification

#### DB Layer
| File | Change | Complexity |
|------|--------|------------|
| `el-templo-api/src/db/schema/session-prescriptions.ts` | Add `exerciseType` column | LOW |
| New migration file | ALTER TABLE + DEFAULT for existing rows | LOW |

#### Pipeline / Generation
| File | Change | Complexity |
|------|--------|------------|
| `el-templo-api/src/modules/sessions/pipeline/utils/mobility-routes.ts` | Add `LS` route, validate/refine mapping | LOW |
| New: `el-templo-api/src/modules/sessions/pipeline/utils/mobility-selection.ts` | Mobility exercise selection function | MEDIUM |
| `el-templo-api/src/modules/sessions/service.ts` | Add mobility selection after pipeline, include in save | MEDIUM |
| `el-templo-api/src/modules/sessions/types.ts` | Add `exerciseType` to `ExercisePrescription` | LOW |

#### API Layer
| File | Change | Complexity |
|------|--------|------------|
| `el-templo-api/src/modules/sessions/routes.ts` | Update `sessionToResponse` to separate mobility | LOW |
| `el-templo-api/src/modules/admin/service.ts` | Include exerciseType in query projection | LOW |
| `el-templo-api/src/modules/admin/edit-service.ts` | Add mobility swap endpoint, prevent remove/add for mobility | MEDIUM |
| `el-templo-api/src/modules/admin/routes.ts` | Add mobility swap route, mobility pool endpoint | LOW |

#### Admin App
| File | Change | Complexity |
|------|--------|------------|
| `el-templo-admin/src/types/session.ts` | Add `mobilityExercise` to SessionBlock type | LOW |
| `el-templo-admin/src/components/sessions/EditableBlockCard.vue` | Add "Descanso Activo" section at bottom | MEDIUM |
| `el-templo-admin/src/components/sessions/ExerciseSwapDialog.vue` | Add `mobilityMode` prop for MOVILIDAD pool | MEDIUM |
| `el-templo-admin/src/utils/pdf/session-data-transformer.ts` | Populate `mobility` field from block data | LOW |

#### Member App
| File | Change | Complexity |
|------|--------|------------|
| `el-templo-app/src/modules/training/types/session.ts` | Add `mobilityExercise` to Block type | LOW |
| `el-templo-app/src/modules/training/pages/DayPlayer.vue` | Add "Descanso Activo" section after ExerciseList | MEDIUM |
| `el-templo-app/src/modules/training/components/player/ExerciseList.vue` | No change needed (mobility uses same card style but rendered separately) | NONE |

### Files That Do NOT Need Modification
- Pipeline stages 1-7 (mobility is post-pipeline)
- `session-pdf-builder.ts` (already renders `block.mobility` field; just needs data)
- `pdf-types.ts` (already has `mobility?: string` field)
- `useSessionPlayer.ts` (mobility doesn't affect block completion flow)

## Discretion Recommendations

### 1. PDF Mobility Row Text Format
**Recommendation:** `"EXERCISE_NAME PRESCRIPTION"` where prescription is `N"` for seconds or `N` for reps.

Examples from PDF builder context:
- ISO: `"COUCH STRETCH 20\""` (matches existing hardcoded format `'ASSISTED SPAGAT DELTA 20"'`)
- CON: `"PCK AROUND THE WORLD 10"`

This matches the existing hardcoded fallback format and looks consistent in the PDF layout.

### 2. Swap Dialog Approach
**Recommendation:** Reuse `ExerciseSwapDialog` with a `mobilityMode` prop rather than creating a separate component.

**Rationale:**
- 80% of the dialog UX is identical (search, filter by contraction, click to swap)
- When `mobilityMode=true`: fetch from `pattern='MOVILIDAD'` pool, sort route-relevant first, hide category filter (all mobility), disable "add" action
- Saves component duplication while keeping the swap flow consistent
- The `editApi.fetchExercisePool()` needs a new server endpoint or parameter to fetch MOVILIDAD exercises

### 3. Routes with No Mapped Mobility Exercises
**Recommendation:** Tiered fallback strategy:
1. Try route-specific mobility exercises (via ROUTE_TO_MOBILITY_ROUTES + mobilityRelated)
2. If none found: pick any MOVILIDAD exercise from the full pool
3. If pool is empty (data issue): log warning in trace, skip mobility for that block

This matches the existing INITIUM pipeline's contextual-then-generic fallback pattern.

### 4. Pipeline Stage Placement
**Recommendation:** **Post-pipeline step in `SessionGeneratorService.generateDailySession()`**, NOT a new pipeline stage.

**Rationale:**
- The 7-stage pipeline has a strict type progression (BlockContext -> BlockContextWithRoute -> ... -> BlockContextComplete)
- Adding Stage 8 would require extending the context chain for a fundamentally different selection process
- Mobility selection is a one-query-one-pick operation, not a multi-stage enrichment
- Place it right after `blocks.push(blockPlan)` in the block generation loop, mutating the BlockPlan to include the mobility exercise

**Implementation location:** Inside the `for (const role of blockRoles)` loop in `generateDailySession()`, after `runBlockPipeline()` returns, before pushing to the `blocks` array.

## Open Questions

1. **Exact exercises in MOVILIDAD pattern**
   - What we know: The exercises table contains entries with `pattern = 'MOVILIDAD'` and the `mobilityRelated` column links them to routes
   - What's unclear: The exact count and distribution of MOVILIDAD exercises per route cannot be verified without DB access
   - Recommendation: Add a validation step in the first plan that queries the DB and logs the mobility exercise inventory. If any routes have 0 available exercises, the fallback strategy handles it.

2. **Existing sessions migration**
   - What we know: All existing prescription rows should be `exercise_type = 'main'` (no mobility was generated before)
   - What's unclear: Whether any sessions need to be regenerated to include mobility
   - Recommendation: The migration only adds the column with DEFAULT 'main'. Existing sessions keep working as-is. New sessions generated after this phase will include mobility. Admin can re-generate sessions if they want mobility for existing weeks.

3. **Algorithm snapshot compatibility**
   - What we know: The snapshot JSON stores `exercises[]` per block. New snapshots will include `exerciseType`.
   - What's unclear: Whether old snapshots (without exerciseType) will cause issues on "Reset to Algorithm"
   - Recommendation: When restoring from snapshot, treat exercises without `exerciseType` field as `'main'` (backward compatible). This is handled naturally by the DB DEFAULT.

## Sources

### Primary (HIGH confidence)
- Codebase analysis of all files listed in "Codebase Cross-Reference" section
- `examples.txt` at `.docs/mobility-examples/examples.txt` — 21 real mappings from coach-built sessions
- `mobility-routes.ts` — existing ROUTE_TO_MOBILITY_ROUTES mapping
- `session-pdf-builder.ts` — existing hardcoded mobility row rendering
- `pdf-types.ts` — existing `mobility?: string` field on PdfBlockPage
- `session-prescriptions.ts` — current schema without exercise_type discriminator

### Secondary (MEDIUM confidence)
- Prescription defaults derived from examples.txt statistical analysis (20'' for ISO, 6-10 for CON)
- Route mapping gap analysis (LS missing) based on cross-referencing examples.txt with ROUTE_TO_MOBILITY_ROUTES

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all existing patterns
- Architecture: HIGH - patterns follow existing codebase conventions exactly, verified against source code
- Pitfalls: HIGH - identified from actual code analysis (snapshot system, migration, mapping gaps, PDF transformer)
- Discretion areas: HIGH - recommendations based on codebase evidence and existing patterns

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (stable, internal codebase)

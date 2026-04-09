# Phase 97: ROM Mode — Saturday Mobility Sessions - Research

**Researched:** 2026-04-09
**Domain:** Session generation pipeline, admin UI, PDF output, member app training views
**Confidence:** HIGH

## Summary

Phase 97 introduces a parallel session generation path ("ROM mode") for configurable days (starting Saturday). ROM sessions differ fundamentally from regular SPOM sessions: 3 body-zone blocks (ROM_LOWER, ROM_CORE, ROM_UPPER), 2 tiers only (alfa=Basico, delta=Avanzado), For Quality x3 format, and exercises drawn exclusively from the mobility pool filtered by body zone. The implementation touches all layers: database schema (new column + table), session generator service, admin display/editing, PDF output, and the member app's weekly view + DayPlayer.

The existing codebase provides strong foundations. The `for_quality` format already exists with `rounds: 3` as a default. The `mobility_related` field on exercises already maps 126 exercises to body zones (`LS`, `FL`, `TTB / HF`, `MN`, `PL`). Block roles are varchar(20) with no enum constraint, so new ROM roles work without migration hassle. The goal-plan pipeline (`goal-plan-pipeline.ts`) establishes precedent for an alternative session generation path that bypasses SPOM stages.

**Primary recommendation:** Build a dedicated `generateRomSession()` method on `SessionGeneratorService` that directly constructs 3 blocks with fixed For Quality format, mobility-only exercises filtered by body zone, and tier-differentiated difficulty ranges. This avoids entangling ROM logic in the 7-stage SPOM pipeline. The `generateWeek` batch flow checks `day_modes` before routing to either the standard or ROM generator.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** ROM sessions have NO INITIUM block — go straight to the 3 ROM blocks
- **D-02:** Block roles: `ROM_LOWER`, `ROM_CORE`, `ROM_UPPER` — distinct from NUCLEUS/DEUTEROS to avoid inheriting their special behaviors
- **D-03:** No ATHLOS/EPIKOS blocks for ROM sessions
- **D-04:** Only 2 levels generated: alfa (Basico) and delta (Avanzado) under the `alfa_delta` level group
- **D-05:** `session_mode` column on `sessions` table — `'regular'` (default) or `'rom'`
- **D-06:** Format: "For Quality" with rounds=3 (`for_quality` format type, rounds param = 3)
- **D-07:** 3 CON exercises per block, randomly assigned reps of 20, 30, and 40 (one of each, shuffled)
- **D-08:** Rest between rounds: 30 seconds — stored as format rest parameter, NOT a separate ISO exercise
- **D-09:** Different exercises per tier — alfa gets easier exercises (lower `dificultad_lineal`), delta gets harder ones
- **D-10:** No DESCANSO ACTIVO (mobility) slot in ROM blocks — all exercises are already mobility
- **D-11:** Use existing `mobility_related` field to map exercises to body zones: `LS (LUNGES)` -> ROM_LOWER (37 exercises), `FL` + `TTB / HF` + `MN` -> ROM_CORE (78 exercises), `PL` -> ROM_UPPER (11 exercises)
- **D-12:** No new column on exercises table — reuse existing `mobility_related` mapping
- **D-13:** Generator picks random mobility exercises; coach replaces them via edit interface
- **D-14:** New `day_modes` table: `(id, day_of_week UNIQUE, session_mode)` — global, no branch_id
- **D-15:** Seeded with 6 rows (Mon=1 through Sat=6), all `'regular'` except Saturday=`'rom'`
- **D-16:** Admin UI: day mode toggles in the SessionsPage (session generation area), with `PUT /admin/sessions/day-modes` endpoint
- **D-17:** Same batch generation flow — generator checks `day_modes` config per day, routes to ROM generator if mode=rom
- **D-18:** If a ROM day falls on a holiday, skip generation entirely (same as regular days)
- **D-19:** ROM days appear inline in SessionsPage with a 'ROM' badge — not a separate section
- **D-20:** Only 2 level rows shown (alfa/delta) instead of 4 for ROM days
- **D-21:** Block summary shows TREN INFERIOR / ZONA MEDIA / TREN SUPERIOR instead of route names
- **D-22:** Exercise swap in ROM blocks filters by body zone using `mobility_related` mapping. Full search tab still available.
- **D-23:** No DESCANSO ACTIVO slot in ROM block edit view
- **D-24:** Same approval workflow as regular sessions (pending_review -> approved). No auto-approve.
- **D-25:** Block headers in Spanish: TREN INFERIOR / ZONA MEDIA / TREN SUPERIOR
- **D-26:** Tier labels: BASICO / AVANZADO (replaces Greek symbols)
- **D-27:** 2-row stacked layout: Basico full width on top, Avanzado full width below
- **D-28:** Same training page, simplified for ROM: 3 blocks displayed sequentially, no Deuteros selector
- **D-29:** Level-based tier assignment: alfa members see Basico, delta and all others see Avanzado
- **D-30:** Full DayPlayer support: 3 blocks played sequentially, For Quality format handles rounds naturally, completion tracking logs ROM block roles
- **D-31:** Weekly carousel: Saturday card gets a small 'ROM' badge, block summary shows body zone names
- **D-32:** No INITIUM in player flow — first block is ROM_LOWER
- **D-33:** Existing Saturday sessions left as-is with `session_mode='regular'` (column default). No data migration.
- **D-34:** `session_mode` column defaults to `'regular'` — all existing sessions are automatically regular

### Claude's Discretion

- Block role naming convention (ROM_LOWER vs ROM-LOWER vs rom_lower) — follow existing codebase conventions
- Exact exercise count filtering when PL pool is thin (11 exercises) — handle gracefully if not enough unique exercises for both tiers
- DayPlayer block transition animations/UX for ROM — match existing block transition patterns

### Deferred Ideas (OUT OF SCOPE)

- Body zone column on exercises — not needed now with 126 exercises
- ROM as a goal plan program — future migration path
- Per-branch day modes — add `branch_id` to `day_modes` table if needed later
  </user_constraints>

## Architecture Patterns

### Current Session Generation Flow (Regular SPOM)

```
generateWeek (batch)
  -> for each day in TRAINING_DAYS
    -> for each levelGroup (alfa_delta, sigma, omega)
      -> for each memberLevel in levelGroup
        -> generateDailySession()
          -> 7-stage pipeline per block (rotator, SPOM, budget, contraction, format, exercises, prescription)
          -> selectMobilityExercise() post-pipeline
        -> saveSession()
```

### ROM Session Generation Flow (NEW)

```
generateWeek (batch)
  -> for each day in TRAINING_DAYS
    -> lookup day_modes for this day
    -> IF mode === 'rom':
      -> for each memberLevel in ['alfa', 'delta'] (only alfa_delta group)
        -> generateRomSession()
          -> for each zone in [ROM_LOWER, ROM_CORE, ROM_UPPER]:
            -> query mobility exercises by body zone (mobilityRelated)
            -> filter by difficulty range (alfa: dificultadLineal 1-3, delta: 4-6)
            -> pick 3 random CON exercises
            -> assign shuffled reps [20, 30, 40]
            -> rest = 30s (format param, not per-exercise)
          -> saveSession() with session_mode='rom'
    -> ELSE: standard generation flow (unchanged)
```

### Recommended Project Structure (New Files)

```
el-templo-api/src/
├── db/schema/
│   ├── sessions.ts              # ADD: session_mode column
│   └── day-modes.ts             # NEW: day_modes table
├── modules/
│   ├── sessions/
│   │   ├── service.ts           # ADD: generateRomSession() method
│   │   └── rom-generator.ts     # NEW: ROM-specific generation logic
│   ├── admin/
│   │   ├── service.ts           # MODIFY: generateWeek() to check day_modes
│   │   ├── routes.ts            # ADD: day-modes CRUD endpoints
│   │   ├── exercise-swap-service.ts  # ADD: ROM body-zone pool query
│   │   └── schemas.ts           # ADD: day-modes schemas

el-templo-admin/src/
├── pages/
│   └── SessionsPage.vue         # MODIFY: ROM badge, day mode toggles, 2 levels for ROM
├── components/sessions/
│   ├── EditableBlockCard.vue     # MODIFY: hide mobility slot for ROM, Spanish zone names
│   └── ExerciseSwapDialog.vue    # MODIFY: body-zone filtering for ROM blocks
├── utils/pdf/
│   ├── session-pdf-builder.ts    # ADD: ROM 2-row stacked layout
│   └── session-data-transformer.ts  # ADD: ROM data transformation

el-templo-app/src/modules/training/
├── components/
│   └── DayCard.vue              # MODIFY: ROM badge, zone names, no Deuteros choice
├── composables/
│   └── useSessionPlayer.ts      # MODIFY: skip Deuteros choice for ROM
├── pages/
│   └── DayPlayer.vue            # No change needed (driven by composable)
└── utils/
    └── blockColors.ts           # ADD: ROM_LOWER, ROM_CORE, ROM_UPPER entries
```

### Pattern 1: ROM Generator as Separate Module

**What:** A dedicated `rom-generator.ts` that generates ROM sessions without going through the 7-stage SPOM pipeline. [VERIFIED: codebase inspection]
**When to use:** When the session structure is fundamentally different (fixed format, fixed exercise count, body-zone-based selection instead of route-based).
**Why:** The SPOM pipeline (rotator -> SPOM tables -> budget -> contraction -> format -> exercises -> prescription) is designed around route-based training with intensity scaling. ROM sessions have none of that -- they're fixed format, fixed exercise count, body-zone filtered. Forcing ROM through the SPOM pipeline would require guard clauses in every stage.
**Precedent:** `goal-plan-pipeline.ts` already establishes this pattern -- it replaces Stage 1 (rotator) with deterministic route selection while reusing stages 2-7. ROM goes further: it replaces the entire pipeline with direct exercise selection and prescription. [VERIFIED: goal-plan-pipeline.ts]

### Pattern 2: Day Modes Table for Configuration

**What:** A `day_modes` table mapping `day_of_week` (1-6) to `session_mode` ('regular'|'rom'). [VERIFIED: CONTEXT.md D-14, D-15]
**When to use:** To allow admin-configurable session types per day of the week.
**Why:** Hardcoding "Saturday = ROM" would work initially but prevents the coach from changing the schedule. A simple config table with admin toggles provides flexibility with minimal complexity.

### Pattern 3: session_mode Discriminator Column

**What:** Add `session_mode` varchar column to `sessions` table, defaulting to `'regular'`. [VERIFIED: CONTEXT.md D-05, D-34]
**When to use:** To distinguish ROM sessions from regular sessions in queries, UI rendering, and API responses.
**Precedent:** Follows the same discriminator pattern as `goalPlanType` on sessions table. [VERIFIED: sessions.ts schema]

### Anti-Patterns to Avoid

- **Routing ROM through SPOM pipeline with flag checks:** Would require conditionals in every pipeline stage. Use separate generator instead. [ASSUMED: based on code complexity assessment]
- **Storing body zone on exercises table:** D-12 explicitly defers this. Use `mobilityRelated` field mapping for now.
- **Creating new format for ROM:** D-06 explicitly says use existing `for_quality` with `rounds: 3`. The format system already supports this.
- **Separate admin page for ROM:** D-19 explicitly says inline with ROM badge, not a separate section.

## Don't Hand-Roll

| Problem                   | Don't Build                | Use Instead                                                                  | Why                                                                                      |
| ------------------------- | -------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| For Quality format        | Custom format logic        | Existing `for_quality` format type with `{ type: 'for_quality', rounds: 3 }` | Format params system already handles this [VERIFIED: format-params.ts line 79, 319]      |
| Mobility exercise queries | New exercise query by zone | Existing `mobilityRelated` field on exercises + pattern='MOVILIDAD' filter   | 126 exercises already mapped [VERIFIED: exercises.ts, CONTEXT D-11]                      |
| Exercise prescription     | Custom ROM prescriber      | Direct prescription: CON, shuffled [20,30,40] reps, 30s rest                 | ROM prescription is deterministic and simple (no budget/intensity scaling)               |
| Admin editing             | New edit flow              | Existing `AdminEditService` facade + `ExerciseSwapService`                   | ROM uses same edit flow, just needs body-zone pool filtering [VERIFIED: edit-service.ts] |
| Approval workflow         | Custom ROM approval        | Existing `pending_review -> approved` flow                                   | D-24 confirms same workflow                                                              |
| PDF generation framework  | New PDF library            | Existing pdfmake infrastructure in `session-pdf-builder.ts`                  | Just needs a new layout variant                                                          |

**Key insight:** ROM is a content variant, not a structural overhaul. The session/block/prescription data model works unchanged. Only the generation algorithm and display logic diverge.

## Common Pitfalls

### Pitfall 1: PL Pool Exhaustion (ROM_UPPER)

**What goes wrong:** PL (Planche) mobility pool has only 11 exercises. With 3 per tier x 2 tiers = 6 unique exercises needed per session, that's over half the pool.
**Why it happens:** The mobility exercise pool for upper body is naturally smaller than lower/core.
**How to avoid:** (a) Allow exercises to repeat across tiers if the pool is too small. (b) When selecting for delta (Avanzado), if remaining pool after alfa selection has < 3 exercises, fall back to higher-difficulty exercises from the full MOVILIDAD pool. (c) Log a trace warning when pool is thin.
**Warning signs:** Generator throws or produces sessions with duplicate exercises within a tier.

### Pitfall 2: BlockRole Type Mismatch

**What goes wrong:** The `BlockRole` type in `sessions/types.ts` is a union of fixed strings. Adding ROM_LOWER/ROM_CORE/ROM_UPPER requires updating this type, plus every `Record<BlockRole, ...>` map in the codebase.
**Why it happens:** TypeScript exhaustiveness checking catches this at compile time -- which is good -- but it means updates propagate to: `blockColors.ts`, `getBlockColorClass()`, `getBlockAccentColor()`, `getBlockCSSColor()`, `getBlockHeaderGradient()`, `opacityMap` in blockColors, the `useSessionPlayer` composable, and DayCard's `groupedBlocks`.
**How to avoid:** Update the BlockRole type first, then let TypeScript errors guide all downstream changes. ROM roles should map to `block-bg--default` and accent `secondary` (Aged Gold) per UI spec.
**Warning signs:** TypeScript compilation errors in member app after adding ROM roles.

### Pitfall 3: Member Level Routing for ROM

**What goes wrong:** The weekly API endpoint (`GET /sessions/weekly`) builds dayIds as `W{week}-{day}-{memberLevel}`. For ROM, all non-alfa members see Avanzado (delta), but their dayId still uses their actual level (sigma, omega, spartan). If ROM sessions are only generated for alfa and delta, sigma/omega/spartan members would get no session for Saturday.
**Why it happens:** D-04 says "Only 2 levels generated: alfa and delta." D-29 says "alfa members see Basico, delta and all others see Avanzado."
**How to avoid:** The member API must map non-alfa levels to delta when looking up ROM sessions. When building dayIds for ROM days: if the day is ROM mode and memberLevel is not alfa, use delta's dayId instead. This mapping belongs in the `/sessions/weekly` route handler.
**Warning signs:** Sigma/omega/spartan members see "No session" on Saturdays.

### Pitfall 4: generateWeek Shared Formats Across ROM and Regular

**What goes wrong:** The `generateWeek` method captures `sharedFormats` from the first generated session to enforce cross-level format consistency. ROM sessions use a fixed format (For Quality x3), so this is irrelevant for ROM days. But if ROM is the first day processed, it could accidentally set sharedFormats for subsequent regular days.
**Why it happens:** `sharedFormats` is scoped per-day in the current code (reset at the start of each day loop iteration). Since ROM has its own dedicated flow, this should be naturally isolated.
**How to avoid:** Keep `sharedFormats` scoped per-day as it currently is. The ROM branch should NOT set or read `sharedFormats`. Verify the day-level reset works correctly.
**Warning signs:** Regular days after a ROM day getting unexpected format assignments.

### Pitfall 5: Admin Day-Details Endpoint Filtering

**What goes wrong:** `GET /admin/sessions/day-details` filters by `goalPlanType` (null for general). ROM sessions have `goalPlanType=null` but `session_mode='rom'`. The admin UI needs to display them correctly when loading day details.
**Why it happens:** The endpoint returns all sessions for a day/week. ROM sessions are mixed in with regular sessions since they share the same `goalPlanType=null`.
**How to avoid:** Include `session_mode` in the admin API responses. The admin UI can then distinguish ROM from regular sessions and render accordingly.
**Warning signs:** ROM sessions showing up with wrong display format in admin, or being filtered out.

### Pitfall 6: PDF Layout Switching

**What goes wrong:** The PDF builder currently generates one page per block with a 2x2 level grid (alfa/delta top, sigma/omega bottom). ROM needs a 2-row stacked layout (Basico full-width top, Avanzado full-width bottom) with different headers.
**Why it happens:** `buildBlockPageWithGrid()` is hardcoded for the 4-level grid pattern. ROM needs a fundamentally different layout.
**How to avoid:** Create a `buildRomBlockPage()` function alongside the existing grid function. The `sessionsToPdfDay()` transformer detects ROM sessions (by session*mode or block roles starting with ROM*) and routes to the ROM layout.
**Warning signs:** ROM sessions rendered with the 4-level grid, Greek symbols, or incorrect block names.

## Code Examples

### ROM Session Schema Changes

```typescript
// sessions.ts — add session_mode column
session_mode: varchar('session_mode', { length: 10 }).default('regular').notNull(),

// day-modes.ts — new table
export const dayModes = mysqlTable('day_modes', {
  id: int('id').primaryKey().autoincrement(),
  dayOfWeek: int('day_of_week').notNull().unique(), // 1=Mon, 6=Sat
  sessionMode: varchar('session_mode', { length: 10 }).default('regular').notNull(),
});
// Source: CONTEXT.md D-14, verified against existing schema patterns
```

### ROM Exercise Selection (Body Zone Mapping)

```typescript
// ROM body zone to mobilityRelated field mapping
// Source: CONTEXT.md D-11, verified against exercises.ts mobilityRelated field
const ROM_ZONE_MOBILITY_MAP: Record<string, string[]> = {
  ROM_LOWER: ["LS ( LUNGES )"], // 37 exercises
  ROM_CORE: ["FL", "TTB / HF", "MN"], // 78 exercises
  ROM_UPPER: ["PL"], // 11 exercises
};

// Query mobility exercises for a ROM zone
async function selectRomExercises(
  zone: "ROM_LOWER" | "ROM_CORE" | "ROM_UPPER",
  difficultyMax: number,
  excludeIds: number[],
  db: MySql2Database<typeof schema>,
): Promise<SelectedExercise[]> {
  const mobilityKeys = ROM_ZONE_MOBILITY_MAP[zone];

  const allMobility = await db
    .select()
    .from(schema.exercises)
    .where(eq(schema.exercises.pattern, "MOVILIDAD"));

  // Filter by body zone using mobilityRelated field
  const zoneExercises = allMobility.filter((ex) => {
    if (!ex.mobilityRelated) return false;
    return mobilityKeys.some((key) => ex.mobilityRelated!.includes(key));
  });

  // Filter by difficulty and contraction type
  const eligible = zoneExercises.filter(
    (ex) =>
      ex.effort === "CON" &&
      ex.dificultadLineal <= difficultyMax &&
      !excludeIds.includes(ex.id),
  );

  // Randomly pick 3
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}
```

### ROM Prescription (Fixed Format)

```typescript
// Source: CONTEXT.md D-07, D-08
// 3 exercises per block, each gets one of [20, 30, 40] reps (shuffled)
function prescribeRomBlock(
  exercises: SelectedExercise[],
): ExercisePrescription[] {
  const repValues = [20, 30, 40];
  // Shuffle rep values
  for (let i = repValues.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [repValues[i], repValues[j]] = [repValues[j], repValues[i]];
  }

  return exercises.map((ex, idx) => ({
    exerciseId: ex.exerciseId,
    name: ex.name,
    contraction: "CON" as const,
    reps: repValues[idx],
    seconds: 0,
    rest: 30, // D-08: 30s rest between rounds, stored on prescription
    exerciseType: "main" as const,
    dificultadLineal: ex.difficulty,
  }));
}
```

### BlockRole Type Extension

```typescript
// sessions/types.ts — extend BlockRole union
// Source: CONTEXT.md D-02, codebase convention uses UPPER_SNAKE_CASE
export type BlockRole =
  | "INITIUM"
  | "NUCLEUS"
  | "DEUTEROS_1"
  | "DEUTEROS_2"
  | "ATHLOS"
  | "EPIKOS"
  | "ROM_LOWER"
  | "ROM_CORE"
  | "ROM_UPPER";
```

### Block Colors Extension (Member App)

```typescript
// blockColors.ts — add ROM entries per UI spec
// All ROM blocks use block-bg--default and accent 'secondary' (Aged Gold)
// Source: 97-UI-SPEC.md
const opacityMap: Record<BlockRole, string> = {
  INITIUM: "block-bg--initium",
  NUCLEUS: "block-bg--nucleus",
  DEUTEROS_1: "block-bg--deuteros-1",
  DEUTEROS_2: "block-bg--deuteros-2",
  ATHLOS: "block-bg--athlos",
  EPIKOS: "block-bg--athlos",
  ROM_LOWER: "block-bg--default",
  ROM_CORE: "block-bg--default",
  ROM_UPPER: "block-bg--default",
};
```

### Member API Level Mapping for ROM

```typescript
// In /sessions/weekly handler — handle ROM level routing
// Source: CONTEXT.md D-29
// alfa members get Basico (alfa session), all others get Avanzado (delta session)
function getRomDayId(
  week: number,
  dayName: string,
  memberLevel: ExerciseLevel,
): string {
  const romLevel = memberLevel === "alfa" ? "alfa" : "delta";
  return `W${week}-${dayName}-${romLevel}`;
}
```

### DayCard ROM Detection

```typescript
// In DayCard.vue — detect ROM session by checking block roles
// Source: CONTEXT.md D-28, D-31
const isRomSession = computed(() => {
  if (!props.day.session?.blocks) return false;
  return props.day.session.blocks.some((b) => b.role.startsWith("ROM_"));
});
```

### useSessionPlayer ROM Flow

```typescript
// In useSessionPlayer.ts — skip Deuteros choice for ROM
// Source: CONTEXT.md D-29, D-32
const hasDeuterosBlocks = computed(() => {
  return session.blocks.some(
    (b) => b.role === "DEUTEROS_1" || b.role === "DEUTEROS_2",
  );
});

// Modify playableBlocks to handle ROM: all blocks in order, no choice
const playableBlocks = computed<Block[]>(() => {
  if (!hasDeuterosBlocks.value) {
    // ROM or any session without Deuteros: play all blocks in order
    return [...session.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  // Existing Deuteros choice logic...
});
```

## State of the Art

| Old Approach              | Current Approach                              | When Changed | Impact                                        |
| ------------------------- | --------------------------------------------- | ------------ | --------------------------------------------- |
| All days = SPOM           | Day-configurable mode (regular/rom)           | Phase 97     | Enables non-SPOM session types                |
| 4-level grid PDF          | 2-tier stacked PDF for ROM                    | Phase 97     | Simpler layout for 2-tier sessions            |
| Deuteros choice mandatory | Deuteros choice conditional on block presence | Phase 97     | Cleaner player flow for non-Deuteros sessions |

## Assumptions Log

| #   | Claim                                                                          | Section               | Risk if Wrong                                                                            |
| --- | ------------------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------- |
| A1  | ROM generator as separate module (not pipeline stages) is the right approach   | Architecture Patterns | If forced into pipeline, would require extensive guard clauses in all 7 stages           |
| A2  | `for_quality` format in DB has an id that can be looked up                     | Code Examples         | If format not seeded, ROM blocks would need format creation or a different approach      |
| A3  | CON-only exercises exist in sufficient quantity across all 3 body zones        | Code Examples         | If some zones have mostly ISO exercises, ROM generation would fail or produce thin pools |
| A4  | The 30s rest is stored per-exercise in the `rest` column (not as format param) | Code Examples         | If rest should be in formatParams, prescription logic would differ                       |

## Open Questions

1. **For Quality format ID lookup**
   - What we know: The `for_quality` format exists in the format params type system. Format names are stored as strings in `session_blocks.formatName`.
   - What's unclear: What `formatId` to use for ROM blocks. Regular sessions get formatId from the formats table via the pipeline. ROM bypasses the pipeline.
   - Recommendation: Query the `formats` table for a row matching `for_quality` (or similar name). If no exact match exists, use formatId=0 and store `formatName='For Quality'` + `formatParams: { type: 'for_quality', rounds: 3 }`. The formatId is referenced for compatible format queries in editing, but ROM blocks have a fixed format, so this is low risk.

2. **ROM block `route` and `pattern` fields**
   - What we know: `session_blocks` has required `route` and `pattern` varchar columns. Regular blocks use route codes (FL, PL, etc.) and movement patterns.
   - What's unclear: What values to store for ROM blocks.
   - Recommendation: Use the zone name as route (e.g., `'ROM_LOWER'`, `'ROM_CORE'`, `'ROM_UPPER'`) and `'MOVILIDAD'` as pattern. These are display/query fields, not functional keys for ROM.

3. **ROM block `intensity` and `repsBudget` fields**
   - What we know: Required int columns on `session_blocks`. Regular blocks derive these from SPOM tables.
   - What's unclear: What values ROM blocks should have.
   - Recommendation: Use fixed values: `intensity: 50` (moderate), `repsBudget: 270` (3 exercises x 90 avg reps). These are informational for ROM since prescription is fixed.

4. **Holiday check during generation**
   - What we know: D-18 says "skip generation on holidays, same as regular days." But `generateWeek()` currently has no holiday check -- it generates for all 6 days.
   - What's unclear: Whether holiday skipping is existing behavior that I missed, or aspirational behavior for Phase 97.
   - Recommendation: Do not implement holiday skipping in Phase 97 unless explicitly instructed. The current `generateWeek()` generates regardless of holidays. ROM should follow the same behavior for consistency.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- this phase is purely code/config changes within the existing monorepo stack).

## Security Domain

No security-relevant changes in this phase. ROM mode adds:

- A new admin endpoint (`PUT /admin/sessions/day-modes`) behind existing `TRAINING_ROLES` auth hook
- No new user-facing input (day modes are admin-only toggle)
- No new data access patterns (exercises are already public)
- No PII/sensitive data in day_modes table

All new endpoints inherit existing auth/role guards from the admin routes plugin. No additional ASVS controls needed beyond what exists.

## Sources

### Primary (HIGH confidence)

- `el-templo-api/src/db/schema/sessions.ts` — sessions table schema (verified column structure)
- `el-templo-api/src/db/schema/session-blocks.ts` — block schema (varchar role, required fields)
- `el-templo-api/src/db/schema/session-prescriptions.ts` — prescription schema (rest, reps, exerciseType)
- `el-templo-api/src/db/schema/exercises.ts` — exercises schema (mobilityRelated field, effort, dificultadLineal)
- `el-templo-api/src/modules/sessions/service.ts` — SessionGeneratorService (generation and save flows)
- `el-templo-api/src/modules/sessions/types.ts` — BlockRole type union, DaySession interface
- `el-templo-api/src/modules/sessions/pipeline/utils/mobility-selection.ts` — mobility exercise selection logic
- `el-templo-api/src/modules/sessions/pipeline/utils/mobility-routes.ts` — ROUTE_TO_MOBILITY_ROUTES mapping
- `el-templo-api/src/modules/sessions/pipeline/goal-plan-pipeline.ts` — precedent for alternative pipeline
- `el-templo-api/src/modules/admin/service.ts` — generateWeek batch flow, getWeekSummary
- `el-templo-api/src/modules/admin/routes.ts` — admin endpoint patterns
- `el-templo-api/src/modules/admin/edit-service.ts` — AdminEditService facade
- `el-templo-api/src/modules/admin/exercise-swap-service.ts` — exercise pool and swap logic
- `el-templo-api/src/modules/admin/format-params.ts` — FormatParams type system, for_quality definition
- `el-templo-api/src/modules/sessions/routes.ts` — member session API, sessionToResponse, weekly handler
- `el-templo-api/src/modules/shared/training-constants.ts` — TRAINING_DAYS, LEVEL_DIFFICULTY_MAP
- `el-templo-admin/src/pages/SessionsPage.vue` — admin day groups, DISPLAY_LEVELS, dayGroups computed
- `el-templo-admin/src/components/sessions/EditableBlockCard.vue` — block editing UI structure
- `el-templo-admin/src/components/sessions/ExerciseSwapDialog.vue` — exercise swap dialog structure
- `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` — PDF layout, buildBlockPageWithGrid
- `el-templo-admin/src/utils/pdf/session-data-transformer.ts` — PDF data transformation, buildGridPage
- `el-templo-admin/src/utils/pdf/pdf-types.ts` — PDF type definitions
- `el-templo-app/src/modules/training/components/DayCard.vue` — member day card, groupedBlocks, getSessionRouteName
- `el-templo-app/src/modules/training/pages/DayPlayer.vue` — player template structure
- `el-templo-app/src/modules/training/composables/useSessionPlayer.ts` — player state, playableBlocks, Deuteros logic
- `el-templo-app/src/modules/training/composables/useWeekData.ts` — week data fetching
- `el-templo-app/src/modules/training/types/session.ts` — Session, Block, BlockRole types (frontend)
- `el-templo-app/src/modules/training/utils/blockColors.ts` — block color/accent maps
- `.docs/rom-mode.md` — coach's original ROM specification
- `97-CONTEXT.md` — 34 locked decisions
- `97-UI-SPEC.md` — visual/interaction contract

### Secondary (MEDIUM confidence)

- Exercise pool sizes (37 LOWER, 78 CORE, 11 UPPER) — from CONTEXT.md, not independently verified against DB

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all technologies already in use, no new dependencies
- Architecture: HIGH — clear precedent in goal-plan-pipeline, well-documented decisions in CONTEXT.md
- Pitfalls: HIGH — identified through direct codebase inspection, especially the level mapping issue (Pitfall 3) and PL pool exhaustion (Pitfall 1)
- Code examples: HIGH — derived from verified codebase patterns

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable domain, no external dependencies)

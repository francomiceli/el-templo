# Phase 9: Level-Specific Sessions - Research

**Researched:** 2026-01-27
**Domain:** Session Generation Pipeline & Exercise Selection
**Confidence:** HIGH

## Summary

Phase 9 differentiates sessions by member's actual level (alfa, delta, sigma, omega) instead of level groups (alfa_delta, sigma, omega). The research reveals a clean separation of concerns: exercises are tagged with individual levels, but the current pipeline aggregates members into level groups for session caching. The exercise selection logic already has a sophisticated 4-tier fallback system that can be easily modified to prioritize exact level matches.

Key findings:
1. **Exercise data is already level-tagged**: The exercises table has a `level` column (enum: alfa, delta, sigma, omega, spartan) with good distribution (383 alfa, 522 delta, 284 sigma, 206 omega, 94 spartan)
2. **SPOM rules are level-agnostic**: Intensity, pattern, and category are shared across all levels - no level dimension in spom_rules table
3. **Session generation uses levelGroup**: The pipeline context uses `levelGroup` (alfa_delta, sigma, omega) throughout, and session caching is keyed by (week, day, levelGroup)
4. **Format compatibility uses individual levels**: The format_compatibility table has a level column (alfa, delta, sigma, omega) and already uses representative level from each group (delta for alfa_delta)
5. **Exercise fallback has level widening**: The existing fallback ladder includes LEVEL_WIDENED actions that expand from initial levels to broader sets

**Primary recommendation:** Thread member's actual level through the pipeline context while keeping levelGroup for route lookup. Modify exercise selection to prioritize exact level match before falling back to level group.

## Standard Stack

No external libraries needed - this is pure domain logic refactoring within the existing session generation pipeline.

### Core Components (Already in Codebase)
| Component | Location | Purpose | Current State |
|-----------|----------|---------|---------------|
| Session Pipeline | `el-templo-api/src/modules/sessions/pipeline/` | 7-stage block generation orchestrator | Uses levelGroup throughout |
| Exercise Fallback | `el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts` | 4-tier fallback ladder for exercise selection | Has level widening logic |
| BlockContext | `el-templo-api/src/modules/sessions/pipeline/context.ts` | Immutable context passed through pipeline stages | Contains levelGroup only |
| Session Service | `el-templo-api/src/modules/sessions/service.ts` | Session generation and caching orchestrator | Receives levelGroup as input |
| Session Routes | `el-templo-api/src/modules/sessions/routes.ts` | API endpoints that map user level to levelGroup | Uses `levelToLevelGroup()` helper |

### Database Schema
| Table | Level Column | Values | Purpose |
|-------|--------------|--------|---------|
| exercises | level (enum) | alfa, delta, sigma, omega, spartan | Exercise difficulty tier |
| users | level (enum) | alfa, delta, sigma, omega, spartan | Member's current level |
| sessions | levelGroup (varchar) | alfa_delta, sigma, omega | Session cache key component |
| weekly_rotator | levelGroup (enum) | alfa_delta, sigma, omega | Route assignment by level group |
| format_compatibility | level (enum) | alfa, delta, sigma, omega | Format suitability by level |

## Architecture Patterns

### Pattern 1: Level vs Level Group Separation

**What:** Distinguish between individual member level (domain concept) and level group (aggregation for route sharing).

**When to use:** Throughout the pipeline, but especially in:
- Exercise selection (filter by member level)
- Session caching (key by level, not levelGroup)
- UI display (show member level, not levelGroup)

**How it works:**
```typescript
// Member has individual level
interface User {
  level: 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan';
}

// Level group is computed for route lookup
type LevelGroup = 'alfa_delta' | 'sigma' | 'omega';

function getLevelGroup(level: string): LevelGroup {
  switch (level) {
    case 'alfa':
    case 'delta':
      return 'alfa_delta';  // Shared rotator for Alfa/Delta
    case 'sigma':
      return 'sigma';
    case 'omega':
    case 'spartan':
      return 'omega';
  }
}
```

**Current pipeline flow:**
```
User (level: 'alfa')
  → API route maps to levelGroup ('alfa_delta')
    → Session generated with levelGroup context
      → Exercises filtered by levelGroup levels ['alfa', 'delta']
        → Session cached with key: W1-lunes-alfa_delta
```

**Target pipeline flow:**
```
User (level: 'alfa')
  → API route passes both level AND levelGroup
    → Session generated with level + levelGroup context
      → Exercises filtered FIRST by level ('alfa'), fallback to group
        → Session cached with key: W1-lunes-alfa
```

### Pattern 2: Context Enrichment (Existing Pattern)

The pipeline uses progressive context enrichment through 7 stages. Each stage adds fields without mutating:

```typescript
BlockContext (initial)
  → BlockContextWithRoute (+ route)
    → BlockContextWithSpom (+ intensity, pattern)
      → BlockContextWithBudget (+ repsBudget, difficultyBucket)
        → BlockContextWithContraction (+ contractionMix)
          → BlockContextWithFormat (+ format)
            → BlockContextWithExercises (+ exercises)
              → BlockContextComplete (+ prescriptions)
```

**For Phase 9:** Add `memberLevel` to BlockContext:
```typescript
export interface BlockContext {
  readonly week: number;
  readonly day: string;
  readonly levelGroup: LevelGroup;        // Keep for route lookup
  readonly memberLevel: ExerciseLevel;    // NEW: actual member level
  readonly blockId: string;
  readonly role: BlockRole;
  readonly trace: readonly TraceEvent[];
}
```

### Pattern 3: Deterministic Fallback Ladder (Existing)

The exercise selection already implements a 4-tier fallback with recorded actions:

```
Tier 0: Exact match (route + contraction + difficulty + level)
Tier 1: Relax difficulty
Tier 2: Widen level filter    ← MODIFY THIS TIER
Tier 3: Widen scope (parent category)
Tier 4: Substitute contraction
```

**Current Tier 2 behavior:**
```typescript
// From exercise-fallback.ts lines 42-57
const LEVEL_WIDENING: Record<LevelGroup, readonly ExerciseLevel[][]> = {
  alfa_delta: [
    ['alfa', 'delta'],           // Tier 0: both levels
    ['alfa', 'delta', 'sigma'],  // Tier 2: add sigma
    ['alfa', 'delta', 'sigma', 'omega'],
  ],
  sigma: [
    ['alfa', 'delta', 'sigma'],
    ['alfa', 'delta', 'sigma', 'omega'],
    ['alfa', 'delta', 'sigma', 'omega', 'spartan'],
  ],
  omega: [
    ['alfa', 'delta', 'sigma', 'omega', 'spartan'],
  ],
};
```

**Target Tier 0-2 behavior for Alfa member:**
```
Tier 0: ['alfa']                          ← NEW: exact level match
Tier 1: ['alfa'] (difficulty relaxed)
Tier 2: ['alfa', 'delta']                 ← Widen to level group
Tier 3+: Progressive widening as before
```

### Pattern 4: High-Intensity Level Shift

**What:** At 90-95% intensity, pull exercises from one level above the member's current level.

**Spec reference:** CONTEXT.md specifies this behavior for progressive overload.

**Implementation approach:**
```typescript
// In exercise selection, after determining memberLevel
let targetLevel = memberLevel;

if (intensity >= 90) {
  // Shift to next level for high-intensity blocks
  const levelProgression = ['alfa', 'delta', 'sigma', 'omega', 'spartan'];
  const currentIndex = levelProgression.indexOf(memberLevel);

  if (currentIndex < levelProgression.length - 1) {
    targetLevel = levelProgression[currentIndex + 1];

    // Add trace event
    trace.push({
      code: 'HIGH_INTENSITY_LEVEL_SHIFT',
      decision: {
        from: memberLevel,
        to: targetLevel,
        reason: `Intensity ${intensity}% triggers level shift`
      }
    });
  }
}

// Within the "next level up", select EASIEST exercises (difficulty 1)
const candidates = await queryExercises(
  db, route, contraction,
  maxDifficulty: 1,  // Lowest difficulty from higher level
  allowedLevels: [targetLevel]
);
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session cache invalidation | Custom cache eviction logic | Keep existing dayId-based cache, add level to key | Session caching is simple key-value by dayId, just change the key format |
| Level progression logic | Complex level advancement system | Simple array index lookup | Only 5 levels in fixed order, no need for graph/tree structure |
| Exercise difficulty scoring | Machine learning difficulty predictor | Use existing difficulty column (1-3 scale) | Exercises are pre-categorized by coaches |
| Multi-level session variants | Generate all 4 level variants upfront | Lazy generation per member request | Most members never see other levels, waste of compute |

**Key insight:** The existing fallback system is sophisticated and deterministic. Don't replace it - augment it by changing the initial filter (Tier 0) from levelGroup to memberLevel.

## Common Pitfalls

### Pitfall 1: Breaking Alfa/Delta Route Sharing

**What goes wrong:** Alfa and Delta members must work the same route on the same day (they train together in the same class). If you cache sessions by level only, you might serve Alfa members a Delta route.

**Why it happens:** Confusing "same exercises" with "same route". They share routes but get different exercises.

**How to avoid:**
- Keep `levelGroup` in context for route lookup (stage 1)
- Use `memberLevel` only in exercise selection (stage 6)
- Weekly rotator table stays indexed by levelGroup

**Validation:**
```typescript
// In tests, verify:
const alfaSession = await generateSession({ week: 1, day: 'lunes', level: 'alfa' });
const deltaSession = await generateSession({ week: 1, day: 'lunes', level: 'delta' });

// MUST be true:
assert(alfaSession.blocks[1].route === deltaSession.blocks[1].route); // NUCLEUS
assert(alfaSession.blocks[2].route === deltaSession.blocks[2].route); // DEUTEROS_1
// But exercises MUST differ:
assert(alfaSession.blocks[1].exercises !== deltaSession.blocks[1].exercises);
```

### Pitfall 2: Session Cache Key Collision

**What goes wrong:** Current cache key is `W${week}-${day}-${levelGroup}`. If you don't update this, Alfa and Delta members will share the same cached session.

**Why it happens:** Database schema has `sessions.dayId` as unique key, and service uses `getSessionByDayId(dayId)` for cache lookup.

**How to avoid:**
```typescript
// BEFORE (Phase 8):
const dayId = `W${week}-${day}-${levelGroup}`;  // W1-lunes-alfa_delta

// AFTER (Phase 9):
const dayId = `W${week}-${day}-${level}`;       // W1-lunes-alfa
```

**Warning signs:**
- Two members with different levels getting identical exercise lists
- Cache hit rate suspiciously high (two levels sharing one cached session)

### Pitfall 3: Format Compatibility Lookup Mismatch

**What goes wrong:** Format selection (stage 5) uses `levelGroupToLevel()` helper that maps alfa_delta → delta. If you change context to use memberLevel but forget to update format lookup, Alfa members will get Delta-appropriate formats.

**Why it happens:** Format compatibility table has individual level column, not levelGroup. Stage 5 needs to know which level to look up.

**Current code (stage-5-format.ts lines 36-46):**
```typescript
function levelGroupToLevel(levelGroup: LevelGroup): 'alfa' | 'delta' | 'sigma' | 'omega' {
  switch (levelGroup) {
    case 'alfa_delta':
      return 'delta';  // Uses DELTA as representative! ⚠️
    case 'sigma':
      return 'sigma';
    case 'omega':
      return 'omega';
  }
}
```

**How to avoid:**
Once context has `memberLevel`, use it directly in format selection:
```typescript
// AFTER Phase 9:
export async function selectFormat(ctx: BlockContextWithContraction, db) {
  const block = roleToBlock(ctx.role);
  const level = ctx.memberLevel;  // Use member's actual level, not representative
  // ... rest of format selection
}
```

### Pitfall 4: UI Displaying "ALFA_DELTA" Instead of "ALFA"

**What goes wrong:** SplashScreen component (lines 82-83 in SplashScreen.vue) currently displays `levelGroup.toUpperCase().replace('_', ' ')` which shows "ALFA DELTA" instead of the member's actual level.

**Why it happens:** Frontend receives `session.levelGroup` from API response, not the member's individual level.

**How to avoid:**
- Option A: Add `memberLevel` field to session API response
- Option B: Frontend already knows user.level from auth store, use that instead
- Option C: Parse from dayId if it includes level (W1-lunes-alfa)

**Correct display:**
```typescript
// In SplashScreen.vue, use user's actual level:
import { useUserStore } from '@/stores/useUserStore';

const userStore = useUserStore();
const levelDisplay = computed(() => {
  // "ALFA", "DELTA", "SIGMA", "OMEGA"
  return userStore.user?.level.toUpperCase() ?? '';
});
```

## Code Examples

### Example 1: Modified Exercise Selection (Tier 0 Change)

Current Tier 0 query (exercise-fallback.ts lines 175-186):
```typescript
// Tier 0: Exact match
let pool = await queryExercises(db, currentRoute, currentContraction, currentDifficulty, currentLevels);
```

After Phase 9 (prioritize member level):
```typescript
// Tier 0: Exact match for member's level ONLY
const memberOnlyLevels = [ctx.memberLevel];
let pool = await queryExercises(db, currentRoute, currentContraction, currentDifficulty, memberOnlyLevels);

if (pool.length >= count) {
  const sorted = [...pool].sort((a, b) => a.id - b.id);
  const selected = sorted.slice(0, count);
  return {
    status: 'exact',
    data: selected,
    tier: 0,
    actions: [],
  };
}

// Tier 1: Relax difficulty (still member level only)
currentDifficulty = 999;
pool = await queryExercises(db, currentRoute, currentContraction, currentDifficulty, memberOnlyLevels);

actions.push({
  type: 'DIFFICULTY_RELAXED',
  tier: 1,
  from: originalDifficulty,
  to: currentDifficulty,
});

if (pool.length >= count) {
  // ... return fallback
}

// Tier 2: Widen to level group (existing behavior)
const originalLevels = memberOnlyLevels;
currentLevels = getAllowedLevels(levelGroup);  // Existing helper
pool = await queryExercises(db, currentRoute, currentContraction, currentDifficulty, currentLevels);

actions.push({
  type: 'LEVEL_WIDENED',
  tier: 2,
  from: originalLevels,
  to: currentLevels,
});
// ... continue with Tier 3, 4 as before
```

### Example 2: Context Creation with Member Level

Current createInitialContext (context.ts lines 81-97):
```typescript
export function createInitialContext(
  week: number,
  day: string,
  levelGroup: LevelGroup,
  role: BlockRole
): BlockContext {
  const blockId = `W${week}-${day}-${levelGroup}-${role}`;
  return {
    week,
    day,
    levelGroup,
    blockId,
    role,
    trace: [],
  };
}
```

After Phase 9:
```typescript
export function createInitialContext(
  week: number,
  day: string,
  levelGroup: LevelGroup,
  memberLevel: ExerciseLevel,  // NEW parameter
  role: BlockRole
): BlockContext {
  const blockId = `W${week}-${day}-${memberLevel}-${role}`;  // Use memberLevel in blockId
  return {
    week,
    day,
    levelGroup,      // Keep for route lookup
    memberLevel,     // Add for exercise filtering
    blockId,
    role,
    trace: [],
  };
}
```

### Example 3: API Route Changes

Current /daily endpoint (routes.ts lines 107-154):
```typescript
fastify.get('/daily', async (request, reply) => {
  const { date } = request.query;
  const { userId } = request.user;

  // 1. Get member's level
  const [user] = await fastify.db
    .select({ level: schema.users.level })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  // 2. Compute levelGroup
  const levelGroup = levelToLevelGroup(user.level);

  // 3-4. Get week and day
  const week = await spomService.getCurrentWeek();
  const dayName = dateToDayName(date);

  // 5. Build dayId with LEVEL GROUP
  const dayId = `W${week}-${dayName}-${levelGroup}`;

  // 6-8. Check cache, generate, save
  // ...
});
```

After Phase 9:
```typescript
fastify.get('/daily', async (request, reply) => {
  const { date } = request.query;
  const { userId } = request.user;

  // 1. Get member's level
  const [user] = await fastify.db
    .select({ level: schema.users.level })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  const memberLevel = user.level;  // 'alfa', 'delta', etc.

  // 2. Compute levelGroup (still needed for route lookup)
  const levelGroup = levelToLevelGroup(memberLevel);

  // 3-4. Get week and day
  const week = await spomService.getCurrentWeek();
  const dayName = dateToDayName(date);

  // 5. Build dayId with MEMBER LEVEL (not group)
  const dayId = `W${week}-${dayName}-${memberLevel}`;  // W1-lunes-alfa

  // 6. Check cache
  const cached = await sessionService.getSessionByDayId(dayId);
  if (cached) {
    return sessionToResponse(cached);
  }

  // 7. Generate with BOTH level and levelGroup
  const session = await sessionService.generateDailySession({
    week,
    day: dayName,
    levelGroup,      // For route lookup
    memberLevel,     // NEW: for exercise filtering
  });

  // 8. Save to database
  await sessionService.saveSession(session);
  return sessionToResponse(session);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single session per level group | One session per individual level | Phase 9 | 3x more cached sessions (Alfa + Delta separate instead of shared) |
| Representative level for formats (delta for alfa_delta) | Member's actual level for format lookup | Phase 9 | More appropriate format selection for Alfa members |
| Level group displayed in UI ("ALFA_DELTA") | Individual level displayed ("ALFA") | Phase 9 | Clearer user experience |
| Level widening starts at Tier 0 | Level widening starts at Tier 2 | Phase 9 | Exact level matches prioritized |

**Deprecated/outdated:**
- **levelToLevelGroup() as session cache key component**: Still needed for route lookup, but should not be part of dayId
- **getAllowedLevels() as Tier 0 filter**: Should only apply at Tier 2+ (fallback), not initial query

## Open Questions

### Question 1: Session Cache Growth

**What we know:**
- Current: 6 days × 3 level groups × N weeks = 18N cached sessions
- After Phase 9: 6 days × 4 levels (alfa, delta, sigma, omega) × N weeks = 24N cached sessions
- Spartan level: Only 94 exercises exist. Can Spartan members get full sessions?

**What's unclear:**
- Do we cache Spartan sessions separately, or do they share Omega cache?
- Should old sessions be pruned after X weeks?

**Recommendation:**
- Spartan shares with Omega (same levelGroup)
- Add CONTEXT.md decision: "Spartan members use omega levelGroup for caching, exercises filtered to spartan+omega pool"
- Consider TTL on cached sessions (delete after 4 weeks) to prevent unbounded growth

### Question 2: High-Intensity Level Shift Details

**What we know:**
- At 90-95% intensity, pull from one level above
- Use EASIEST exercises from that higher level (difficulty 1)

**What's unclear:**
- Does "some exercises" mean ALL exercises in the block, or a MIX?
- If mix, what percentage? 50%? 75%?

**Recommendation:**
- Add to CONTEXT.md: "50% of exercises from higher level at 90%, 75% at 95%"
- OR: Start simple with 100% shift (all exercises from higher level) for MVP, iterate based on coach feedback

### Question 3: Level Promotion Mid-Week

**What we know:**
- Member gets promoted from Alfa → Delta on Wednesday
- CONTEXT.md says "immediately sees new level's sessions"
- "No regeneration needed"

**What's unclear:**
- What happens to already-completed sessions from earlier in the week? Do they stay Alfa in history?
- If member completes Monday/Tuesday as Alfa, then promoted to Delta, does Wednesday's session show Delta exercises?

**Recommendation:**
- Completed sessions are historical records, keep original level
- On promotion, user.level updates in DB
- Next API call uses new level → generates new session with new dayId
- This is automatic with per-level caching (no special logic needed)

## Sources

### Primary (HIGH confidence)
- Database schema files:
  - `el-templo-api/src/db/schema/exercises.ts` - Confirmed `level` enum column
  - `el-templo-api/src/db/schema/sessions.ts` - Confirmed `levelGroup` in cache key
  - `el-templo-api/src/db/schema/users.ts` - Confirmed user level storage
  - `el-templo-api/src/db/schema/weekly-rotator.ts` - Confirmed levelGroup for route sharing
  - `el-templo-api/src/db/schema/format-compatibility.ts` - Confirmed individual level column
- Exercise CSV data:
  - `docs/[Planificaciones] - Base de Datos - Ejercicios.csv` - Exercise distribution: 383 alfa, 522 delta, 284 sigma, 206 omega, 94 spartan
- Pipeline implementation:
  - `el-templo-api/src/modules/sessions/pipeline/` - All 7 stages reviewed
  - `el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts` - Fallback logic with LEVEL_WIDENING map
  - `el-templo-api/src/modules/sessions/service.ts` - Session generation and caching flow
  - `el-templo-api/src/modules/sessions/routes.ts` - API endpoints and levelToLevelGroup() helper
- Frontend display:
  - `el-templo-app/src/modules/training/components/player/SplashScreen.vue` - Current levelGroup display (line 82)

### Secondary (MEDIUM confidence)
- Phase context document (provided in objective):
  - Decisions about level-specific exercise filtering
  - High-intensity level shift behavior (90-95%)
  - Shared routes between Alfa/Delta

## Metadata

**Confidence breakdown:**
- Database schema: HIGH - Directly inspected schema files and CSV data
- Pipeline logic: HIGH - Read complete implementation of all 7 stages and fallback system
- Exercise distribution: HIGH - Counted from canonical CSV file (1,489 total exercises)
- UI display: HIGH - Reviewed Vue components that show level information
- High-intensity shift details: MEDIUM - Described in CONTEXT.md but implementation TBD
- Cache growth impact: MEDIUM - Calculated based on known session count, but pruning strategy undefined

**Research date:** 2026-01-27
**Valid until:** 30 days (stable codebase, no fast-moving dependencies)

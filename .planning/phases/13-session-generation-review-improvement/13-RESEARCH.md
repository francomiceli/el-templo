# Phase 13: Session Generation Review & Improvement - Research

**Researched:** 2026-02-04
**Domain:** Domain-specific algorithm review and validation against coach-built examples
**Confidence:** HIGH (based on extensive internal documentation and 19 weeks of example data)

## Summary

This phase involves reviewing and improving an existing session generation algorithm by comparing its output to 19 weeks of coach-built example sessions. The research analyzed the documentation structure in `docs/session-logic/`, the existing pipeline implementation in `el-templo-api/src/modules/sessions/`, and the reference data in CSV databases.

The key discoveries center around:
1. **Difficulty mapping gap**: The current system uses `difficulty` values 1-3 with "Nivel Superior" bucket, but the requirements specify a linear 1-12 scale mapped to levels (Alfa 1-3, Delta 4-6, etc.)
2. **Block specification patterns**: Coach examples show clear patterns for exercise counts (max 3 except Initium), Alpha-Delta correlation in Nucleus, and upper/lower body choices in Deuteros
3. **Initium special handling**: INITIUM block uses FLOW/Movilidad exercises contextual to the day's main stimulus, not random warmup exercises

**Primary recommendation:** Implement a linear difficulty scale (Dificultad Lineal 1-12), update the exercises database with these values, cap exercise count at 3 for non-Initium blocks, and create validation tests comparing algorithm output to the 19 example weeks.

## Standard Stack

This is internal domain algorithm improvement - no new external libraries needed.

### Core (Existing Implementation)
| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| Session Pipeline | `modules/sessions/pipeline/` | 7-stage deterministic session generation | Needs difficulty updates |
| SPOM Service | `modules/spom/service.ts` | SPOM lookups (intensity, pattern, route) | Working correctly |
| Exercises Table | `db/schema/exercises.ts` | Exercise database with difficulty | Missing Dificultad Lineal column |
| Contraction Rules | `db/schema/contraction-rules.ts` | Contraction distribution by intensity | Working correctly |
| Intensity Rules | `db/schema/intensity-rules.ts` | Reps budget, difficulty bucket, exercise count | Working correctly |

### Data Files (Source of Truth)
| File | Purpose | Key Fields |
|------|---------|------------|
| `Ejercicios.csv` | Exercise database | Nivel (alfa/delta/sigma/omega), Dificultad Relativa (1-3), Ruta, Esfuerzo |
| `SPOM.csv` | 52-week intensity/pattern matrix | Semana, Ruta, Intensidad, Patron Activo |
| `Rotador Semanal.csv` | Routes per block/day/level | Semana, Dia, Nucleus, Deuteros 1, Deuteros 2, Athlos/Epikos |
| `SPOM - Intensidad.csv` | Intensity to reps/difficulty mapping | % Intensidad, Repeticiones, Dificultad, Ejercicios por Bloque |
| `Contraccion.txt` | Contraction distribution rules | JSON: intensidad, totalEjercicios, concentrico, excentrico, isometrico |

## Architecture Patterns

### Current Pipeline Structure (7 Stages)
```
Stage 1: Resolve Rotator    -> Gets route from weekly rotator
Stage 2: Resolve SPOM       -> Gets intensity/pattern from SPOM
Stage 3: Derive Budget      -> Calculates reps budget from intensity
Stage 4: Derive Contraction -> Gets CON/EXC/ISO distribution
Stage 5: Select Format      -> Picks compatible format
Stage 6: Select Exercises   -> Filters by route/contraction/difficulty
Stage 7: Generate Prescription -> Builds final exercise prescriptions
```

### Required Changes Pattern

#### Pattern 1: Linear Difficulty Mapping
**What:** Map categorical levels + relative difficulty to a single 1-12 linear scale
**Current state:**
- Exercises have `level` (alfa/delta/sigma/omega/spartan) and `difficulty` (1-3)
- Selection uses `difficultyBucket` ("1", "2", "3", "Nivel Superior")
**Required state:**
```
Level     + RelativeDifficulty  -> DificultadLineal
Alfa      + 1,2,3               -> 1,2,3
Delta     + 1,2,3               -> 4,5,6
Sigma     + 1,2                 -> 7,8
Omega     + 1,2                 -> 9,10
Spartan   + 1,2                 -> 11,12
```

#### Pattern 2: Nivel Superior Mapping
**What:** "Nivel Superior 1" (at 85-95% intensity) maps to next level's first difficulty
**Mapping:**
```
Alfa    + Nivel Superior 1 -> 4 (Delta 1)
Delta   + Nivel Superior 1 -> 7 (Sigma 1)
Sigma   + Nivel Superior 1 -> 9 (Omega 1)
Omega   + Nivel Superior 1 -> 11 (Spartan 1)
```
**Implementation:** When intensity >= 85% and difficultyBucket is "Nivel Superior 1", shift target level up one tier and use lowest difficulty.

#### Pattern 3: Block Exercise Count Cap
**What:** All blocks except Initium have max 3 exercises
**Evidence from examples:**
- Nucleus: 2-3 exercises per level (coach examples show this consistently)
- Deuteros 1/2: 3 exercises
- Athlos/Epikos: 2-3 exercises
- Initium: 2-4 exercises (warmup, no cap)

**Current state:** Pipeline uses `exerciseCountMin` from intensity rules (4-5 at low intensity)
**Required change:** Cap at 3 for non-INITIUM blocks

#### Pattern 4: Alpha-Delta Correlation in Nucleus
**What:** Alpha and Delta follow same pattern/logic with different difficulty
**Evidence from coach examples:**
```
alfa,Nucleus,alfa,,PUSH,,,1,,P.U KNEE,EXC.
delta,Nucleus,delta,,PUSH,,,1,,P.U DECLINED,EXC.
```
Same pattern (PUSH), same contraction logic, different exercise difficulty.

**Implementation:** When generating Nucleus for alfa_delta group, ensure exercises share logical progression.

#### Pattern 5: Initium Contextual Selection
**What:** Initium exercises relate to day's main stimulus, not random FLOW/Movilidad
**Evidence from coach docs:**
> "Initium is not generic; it is contextual. If the day has a strong shoulder stimulus -> shoulder mobility and activation"

**Current state:** Selects any FLOW pattern or Movilidad category
**Required change:** Consider Nucleus route when selecting Initium exercises

### Validation Architecture
```
Compare Script
    |
    +-> For each week (3-21):
    |       For each day (Lunes-Sabado):
    |           For each level (alfa_delta, sigma, omega):
    |               - Load coach example from CSV
    |               - Generate algorithm output
    |               - Compare: routes, intensities, exercise counts, difficulty average
    |
    +-> Generate discrepancy report
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV Parsing | Custom parser | Existing `fast-csv` library | Already in use for seed scripts |
| Difficulty calculation | Complex conditionals | Lookup table / formula | Simpler, auditable |
| Validation framework | Ad-hoc comparisons | Structured test runner | Consistent output format |

**Key insight:** The comparison/validation logic is the core value - focus on clear, auditable comparisons rather than complex algorithms.

## Common Pitfalls

### Pitfall 1: Difficulty Bucket Confusion
**What goes wrong:** Confusing the current 3-bucket system with the required 12-level linear scale
**Why it happens:** Current `difficulty` field in exercises is 1-3, but requirements want 1-12 scale
**How to avoid:**
1. Add new `dificultad_lineal` column to exercises table
2. Migrate values using: `(level_index * 3) + relative_difficulty`
3. Update pipeline to use new column, not old calculation
**Warning signs:** Exercise selection returning wrong difficulty range

### Pitfall 2: Level Group vs Member Level
**What goes wrong:** Using `levelGroup` (alfa_delta/sigma/omega) when `memberLevel` (alfa/delta/sigma/omega/spartan) is needed
**Why it happens:** Pipeline handles both concepts for different purposes
**How to avoid:**
- `levelGroup` = session-wide grouping (which users train together)
- `memberLevel` = individual user's actual level (for exercise difficulty targeting)
**Warning signs:** Omega users getting exercises too easy/hard

### Pitfall 3: Initium Route Assignment
**What goes wrong:** Treating INITIUM like other blocks with route-based exercise selection
**Why it happens:** Standard pipeline expects route for filtering
**How to avoid:** INITIUM has separate pipeline (`initium-pipeline.ts`) that:
- Uses "INITIUM" as marker route (not real SPOM route)
- Selects from FLOW pattern or Movilidad category
- Should be contextual to day's Nucleus route
**Warning signs:** Generic warmup exercises unrelated to day's focus

### Pitfall 4: Exercise Repetition Within Session
**What goes wrong:** Same exercise appearing multiple times in a day's session
**Why it happens:** Each block queries independently
**How to avoid:** Current implementation tracks `excludedNames` set across contraction types - extend to track across blocks
**Warning signs:** User sees same exercise in Nucleus and Deuteros

### Pitfall 5: Block-Level Validation vs Day-Level
**What goes wrong:** Validating blocks in isolation, missing day-level patterns
**Why it happens:** Pipeline runs per-block, comparison might check per-block
**How to avoid:** Validation must check:
- Individual block correctness
- Cross-block patterns (upper/lower alternation, no repeats)
- Day-level coherence (Initium relates to Nucleus)
**Warning signs:** Valid blocks but incoherent session

## Code Examples

### Example 1: Linear Difficulty Calculation
```typescript
// Source: docs/session-logic/[Planificaciones] - Base de Datos - SPOM - Intensidad.csv
// Mapping from documentation requirements DIFF-01

type Level = 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan';

const LEVEL_BASE: Record<Level, number> = {
  alfa: 0,
  delta: 3,
  sigma: 6,
  omega: 8,
  spartan: 10,
};

function calculateLinearDifficulty(level: Level, relativeDifficulty: number): number {
  // Alfa has 3 difficulties (1-3), Delta has 3 (4-6), Sigma has 2 (7-8), etc.
  return LEVEL_BASE[level] + relativeDifficulty;
}

// Mapping table:
// Alfa:   1,2,3 -> 1,2,3
// Delta:  1,2,3 -> 4,5,6
// Sigma:  1,2   -> 7,8
// Omega:  1,2   -> 9,10
// Spartan: 1,2  -> 11,12
```

### Example 2: Nivel Superior Mapping
```typescript
// Source: SPOM - Intensidad.csv shows "Nivel Superior 1" at 85-95%
// Requirements DIFF-04

function getTargetDifficultyForNivelSuperior(
  currentLevel: Level,
  intensity: number
): { targetLevel: Level; maxDifficulty: number } {
  if (intensity < 85) {
    // Not nivel superior
    return { targetLevel: currentLevel, maxDifficulty: getDifficultyBucket(intensity) };
  }

  // Nivel Superior 1: map to next level's first difficulty
  const levelProgression: Level[] = ['alfa', 'delta', 'sigma', 'omega', 'spartan'];
  const currentIndex = levelProgression.indexOf(currentLevel);

  if (currentIndex < levelProgression.length - 1) {
    return {
      targetLevel: levelProgression[currentIndex + 1],
      maxDifficulty: 1, // First difficulty of next level
    };
  }

  // Spartan stays at spartan
  return { targetLevel: 'spartan', maxDifficulty: 2 };
}
```

### Example 3: Block Exercise Count Cap
```typescript
// Source: Coach examples consistently show max 3 exercises per block
// Requirements BLOCK-06

function getMaxExerciseCount(role: BlockRole, intensityExerciseCount: number): number {
  if (role === 'INITIUM') {
    // Initium has no cap - uses full intensity-based count
    return intensityExerciseCount;
  }

  // All other blocks capped at 3
  return Math.min(intensityExerciseCount, 3);
}
```

### Example 4: Contraction Distribution Lookup
```typescript
// Source: docs/session-logic/[Planificaciones] - Base de Datos - Contraccion.txt
// Already implemented correctly in stage-4-contraction.ts

// Example data from Contraccion.txt:
const contractionRules = [
  { intensidad: 55, totalEjercicios: 4, concentrico: 2, excentrico: 1, isometrico: 1 },
  { intensidad: 55, totalEjercicios: 5, concentrico: 3, excentrico: 1, isometrico: 1 },
  { intensidad: 65, totalEjercicios: 3, concentrico: 1, excentrico: 1, isometrico: 1 },
  // ...
];

// Usage: lookup by (intensity, exerciseCount) to get CON/EXC/ISO distribution
```

### Example 5: Validation Comparison Structure
```typescript
// Validation output structure for comparing algorithm to coach examples

interface BlockComparison {
  week: number;
  day: string;
  levelGroup: 'alfa_delta' | 'sigma' | 'omega';
  role: BlockRole;

  // Expected from coach CSV
  expected: {
    route: string;
    intensity: number;
    exerciseCount: number;
    avgDifficulty: number;
    contractionMix: { CON: number; EXC: number; ISO: number };
  };

  // Generated by algorithm
  actual: {
    route: string;
    intensity: number;
    exerciseCount: number;
    avgDifficulty: number;
    contractionMix: { CON: number; EXC: number; ISO: number };
  };

  // Discrepancies found
  issues: {
    field: string;
    expected: unknown;
    actual: unknown;
    tolerance?: number; // For numeric comparisons like avgDifficulty (+/-0.5)
  }[];
}
```

## Block Specification Patterns (from Coach Examples)

### Initium Block
| Attribute | Specification |
|-----------|--------------|
| Route | None (uses "INITIUM" marker) |
| Pattern | FLOW or Movilidad |
| Intensity | Fixed ~30% |
| Reps Budget | N/A (not used) |
| Exercise Count | 2-4 |
| Contextual | Yes - relates to day's main stimulus |
| Format | Tabata, Interval Training, HIIT |

### Nucleus Block
| Attribute | Specification |
|-----------|--------------|
| Route | From weekly rotator |
| Primary Block | Yes - determines day's main stimulus |
| Exercise Count | 2-3 (capped) |
| Alfa-Delta Correlation | Same pattern, same logic, different difficulty |
| All Levels Together | Yes - planned as coherent unit |
| Difficulty Average | Within +/-0.5 of target |

### Deuteros 1 & 2 Blocks
| Attribute | Specification |
|-----------|--------------|
| Route | From weekly rotator |
| Secondary Work | Yes - complements Nucleus |
| Upper/Lower Choice | User can select enfoque |
| Exercise Count | 3 (capped) |
| Difficulty | Matches route's intensity bucket |

### Athlos/Epikos Block
| Attribute | Specification |
|-----------|--------------|
| Type | Athlos (odd weeks) / Epikos (even weeks) |
| Athlos | Structured technical challenge |
| Epikos | Playful physical game |
| Direction | Complementary to Nucleus (if Nucleus is upper, this is lower) |
| Exercise Count | 2-3 (capped) |

## State of the Art

| Current Implementation | Required Change | Impact |
|------------------------|-----------------|--------|
| Difficulty bucket: 1-3 + "Nivel Superior" | Linear scale 1-12 | Major - affects exercise selection |
| No Dificultad Lineal column | Add column to exercises table | Database migration |
| Exercise count from intensity rules (4-5) | Cap at 3 for non-Initium | Medium - add constraint in pipeline |
| Generic Initium exercises | Contextual to day's Nucleus | Medium - enhance initium-pipeline.ts |
| No algorithm-to-coach comparison | Validation suite with 19 weeks | New implementation |

## Open Questions

1. **Exercise Count Edge Cases**
   - What we know: Coach examples show max 3 exercises per non-Initium block
   - What's unclear: At very low intensity (55%), intensity rules say 4-5 exercises
   - Recommendation: Apply cap of 3; if discrepancies found in validation, investigate specific cases

2. **Difficulty Average Tolerance**
   - What we know: DIFF-05 requires block difficulty average within +/-0.5 of target
   - What's unclear: How to calculate "target" - is it the difficulty bucket or the linear value?
   - Recommendation: Use linear difficulty; target = bucket median mapped to linear scale

3. **Athlos vs Epikos Selection**
   - What we know: Odd weeks = Athlos, even weeks = Epikos (already implemented)
   - What's unclear: Any exceptions in the 19 example weeks?
   - Recommendation: Validate with examples; current implementation may be correct

## Sources

### Primary (HIGH confidence)
- `docs/session-logic/Documento de Planificacion` parts 1-4 - Complete system specification
- `docs/session-logic/coach-step-by-step-part-*.txt` - Teacher planning process
- `docs/session-logic/workbook-map-part-*.txt` - Excel workbook structure
- `docs/session-logic/examples/` - 19 weeks of coach-built sessions (Weeks 3-21)
- `el-templo-api/src/modules/sessions/` - Current pipeline implementation

### Secondary (HIGH confidence - internal code)
- `db/schema/*.ts` - Database schema definitions
- `[Planificaciones] - Base de Datos - *.csv` - Reference data files

## Metadata

**Confidence breakdown:**
- Difficulty system: HIGH - Clear specification in requirements and documentation
- Block specifications: HIGH - Consistent patterns across 19 weeks of examples
- Initium logic: MEDIUM - Current implementation exists but may need contextual enhancement
- Validation approach: HIGH - Clear comparison methodology defined

**Research date:** 2026-02-04
**Valid until:** N/A (internal domain research, stable unless requirements change)

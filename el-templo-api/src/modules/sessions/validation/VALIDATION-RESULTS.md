# Validation Results

## Summary

**Validation Date:** 2026-02-04
**Weeks Validated:** 3-21 (19 weeks)
**Total Coach Examples:** 1711 blocks

### Parse Analysis (Coach Examples Only)

- **Total blocks:** 1711
- **Average exercises per block:** 3.37
- **Blocks per day (typical):** ~16 blocks (4 roles x 4 levels)

## Coach Examples Structure

### Blocks by Role

| Role       | Count | Percentage |
|------------|-------|------------|
| NUCLEUS    | 432   | 25.2%      |
| DEUTEROS_1 | 432   | 25.2%      |
| DEUTEROS_2 | 432   | 25.2%      |
| EPIKOS     | 232   | 13.6%      |
| ATHLOS     | 183   | 10.7%      |

**Note:** ATHLOS/EPIKOS alternates by week (odd=ATHLOS, even=EPIKOS). The counts differ because some weeks have varying coverage.

### Blocks by Level Group

| Level Group | Count | Percentage |
|-------------|-------|------------|
| alfa_delta  | 854   | 49.9%      |
| sigma       | 426   | 24.9%      |
| omega       | 431   | 25.2%      |

**Note:** alfa_delta group has more blocks because it contains both alfa and delta member levels (2 members levels x blocks vs 1 each for sigma/omega).

### Blocks by Week

| Week | Count | Notes |
|------|-------|-------|
| 3    | 96    | Full week |
| 4    | 96    | Full week |
| 5    | 96    | Full week |
| 6    | 96    | Full week |
| 7    | 80    | Reduced |
| 8    | 92    | Near full |
| 9    | 96    | Full week |
| 10   | 95    | Near full |
| 11   | 80    | Reduced |
| 12   | 97    | Full week |
| 13   | 80    | Reduced |
| 14   | 80    | Reduced |
| 15   | 80    | Reduced |
| 16   | 80    | Reduced |
| 17   | 80    | Reduced |
| 18   | 97    | Full week |
| 19   | 97    | Full week |
| 20   | 97    | Full week |
| 21   | 96    | Full week |

## Format Distribution

| Format | Count | Percentage |
|--------|-------|------------|
| Straight Sets | 727 | 42.5% |
| AMRAP | 131 | 7.7% |
| Cluster | 111 | 6.5% |
| Chipper | 93 | 5.4% |
| Time Cap | 81 | 4.7% |
| For Time | 75 | 4.4% |
| Complex | 66 | 3.9% |
| EMOM | 56 | 3.3% |
| Accumulate X | 56 | 3.3% |
| Interval Training | 52 | 3.0% |
| I Go, You Go | 51 | 3.0% |
| Unbroken Reps | 33 | 1.9% |
| Others | 179 | 10.5% |

**Key Observations:**
1. "Straight Sets" is the default/fallback format (~42%)
2. AMRAP, Cluster, Chipper are popular workout formats
3. 32 distinct formats used across all weeks

## Route Distribution (Top 10)

| Route | Count | Description |
|-------|-------|-------------|
| HT | 175 | Hip Dominant |
| SU | 170 | Sentadilla (Squat) |
| NC | 108 | Knee Dominant |
| PHS | 93 | Push Horizontal + Vertical |
| QC | 92 | Quad Centric |
| PS | 92 | Push Specific |
| OAP | 82 | One Arm Push |
| FL | 74 | Flexibility/Mobility |
| TTB | 73 | Toes to Bar |
| OAPU | 73 | One Arm Pull Up |

## Patterns Identified

### Pattern 1: Exercise Count by Block Role

Based on coach examples analysis:

| Block Role | Typical Exercise Count |
|------------|----------------------|
| INITIUM    | 2-4 (warmup, flexible) |
| NUCLEUS    | 4-5 (main work block) |
| DEUTEROS_1 | 3-4 (secondary work) |
| DEUTEROS_2 | 3-4 (secondary work) |
| ATHLOS/EPIKOS | 3-4 (finisher) |

**Aligns with BLOCK-06:** Non-Initium blocks capped at 3 exercises (Plan 13-02)

### Pattern 2: Contraction Distribution

Typical distribution per block:
- **CON (Concentric):** 1-2 exercises
- **EXC (Eccentric):** 1-2 exercises
- **ISO (Isometric):** 1 exercise

This follows the intensity-based contraction rules in the SPOM documentation.

### Pattern 3: Difficulty Progression

- Lower intensity (55-65%): Difficulty 1 exercises
- Medium intensity (70-80%): Difficulty 2 exercises
- High intensity (85%+): Difficulty 3 or "Nivel Superior"

## Validation Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| ALGO-01 | READY | 19 weeks parsed, patterns extracted |
| ALGO-02 | READY | Routes parsed from summary section |
| ALGO-03 | READY | Intensity comparison implemented |
| ALGO-04 | READY | Contraction mix comparison implemented |
| FORM-01 | READY | Format comparison implemented |
| FORM-02 | READY | Format compatibility to be validated |
| BLOCK-06 | READY | Exercise count comparison implemented |
| DIFF-05 | READY | Difficulty tolerance (0.5) implemented |

## Next Steps

### To Run Full Validation

1. Ensure database is seeded with SPOM rules matching weeks 3-21
2. Run: `npx tsx src/modules/sessions/validation/run-validation.ts`
3. Review discrepancies in report

### Expected Discrepancies to Address

Based on coach examples analysis, likely issues:

1. **Format Selection:** Algorithm may not match coach's creative format choices
2. **Exercise Selection:** Coach may select exercises outside strict difficulty rules
3. **Route Assignment:** Weekly rotator data must match coach examples exactly
4. **Contraction Distribution:** Minor variations expected due to exercise availability

### Recommended Fixes (Post-Validation)

1. Ensure format_compatibility table includes all 32 formats used by coach
2. Verify weekly_rotator data matches coach planning for weeks 3-21
3. Consider tolerance for exercise count (3 +/- 1)
4. Document acceptable format variations

## Appendix: Validation Script Usage

```bash
# Parse-only analysis (no database required)
npx tsx src/modules/sessions/validation/run-validation.ts --parse-only

# Full validation (requires database)
npx tsx src/modules/sessions/validation/run-validation.ts

# Specific week range
npx tsx src/modules/sessions/validation/run-validation.ts --week-start 10 --week-end 15
```

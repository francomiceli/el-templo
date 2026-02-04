# Format-Specific Prescription Testing Roadmap

## Overview

The session generation algorithm needs to handle format-specific prescription logic. This document defines the testing plan to validate each format's requirements.

## Format Categories

### Category 1: Structure-Based (Prescription Order Matters)

| Format | Requirement | Priority |
|--------|-------------|----------|
| **Buy-in / Cash-out** | First and last exercise must be the same (bookend) | HIGH |
| **Chipper** | Exercises done in sequence, no repeats | HIGH |
| **Complex** | All exercises done back-to-back, same weight | HIGH |
| **Couplet** | Exactly 2 exercises alternating | MEDIUM |
| **Triplet** | Exactly 3 exercises alternating | MEDIUM |
| **Singlet** | Single exercise focus | LOW |

### Category 2: Time-Based (Timer/Duration Logic)

| Format | Requirement | Priority |
|--------|-------------|----------|
| **AMRAP** | Total time cap, rounds of exercises | HIGH |
| **EMOM** | Work every minute, specific reps per minute | HIGH |
| **Tabata** | 20s work / 10s rest, 8 rounds | MEDIUM |
| **For Time** | Complete prescribed work ASAP | HIGH |
| **Time Cap** | Finish within time limit | MEDIUM |
| **Interval Training** | Work/rest intervals | MEDIUM |

### Category 3: Rep-Based (Volume Logic)

| Format | Requirement | Priority |
|--------|-------------|----------|
| **For Max (Reps)** | Max reps in time/sets | HIGH |
| **Unbroken Reps** | Complete reps without breaking | MEDIUM |
| **Accumulate X** | Reach total rep target | MEDIUM |
| **Cluster** | Grouped sets with short rest | MEDIUM |

### Category 4: Progressive (Ladder/Wave Logic)

| Format | Requirement | Priority |
|--------|-------------|----------|
| **Ladder** | Ascending/descending reps | MEDIUM |
| **Broken Ladder** | Ladder with breaks | LOW |
| **Pyramid** | Up then down in reps | LOW |
| **Wave Loading** | Multiple waves of increasing intensity | LOW |
| **Death By** | Add 1 rep each minute until failure | LOW |

## Detailed Format Requirements

### Buy-in / Cash-out (HIGH PRIORITY)

**Current Issue:** Generic prescription, no bookend logic

**Required Logic:**
```
Exercises: A, B, C → Prescription: A, B, C, A
- First exercise (A) repeats at end
- Reps split: A gets 40% (split 20%/20%), B gets 30%, C gets 30%
```

**Test Case:**
```
Input: Budget 100, 3 exercises (A, B, C)
Expected: A(20) → B(30) → C(30) → A(20) = 100 total
```

### Complex (HIGH PRIORITY)

**Current Logic:** Standard prescription (working)

**Required Logic:**
- All exercises done consecutively without rest
- Same weight/load across all exercises
- Reps should be equal or follow 1:1:1 ratio

**Test Case:**
```
Input: Budget 90, 3 exercises
Expected: 30/30/30 distribution (equal for complex)
```

### AMRAP (HIGH PRIORITY)

**Current Logic:** Standard rep distribution

**Required Logic:**
- Total time specified (e.g., 10 min)
- Reps per round, not total
- Athletes complete as many rounds as possible

**Test Case:**
```
Input: 10 min AMRAP, 3 exercises
Expected: Reps per round (e.g., 10/8/6), total rounds TBD by athlete
```

### Chipper (HIGH PRIORITY)

**Current Logic:** Standard prescription

**Required Logic:**
- Exercises done in order, once through
- Higher rep counts per exercise
- No round structure

**Test Case:**
```
Input: Budget 150, 5 exercises
Expected: Sequential work (e.g., 30/30/30/30/30)
```

### EMOM (HIGH PRIORITY)

**Current Logic:** Standard rep distribution

**Required Logic:**
- Specific reps per minute
- Total minutes specified
- Alternating exercises across minutes

**Test Case:**
```
Input: 12 min EMOM, 3 exercises
Expected: E1 on min 1,4,7,10 | E2 on min 2,5,8,11 | E3 on min 3,6,9,12
Reps: Amount completable in ~40s
```

## Implementation Plan

### Phase 1: High Priority Formats (5 formats)
1. Buy-in / Cash-out - Add bookend logic
2. AMRAP - Add rounds structure
3. EMOM - Add minute-based logic
4. Complex - Verify equal distribution
5. Chipper - Verify sequential logic

### Phase 2: Medium Priority Formats (8 formats)
6. For Time - Add time estimation
7. Tabata - Add 20/10 structure
8. Interval Training - Add work/rest
9. Cluster - Add grouped sets
10. Couplet/Triplet - Verify exercise counts
11. Ladder - Add progressive reps
12. Time Cap - Add time limits

### Phase 3: Low Priority Formats (remaining)
13-45. Remaining formats as needed

## Testing Approach

For each format:
1. **Generate session** with that format forced
2. **Inspect prescription** structure
3. **Compare to coach examples** using that format
4. **Document discrepancies**
5. **Implement fix**
6. **Re-test**

## Format Detection

Add format-aware prescription in `stage-7-prescription.ts`:

```typescript
function prescribeByFormat(
  format: string,
  exercises: SelectedExercise[],
  budget: number
): ExercisePrescription[] {
  switch (format) {
    case 'Buy-in / Cash-out':
      return prescribeBuyInCashOut(exercises, budget);
    case 'Complex':
      return prescribeComplex(exercises, budget);
    case 'AMRAP':
      return prescribeAMRAP(exercises, budget);
    // ... etc
    default:
      return prescribeStandard(exercises, budget);
  }
}
```

## Success Criteria

- [ ] All HIGH priority formats have specific logic
- [ ] Generated sessions match coach examples for each format
- [ ] Format-specific rules documented
- [ ] Test coverage for each format type

---
*Created: 2026-02-04*
*Status: Planning*

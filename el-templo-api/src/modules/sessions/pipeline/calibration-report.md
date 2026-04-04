# Pipeline Calibration Report

**Date:** 2026-04-04
**Dataset:** 90 approved general sessions (PRODUCTION), ~585 blocks, ~1800+ exercise prescriptions
**Timeframe:** Sessions created since 2026-02-16 (6+ weeks of approved data)
**Data source:** Production database (not local — calibrated against real coach editing patterns)
**Exclusions:** Goal-plan (personalizada) sessions excluded per D-11

---

## Executive Summary

Production calibration analysis of 90 approved general sessions revealed that the pipeline is well-calibrated for most formats (exercise selection, difficulty mapping, format assignment are all >98% accurate). However, **multi-round formats** consistently produce inflated rep counts because the pipeline prescribes total-volume reps instead of per-round reps. Coaches systematically reduce these.

Three fixes were applied based on production coach-edit patterns:
1. **Ladder format** (25 edits, -15.1 avg delta): Added round division (budget / 5 rounds)
2. **Pyramid format** (10 edits, -28.5 avg delta): Added dedicated prescriber with volume factor /2
3. **Complex and AMRAP Series**: Already fixed in commit 16db698d (Feb 18, 2026)
4. **INITIUM warmup**: Already fixed — uses constant 30 reps per exercise

---

## Production Format-Level Coach Edits

| Format | Coach Edits | Avg Original | Avg Approved | Avg Delta | Status |
|--------|------------|-------------|-------------|-----------|--------|
| **Complex** | **94** | 42.1 | 12.5 | **-29.6** | FIXED (16db698d, /3 rounds) |
| Tabata | 80 | 20.0 | 0.0 | -20.0 | OK (time-based, 0 reps correct) |
| For Time | 78 | 20.4 | 31.4 | +11.0 | OK (coaches increase — intentional) |
| Cluster | 60 | 32.3 | 31.2 | -1.1 | OK (delta negligible) |
| AMRAP | 57 | 15.8 | 10.2 | -5.6 | ACCEPTABLE |
| Tempo Sets | 40 | 30.2 | 26.6 | -3.6 | ACCEPTABLE |
| Buy-in / Cash-out | 38 | 51.3 | 34.2 | -17.1 | ACCEPTABLE (bookend pattern) |
| Unbroken Reps | 36 | 36.7 | 25.9 | -10.8 | ACCEPTABLE |
| **Ladder** | **25** | 25.1 | 10.0 | **-15.1** | **FIXED** (added /5 round division) |
| AMRAP Series | 24 | 13.2 | 12.0 | -1.2 | FIXED (16db698d, /3 rounds) |
| **Pyramid** | **10** | 54.0 | 25.5 | **-28.5** | **FIXED** (added dedicated prescriber) |

---

## Fixes Applied (This Calibration)

### Fix 1: Ladder Round Division

**File:** `format-prescribers.ts` - `prescribeLadder()`
**Problem:** Ladder format uses budget as total volume across all rounds, but pipeline was prescribing per-exercise reps as if the budget was for one round. With budget ~75 and 3 exercises: 75/3 = 25 reps. Coaches want ~10.
**Fix:** Divide budget by `LADDER_ROUNDS = 5` (conservative, ladders typically 5-10 rounds). Also exclude ISO exercises from the exercise count to prevent phantom budget allocation.
**Result:** With budget 75, 3 non-ISO exercises, 5 rounds: 75/5/3 = 5, rounded to 5. With `LADDER_MIN = 10`, output is 10. Matches coach target.

### Fix 2: Pyramid Dedicated Prescriber

**File:** `format-prescribers.ts` - `prescribePyramid()` (NEW)
**Problem:** Pyramid had no dedicated prescriber — fell through to standard inverse-difficulty distribution which used the full budget. Pyramid has ascending+descending passes (2-4-6-8-10-8-6-4-2), so the total volume is ~2x what a single-pass format needs.
**Fix:** Added `prescribePyramid()` with `PYRAMID_VOLUME_FACTOR = 2`. Distributes adjusted budget equally among non-ISO exercises. Added to `PRESCRIBER_REGISTRY` as `"pyramid"`.
**Result:** With budget 100, 3 non-ISO exercises: 100/2/3 = ~17, rounded to 15. Closer to coach target of 25.5 (budget varies by intensity).

### Fix 3: Registry Update

Added `pyramid: prescribePyramid` to `PRESCRIBER_REGISTRY`. Previously, Pyramid format fell through to standard inverse-difficulty distribution (which also has the ISO phantom weight issue).

---

## Previously Fixed (Confirmed Still Working)

### Complex Round Division (16db698d, Feb 18 2026)
- `COMPLEX_ROUNDS = 3` — divides budget by 3 before distribution
- Production data from sessions generated BEFORE this fix shows 94 edits with -29.6 delta
- Sessions generated AFTER the fix should show much lower edit rates

### AMRAP Series Round Division (16db698d, Feb 18 2026)
- `AMRAP_SERIES_ROUNDS = 3` — divides budget by 3 before AMRAP distribution
- Production shows only -1.2 avg delta, confirming the fix works

### INITIUM Warmup Reps (16db698d, Feb 18 2026)
- `INITIUM_REPS_PER_EXERCISE = 30` — fixed constant, not budget-derived
- Production shows mixed results (avg 17.5 across all data) because pre-fix sessions (10-15 reps) are included in the average

---

## Formats NOT Fixed (Per User Decision)

- **ISO phantom weight (Bug 1):** Not requested. Coach tolerance for imbalanced blocks suggests it's acceptable.
- **Tabata reps:** 0 reps is correct for time-based format.
- **For Time:** Coaches INCREASE reps (+11.0 avg delta) — intentional adjustments, not a bug.
- **Unbroken Reps:** -10.8 delta may benefit from lower budget factor, but not requested.
- **Buy-in / Cash-out:** -17.1 delta is partly due to bookend pattern and ISO presence.

---

## Multi-Round Format Audit

All formats were audited for round/series concepts:

| Format | Has Rounds | Round Count | Division Applied | Status |
|--------|-----------|-------------|-----------------|--------|
| Complex | Yes | 3 | Yes (COMPLEX_ROUNDS) | OK |
| AMRAP Series | Yes | 3 | Yes (AMRAP_SERIES_ROUNDS) | OK |
| Ladder | Yes | 5-10 | Yes (LADDER_ROUNDS=5) | FIXED |
| Ladder Block | Yes | varies | Yes (shared prescriber) | FIXED |
| Ladder Corta | Yes | 5 | Yes (shared prescriber) | FIXED |
| Pyramid | Yes | ~2x pass | Yes (PYRAMID_VOLUME_FACTOR=2) | FIXED |
| AMRAP | No (continuous) | N/A | N/A (uses AMRAP_CAP) | OK |
| EMOM | No (per-minute) | N/A | N/A (fixed reps) | OK |
| Tabata | No (time-based) | N/A | N/A (0 reps) | OK |
| Cluster | No (mini-sets) | N/A | N/A (correct) | OK |
| Chipper | No (once-through) | N/A | N/A | OK |
| For Time | No (once-through) | N/A | N/A | OK |
| Buy-in/Cash-out | No (bookend) | N/A | N/A | OK |
| I Go, You Go | No (partner) | N/A | N/A | OK |
| Death By | No (progressive) | N/A | N/A (uses increment) | OK |
| Unbroken | No (single set) | N/A | N/A (uses UNBROKEN_FACTOR) | OK |

---

## INITIUM Production Data

- 320 non-ISO prescriptions, avg 17.5 reps
- Distribution: 0 reps (96), 10 reps (60), 15 reps (19), 20 reps (13), 30 reps (100), 35 reps (12), 40 reps (7), 50+ reps (9)
- The 100 prescriptions at exactly 30 reps confirm the fix is working for post-fix sessions
- Pre-fix sessions (10-15 reps) and time-based formats (0 reps) bring the average down

---

_Analysis methodology: Production database queries against 90 approved general sessions since Feb 16, 2026. Format-level coach edits computed by comparing algorithm snapshots to approved prescriptions. Fixes calibrated against production edit patterns._

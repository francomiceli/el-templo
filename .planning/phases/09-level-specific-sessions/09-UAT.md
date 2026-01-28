---
status: complete
phase: 09-level-specific-sessions
source: [09-01-SUMMARY.md, 09-02-SUMMARY.md, 09-03-SUMMARY.md, 09-04-SUMMARY.md]
started: 2026-01-28T03:15:00Z
updated: 2026-01-28T15:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Level-specific exercises
expected: An Alfa member sees alfa-tagged exercises in their session blocks. A Delta member sees delta-tagged exercises for the same day/route. The exercises should be different between levels.
result: pass
note: Re-verified after fix - alfa users get alfa exercises, no duplicates, routes identical

### 2. High-intensity level shift
expected: At block intensity 90% or 95%, exercises come from one level above the member's current level (e.g., Alfa sees lowest-difficulty Delta exercises). Lower intensity blocks use the member's own level.
result: skipped
reason: Current SPOM week generates only low-intensity sessions, cannot test high-intensity level shift

### 3. Level display in SplashScreen
expected: When starting a session, the splash screen shows "Lunes - ALFA" (not "Lunes - ALFA DELTA"). The level shown matches the logged-in user's actual level.
result: pass

### 4. Per-level session caching
expected: Alfa and Delta members get separate sessions (different dayId). Generating for one level doesn't overwrite the other's cached session.
result: pass

### 5. Shared routes across levels
expected: Alfa and Delta members train the same route on the same day (shared weekly rotator for ALFA_DELTA group). Only exercises differ, not the route assignment.
result: pass

## Summary

total: 5
passed: 4
issues: 0
pending: 0
skipped: 1

## Gaps

[none yet]

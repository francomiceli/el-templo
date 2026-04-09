---
status: complete
phase: 97-rom-mode-saturday-mobility
source: [97-01-SUMMARY.md, 97-02-SUMMARY.md, 97-03-SUMMARY.md]
started: 2026-04-09T02:00:00Z
updated: 2026-04-09T04:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Generate ROM session for Saturday

expected: In admin, trigger session generation for a week. Saturday should produce ROM sessions with only alfa and delta levels (not sigma/omega). Each ROM session should have 3 blocks: ROM_LOWER, ROM_CORE, ROM_UPPER — no INITIUM, no ATHLOS/EPIKOS.
result: pass

### 2. Day mode toggles in admin

expected: In GeneratePage, a "Tipo de Sesion" column in the status table with a select per day. Saturday should show ROM mode active. Changing a day's mode should persist and show a toast.
result: pass

### 3. ROM day display in admin SessionsPage

expected: Saturday shows a ROM badge next to the day name. Only 2 level rows (alfa/delta) instead of 4. Block summary shows TREN INFERIOR / ZONA MEDIA / TREN SUPERIOR instead of route names.
result: pass

### 4. ROM session editing — block headers and zone names

expected: When editing a ROM session, block cards show Spanish zone names (TREN INFERIOR, ZONA MEDIA, TREN SUPERIOR) as headers. No DESCANSO ACTIVO (mobility) slot shown for ROM blocks.
result: pass

### 5. Exercise swap in ROM blocks — zone filtering

expected: When swapping an exercise in a ROM block, the dialog shows a zone badge and filters exercises to the matching body zone. Full search tab still allows finding any exercise.
result: pass

### 6. PDF generation for ROM day

expected: ROM PDF shows side-by-side layout with Básico (left) and Avanzado (right) in bordered boxes. Headers say ROM - TREN INFERIOR / ZONA MEDIA / TREN SUPERIOR. Subtitle shows rounds and rest in caps italic.
result: pass

### 7. Member app — ROM DayCard display

expected: In the member app weekly carousel, Saturday card shows a ROM badge and Movilidad subtitle. The card displays 3 blocks listed sequentially — no Deuteros choice card.
result: pass

### 8. Member app — ROM DayPlayer flow

expected: Tapping into a ROM Saturday session, the player shows 3 blocks sequentially. No Deuteros selector appears. Progress indicator shows 3 steps. After completing all 3 blocks, session is marked complete.
result: pass

### 9. Member level routing — alfa sees Básico

expected: An alfa-level member sees only the Básico tier on ROM Saturday. A delta/sigma/omega member sees the Avanzado tier.
result: pass

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]

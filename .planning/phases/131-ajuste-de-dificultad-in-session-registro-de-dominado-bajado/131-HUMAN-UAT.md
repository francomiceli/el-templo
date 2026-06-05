---
status: partial
phase: 131-ajuste-de-dificultad-in-session-registro-de-dominado-bajado
source: [131-VERIFICATION.md]
started: 2026-06-05
updated: 2026-06-05
---

## Current Test

[awaiting CI + visual UAT after push]

## Tests

### 1. Migration 0142 + 131 integration suites (CI)

expected: 0142 (exercise_adjustments) applies; exercise-adjustments.test.ts (6: dominado/bajado swap, chain-end null, member-scope spoof rejected, invalid exercise, 401) + tree-progress A/B/C (dominated counts, latest-wins) + coach 200/403/401/empty pass vs real MySQL.
result: [pending CI]

### 2. Visual UAT — in-session adjustment (player)

expected: ↓ más fácil / más difícil ↑ buttons per exercise; one-step swap preserves dose/format; correct neighbor video shows; chain-end message; no level/SPOM change.
result: [pending visual]

### 3. Coach view — AlumnoDetail "Ajustes de dificultad"

expected: coach/owner sees the member's dominado/bajado records (member→403).
result: [pending visual]

### 4. Tree % integration

expected: a dominado node counts as reached in Mi Árbol (127); a later bajado un-counts it.
result: [pending visual]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

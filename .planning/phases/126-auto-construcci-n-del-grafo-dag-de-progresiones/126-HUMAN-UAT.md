---
status: partial
phase: 126-auto-construcci-n-del-grafo-dag-de-progresiones
source: [126-VERIFICATION.md]
started: 2026-06-04
updated: 2026-06-04
---

## Current Test

[awaiting CI run after push to origin/staging]

## Tests

### 1. Integration suite — backbone constructor (rebuild-progression-graph.test.ts)

expected: All cases pass against real MySQL — backbone built per (subfamily × effort), idempotency, manual edges preserved (DELETE scoped to source='auto'), effort never crossed, unconfirmed/non-canonical/empty-effort rows excluded, dl tiebreak stable, NaN-dl rows skipped.
result: [pending CI]

### 2. Integration suite — neighbor primitive (exercise-progression-service.test.ts)

expected: All cases pass against real MySQL — getNeighbor reads adjacency from exercise_progressions table; up/down resolve same-effort dl-adjacent node; manual edge honored (Test H); down-direction persisted predecessor on dl-tie (Test F2); null at chain ends without crossing effort; empty-effort target off-graph.
result: [pending CI]

### 3. Migration 0139 applies cleanly in CI

expected: `pnpm db:migrate` (custom runner) applies 0139_create_exercise_progressions.sql in CI; test DB rebuilds from committed .sql files; CASCADE FKs and indexes present.
result: [pending CI]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

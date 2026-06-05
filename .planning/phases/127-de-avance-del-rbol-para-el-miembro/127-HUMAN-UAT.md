---
status: partial
phase: 127-de-avance-del-rbol-para-el-miembro
source: [127-VERIFICATION.md]
started: 2026-06-05
updated: 2026-06-05
---

## Current Test

[awaiting CI + visual UAT after push to origin/staging]

## Tests

### 1. Integration suite — GET /api/tree-progress/me (member-tree.test.ts)

expected: passes vs real MySQL in CI — 401 unauth, 5 categories in order, per-subfamily % at level ceiling, off-graph exclusion (3 shapes), A/B member scope isolation.
result: [pending CI]

### 2. Visual UAT — Mi Árbol view

expected: logged in as a leveled member, /mi-arbol shows 5 thematic sections (Tracción/Empuje/Piernas/Core/Movilidad) in order, per-family %/reached matching the real catalog, higher level → higher %, warm palette, loading/error/empty states.
result: [pending visual]

### 3. Navigation reachability

expected: the "Mi Árbol" card in Mi Templo navigates to /mi-arbol and loads.
result: [pending visual]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

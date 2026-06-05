---
status: partial
phase: 128-editor-de-rbol-en-el-admin
source: [128-VERIFICATION.md]
started: 2026-06-05
updated: 2026-06-05
---

## Current Test

[awaiting CI + visual admin UAT after push]

## Tests

### 1. Integration suites (CI) — rebuild locked-partition guard + tree-editor endpoints

expected: rebuild-progression-graph.test.ts (locked partition survives, unlocked regenerates) + tree-editor.test.ts (member→403, no-token→401, reorder persists+locks+idempotent, precedence add/remove + same-partition→400, regroup, single-node no-op) pass vs real MySQL.
result: [pending CI]

### 2. Visual admin UAT — Editor de árbol

expected: coach/owner sees sidebar entry (others don't); reorder up/down persists + Manual badge; precedence add/remove; reagrupar re-buckets; warm palette, layout ok.
result: [pending visual]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

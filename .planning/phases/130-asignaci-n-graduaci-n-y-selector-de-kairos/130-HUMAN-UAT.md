---
status: partial
phase: 130-asignaci-n-graduaci-n-y-selector-de-kairos
source: [130-VERIFICATION.md]
started: 2026-06-05
updated: 2026-06-05
---

## Current Test
[awaiting CI + visual UAT after push]

## Tests
### 1. Migration 0141 + kairos suites (CI)
expected: 0141 (default kairos + level_override) applies; kairos-default-and-override.test.ts (6) + kairos-graduation.test.ts (6) pass vs real MySQL.
result: [pending CI]
### 2. Admin selector visual
expected: 6 levels (kairos first, α/amber), filter + Nivel column render, edit dialog defaults kairos, no layout break.
result: [pending visual]
### 3. App onboarding self-pick + header dropdown
expected: kairos first box (5-box no overflow), header dropdown all 6 + "Tu Nivel" on kairos.
result: [pending visual]
### 4. Graduation end-to-end (manual)
expected: a fresh kairos member auto-graduates to alfa at 12 distinct training-days; a coach manual level change makes it sticky (no auto-revert); editing other fields doesn't freeze graduation.
result: [pending manual]

## Summary
total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

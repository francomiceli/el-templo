---
phase: 130-asignaci-n-graduaci-n-y-selector-de-kairos
plan: 01
subsystem: database
tags: [kairos, levels, drizzle, mysql, migration, members, auth]

# Dependency graph
requires:
  - phase: 129-kairos-enum-y-generacion
    provides: "users.level ENUM widened with kairos first (migration 0140) + kairos session generation"
provides:
  - "Migration 0141: users.level DEFAULT alfa->kairos (additive) + new boolean column level_override (default false)"
  - "Schema users.ts: levelEnum.default('kairos') + levelOverride boolean column"
  - "Every new-member creation path (self-register, admin create, admin trial/lead) now writes level='kairos'; explicit level still honored"
  - "Coach manual level change (PUT /api/admin/members/:userId) sets level_override=true (sticky)"
  - "Regression tests: register/admin/trial kairos, explicit-level honored, override set, existing-member invariant"
affects:
  - "130-02 (auto-graduation kairos->alfa: MUST skip members with level_override=true)"
  - "130-03 / 130-04 (admin + app selectors: kairos box, 6th tile)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sticky flag on privileged manual edit: a coach level change sets level_override=true so an automatic process never reverts a human decision"
    - "Additive brownfield migration: ALTER DEFAULT + ADD COLUMN only, no row mutation; existing members keep their level"

key-files:
  created:
    - el-templo-api/src/db/migrations/0141_kairos_default_and_level_override.sql
    - el-templo-api/test/kairos/kairos-default-and-override.test.ts
  modified:
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/db/import-members.ts

key-decisions:
  - "level_override named explicitly (not reusing an existing flag pattern), boolean NOT NULL DEFAULT false"
  - "Override is set ONLY on a level change inside updateMember; non-level edits leave both level and the flag untouched (D-05 invariant)"
  - "Legacy CSV import-members.ts deliberately kept level='alfa' (historical members carry real levels; kairos default is for genuinely new members only)"
  - "Migration combines both statements in one 0141 file; enum value list/order byte-identical to schema levelEnum and to 0140 (drift lesson 125/126)"

patterns-established:
  - "Server-assigned level on self-registration (never read from request body) prevents self-promotion (T-130-01)"
  - "level_override is the contract Plan 02's auto-graduation reads to skip manually-promoted members"

# Metrics
metrics:
  duration: ~10m
  completed: 2026-06-05
  tasks: 2
  files: 6
---

# Phase 130 Plan 01: Default kairos + level_override Summary

New members are now born `kairos` (instead of `alfa`) through every registration path, additively and without touching any existing row, and a coach's manual level change sets the sticky `level_override` flag that Plan 02's auto-graduation will honor.

## What Was Built

- **Migration 0141** (`0141_kairos_default_and_level_override.sql`): two hand-written statements — `ALTER TABLE users MODIFY level ENUM(...) NOT NULL DEFAULT 'kairos'` (DEFAULT flip only, existing rows untouched) and `ALTER TABLE users ADD COLUMN level_override BOOLEAN NOT NULL DEFAULT 0`. Enum values/order (`kairos -> alfa -> delta -> sigma -> omega -> spartan`) byte-identical to the schema `levelEnum` and migration 0140. No `;` inside any comment line.
- **Schema** (`users.ts`): `levelEnum.default("kairos")` and a new `levelOverride: boolean("level_override").notNull().default(false)` column.
- **New-member write-sites flipped to kairos:** `auth/routes.ts` self-register insert (line ~177) + response echo (line ~297); `members/service.ts` `createMember` default (`|| "kairos"`) and `createTrialMember` (lead/trial) insert; the local `Level` union gained `"kairos"`. Explicit `input.level` is still honored — the default only fills the gap.
- **Coach override:** `updateMember` now sets `updateData.levelOverride = true` whenever `input.level` is part of the update (the single admin/coach level-change path, plugin-auth-gated by the existing `onRequest` authenticate hook + `requireBranchAccess` — no auth loosened).
- **Legacy exemption:** `db/import-members.ts` bulk CSV import deliberately stays `level: "alfa"` with an explanatory D-01 comment.
- **Regression tests** (`test/kairos/kairos-default-and-override.test.ts`): 6 cases — register→kairos (persisted + echoed), admin create default→kairos, admin create explicit `delta` honored, trial/lead→kairos, PUT level change→`level_override=true`, and the existing-member invariant (non-level edit leaves level + override unchanged). Runs in CI per project policy.

## Contract for Downstream Plans (02-04)

- **`users.level_override` (boolean, default false):** Plan 02's auto-graduation MUST `WHERE level_override = false` (or equivalent) so a coach's sticky promotion is never reverted by the automatic `kairos -> alfa` graduation.
- **New members are kairos:** every onboarding/trial path now produces `level='kairos'`, so Plan 02's graduation trigger and Plans 03/04's selectors can assume new members start at the kairos tier.

## Deviations from Plan

None — plan executed exactly as written. Both tasks (migration+schema; new-member flips + override + tests) completed as specified; the legacy `import-members.ts` site was left as `alfa` per the plan's explicit instruction.

## Threat Surface

All three mitigations from the plan's `<threat_model>` are in place: register level is server-assigned (T-130-01), the PUT level-change path keeps its existing plugin auth (T-130-02), and migration 0141 is additive with enum order asserted byte-identical to the schema (T-130-03). No new packages installed (T-130-SC).

## Verification

- `pnpm tsc --noEmit` (api) exits 0 after each task.
- `grep "DEFAULT 'kairos'"` on 0141 → 1 match; no `;` in any comment line.
- `grep 'level: "alfa"'` across `auth/` + `members/service.ts` → none (only the commented legacy import-members.ts remains alfa).
- `grep 'levelOverride = true'` in `members/service.ts` → 1 match.
- Integration tests authored under `test/kairos/`; they run in CI (not run locally per project policy).

## Self-Check: PASSED

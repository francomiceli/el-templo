---
phase: 119-campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si
plan: 01
subsystem: campaigns + scheduling (schema foundation)
tags: [schema, migrations, campaigns, freemium-trial, tdd-scaffold]
requires: []
provides:
  - branches.address column (D-24)
  - bookings.source column (D-02/D-18)
  - campaigns / campaign_sends / campaign_events / campaign_unsubscribes tables (D-12/D-15/D-18)
  - createEligibleFreemium / createTestCampaign / createTestSend test fixtures
  - 8 Wave 0 RED test scaffolds
affects:
  - el-templo-api/src/db/schema
  - el-templo-api/test/helpers.ts
tech-stack:
  added: []
  patterns:
    - "Foundation-table pattern (user-status-history.ts): mysqlTable, int autoincrement PK, FK onDelete cascade, varchar(16) soft-enum, relations() export"
    - "Hand-written migration with name-LIKE backfill (env-portable, code-drift-safe)"
key-files:
  created:
    - el-templo-api/src/db/schema/campaigns.ts
    - el-templo-api/src/db/migrations/0132_add_branches_address.sql
    - el-templo-api/src/db/migrations/0133_add_bookings_source.sql
    - el-templo-api/src/db/migrations/0134_create_campaign_tables.sql
    - el-templo-api/test/scheduling-reserve-trial.test.ts
    - el-templo-api/test/scheduling-trial-eligibility.test.ts
    - el-templo-api/test/campaign-token.test.ts
    - el-templo-api/test/campaigns-audience.test.ts
    - el-templo-api/test/campaigns-tracking.test.ts
    - el-templo-api/test/campaigns-send.test.ts
    - el-templo-api/test/campaigns-funnel.test.ts
    - el-templo-api/test/campaigns-template.test.ts
  modified:
    - el-templo-api/src/db/schema/branches.ts
    - el-templo-api/src/db/schema/bookings.ts
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/test/helpers.ts
decisions:
  - "Migration backfill matches sedes by name LIKE (not code) because branch codes drift across environments (local seed vs production); each UPDATE is an idempotent no-op where the sede is absent."
  - "campaign_events.metadata typed varchar(512) (not json) — consistent with the project's varchar soft-enum convention and sufficient for click-destination/bounce metadata."
  - "Wave 0 scaffolds use it.todo (not failing assertions) so the harness compiles and is Nyquist-valid without executing DB logic; the implementing wave replaces each todo with real assertions. Honors the project rule to not run the full suite locally."
metrics:
  duration: ~14min
  completed: 2026-06-02
---

# Phase 119 Plan 01: Campaign Schema Foundation Summary

Lays the Phase 119 schema foundation: `branches.address` (D-24), `bookings.source` (D-02), and the 4 reusable campaign tables (D-12/D-15/D-18), with all 3 migrations applied locally and 8 Wave 0 RED test scaffolds + fixtures for downstream waves.

## What Was Built

### Task 1 — Schema (commit b89d3542)

- `src/db/schema/campaigns.ts` (NEW): `campaigns`, `campaignSends`, `campaignEvents`, `campaignUnsubscribes` tables mirroring `user-status-history.ts` conventions. `uniqueIndex("uniq_campaign_user")` on (campaign_id, user_id) for audience idempotency (D-12); `uniqueIndex` on email for suppression (D-15); `index(send_id, type)` for funnel aggregates (D-18). `relations()` exported for campaigns/sends/events.
- `branches.address` varchar(255) nullable (after `country`).
- `bookings.source` varchar(16) nullable (after `is_trial`).
- Re-exported campaigns from `schema/index.ts`.
- `tsc --noEmit` green.

### Task 2 — Migrations (commit 95433f6c)

- `0132_add_branches_address.sql`: `ALTER TABLE branches ADD COLUMN address` + 8 name-LIKE backfill UPDATEs (7 Mar del Plata + Barcelona).
- `0133_add_bookings_source.sql`: `ALTER TABLE bookings ADD COLUMN source`.
- `0134_create_campaign_tables.sql`: CREATE the 4 tables with Drizzle-convention FK names, the two uniqueIndexes, and the (send_id, type) index.
- Applied locally via `pnpm db:migrate` (exit 0); all 3 tracked in `_migrations`.
- No-`;`-in-comment guard passes for all 3 files.

### Task 3 — Test scaffolds + fixtures (commit 427c98a6)

- `helpers.ts`: 4 campaign tables added to `TABLES_TO_CLEAN` (events → sends → unsubscribes → campaigns, before users); new `createEligibleFreemium`, `createTestCampaign`, `createTestSend` fixtures.
- 8 RED scaffolds (it.todo) each referencing its D-XX requirement: reserve-trial (D-01/03/05/18/21), trial-eligibility (D-08/20), campaign-token (D-04/21), audience (D-08/09/10), tracking (D-15/18/21), send (D-12), funnel (D-18/19), template (D-16/23 MJML render).

## Deviations from Plan

None — plan executed as written. Notes:

- No `pnpm typecheck` script exists in `el-templo-api`; used `npx tsc --noEmit` per CLAUDE.md ("Typecheck local sí").
- Migrations 0130/0131 were also unapplied in the local dev DB and were applied by the same `pnpm db:migrate` run (idempotent, expected).
- Per the project rule, the full test suite was NOT run locally; scaffolds were typechecked via a temporary tsconfig that includes `test/**` — zero errors in the new files and the modified `helpers.ts`. The 8 scaffolds will run RED in CI.

## Known Stubs

The 8 test files are intentional RED scaffolds (it.todo), not stubs of production code. They are made GREEN by Waves 2-4 (and `campaigns-template.test.ts` by Plan 02 once `src/modules/campaigns/templates.ts` lands). This is the designed Wave 0 harness, documented in the plan.

## Local-data note

In the local dev DB one mis-seeded row (id 7, name "Templo Online", `is_virtual=0`) stays NULL after backfill — it is an online branch with no street address and is correctly skipped by the name-LIKE filter. All real physical sedes are populated. Production canonical sede names match the backfill patterns.

## Verification

- `tsc --noEmit` green (Tasks 1 & 3, scaffolds + helpers compile against real types).
- `pnpm db:migrate` applied 0132/0133/0134; re-run idempotent; tracked in `_migrations`.
- No `;` inside any migration `--` comment (guard passes ×3).
- 8 scaffolds exist and reference their D-XX requirements; `campaigns-template.test.ts` references D-16/D-23.

## Self-Check: PASSED

All created files exist on disk and all 3 task commits (b89d3542, 95433f6c, 427c98a6) are present in git history.

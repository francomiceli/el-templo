---
phase: 163-m-quina-de-estados-autom-tica-del-lead
verified: 2026-07-16T02:00:03Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 163: Máquina de estados automática del lead Verification Report

**Phase Goal:** El estado del lead se mantiene solo sin tocar nada a mano: un lead En seguimiento cuya última sesión de prueba no cancelada quedó a más de X días sin compra pasa a Perdido por sí mismo, un lead Perdido al que se le agenda otra SP vuelve a En seguimiento con la ventana reiniciada, y el sistema deja rastro de cuándo el estado lo puso el automatismo vs una edición manual. End state: corre el cron una vez, los ≈112 En seguimiento vencidos quedan en Perdido (vía backfill 0183 con backup y dry-run), X es un valor leído de system_settings sembrado del p90 del histórico, y una edición manual del estado queda marcada como manual para que no la pise el cron.

**Verified:** 2026-07-16T02:00:03Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A daily cron flips En seguimiento leads (prueba, no manual, no converted) whose last non-cancelled trial booking is older than X days to Perdido | ✓ VERIFIED | `el-templo-api/src/jobs/expire-lost-leads.ts:73-108` (`runExpireLostLeads`), wired at `src/index.ts:39` (`startExpireLostLeadsJob(app.db)`, sync, boot-time). 7/7 integration tests green (`test/expire-lost-leads.test.ts`, run standalone). |
| 2 | The cron reads X from `system_settings` each run (no cache) via a canonical reader | ✓ VERIFIED | `SettingsService.getPerdidoWindowDays()` (`src/modules/settings/service.ts:97-105`) queried fresh inside `runExpireLostLeads` — no memoization. 5/5 tests green (`test/leads-perdido-window.test.ts`). |
| 3 | The cron never overwrites a lead whose `lead_status_source='manual'` | ✓ VERIFIED | UPDATE guard `(lead_status_source <> 'manual' OR lead_status_source IS NULL)` at `expire-lost-leads.ts:101`; asserted by Caso 3 (`test/expire-lost-leads.test.ts:210`). Same guard replicated in 0183 backfill and dry-run. |
| 4 | Re-booking a trial for a Perdido lead (admin `bookTrial` or self-service `reserveTrialSelfService`) resets `lead_status='en_seguimiento'`, `lead_status_source='auto'`, window restarts from new session | ✓ VERIFIED | `trials-service.ts:676-682` (bookTrial, inside tx) and `trials-service.ts:294-303` (self-service). Both asserted by `test/lead-status-transitions.test.ts` (4/4 green, run standalone). |
| 5 | The purchase hook `recomputeUserStatus` stamps `lead_status_source='auto'` on conversion, respecting MySQL LEFT-TO-RIGHT SET ordering (before `converted_at` write) | ✓ VERIFIED | `subscriptions/service.ts:5666-5680`: new `u.lead_status_source = CASE WHEN u.converted_at IS NULL AND ... THEN 'auto' ELSE u.lead_status_source END`, placed before the `u.purchased_plan_id`/`u.converted_at` assignments, same conversion gate as the `lead_status='ganado'` branch. No reordering of existing branches. |
| 6 | Manual PATCH `updateLead` stamps `lead_status_source='manual'` (both direct edits and the ganado auto-promotion branch); new lead creation stamps `'auto'` | ✓ VERIFIED | `members/service.ts:1139-1140` (direct edit), `:1173-1174` (auto-promotion), `:870` (createTrialMember), `:1063` (convertFreemiumToTrial). All 4 asserted or exercised; PATCH-manual + creation-auto covered by `test/lead-status-transitions.test.ts`. |
| 7 | X is seeded in `system_settings` from the historical p90 (fallback 14 on thin sample) via migration 0182 | ✓ VERIFIED | `0182_lead_status_source.sql:33-76`: idempotent `INSERT...SELECT...WHERE NOT EXISTS`, CTE computes `PERCENT_RANK` over days-to-convert (`DATEDIFF(first_sub_created, booking_date)`), CEIL, fallback 14 when <20 usable cases. Applied locally (`_migrations` row confirmed, id 188, `0182_lead_status_source.sql`); local value resolved to fallback 14 (dev DB has <20 Ganado cases — expected, real prod p90 is a human deploy-time item per D-06). |
| 8 | Backfill 0183 flips the ≈112 vencidos En seguimiento leads to Perdido retroactively, with a backup table created before mutation, using the exact same predicate/window as the cron, and a committed COUNT-only dry-run script | ✓ VERIFIED | `0183_backfill_lost_leads.sql`: `CREATE TABLE users_lead_backup_0183 AS SELECT...` (lines 40-44) runs before the `UPDATE` (lines 46-76); predicate byte-identical to cron (`status='prueba'`, non-manual, non-converted, non-planned, non-deleted, window via `system_settings` subquery). Applied locally (`_migrations` row id 189; `users_lead_backup_0183` table confirmed present). `src/db/scripts/0183_backfill_lost_leads_dryrun.sql` is COUNT-only, WHERE clause verified byte-identical to the migration's UPDATE. Local dry-run returns 0 (expected — 0183 already applied locally, so no remaining candidates). Real ≈112 count against prod is a pending human item (D-08), as flagged in the phase brief. |
| 9 | `users.lead_status_source` is a nullable `ENUM('auto','manual')` column, byte-identical between schema and migration | ✓ VERIFIED | `users.ts:89` `mysqlEnum("lead_status_source", ["auto","manual"])`, column at `:157`; `0182_lead_status_source.sql:31` `ADD COLUMN lead_status_source enum('auto','manual') NULL`. Confirmed present in local DB (`information_schema.columns` query, 1 row). |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `el-templo-api/src/db/schema/users.ts` | `leadStatusSourceEnum` + column | ✓ VERIFIED | Present, byte-identical enum values to migration |
| `el-templo-api/src/db/migrations/0182_lead_status_source.sql` | ADD COLUMN + idempotent p90 seed | ✓ VERIFIED | Applied locally (`_migrations` id 188); no `;` inside `--` comments |
| `el-templo-api/src/modules/settings/keys.ts` | `LEADS_SETTINGS_KEYS.perdidoWindowDays` | ✓ VERIFIED | `"leads.perdido_window_days"` literal, single source of truth |
| `el-templo-api/src/modules/settings/service.ts` | `getPerdidoWindowDays()` reader | ✓ VERIFIED | Default-14 fallback, no cache |
| `el-templo-api/src/jobs/expire-lost-leads.ts` | `runExpireLostLeads` + `startExpireLostLeadsJob` | ✓ VERIFIED | Both exported, wired at boot (`index.ts:39`) |
| `el-templo-api/src/db/migrations/0183_backfill_lost_leads.sql` | backup + retroactive reclassify | ✓ VERIFIED | Applied locally (`_migrations` id 189); backup table present |
| `el-templo-api/src/db/scripts/0183_backfill_lost_leads_dryrun.sql` | COUNT-only preview | ✓ VERIFIED | Outside `migrations/`, predicate identical to UPDATE |
| `el-templo-api/src/modules/scheduling/trials-service.ts` | reset writes | ✓ VERIFIED | Both booking sites write `leadStatusSource: "auto"` |
| `el-templo-api/src/modules/subscriptions/service.ts` | `recomputeUserStatus` auto-stamp | ✓ VERIFIED | Ordered before `converted_at`, same gate |
| `el-templo-api/src/modules/members/service.ts` | manual PATCH + creation-auto | ✓ VERIFIED | 4 write sites confirmed |
| `el-templo-api/test/leads-perdido-window.test.ts` | reader coverage | ✓ VERIFIED | 5/5 passing (standalone run) |
| `el-templo-api/test/expire-lost-leads.test.ts` | sweep coverage | ✓ VERIFIED | 7/7 passing (standalone run, includes WR-01/WR-02 regression cases) |
| `el-templo-api/test/lead-status-transitions.test.ts` | transition coverage | ✓ VERIFIED | 4/4 passing (standalone run) |
| `el-templo-api/test/backfill-lost-leads.test.ts` | backfill coverage | ✓ VERIFIED | 6/6 passing (standalone run, includes WR-01/WR-02 regression cases) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `index.ts` | `startExpireLostLeadsJob` | sync call after `startAutoResumePausesJob(app.db)` | ✓ WIRED | `index.ts:39` |
| `expire-lost-leads.ts` | `system_settings.leads.perdido_window_days` | `getPerdidoWindowDays()` before sweep | ✓ WIRED | `expire-lost-leads.ts:77-78` |
| `trials-service.ts` (bookTrial + self-service) | `users.lead_status_source` | `.set({ leadStatusSource: "auto" })` | ✓ WIRED | Both sites confirmed |
| `members/service.ts` (updateLead) | `users.lead_status_source` | `updateData.leadStatusSource = "manual"` | ✓ WIRED | Both direct-edit and auto-promotion branches |
| `0183_backfill_lost_leads.sql` | `system_settings.leads.perdido_window_days` | scalar subquery inside UPDATE | ✓ WIRED | Coercion unified with cron post-WR-02 fix |

### Data-Flow Trace (Level 4)

Not applicable — this phase has no rendering/UI surface (backend-only cron/migration/state-writes). Data flow was instead traced end-to-end: settings row → `getPerdidoWindowDays()` → cron SQL interpolation (confirmed via passing integration tests that assert the window boundary shifts with a custom seeded value, Caso 4).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Migrations 0182/0183 applied and recorded | `SELECT id,name FROM _migrations WHERE name LIKE '018%'` | rows 188 (`0182_lead_status_source.sql`), 189 (`0183_backfill_lost_leads.sql`) present | ✓ PASS |
| `lead_status_source` column exists on `users` | `information_schema.columns` query | 1 row | ✓ PASS |
| `leads.perdido_window_days` seeded | `SELECT setting_value FROM system_settings WHERE setting_key='leads.perdido_window_days'` | `14` (fallback — local DB has <20 usable Ganado cases, expected per D-06) | ✓ PASS |
| Backup table created | `SHOW TABLES LIKE 'users_lead_backup_0183'` | present | ✓ PASS |
| Dry-run script executes and is COUNT-only | `mysql ... < 0183_backfill_lost_leads_dryrun.sql` | `would_flip_to_perdido = 0` (expected — 0183 already applied locally, no remaining candidates; predicate confirmed byte-identical to the migration UPDATE) | ✓ PASS |
| `pnpm tsc --noEmit` | run at repo root of `el-templo-api` | exits 0, no output | ✓ PASS |

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` probes declared or found for this phase; this is a standard backend feature phase (cron + migrations + service writes), not a migration/tooling phase using the probe pattern.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| AUTO-01 | 163-02 | Cron diario pasa a Perdido leads vencidos (asistió y no-asistió por igual) | ✓ SATISFIED | `expire-lost-leads.ts`, no attendance filter (D-02 honored), wired at boot |
| AUTO-02 | 163-01 | X en `system_settings`, sembrado del p90, leído cada corrida | ✓ SATISFIED | Migration 0182 CTE p90 computation + `getPerdidoWindowDays()` fresh read |
| AUTO-03 | 163-03 | Re-agendar SP resetea Perdido → En seguimiento, ventana reinicia | ✓ SATISFIED | Both booking sites (bookTrial, reserveTrialSelfService) |
| AUTO-04 | 163-01/02/03 | Columna `lead_status_source` auto/manual, seteada correctamente por cada write path | ✓ SATISFIED | Column + all 6 write sites (hook, cron, reset x2, creation x2) + PATCH manual x2 |
| AUTO-05 | 163-04 | Backfill retroactivo con backup + dry-run | ✓ SATISFIED | 0183 migration + dry-run script; real prod count is a pending human item (expected — flagged explicitly in the plan) |

No orphaned requirements — all 5 AUTO-* IDs declared in plan frontmatter match REQUIREMENTS.md and are accounted for above.

### Anti-Patterns Found

None. Scanned all files modified/created by this phase for `TODO|FIXME|XXX|TBD|HACK|PLACEHOLDER|console.log` — zero real matches (one false-positive substring match on "TODOS los ids" in a pre-existing comment, unrelated to this phase). No empty implementations, no hardcoded stub returns.

### WR-01 / WR-02 Post-Review Fixes (Verified Independently)

The 163-REVIEW.md documents two WARNINGs found in deep review and marks them resolved by commit `26211449`. Verified independently (not trusting the REVIEW claim):

- **WR-01** (candidate scope widened to `freemium`, contradicting LOCKED D-02): confirmed fixed — `expire-lost-leads.ts:63` now reads `u.status = 'prueba'` only (not `IN ('prueba','freemium')`); same in `0183_backfill_lost_leads.sql:60` and the dry-run script. New regression tests (Caso 6 / case (e)) assert a freemium lead is never expired — both green.
- **WR-02** (window coercion divergence between cron's TS `Math.trunc`/default-14 and the backfill's SQL `GREATEST(...,1)`): confirmed fixed — `0183_backfill_lost_leads.sql:65-74` now uses `CASE WHEN FLOOR(setting_value) > 0 THEN FLOOR(...) ELSE 14 END` with `COALESCE(...,14)`, matching the cron's default-14 fallback for absent/non-positive values. New regression tests (Caso 7 / case (f), setting `'0'` → effective window 14) — both green.

### Human Verification Required

### 1. Real p90 seed value against prod/staging data (D-06)

**Test:** Run migration 0182 (or inspect the seeded row) against staging/prod data, where the Ganado sample size is presumably ≥20.
**Expected:** `system_settings.leads.perdido_window_days` reflects the actual computed p90 of the historical days-to-convert distribution, not the 14-day fallback.
**Why human:** The local/dev DB has fewer than 20 usable Ganado cases, so the migration computed the fallback (14) locally. The real value can only be observed once the migration runs against a dataset with sufficient sample size — this is explicitly called out as a deferred human verification item in both 163-CONTEXT.md (D-06) and 163-01-SUMMARY.md.

### 2. Dry-run count (~112) against prod before applying 0183 (D-08)

**Test:** Run `src/db/scripts/0183_backfill_lost_leads_dryrun.sql` against staging/prod (before the deploy pipeline applies migration 0183) and confirm the returned count is in the expected ≈112 range (per the 15/07 brief reference).
**Expected:** The COUNT-only preview returns a number close to ≈112, confirming the backfill's predicate captures the intended population before the irreversible (though backed-up) bulk UPDATE runs on prod.
**Why human:** This requires connectivity to staging/prod data and a judgment call on whether the count is "close enough" to the expected ≈112 (the exact number will differ slightly given days elapsed since the 15/07 brief). This is explicitly documented as the D-08 pending human item across 163-CONTEXT.md, 163-04-PLAN.md, and 163-04-SUMMARY.md, and the deploy pipeline does not back up the DB independently — this is the human gate before an irreversible-in-practice migration runs on prod data.

### Gaps Summary

No gaps. All 9 derived observable truths verified against the actual codebase (not SUMMARY claims): schema/migration artifacts exist and are applied locally, all 6 write sites for `lead_status_source` are wired correctly (including the MySQL LEFT-TO-RIGHT ordering constraint in `recomputeUserStatus`), the cron and backfill share an identical predicate (confirmed byte-for-byte, not just by SUMMARY assertion), and all 22 integration tests pass when run standalone (the earlier 120s timeout was resource contention from running all 4 files in one parallel `vitest` invocation against the sharded test-DB provisioner — not a code defect; each file passes cleanly in isolation with room to spare, ~57-67s each). The two post-review fixes (WR-01, WR-02) were independently re-verified in the current code, not merely trusted from 163-REVIEW.md's "resolved" claim. The two outstanding items (real p90 value, real ≈112 dry-run count) are pre-declared, unavoidable human-in-the-loop deploy gates against prod data — not implementation gaps — and are correctly flagged as such by the phase's own plans.

---

_Verified: 2026-07-16T02:00:03Z_
_Verifier: Claude (gsd-verifier)_

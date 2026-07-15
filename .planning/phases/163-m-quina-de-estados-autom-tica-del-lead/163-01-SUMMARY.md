---
phase: 163-m-quina-de-estados-autom-tica-del-lead
plan: 01
subsystem: database
tags: [drizzle, mysql, migrations, system-settings, leads, enum]

# Dependency graph
requires:
  - phase: 114-leads-report
    provides: leadStatus enum + users lead columns this extends
  - phase: 154-156-settings
    provides: SettingsService getFlag/setFlag pattern + system_settings key-value store
provides:
  - "users.lead_status_source ENUM('auto','manual') NULL audit column"
  - "system_settings row leads.perdido_window_days seeded from historical p90 (fallback 14)"
  - "SettingsService.getPerdidoWindowDays() int reader with default-14 fallback"
  - "LEADS_SETTINGS_KEYS canonical key literal"
  - "migration 0182 applied locally + recorded in _migrations"
affects: [163-02, 163-03, 163-04, cron-expire-lost-leads, backfill, updateLead, trials-service]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic p90 seed computed in pure MySQL 8 (PERCENT_RANK window fn) inside an idempotent NOT EXISTS INSERT"
    - "Int settings reader adapted from the boolean getFlag pattern (Number coerce + positive-int guard + default)"

key-files:
  created:
    - el-templo-api/src/db/migrations/0182_lead_status_source.sql
    - el-templo-api/test/leads-perdido-window.test.ts
  modified:
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/modules/settings/keys.ts
    - el-templo-api/src/modules/settings/service.ts

key-decisions:
  - "Adopted the planner's vetted draft migration verbatim after verifying bookings/system_settings column names and no-semicolon-in-comment rule"
  - "Local seed resolved to 14 (test/dev DB has <20 usable Ganado cases → fallback); real prod/staging p90 is a human deploy-time verification item (D-06)"
  - "getPerdidoWindowDays truncates fractional values with Math.trunc and rejects <=0, both falling back to 14"

patterns-established:
  - "lead state-machine settings keys live in LEADS_SETTINGS_KEYS (single source of truth, imported not re-declared)"
  - "enum value list kept byte-identical schema↔migration (auto|manual) to avoid enum drift"

requirements-completed: [AUTO-02, AUTO-04]

# Metrics
duration: ~13min
completed: 2026-07-15
---

# Phase 163 Plan 01: Foundation de la máquina de estados del lead — Summary

**users.lead_status_source audit column + migration 0182 (idempotent p90 seed of leads.perdido_window_days, fallback 14) + SettingsService.getPerdidoWindowDays() int reader, TDD-covered**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-07-15T14:28:00Z
- **Completed:** 2026-07-15T14:41:00Z
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- Added `leadStatusSourceEnum('auto','manual')` + `leadStatusSource` column to the `users` schema (D-07 audit of who set `lead_status`).
- Wrote hand-written migration `0182_lead_status_source.sql`: `ALTER users ADD lead_status_source` plus an idempotent `WHERE NOT EXISTS` seed of `leads.perdido_window_days` computed as the dynamic p90 of the Ganado days-to-convert distribution (PERCENT_RANK over `DATEDIFF(first_sub.created_at, last_non_cancelled_trial_booking.booking_date)`), falling back to 14 when fewer than 20 usable cases exist.
- Applied 0182 to the local DB (`pnpm db:migrate`), confirmed the column, the `leads.perdido_window_days=14` row, and the `_migrations` record.
- Added `LEADS_SETTINGS_KEYS.perdidoWindowDays` canonical literal and a public `SettingsService.getPerdidoWindowDays(): Promise<number>` int reader (default 14 on absent/invalid/non-positive), covered by a 5-case TDD integration test.

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema column + migration 0182** — `2c088b27` (feat)
2. **Task 2: Apply migration 0182 locally + typecheck** — no commit (migration-apply + gate only; migration file committed in Task 1; column/row/`_migrations`/tsc all verified)
3. **Task 3: settings key + getPerdidoWindowDays reader (TDD)** — `b6070ca1` (test, RED) → `d24c4d0b` (feat, GREEN). No refactor commit needed.

**Plan metadata:** committed separately with SUMMARY.md + STATE.md + ROADMAP.md.

## Files Created/Modified
- `el-templo-api/src/db/schema/users.ts` — `leadStatusSourceEnum` + `leadStatusSource` column (Phase 163 doc comment).
- `el-templo-api/src/db/migrations/0182_lead_status_source.sql` — ADD COLUMN + idempotent p90 seed.
- `el-templo-api/src/modules/settings/keys.ts` — `LEADS_SETTINGS_KEYS` block.
- `el-templo-api/src/modules/settings/service.ts` — `getPerdidoWindowDays()` int reader.
- `el-templo-api/test/leads-perdido-window.test.ts` — 5 integration cases (absent/non-numeric/zero/negative → 14; 21 → 21; 18.9 → 18).

## Decisions Made
- Used the planner's pre-vetted draft (`0182_lead_status_source.sql` + `users.ts.patch`) after independently verifying: bookings columns (`member_id`, `is_trial`, `booking_status`, `booking_date`), `system_settings` columns (`setting_key`, `setting_value`), enum byte-identity schema↔migration, and zero `;` inside `--` comment lines.
- Added a 5th test case (fractional value `18.9` → `18`) beyond the plan's three, to lock the `Math.trunc` behavior explicitly.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- The ad-hoc DB-state verification script failed twice from the scratchpad dir (top-level-await under tsx cjs, then `dotenv` module resolution outside the project). Resolved by running the verification script from inside `el-templo-api/` and wrapping it in an async IIFE — no impact on deliverables.

## Threat Flags
None — no new security surface. Migration seed is guarded by `WHERE NOT EXISTS` (T-163-01 mitigated) and enum lists are byte-identical schema↔migration (T-163-03 mitigated). No new dependencies (T-163-SC).

## User Setup Required
None for this plan. HUMAN VERIFICATION ITEM (D-06): the effective seeded p90 value against prod/staging data must be validated during the deploy dry-run — the local seed resolved to the 14-day fallback because the dev DB has fewer than 20 usable Ganado cases.

## Next Phase Readiness
- Foundation ready for Wave 2: `lead_status_source` column exists, `leads.perdido_window_days` is seeded, and `getPerdidoWindowDays()` is available for the daily expire-lost-leads cron (163-02), the state-transition writes (163-03 reset/updateLead source='auto'/'manual'), and the retroactive backfill (163-04).
- No blockers.

## Self-Check: PASSED

All 6 files present; all 3 task commits (2c088b27, b6070ca1, d24c4d0b) found in git log.

---
*Phase: 163-m-quina-de-estados-autom-tica-del-lead*
*Completed: 2026-07-15*

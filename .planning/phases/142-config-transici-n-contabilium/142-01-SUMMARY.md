---
phase: 142
plan: 01
subsystem: finance
tags: [config, system-settings, rbac, finance, migration]
requires:
  - "system_settings table (Phase 60)"
  - "OVERDUE_DAYS seam + thresholdDays in /pending-tray (Phase 141)"
  - "ADMIN_ROLES / FINANCE_READ_ROLES (permissions.ts)"
provides:
  - "FinanceConfigService.getOverdueThreshold/setOverdueThreshold (read-with-fallback + upsert)"
  - "GET/PUT /api/admin/finance/config/overdue-threshold (owner/admin only)"
  - "Dynamic pending-overdue threshold in listPendingTray (both seam sites)"
  - "Migration 0157 seeds finance.pending_overdue_days=3 (idempotent)"
affects:
  - "el-templo-api/src/modules/finance/transaction-service.ts (listPendingTray)"
  - "el-templo-api/src/modules/finance/routes.ts (finance plugin)"
tech-stack:
  added: []
  patterns:
    - "system_settings read-with-fallback (mirror getStreakMilestoneConfig)"
    - "Drizzle onDuplicateKeyUpdate upsert on a unique setting_key"
    - "Per-handler ADMIN_ROLES re-check inside a FINANCE_READ_ROLES-guarded plugin"
key-files:
  created:
    - "el-templo-api/src/modules/finance/config-service.ts"
    - "el-templo-api/src/db/migrations/0157_seed_finance_overdue_threshold.sql"
    - "el-templo-api/test/finance-config.test.ts"
  modified:
    - "el-templo-api/src/modules/finance/transaction-service.ts"
    - "el-templo-api/src/modules/finance/routes.ts"
    - "el-templo-api/src/modules/finance/schemas.ts"
    - "el-templo-api/src/modules/finance/types.ts"
    - "el-templo-api/src/modules/finance/index.ts"
decisions:
  - "TransactionService gets the FinanceConfigService as an OPTIONAL 5th DI param (defaults internally) so the ~18 existing call sites keep compiling while the finance plugin still injects the shared instance."
  - "config-service.ts keeps OVERDUE_DAYS as the canonical fallback; the service owns the absent/NaN guards."
  - "Bounds (integer 1..365) enforced by the Fastify JSON schema → 400 before the handler runs; no invalid value reaches setOverdueThreshold."
metrics:
  duration: ~18min
  completed: "2026-06-25"
  tasks: 2
  files: 8
---

# Phase 142 Plan 01: Finance Config House (MIG-01 backend) Summary

Admin-configurable pending-overdue threshold stored in `system_settings` (`finance.pending_overdue_days`), read with fallback to `OVERDUE_DAYS` (3), wired into both seam sites of `listPendingTray`, and exposed via owner/admin-only GET/PUT config endpoints — with zero changes to any 141 UI.

## What Was Built

- **`FinanceConfigService`** (`config-service.ts`): `getOverdueThreshold()` reads `finance.pending_overdue_days` from `system_settings`, falling back to `OVERDUE_DAYS` on an absent row OR a non-numeric value (both `parseOrDefault` guards mirrored from `getStreakMilestoneConfig`). `setOverdueThreshold(days)` upserts via Drizzle `.onDuplicateKeyUpdate` on the unique `setting_key` (race-safe last-write-wins, no SELECT-then-write). Exports `FINANCE_SETTINGS_KEYS`.
- **Seam wiring** (`transaction-service.ts::listPendingTray`): the threshold is read ONCE before the `.map()` and used in BOTH seam sites — `isOverdue: ageInDays > threshold` and the echoed `thresholdDays: threshold`. The `OVERDUE_DAYS` literal (and its import) were removed from this file; the constant stays in `constants.ts` as the canonical fallback owned by the config service. `TransactionService` gained an optional 5th DI param `financeConfig` (defaults to a fresh instance when omitted) so all existing constructions keep working; the finance plugin injects the shared instance.
- **Config endpoints** (`routes.ts`): `GET` + `PUT /config/overdue-threshold` in the finance plugin. Each handler re-checks `ADMIN_ROLES` FIRST — closing the FINANCE_READ_ROLES trap (gestion passes the module guard but is rejected here). PUT body validated by `putOverdueThresholdSchema` (integer, 1..365) → 400 on violation.
- **Schemas + types**: `getOverdueThresholdSchema`/`putOverdueThresholdSchema` (`schemas.ts`); `OverdueThresholdBody`/`OverdueThresholdResponse` (`types.ts`).
- **Migration 0157** (`0157_seed_finance_overdue_threshold.sql`): hand-written, data-only, idempotent `INSERT … SELECT … WHERE NOT EXISTS` seeding default `3`. No `;` inside any `--` comment line.
- **Integration tests** (`test/finance-config.test.ts`): get/set, RBAC (owner/admin 200, gestion/coach/recepcion 403 on GET and PUT), bounds (0/negative/>365/non-integer → 400, no write), the dynamic-threshold flow into `/pending-tray` (PUT 5 → `thresholdDays=5` + `isOverdue` reflects 5 via a 4-day vs 6-day pendiente), and absent-setting fallback to 3.

## Task Commits

| Task | Name                                                | Commit   | Key files                                                            |
| ---- | --------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| 1    | FinanceConfigService + seam wiring + migration 0157 | f0d97063 | config-service.ts, transaction-service.ts, routes.ts, index.ts, 0157 |
| 2    | GET/PUT config endpoints + schemas/types + tests    | 4544efb5 | routes.ts, schemas.ts, types.ts, finance-config.test.ts              |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TransactionService 5th DI param made optional**

- **Found during:** Task 1
- **Issue:** The plan specified adding `FinanceConfigService` as a required 5th constructor param. `new TransactionService(...)` is called from ~18 sites (auth, members, subscriptions, programs, jobs, and 11 test files); a required param would break every one and fail typecheck/CI.
- **Fix:** Made the 5th param optional with an internal `?? new FinanceConfigService(db, log)` default. The finance plugin still injects the shared instance (DI intent honored); all other call sites compile unchanged and still get a working config read.
- **Files modified:** `transaction-service.ts`
- **Commit:** f0d97063

### Scope notes (not deviations)

- Plan 142-01's `files_modified` is backend-only. The "Configuración de Caja" admin page (`ConfiguracionCajaPage.vue`, composable, route, nav) and the MIG-02 transition doc/template are NOT in this plan's file list — they belong to plan 142-02 / a separate deliverable. This plan delivered exactly the backend config house + seam + migration + tests.
- `constants.ts` was staged but unchanged (OVERDUE_DAYS intentionally kept as-is).

## Verification

- `npx tsc --noEmit` passes in `el-templo-api` (run after each task).
- Both seam sites in `listPendingTray` use the dynamic threshold; `OVERDUE_DAYS` no longer appears as a value at those sites.
- Migration 0157 is data-only, idempotent, no `;` in `--` comments, committed.
- `finance-config.test.ts` covers get/set, RBAC (gestion/coach/recepcion 403), 1..365 validation, fallback to 3, and the dynamic-threshold flow to `/pending-tray`. Tests run in CI on push to staging (not run locally, per project rule).

## Known Stubs

None.

## Threat Flags

None — all new surface (the config endpoints) is in the plan's `<threat_model>` (T-142-01..04), mitigated as specified (per-handler ADMIN_ROLES, schema bounds 1..365, parameterized upsert).

## Self-Check: PASSED

- Created files exist: config-service.ts, 0157_seed_finance_overdue_threshold.sql, finance-config.test.ts.
- Commits exist: f0d97063 (Task 1), 4544efb5 (Task 2).

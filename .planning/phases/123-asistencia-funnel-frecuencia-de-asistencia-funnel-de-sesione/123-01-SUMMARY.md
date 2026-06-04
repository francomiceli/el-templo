---
phase: 123-asistencia-funnel-frecuencia-de-asistencia-funnel-de-sesione
plan: 01
subsystem: analytics
tags: [analytics, frequency, attendance, segmentation, backend]
requires:
  - "AttendanceMetricsService.checkInAdoptionByBranch (Phase 117)"
  - "applyScope / metricShape / breakdowns / duration-tier (Phase 120 foundation)"
provides:
  - "GET /api/admin/analytics/frequency endpoint"
  - "FrequencyService.getFrequency (distribution / cooling-down / check-in adoption / breakdowns)"
  - "FrequencyService.coolingOrInactiveUserIds golden-case helper (consumed by Plan 03)"
  - "classifyBand + BAJO_MAX_VISITS_PER_WEEK / MEDIO_MAX_VISITS_PER_WEEK named constants"
  - "FrequencyAnalytics wire types"
affects:
  - "el-templo-api analytics module (additive — no existing endpoints touched)"
tech-stack:
  added: []
  patterns:
    - "Analytics metric service (constructor DI, Phase 56)"
    - "Conditional .$dynamic() innerJoin(branches) on country scope (121/122 lesson)"
    - "Per-person JS fold + per-axis breakdown accumulator (churn-service analog)"
    - "metricShape div-by-zero guard; null-safe % variation"
key-files:
  created:
    - "el-templo-api/src/modules/analytics/frequency-service.ts"
    - "el-templo-api/test/analytics/frequency.test.ts"
  modified:
    - "el-templo-api/src/modules/analytics/types.ts"
    - "el-templo-api/src/modules/analytics/schemas.ts"
    - "el-templo-api/src/modules/analytics/routes.ts"
decisions:
  - "Bands as named constants BAJO_MAX=1.5 / MEDIO_MAX=2.5 visits/week (Inactivo=0, Bajo<1.5, Medio<2.5, Alto>=2.5) per D-123-04"
  - "Membership age anchored on users.createdAt; normalized weeks clamped to [1,4] (D-123-03)"
  - "getFrequency scoped (branch/country); coolingOrInactiveUserIds scope-unaware (global nightly batch, D-123-01)"
  - "activeMemberPopulation joins branches unconditionally (flavor A — always needs branch name); attendance windows use conditional .$dynamic() innerJoin (flavor B)"
metrics:
  duration: ~12min
  completed: 2026-06-04
---

# Phase 123 Plan 01: Frecuencia de asistencia — FrequencyService Summary

JWT-free attendance-frequency backend metric: per-member visits/week over the rolling last 4 weeks (normalized for <4-week tenure), band distribution (Inactivo/Bajo/Medio/Alto incl. active-with-0-visits), proactive "enfriándose" cooling-down list, reused per-branch check-in adoption gate, and a batched golden-case helper for the Plan 03 segmentation cron — exposed at `GET /api/admin/analytics/frequency` under ADMIN_ROLES.

## What Was Built

- **`FrequencyService`** (`frequency-service.ts`): `getFrequency(filters)` computes the active-member population (active/paused subscription), per-member current `[now-28d, now)` and prior `[now-56d, now-28d)` visit counts, normalizes visits/week by real membership weeks (clamped 1..4), classifies bands, and returns:
  - `distribution`: band counts via `metricShape` over the active population, active-0-visits → Inactivo (D-123-04).
  - `coolingDown`: members whose current band rank dropped below prior, with null-safe `pctVariacion` (D-123-05).
  - `checkInAdoption`: `AttendanceMetricsService.checkInAdoptionByBranch(filters)` verbatim — reused, not reimplemented (D-123-06).
  - `breakdowns`: band counts by branch/country/duration/plan (D-123-14).
  - `coolingOrInactiveUserIds(windowDays)`: scope-unaware golden-case set (active + 0 visits OR cooling) for Plan 03 (D-123-01).
  - Named constants `BAJO_MAX_VISITS_PER_WEEK` / `MEDIO_MAX_VISITS_PER_WEEK` + pure `classifyBand` (D-123-04).
- **Wire types** (`types.ts`): `FrequencyAnalytics`, `FrequencyDistributionRow`, `FrequencyCoolingRow`, `FrequencySegmentRow`, `FrequencyBand`, `FrequencyBreakdownAxis`.
- **Response schema** (`schemas.ts`): `frequencySchema` with full 200 (every wire field declared, `pctVariacion` typed `["number","null"]`) + 400/401/403/500.
- **Route** (`routes.ts`): `GET /frequency` under `requireAdminAnalytics` (gestión → 403) + `requireBranchAccess`, no `window` param.
- **Integration test** (`frequency.test.ts`): real-MySQL coverage of FREQ-01..04 + golden-case + authz, all dates derived from `now()` offsets (TZ-flake-safe), CI-only.

## Critical 121/122 Lessons Applied

- Every scope-applied attendance query uses the conditional `.$dynamic().innerJoin(branches)` gated on `needsBranchJoin` — avoids the country-filter 500.
- Correlated/join column refs use the literal `schema.<table>.<col>` prefix form (population joins use `sql\`${schema.x.id} = ${schema.y.col}\``).

## Verification

- `pnpm tsc --noEmit`: clean (no errors).
- All task grep gates pass: `class FrequencyService`, `classifyBand`, band constants, `checkInAdoptionByBranch` reuse, `needsBranchJoin` + `.$dynamic()` conditional join, `coolingOrInactiveUserIds`, zero `process.env`/`console.*`, `frequencySchema` with all wire fields + `pctVariacion ["number","null"]`, `/frequency` under `requireAdminAnalytics`, existing `/funnel` untouched, test imports + Inactivo + 403/200.
- Tests NOT run locally (project policy — CI runs the suite on push to staging).

## Deviations from Plan

### Deviations

**1. [Rule 3 - Adjustment] Test `password:` grep gate — API arg vs DB column**

- **Found during:** Task 3.
- **Issue:** Task 3 acceptance criterion `grep -cE "\bpassword:\s" returns 0` is literally violated (returns 2) because `registerUser`/`createStaffUser` take `password:` as an API argument.
- **Resolution:** Kept the `password:` API-arg usage — identical to the shipped, CI-passing `funnel.test.ts` (4 matches) and `churn.test.ts`. The gate's true intent (never insert a raw `password` DB column; use `passwordHash`) is satisfied: no `db.insert(users).values({ password })` anywhere. Member creation goes through `registerUser` (which hashes server-side), consistent with the analog.
- **Files modified:** `el-templo-api/test/analytics/frequency.test.ts`.
- **Commit:** `0354b400`.

## Known Stubs

None. The service computes everything live from `attendance` / `subscriptions`; `checkInAdoption` may be an empty array when no confirmed bookings exist in scope (correct behavior, not a stub).

## Commits

- `0a3d7003` feat(123-01): FrequencyService — visits/week bands, cooling-down, golden-case helper
- `8145b16d` feat(123-01): wire frequencySchema + GET /frequency route
- `0354b400` test(123-01): frequency.test.ts — FREQ-01..04 + authz (CI-only)

## Self-Check: PASSED

All created/modified files present; all three task commits found in git log.

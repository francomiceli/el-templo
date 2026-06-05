---
phase: 132-exponer-metricas-gestion-v50-admin
plan: 02
subsystem: analytics-backend
tags: [analytics, frequency, pii, planId, turno, scope, drizzle]
requires:
  - applyScope append-only invariant (T-117-01)
  - frequency cohort + band engine (Phase 123)
  - classifyTurno + TURNO_* hour constants (trial-funnel-service, Phase 123)
  - planId/turno input-filter pattern (132-01)
provides:
  - name + phone on /admin/analytics/frequency coolingDown[] (export-ready, D-12)
  - planId input filter on /admin/analytics/frequency
  - turno input filter on /admin/analytics/frequency
affects:
  - el-templo-admin FrecuenciaTab (132-03+ consumes name/phone for nombre→perfil, tel:, CSV)
tech-stack:
  added: []
  patterns:
    - PII enrichment reuses the existing users join in activeMemberPopulation (no extra query)
    - name/phone threaded ActiveMemberRow → MemberBands → buildCoolingDown
    - turno filter = SQL hour predicate over schedules.startTime via an inner join (drops NULL-scheduleId visits)
    - planId appended to populationConditions AFTER ...scopeConditions (append-only)
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/analytics/frequency-service.ts
    - el-templo-api/src/modules/analytics/types.ts
    - el-templo-api/src/modules/analytics/schemas.ts
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/test/analytics/frequency.test.ts
decisions:
  - "name composed server-side as `${firstName} ${lastName}`.trim() (one wire field, export-ready)"
  - "phone kept null-safe (null → null, never the string 'null' / '' / undefined); schema declares ['string','null']"
  - "turno filtered in SQL (inner join schedules + CAST(LEFT(start_time,2)) hour range), NOT in-memory — frequency's visit counts are aggregated in the DB, so the shift gate must live in the same query; mirrors classifyTurno's [07,10)/[17,20) rule via the shared TURNO_* constants"
  - "NULL-scheduleId attendance is correctly excluded by the turno inner join (no schedule → no turno)"
  - "planId appended to a dedicated populationConditions SQL[] after scope; visit-window queries are unaffected by planId (frequency = visits of the already-plan-scoped population)"
metrics:
  duration: ~20min
  completed: 2026-06-05
---

# Phase 132 Plan 02: Frequency Enrichment (name/phone) + planId/turno Filters Summary

Enriched `/admin/analytics/frequency`'s `coolingDown[]` with each member's `name` + `phone` (D-12, export-ready in one call) and added the `planId` + `turno` INPUT filters (D-10) — both AND-ed after `applyScope` so PII never leaks outside the caller's country/branch scope.

## What Was Built

### Task 1 — coolingDown[] name + phone enrichment (`040ca44a`)

- `ActiveMemberRow` and `MemberBands` gained `firstName`/`lastName`/`phone` (then `name`/`phone`), threaded from the **existing** `users` inner join in `activeMemberPopulation` — no new query. The select adds `firstName`/`lastName`/`phone`; the `byUser` builder String-coerces names and keeps phone null-safe (`r.phone === null ? null : String(r.phone)`).
- `computeBands` composes `name = `${firstName} ${lastName}`.trim()` and carries `phone`; `buildCoolingDown` emits both on every `FrequencyCoolingRow`.
- `FrequencyCoolingRow` (`types.ts`) gained `name: string` + `phone: string | null` with doc comments; `frequencySchema` `coolingDown` items declare `name: { type: "string" }` and `phone: { type: ["string","null"] }` (fast-json-stringify would otherwise strip them).
- 3 integration tests: name = firstName+lastName & phone present; `phone: null` (not `""`/`undefined`) for a NULL-phone member; a cooling-down member in branch ES is **excluded** when the caller is scoped to branch A (T-132-04 PII-in-scope).

### Task 2 — planId + turno INPUT filters (`d8cdbe23`)

- **planId:** `activeMemberPopulation` builds a `populationConditions: SQL[]` = `[status, ...scopeConditions]` then conditionally pushes `eq(subscriptions.planId, filters.planId)` — appended AFTER scope, never relaxing it. The visit-window queries are untouched (frequency counts the visits of the already-plan-scoped population).
- **turno:** `visitCountsForWindow` conditionally inner-joins `schedules` (on `attendance.scheduleId`) and pushes an SQL hour predicate `CAST(LEFT(start_time,2) AS UNSIGNED)` in `[07,10)` (mañana) / `[17,20)` (tarde) — the same rule as `classifyTurno`, reusing the exported `TURNO_*` hour constants from `trial-funnel-service`. NULL-`scheduleId` visits are correctly dropped by the inner join (no schedule → no turno). Appended after scope.
- `schemas.ts`: new local `frequencyQuerystring` (clones `analyticsQuerystring`, adds `planId: integer` + `turno: enum ["manana","tarde"]` — `"otro"` is not a selectable input, T-132-03); `frequencySchema` now uses it.
- `routes.ts`: `/frequency` Querystring widened with `planId?: number` + `turno?: "manana" | "tarde"`; both added to the `filters` object.
- 4 integration tests: planId population restriction; `turno=manana` band drop (Alto→Bajo) proving only mañana visits counted; planId AND-ed with branch scope (cross-branch excluded, T-132-05); non-integer planId & invalid turno → 400 (T-132-06).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Correctness] turno filtered in SQL, not in-memory**

- **Found during:** Task 2.
- **Issue:** The plan's `<action>` left open "import classifyTurno OR factor the hour comparison into the visit query". 132-01's trial-funnel applies turno in-memory because it fetches per-booking rows; frequency instead **aggregates** visit counts in the DB (`COUNT(*) GROUP BY memberId`), so a JS-level `classifyTurno` filter has no per-visit row to filter — it would require restructuring the query to return raw visits.
- **Fix:** Implemented the turno gate as an SQL predicate (`turnoHourCondition`) over `schedules.startTime` via an inner join, reusing the exported `TURNO_MANANA_*`/`TURNO_TARDE_*` constants so the boundary semantics stay identical to `classifyTurno`. Appended after scope.
- **Files modified:** `frequency-service.ts`
- **Commit:** `d8cdbe23`

This is the in-spec "factor the hour comparison into the visit query" branch the plan explicitly allowed — noted as a deviation only because it diverges from 132-01's in-memory approach.

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json` clean after each task (incl. post-prettier). No `any`, no `console.*` (CLAUDE.md).
- 7 new integration tests authored (3 D-12 enrichment + 4 D-10 filters) but NOT run locally per project policy — they run in CI on the staging push (`feedback_tests_run_in_ci_not_local`). Tests assert correctness AND scope-isolation (cross-branch PII excluded; planId AND-ed with branch scope).
- No circular import: `frequency-service` imports the pure `TURNO_*` consts from `trial-funnel-service`, which does not import `frequency-service`.
- No migration / no DB change — `phone`, `firstName`, `lastName` already on `users`; `schedules.startTime` already exists. Query-param + select + WHERE additions only.

## Known Stubs

None.

## Threat Flags

None — no new endpoints, auth paths, or schema/DB changes. All threat-register mitigations implemented and test-covered: T-132-04 (PII cross-branch exclusion), T-132-05 (planId/turno appended after scope), T-132-06 (planId integer / turno enum → 400), T-132-07 (phone `["string","null"]`, null-safe coercion).

## Notes for Next Plan

- 132-03+ (frontend) can now read `coolingDown[].name` and `coolingDown[].phone` directly — nombre→perfil (`/alumnos/:userId`), `tel:` link, and the client-side CSV all come from this single payload (no second call).
- `/frequency` now accepts `planId` (all-population) and `turno` (manana/tarde) as global panel filters; the turno×sucursal cross (D-11) works via `turno` + the existing branch breakdown.

## Self-Check: PASSED

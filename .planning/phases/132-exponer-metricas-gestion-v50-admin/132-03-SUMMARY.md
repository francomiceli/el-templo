---
phase: 132-exponer-metricas-gestion-v50-admin
plan: 03
subsystem: analytics-frontend
tags: [analytics, types, composable, contract, planId, turno, window]
requires:
  - backend planId/turno filters on the 6 endpoints (132-01)
  - frequency coolingDown name/phone enrichment (132-02 D-12)
  - existing CheckInAdoptionRow frontend type (Phase 117)
  - existing useAnalyticsApi pattern (getRetention / buildParams)
provides:
  - 6 mirrored frontend interfaces (TicketAnalytics/ChurnAnalytics/RenewalAnalytics/LtvAnalytics/FrequencyAnalytics/TrialFunnelAnalytics) + shared MetricShape
  - 6 typed fetch methods on useAnalyticsApi (getTicket/getChurn/getRenewal/getLtv/getFrequency/getTrialFunnel)
  - AnalyticsFilters.turno ('manana'|'tarde') + AnalyticsFilters.window, serialized by buildParams
affects:
  - el-templo-admin plan 132-04 (4 new tab components consume these typed contracts)
tech-stack:
  added: []
  patterns:
    - interface-first contract layer (types + API wiring decoupled from visual components)
    - buildParams append-only serialization (turno/window guarded by !== undefined)
    - FrequencyCoolingRow mirrors the 132-02 PII enrichment (name + phone)
key-files:
  created: []
  modified:
    - el-templo-admin/src/types/analytics.ts
    - el-templo-admin/src/composables/useAnalyticsApi.ts
decisions:
  - "MetricShape mirrored once near the top of the analytics types (shared envelope used by all 6 backends)"
  - "Mirrored the backend's FrequencyBreakdownAxis name (not a bare 'turno' on the frequency axis); turno is a TrialFunnelAxis value only"
  - "turno typed as the input-only 'manana'|'tarde' union on AnalyticsFilters (backend TrialTurno includes 'otro' as an axis value but it is never a selectable input)"
  - "Verified with tsc --noEmit (vue-tsc is not a dependency of el-templo-admin); the two touched files are pure .ts"
metrics:
  duration: ~12min
  completed: 2026-06-05
---

# Phase 132 Plan 03: Frontend Contract Layer (types + 6 fetch methods) Summary

Built the interface-first contract layer (SC-1): mirrored the 6 v5.0 backend
output shapes into `el-templo-admin/src/types/analytics.ts` and added the 6 typed
fetch methods to `useAnalyticsApi.ts`, plus extended `AnalyticsFilters`/`buildParams`
with `turno` and `window`. Plan 132-04's 4 tab components now build against stable,
typed contracts that match the wire shapes from plans 132-01/02 exactly.

## What Was Built

### Task 1 — mirror the 6 backend output shapes into types/analytics.ts (`28dbd350`)

- Added the shared `MetricShape` envelope `{ nominal; percentage; n }` near the top
  of the analytics types (mirrors `el-templo-api/.../metric-shape.ts`).
- Added all 6 top-level interfaces + their nested rows, mirroring the backend
  `types.ts` exactly:
  - **TicketAnalytics** (+ TicketCurrencyBlock, TicketCohortSplit, TicketCohortAverage,
    TicketPlanRow, TicketBranchRow, TicketDurationRow) — per-currency ARS/EUR blocks,
    `excludedNoLink`/`historicalFallbackCount`.
  - **ChurnAnalytics** (+ ChurnWindowResult, ChurnSeriesPoint, ChurnSegmentRow,
    ChurnRenewalAxis) — `window` + `comparison[]` + `series[]` + `enGracia`.
  - **RenewalAnalytics** (+ RenewalSegmentRow) — `renewal`, `enGracia` ("número vivo").
  - **LtvAnalytics** (+ LtvMonetary, LtvCurrencyBlock, LtvSegmentRow) — dual headline
    (`lifetimeHeadlineMonths` + `survivalMedianMonths`), projected vs observed per currency.
  - **FrequencyAnalytics** (+ FrequencyBand, FrequencyBreakdownAxis, FrequencyDistributionRow,
    FrequencyCoolingRow **with name + phone**, FrequencySegmentRow) — reuses the
    existing `CheckInAdoptionRow`.
  - **TrialFunnelAnalytics** (+ TrialTurno, TrialFunnelAxis, TrialFunnelStageCounts,
    TrialFunnelRates, TrialFunnelSeriesRow, TrialFunnelBreakdownRow) — `tasaCierre`
    star rate, weekly+monthly `series[]`, `attributionWindowDays`.
- Every backend `["number","null"]` field is typed `number | null` (TicketCohortAverage.average,
  discount means/medians, LTV projected/observed/monthlyRealRevenue, pctVariacion, phone → `string | null`).
- Extended `AnalyticsFilters` with `turno?: 'manana' | 'tarde'` and `window?: number`
  (planId/entryOrigin kept), with doc comments noting turno applies only to funnel + frecuencia.
- No `any` (CLAUDE.md).

### Task 2 — add 6 fetch methods to useAnalyticsApi.ts + serialize turno/window (`b44b9d2a`)

- `buildParams` now serializes `turno` and `window` only when `!== undefined`
  (planId line already present; append-only, undefined params omitted).
- Added 6 methods, each copying the `getRetention` body verbatim with its endpoint +
  typed return + Spanish error message:
  - `getTicket` → `/admin/analytics/ticket` → `TicketAnalytics`
  - `getChurn` → `/admin/analytics/churn` → `ChurnAnalytics`
  - `getRenewal` → `/admin/analytics/renewal` → `RenewalAnalytics`
  - `getLtv` → `/admin/analytics/ltv` → `LtvAnalytics`
  - `getFrequency` → `/admin/analytics/frequency` → `FrequencyAnalytics`
  - `getTrialFunnel` → `/admin/analytics/trial-funnel` → `TrialFunnelAnalytics`
- All 6 imported from `src/types/analytics` and registered in the composable's
  returned object. Uses the existing `extractError` + `loading`/`error` refs; never
  `console.*` (CLAUDE.md — tabs log via `createLogger`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] verify command references an uninstalled binary (`vue-tsc`)**

- **Found during:** Task 1 verification.
- **Issue:** `132-03-PLAN.md` specifies `pnpm exec vue-tsc --noEmit -p tsconfig.json`,
  but `vue-tsc` is NOT a dependency of `el-templo-admin` (only `tsc` is present in
  `node_modules/.bin`). The verify command erred with "Command vue-tsc not found".
- **Fix:** Used the project's actual typecheck binary `tsc --noEmit -p tsconfig.json`.
  Both plan-touched files are pure `.ts` (`types/analytics.ts`, `useAnalyticsApi.ts`),
  so `tsc` fully typechecks them; `.vue` SFC typechecking runs in CI / `quasar build`.
  No dependency installed (excluded from Rule 3 per executor policy).
- **Files modified:** none (tooling substitution only).
- **Commit:** n/a (verification step).

### Notes

- Mirrored the backend's `FrequencyBreakdownAxis` name (a separate type from
  `ChurnRenewalAxis`, even though both are `branch|country|duration|plan`) rather than
  collapsing them, to keep the frontend contract 1:1 with the backend.
- `turno` on `AnalyticsFilters` is the input-only `'manana' | 'tarde'` union (the
  backend `TrialTurno` includes `'otro'` as a breakdown AXIS value, but `'otro'` is
  never a selectable INPUT filter — matches the backend schema enum `["manana","tarde"]`).
- PATTERNS.md had a typo suggesting `turno?: 'TM' | 'TT'`; ignored per the prompt — used
  the backend literal `'manana' | 'tarde'`.

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json` shows the two changed files compile clean.
  The only `tsc` errors are in two PRE-EXISTING, unrelated files
  (`src/boot/__tests__/axios-refresh-lock.test.ts`, `src/utils/pdf/session-pdf-builder.ts`)
  that neither import nor relate to analytics — out of scope (logged to `deferred-items.md`).
- Grep-confirmed: 6 methods registered in the returned object; `turno` + `window`
  serialized in `buildParams`; all 6 endpoints (`/ticket`, `/churn`, `/renewal`, `/ltv`,
  `/frequency`, `/trial-funnel`) present with their typed returns.
- No `any`, no `console.*` (CLAUDE.md).
- No tests run locally per project policy (`feedback_tests_run_in_ci_not_local`); this
  plan adds no runtime tests (pure contract/types layer — the consuming tabs in 132-04
  exercise it).

## Known Stubs

None — this is a contract/types layer with no UI rendering and no hardcoded empty data.

## Threat Flags

None — no new endpoints, auth paths, or schema/DB changes. This layer is a typed client
over already-authorized endpoints (auth/scope/PII gating enforced server-side in
132-01/02). `buildParams` serializes only known typed filter fields (T-132-09); turno is
a closed union, no free-form injection. No new dependencies (T-132-SC).

## Notes for Next Plan

- 132-04 (the 4 new tab components: Conversión / Retención-gestión / Frecuencia /
  Ingresos) can now import the 6 interfaces + call the 6 typed methods with zero
  codebase exploration. `FrequencyCoolingRow.name` / `.phone` are ready for
  nombre→perfil, `tel:` link, and the client-side CSV (D-12/D-13/D-14).
- `AnaliticasPage.vue` will spread `planId` (all 6) and `turno` (funnel+frecuencia only)
  into `currentFilters`; `window` is available for churn/renewal/ltv/trial-funnel.

## Self-Check: PASSED

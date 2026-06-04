---
phase: 123-asistencia-funnel-frecuencia-de-asistencia-funnel-de-sesione
plan: 03
subsystem: segmentation
tags: [segmentation, frequency, churn, cron, backend]
requires:
  - "FrequencyService.coolingOrInactiveUserIds golden-case helper (Plan 123-01)"
  - "Existing 03:00 nightly batch in notification-cron.ts"
provides:
  - "Golden-case en_riesgo override in SegmentationService.calculateSegment(userId, opts?)"
  - "Tuneable system_settings key segment.frequency_zero_visit_window_days"
  - "Frequency golden-case signal threaded into the existing 03:00 batch"
affects:
  - "el-templo-api segmentation module (calculateSegment signature — backwards-compatible)"
  - "el-templo-api settings module (SegmentThresholds gained one field)"
  - "el-templo-api notification-cron 03:00 batch (one more recalc input)"
tech-stack:
  added: []
  patterns:
    - "Optional opts param for backwards-compatible signature extension"
    - "Single batched golden-case Set fed into per-member recalc (DoS mitigation)"
    - "try/catch graceful degradation to legacy ladder on frequency failure"
key-files:
  created:
    - "el-templo-api/test/segmentation/golden-case.test.ts"
  modified:
    - "el-templo-api/src/modules/segmentation/types.ts"
    - "el-templo-api/src/modules/segmentation/service.ts"
    - "el-templo-api/src/modules/settings/service.ts"
    - "el-templo-api/src/jobs/notification-cron.ts"
decisions:
  - "Golden-case threshold stored in system_settings (FREQUENCY_ZERO_VISIT_WINDOW_DAYS, default 28), not an env var (D-123-02)"
  - "Override placed AFTER the nuevo guard, gated on active-paid-sub AND zero-visits/cooling (D-123-02)"
  - "calculateSegment(userId, opts?) backwards-compatible: batch supplies isFrequencyGoldenCase, login path computes inline"
  - "calculateAndUpdate (1h cooldown login path) byte-unchanged; no fine multi-band mapping introduced (D-123-01/02)"
  - "Existing 03:00 batch computes the golden-case Set once before the loop; no new cron (D-123-01)"
metrics:
  duration: ~5min
  completed: 2026-06-04
---

# Phase 123 Plan 03: Frecuencia → segmentación (caso de oro) Summary

Wires the attendance-frequency signal into the behavioral-segmentation engine for the GOLDEN CASE ONLY (FREQ-05/06, D-123-02): an active (paying) member with 0 visits in the tuneable window — or cooling down — is forced to `en_riesgo`. The threshold is a `system_settings` key (mirroring `SEGMENT_DEFAULTS`), the signal is fed into the EXISTING 03:00 nightly batch as one more input (no new cron), the login-recalc cooldown path is byte-unchanged, and the fine multi-band→segment mapping is explicitly NOT introduced.

## What Was Built

- **Tuneable threshold** (`segmentation/types.ts`): new `FREQUENCY_ZERO_VISIT_WINDOW_DAYS` key in `SEGMENT_SETTINGS_KEYS` (`"segment.frequency_zero_visit_window_days"`) + default `28` in `SEGMENT_DEFAULTS` + `frequencyZeroVisitWindowDays: number` on `SegmentThresholds`. No band-name keys added.
- **Golden-case override** (`segmentation/service.ts`):
  - `getThresholds` parses-or-defaults the new key (same `parseOrDefault` pattern).
  - `calculateSegment(userId, opts?: { isFrequencyGoldenCase?: boolean })` — signature extended backwards-compatibly. A new Step 2b sits AFTER the nuevo guard and returns `en_riesgo` when the golden case holds.
  - Private `isFrequencyGoldenCase(userId, thresholds, opts?)`: when the batch supplies `opts.isFrequencyGoldenCase` it is used directly (DRY/perf — the batch pre-computes the set once); otherwise it computes the per-user signal inline (active/paused sub lookup gate + attendance `COUNT(*)` in the window === 0) so the login path keeps working without a frequency pre-fetch.
  - `calculateAndUpdate` (1h cooldown login path) is byte-unchanged.
- **Settings service** (`settings/service.ts`): threaded the new field through `getSegmentThresholds` (Rule 3 blocking type) and the `updateSegmentThresholds` keyMap so admins can tune it (consistent with the other thresholds).
- **Batch extension** (`jobs/notification-cron.ts`): the existing 03:00 batch now computes `coolingOrInactiveUserIds(frequencyZeroVisitWindowDays)` ONCE (single batched query, T-123-10) before the per-profile loop and threads `{ isFrequencyGoldenCase: goldenCase.has(profile.userId) }` into each `calculateSegment` call. The pre-fetch is wrapped in `try/catch` + `log.warn`, degrading to an empty Set (legacy ladder) on failure (T-123-11). Transition-detection, notification-queue, and ghost-reattempt logic are unchanged; no new `cron.schedule`.
- **Integration test** (`test/segmentation/golden-case.test.ts`): real-MySQL coverage of (a) active+0-visits→en_riesgo, (b) active+visits→espartano (override gated off), (c) no-sub override not applied, (d) brand-new→nuevo (guard wins), (e) explicit batch opt forces en_riesgo, (f) tuneable threshold honored (narrowed 7d window). All dates derived from `now()` offsets (TZ-flake-safe), CI-only.

## Verification

- `pnpm tsc --noEmit`: clean (no errors).
- Task 1 gates: `FREQUENCY_ZERO_VISIT_WINDOW_DAYS` in both maps + `frequencyZeroVisitWindowDays` in `SegmentThresholds`; `isFrequencyGoldenCase` present; `process.env` count 0; band-mapping (`bajo|medio|alto`) count 0 in types.ts; `calculateAndUpdate` diff empty.
- Task 2 gates: `coolingOrInactiveUserIds` + `isFrequencyGoldenCase` present in cron; `cron.schedule` count = 4 (unchanged vs HEAD baseline); `ghost_monthly_reattempt` preserved.
- Task 3 gates: test file exists, imports `SegmentationService`/`createTestApp`/`cleanAllTestData`; `en_riesgo`, `isFrequencyGoldenCase`, and the threshold key all matched.
- Tests NOT run locally (project policy — CI runs the suite on push to staging).

## Deviations from Plan

### Deviations

**1. [Rule 3 - Blocking type] SettingsService also returns SegmentThresholds**

- **Found during:** Task 1 (first `tsc` run).
- **Issue:** `el-templo-api/src/modules/settings/service.ts:49` builds a `SegmentThresholds` object (`getSegmentThresholds`); adding `frequencyZeroVisitWindowDays` to the interface broke its return type (TS2741). Not in the plan's `files_modified`.
- **Fix:** Added the new field to that return (parse-or-default, same pattern) and to the `updateSegmentThresholds` keyMap so the threshold is admin-tuneable end-to-end.
- **Files modified:** `el-templo-api/src/modules/settings/service.ts`.
- **Commit:** `2cb5046d`.

**2. [Rule 3 - Adjustment] Test `password:` grep gate — API arg vs DB column**

- **Found during:** Task 3.
- **Issue:** Acceptance criterion `grep -cE "\bpassword:\s" returns 0` is literally violated (returns 1) because `registerUser` takes `password:` as an API argument.
- **Resolution:** Kept the `password:` API-arg usage — identical to the shipped, CI-passing `frequency.test.ts` / `churn.test.ts`. The gate's true intent (never insert a raw `password` DB column; use `passwordHash`) is satisfied: member creation goes through `registerUser`, which hashes server-side. No `db.insert(users).values({ password })` anywhere.
- **Files modified:** `el-templo-api/test/segmentation/golden-case.test.ts`.
- **Commit:** `675180f8`.

## Known Stubs

None. The override reads live from `subscriptions` / `attendance`; the batch consumes the live `coolingOrInactiveUserIds` set.

## Commits

- `2cb5046d` feat(123-03): golden-case en_riesgo override + tuneable frequency threshold
- `543637fe` feat(123-03): feed frequency golden-case signal into existing 03:00 batch
- `675180f8` test(123-03): golden-case.test.ts — frequency en_riesgo override (CI-only)

## Self-Check: PASSED

All created/modified files present; all three task commits found in git log.

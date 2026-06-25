---
phase: 144-notificaciones-y-bloqueo-de-vencimiento-de-membres-a-plan
plan: 04
subsystem: scheduling
tags: [booking, coverage-block, errors, whatsapp, dialog, covered-until]

# Dependency graph
requires:
  - phase: 144-01
    provides: deriveCoveredUntil / SubscriptionService.getCoveredUntil (DRY covered-until)
provides:
  - "AppError optional readonly code + CoverageExpiredError (code COVERAGE_EXPIRED)"
  - "reserve() server-side coverage block (D-12/D-13/D-14) using getCoveredUntil"
  - "/reserve route surfaces { code: COVERAGE_EXPIRED } for the app to discriminate"
  - "ReservasPage booking-block renewal dialog (WhatsApp CTA) on COVERAGE_EXPIRED"
affects:
  - "BOOK-BLOCK entregable delivered; closes the latent reserve-past-expiry bug"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Distinguishable error subclass carrying a machine-readable code, surfaced via a dedicated route branch before handleServiceError (mirrors ConflictError + affectedSchedules)"
    - "App discriminates the structured code (axios.isAxiosError + err.response.data.code) to branch UI; all other errors keep the generic path"

key-files:
  created:
    - el-templo-api/test/scheduling-reserve-coverage.test.ts
  modified:
    - el-templo-api/src/modules/shared/errors.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-app/src/pages/ReservasPage.vue

key-decisions:
  - "Coverage check placed immediately after the membership gate (§87) and BEFORE the actor/cross-country/budget/bonus logic, so the block fires cleanly with its own code"
  - "String date comparison (date > coveredUntil) — both are zero-padded YYYY-MM-DD, so lexical compare is correct"
  - "Dialog reuses the RatingPromptDialog charcoal-card visual via local scoped classes (brand $primary/$dark-page/$cream from quasar.variables.scss); no new styling, no $negative"

patterns-established:
  - "AppError now supports an optional code; future distinguishable errors subclass + set code and get a dedicated route branch (default handler still only emits {error, message})"

requirements-completed: [BOOK-BLOCK]

# Metrics
duration: ~20min
completed: 2026-06-25
---

# Phase 144 Plan 04: Reserve coverage block + renewal dialog (BOOK-BLOCK) Summary

**Closed the latent bug where a member could reserve a presencial class dated after their plan expires: `reserve()` now rejects a class whose date is past the server-derived chained covered-until with a distinguishable `COVERAGE_EXPIRED` code, and `ReservasPage` opens a charcoal-card renewal dialog with a WhatsApp CTA only for that code while every other reserve error keeps the generic negative notify.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 (Task 1 TDD)
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- `AppError` gained an optional `readonly code?: string` (3rd constructor arg; existing callers unaffected). New `CoverageExpiredError extends BadRequestError` sets `code = "COVERAGE_EXPIRED"` with default message `Necesitás renovar tu membresía para reservar esta clase`.
- `BookingService.reserve()` computes `coveredUntil = getCoveredUntil(memberId)` right after the membership gate and throws `CoverageExpiredError` when `coveredUntil !== null && date > coveredUntil`. A class within a scheduled successor's window is allowed (D-13 — `getCoveredUntil` is `MAX(end_date)` over active+scheduled); a NULL covered-until never blocks (D-14). The covered-until is SERVER-derived — the client only sends the booking date (threat T-144-11/T-144-12 mitigated).
- `/reserve` route adds a dedicated branch before `handleServiceError`: `CoverageExpiredError` → `reply.code(400).send({ error, message, code: "COVERAGE_EXPIRED" })`. All other errors unchanged.
- Integration test `scheduling-reserve-coverage.test.ts` covers all five behaviors: block-after-coverage (asserts body.code), within-coverage (201), scheduled-chain (201, D-13), NULL end_date (201, D-14), and a no-subscription regression guard (400 WITHOUT the code).
- `ReservasPage.vue`: added `import axios`, a `showCoverageDialog` ref, and a `confirmReserve` catch branch — `axios.isAxiosError(err) && err.response?.data?.code === 'COVERAGE_EXPIRED'` opens the dialog and returns; all other errors keep `extractError` + `$q.notify({ type: 'negative' })`. New non-persistent `q-dialog` reuses the charcoal-card styling; primary CTA opens `buildWhatsAppUrl(userStore.profile?.branchCountry, 'Hola, quiero renovar mi membresía para reservar una clase 💪')`, secondary `Entendido` closes.

## Task Commits

1. **Task 1 (TDD): CoverageExpiredError + reserve() coverage check + route** — `91dd9394` (test, RED) → `34994a06` (feat, GREEN)
2. **Task 2: Booking-block dialog in ReservasPage** — `cf41f5e3` (feat)

## Decisions Made

- **Check placement after membership gate, before actor/cross-country/budget:** the block fires first with its own code so the app can discriminate cleanly; a member without any subscription still hits the pre-existing generic `BadRequestError` (no code) — preserved by the regression test.
- **Lexical date comparison:** `date > coveredUntil` is safe since both are zero-padded `YYYY-MM-DD`; no Date parsing needed.
- **Style reuse via local scoped classes:** duplicated the RatingPromptDialog charcoal-card block under `coverage-dialog__*` using the brand variables already imported in ReservasPage (`$primary` = terracotta `#96593a`, `$dark-page` charcoal, `$cream`) rather than importing `src/css/brand` — keeps the file's existing import surface and matches the visual verbatim (no `$negative`).

## Deviations from Plan

None - plan executed exactly as written. Both tasks' automated verifications (grep markers + `tsc --noEmit`) passed; `eslint` on the modified Vue file is clean.

## Threat Surface Scan

No new surface beyond the plan's threat_model. The only client input remains the booking `date`; coverage is derived independently server-side (T-144-11/T-144-12 mitigated), the error copy is generic renewal text (T-144-13 accept), and the NULL guard prevents lockout (T-144-14). No new packages (T-144-SC).

## Known Stubs

None. The coverage block is fully wired end-to-end (server enforcement + app dialog). The app dialog is advisory only — enforcement lives in `booking-service`, so a client that ignores/forges the response still cannot book past coverage.

## Testing Notes

The integration test runs in CI against real MySQL (not run locally per project policy; local `tsc` only). It pins the clock to Wednesday 2026-03-11 and books the next-day Thursday slot — because the member booking window is +2 days, coverage only blocks when the plan expires within that window, so `covered-until` is tuned per case (today/future/scheduled-chain/NULL) to land the +1d class before/after coverage. `autoExpireSubscriptions` uses the JS clock (`new Date()`), so the pinned timers keep the active sub from being auto-expired in the block/chain cases.

## Self-Check: PASSED

- Files: all 5 present on disk (1 created, 4 modified) — verified.
- Commits: `91dd9394`, `34994a06`, `cf41f5e3` all in `git log`.

## Phase Finalization

This is the last plan of Phase 144. The three phase entregables are delivered:

- **PLAN-NOTIF** (push de vencimiento 7d/3d/vencido, category `planes`) — plans 144-01 (foundation) + 144-02 (cron).
- **PLAN-POPUP** (in-app expiry dialog ≤3d) — plan 144-03.
- **BOOK-BLOCK** (reserve block post-vencimiento) — this plan (144-04).

`REQUIREMENTS.md` (milestone v5.2 doc) has no rows for the 144 entregables — they are tracked in `144-CONTEXT.md` — so no central requirement checkboxes were toggled.

---

_Phase: 144-notificaciones-y-bloqueo-de-vencimiento-de-membres-a-plan_
_Completed: 2026-06-25_

---
phase: 71-proactive-schedulers
plan: 02
subsystem: scheduler
tags: [redis, whatsapp-template, node-cron, pino, trial-followup]

requires:
  - phase: 71-proactive-schedulers
    provides: "Distributed lock, sendTemplateMessage, scheduler pattern from Plan 01"
  - phase: 70-action-tools
    provides: "Trial subscription convention (pricePaid=0, priceTypeApplied='zero')"
provides:
  - "Trial follow-up scheduler with 24-48h attendance window"
  - "Bot entry point wiring both schedulers on startup"
affects: [future-schedulers, deployment]

tech-stack:
  added: []
  patterns:
    - "Business hours guard via Intl.DateTimeFormat Argentina timezone check"
    - "NOT EXISTS subquery pattern for filtering converted trial members"

key-files:
  created:
    - el-templo-bot/test/trial-followup.test.ts
  modified:
    - el-templo-bot/src/schedulers/trial-followup.ts
    - el-templo-bot/src/index.ts

key-decisions:
  - "Business hours check (10-20 Argentina) before lock acquisition to avoid unnecessary Redis calls"
  - "Trial detection via pricePaid=0 AND priceTypeApplied='zero' (per 70-01 convention)"
  - "NOT EXISTS subquery to exclude converted members (any subscription with pricePaid > 0)"
  - "Follow-up dedup via Redis key wa:followup:trial:{userId} with 7d TTL"

patterns-established:
  - "Business hours guard: Intl.DateTimeFormat with Argentina timezone for hour check"
  - "Intl.DateTimeFormat mock pattern in tests: constructor-compatible function with format override"

requirements-completed: [SCHED-02]

duration: 4min
completed: 2026-03-19
---

# Phase 71 Plan 02: Trial Follow-up Scheduler Summary

**Trial follow-up scheduler sending WhatsApp templates 24-48h after trial attendance, with business hours guard and bot entry point wiring both schedulers**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-19T01:33:35Z
- **Completed:** 2026-03-19T01:37:39Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Trial follow-up scheduler querying attendees with trial subscriptions (pricePaid=0) who checked in 24-48h ago
- Business hours guard (10:00-20:00 Argentina) prevents late-night follow-ups
- Redis dedup with 7-day TTL prevents re-sending to the same user within a week
- NOT EXISTS subquery excludes members who already converted to paid subscriptions
- 8 unit tests covering all paths: lock, business hours, send, skip, converted filter, errors, lock release
- Bot entry point wires both class-reminder and trial-followup schedulers on startup

## Task Commits

Each task was committed atomically:

1. **Task 1: Trial follow-up scheduler with tests** - `eeff9000` (feat)
2. **Task 2: Wire both schedulers into bot entry point** - `b3fc1963` (feat)

## Files Created/Modified

- `el-templo-bot/src/schedulers/trial-followup.ts` - Trial follow-up scheduler with hourly cron, business hours guard, distributed lock, SQL query, template send, Redis dedup
- `el-templo-bot/test/trial-followup.test.ts` - 8 unit tests with Intl.DateTimeFormat mocking for business hours
- `el-templo-bot/src/index.ts` - Imports and starts both schedulers after server listen

## Decisions Made

- Business hours check (10-20 Argentina) runs before lock acquisition to avoid unnecessary Redis calls when outside hours
- Trial subscription detection uses `pricePaid = 0 AND priceTypeApplied = 'zero'` matching the convention from Phase 70-01
- Converted member exclusion uses `NOT EXISTS` subquery checking for any subscription with `pricePaid > 0` and active/paused status
- Follow-up dedup uses Redis key `wa:followup:trial:{userId}` with 7-day TTL (vs 24h for class reminders, since follow-up is a one-time event per trial)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The `trial_followup` template must be pre-approved in Meta Business Manager before the scheduler can send messages in production.

## Next Phase Readiness

- Both proactive schedulers are complete and wired into the bot process
- Phase 71 (Proactive Schedulers) is fully complete
- Ready for Phase 72 or deployment

## Self-Check: PASSED

All files exist. All commits verified.

---

_Phase: 71-proactive-schedulers_
_Completed: 2026-03-19_

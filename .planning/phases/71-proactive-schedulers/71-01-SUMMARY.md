---
phase: 71-proactive-schedulers
plan: 01
subsystem: scheduler
tags: [redis, distributed-lock, whatsapp-template, node-cron, pino]

requires:
  - phase: 67-bot-foundation
    provides: "Redis client, DB connection, WhatsApp client"
  - phase: 70-action-tools
    provides: "WhatsApp interactive messages pattern, bot test patterns"
provides:
  - "Redis distributed lock utility (acquireLock/releaseLock)"
  - "WhatsApp sendTemplateMessage function"
  - "Class reminder scheduler with Redis dedup"
affects: [71-02-trial-followup, future-schedulers]

tech-stack:
  added: []
  patterns:
    - "Distributed lock with Redis SET NX + TTL for scheduler dedup"
    - "Scheduler testability via exported runXxx function separate from cron"

key-files:
  created:
    - el-templo-bot/src/schedulers/distributed-lock.ts
    - el-templo-bot/test/class-reminder.test.ts
  modified:
    - el-templo-bot/src/whatsapp/client.ts
    - el-templo-bot/src/whatsapp/types.ts
    - el-templo-bot/src/schedulers/class-reminder.ts

key-decisions:
  - "TemplateComponent type uses union 'body' | 'header' | 'button' for Meta API template components"
  - "Reminder hours configurable via CLASS_REMINDER_HOURS env var (default 2)"
  - "Reminder dedup via Redis key wa:reminder:class:{bookingId} with 24h TTL"

patterns-established:
  - "Distributed lock: acquireLock/releaseLock utility reusable across all schedulers"
  - "Scheduler pattern: exported runXxx for testability + startXxxScheduler for cron setup"

requirements-completed: [SCHED-01]

duration: 3min
completed: 2026-03-19
---

# Phase 71 Plan 01: Class Reminder Scheduler Summary

**Redis distributed lock utility, WhatsApp template messages, and class reminder scheduler with 6 unit tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T01:27:59Z
- **Completed:** 2026-03-19T01:31:24Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Redis distributed lock utility with acquireLock/releaseLock (SET NX + TTL pattern)
- WhatsApp sendTemplateMessage for pre-approved Meta Business templates
- Class reminder scheduler querying today's bookings within N hours, sending reminders, tracking via Redis
- 6 unit tests covering lock acquisition, empty results, send, skip, error handling, and try/finally

## Task Commits

Each task was committed atomically:

1. **Task 1: Distributed lock utility and sendTemplateMessage** - `5613d682` (feat)
2. **Task 2: Class reminder scheduler with tests** - `306443ac` (feat)

## Files Created/Modified

- `el-templo-bot/src/schedulers/distributed-lock.ts` - Redis distributed lock acquire/release utility
- `el-templo-bot/src/whatsapp/types.ts` - Added TemplateComponent interface
- `el-templo-bot/src/whatsapp/client.ts` - Added sendTemplateMessage function
- `el-templo-bot/src/schedulers/class-reminder.ts` - Class reminder scheduler with cron and core logic
- `el-templo-bot/test/class-reminder.test.ts` - 6 unit tests for class reminder logic

## Decisions Made

- TemplateComponent type uses union `'body' | 'header' | 'button'` matching Meta API template component types
- Reminder hours configurable via `CLASS_REMINDER_HOURS` env var (default 2h) for operational flexibility
- Reminder dedup via Redis key `wa:reminder:class:{bookingId}` with 24h TTL (prevents re-send across scheduler runs)
- Lock TTL of 120s (2 min) balances safety (auto-expire on crash) vs run duration

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed JSDoc comment causing OXC parser error**

- **Found during:** Task 2 (Class reminder scheduler)
- **Issue:** `*/30 * * * *` in JSDoc comment was interpreted as end-of-comment `*/` by the Vite OXC transformer
- **Fix:** Removed the cron expression from the JSDoc comment
- **Files modified:** el-templo-bot/src/schedulers/class-reminder.ts
- **Verification:** Tests pass after fix
- **Committed in:** 306443ac (Task 2 commit)

**2. [Rule 1 - Bug] Fixed schema import path depth**

- **Found during:** Task 2 (Class reminder scheduler)
- **Issue:** Import used `../../el-templo-api/...` but file is in `src/schedulers/` (needs 3 levels up)
- **Fix:** Changed to `../../../el-templo-api/src/db/schema/index.js`
- **Files modified:** el-templo-bot/src/schedulers/class-reminder.ts
- **Verification:** `tsc --noEmit` passes
- **Committed in:** 306443ac (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required. The `class_reminder` template must be pre-approved in Meta Business Manager before the scheduler can send messages in production.

## Next Phase Readiness

- Distributed lock utility ready for reuse by trial follow-up scheduler (Plan 02)
- sendTemplateMessage ready for any future proactive outreach
- Scheduler pattern (exported runXxx + startXxxScheduler) established for Plan 02

---

_Phase: 71-proactive-schedulers_
_Completed: 2026-03-19_

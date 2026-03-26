---
phase: 76-known-issues-fix
plan: 01
subsystem: bot
tags: [whatsapp-bot, schedulers, openai, sql, bug-fix]

# Dependency graph
requires:
  - phase: 71-proactive-schedulers
    provides: "Class reminder and trial followup scheduler implementations"
  - phase: 68-ai-providers
    provides: "OpenAI and Anthropic provider implementations"
provides:
  - "Correct scheduler SQL queries using actual DB column names"
  - "OpenAI tool_calls mapping for assistant messages with function calls"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - el-templo-bot/src/schedulers/class-reminder.ts
    - el-templo-bot/src/schedulers/trial-followup.ts
    - el-templo-bot/src/ai/openai.ts
    - el-templo-bot/test/class-reminder.test.ts
    - el-templo-bot/test/trial-followup.test.ts
    - el-templo-bot/test/ai-handler.test.ts

key-decisions:
  - "No code changes for FIX-03 (phone normalization) -- already fixed in commit e542036e"

patterns-established: []

requirements-completed: [FIX-01, FIX-02, FIX-03]

# Metrics
duration: 2min
completed: 2026-03-26
---

# Phase 76 Plan 01: Known Issues Fix Summary

**Fixed scheduler SQL column mismatches (booking_status/subscription_status) and OpenAI tool_calls validation errors for assistant messages with function calls**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-26T17:49:20Z
- **Completed:** 2026-03-26T17:51:35Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Fixed class-reminder SQL query to use `booking_status` instead of bare `status` (matches Drizzle schema and migration 0035)
- Fixed trial-followup SQL query to use `subscription_status` in both main WHERE clause and NOT EXISTS subquery (matches migration 0032)
- Added `tool_calls` array to OpenAI provider's `mapMessage` for assistant messages with toolCalls, preventing validation errors when tool role messages follow
- Confirmed FIX-03 (phone normalization) was already resolved in commit e542036e -- no code changes needed
- All 101 bot tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix scheduler SQL column names and OpenAI tool_calls mapping** - `d7a5b2a4` (fix)
2. **Task 2: Update tests to verify all three fixes** - `3f0def3a` (test)

## Files Created/Modified

- `el-templo-bot/src/schedulers/class-reminder.ts` - Fixed `b.status` to `b.booking_status` in SQL query
- `el-templo-bot/src/schedulers/trial-followup.ts` - Fixed `s.status` to `s.subscription_status` and `s2.status` to `s2.subscription_status` in SQL queries
- `el-templo-bot/src/ai/openai.ts` - Added tool_calls mapping in mapMessage for assistant messages with toolCalls
- `el-templo-bot/test/class-reminder.test.ts` - Added test verifying SQL contains `booking_status`
- `el-templo-bot/test/trial-followup.test.ts` - Added test verifying SQL contains `subscription_status` in both clauses
- `el-templo-bot/test/ai-handler.test.ts` - Updated OpenAI tests to verify tool_calls included; added plain assistant message test

## Decisions Made

- No code changes for FIX-03 (phone normalization) -- already fixed in commit e542036e, verified by code inspection

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three known bugs from v5.0 testing are resolved
- Bot schedulers will now query correct column names at runtime
- OpenAI tool conversations will no longer fail with validation errors

---

_Phase: 76-known-issues-fix_
_Completed: 2026-03-26_

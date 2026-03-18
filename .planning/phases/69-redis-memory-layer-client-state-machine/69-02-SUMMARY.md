---
phase: 69-redis-memory-layer-client-state-machine
plan: 02
subsystem: memory
tags:
  [redis, state-machine, customer-profile, system-prompt, whatsapp, ai-context]

requires:
  - phase: 69-redis-memory-layer-client-state-machine
    plan: 01
    provides: "Redis singleton with graceful degradation, session context CRUD"
provides:
  - "Customer profile CRUD with 90d TTL (memory/profile.ts)"
  - "Client state machine detecting 5 states from DB (state/machine.ts)"
  - "State-adaptive system prompt with profile context injection (system-prompt.ts)"
  - "Handler integration: state detection, profile loading, extraction"
  - "DB migration 0041 updating client_state enum"
affects: [whatsapp-bot, ai-pipeline, admin-dashboard]

tech-stack:
  added: []
  patterns:
    [
      client-state-detection,
      profile-extraction-fire-and-forget,
      state-adaptive-prompt,
    ]

key-files:
  created:
    - el-templo-bot/src/memory/profile.ts
    - el-templo-bot/src/state/machine.ts
    - el-templo-bot/test/state-machine.test.ts
    - el-templo-bot/test/memory-profile.test.ts
    - el-templo-api/src/db/migrations/0041_update_client_state_enum.sql
  modified:
    - el-templo-bot/src/ai/system-prompt.ts
    - el-templo-bot/src/webhook/handler.ts
    - el-templo-api/src/db/schema/whatsapp.ts
    - el-templo-bot/test/ai-handler.test.ts

key-decisions:
  - "State machine returns {state, userId} tuple to enable conversation-member linking"
  - "Profile extraction uses fire-and-forget pattern with explicit inner JSON.parse try/catch"
  - "Paused subscriptions map to inactive_member state"
  - "Notes cap truncates from beginning (oldest notes dropped first)"

patterns-established:
  - "Client state detection: query users -> subscriptions -> attendance for 5-state lifecycle"
  - "Profile extraction: lightweight second AI call after main response, fire-and-forget"
  - "State-adaptive prompt: additive sections appended to base prompt, not replacing it"

requirements-completed: [MEM-03, MEM-04]

duration: 12min
completed: 2026-03-18
---

# Phase 69 Plan 02: Customer Profile + Client State Machine Summary

**Customer profile persistence with 90d TTL, 5-state client detection from DB (users/subscriptions/attendance), state-adaptive Spanish system prompt, and fire-and-forget profile extraction after each AI exchange**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-18T19:52:48Z
- **Completed:** 2026-03-18T20:04:43Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Client state machine detecting lead/trial/active_member/inactive_member/expired_member from DB lookups
- Customer profile module with Redis persistence, 90-day TTL, and 2000-char notes cap
- State-specific additive system prompt sections in Spanish for all 5 client states
- Fire-and-forget profile extraction after each AI response with malformed-JSON guard
- DB migration 0041 updating client_state enum from lapsed/returning to inactive_member/expired_member
- 25 new unit tests (12 state machine + 13 profile) plus updated existing handler tests

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration + state machine + schema update** - `21440ffa` (feat)
2. **Task 2: Profile module + state-adaptive system prompt** - `ed3d7330` (feat)
3. **Task 3: Wire profile + state into handler + extraction + unit tests** - `93ea89ae` (feat)

## Files Created/Modified

- `el-templo-api/src/db/migrations/0041_update_client_state_enum.sql` - Updates client_state enum values
- `el-templo-api/src/db/schema/whatsapp.ts` - Schema enum updated to match migration
- `el-templo-bot/src/state/machine.ts` - Client state detection from users/subscriptions/attendance tables
- `el-templo-bot/src/memory/profile.ts` - Customer profile CRUD with 90d TTL and notes cap
- `el-templo-bot/src/ai/system-prompt.ts` - State-specific additive sections and profile context injection
- `el-templo-bot/src/webhook/handler.ts` - Integrated state detection, profile loading, extraction
- `el-templo-bot/test/state-machine.test.ts` - 12 unit tests for state machine
- `el-templo-bot/test/memory-profile.test.ts` - 13 unit tests for profile module
- `el-templo-bot/test/ai-handler.test.ts` - Updated mocks for new dependencies

## Decisions Made

- State machine returns `{state, userId}` tuple so handler can link conversations to members in one pass
- Paused subscriptions map to `inactive_member` (reasonable since user isn't actively attending)
- Profile extraction uses a second lightweight AI call after the main response, wrapped in fire-and-forget with explicit inner JSON.parse try/catch for malformed output
- Notes cap truncates from the beginning to preserve most recent observations
- `determineClientState` returns `lead` on DB error as the safest default assumption

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated ai-handler.test.ts mocks for new dependencies**

- **Found during:** Task 3
- **Issue:** Existing human takeover test failed because handler now imports state/machine and memory/profile which weren't mocked
- **Fix:** Added vi.doMock for `../src/state/machine`, `../src/memory/profile`, and `../src/memory/session` in the handler test
- **Files modified:** el-templo-bot/test/ai-handler.test.ts
- **Verification:** All 45 tests pass
- **Committed in:** 93ea89ae (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary fix to keep existing tests passing after handler changes. No scope creep.

## Issues Encountered

None beyond the test mock update documented above.

## User Setup Required

None - migration 0041 will be applied automatically on next deploy. Redis already configured from Plan 01.

## Next Phase Readiness

- Phase 69 complete: Redis session context + customer profiles + client state machine all operational
- Bot now remembers customer details across conversations and adapts AI behavior per client lifecycle state
- Ready for future phases: class booking tools, trial registration, proactive schedulers

---

_Phase: 69-redis-memory-layer-client-state-machine_
_Completed: 2026-03-18_

---
phase: 45-architecture-foundation
plan: 03
subsystem: api
tags: [aura, service-layer, tdd, drizzle, mysql-transactions, economy]

# Dependency graph
requires:
  - phase: 45-01
    provides: AURA schema tables (aura_transactions, aura_balances, aura_config)
  - phase: 45-02
    provides: barrel export convention for modules

provides:
  - "AuraService with award/spend/getBalance methods for AURA economy"
  - "InsufficientBalanceError for spend validation"
  - "AuraSourceType union type matching the 8 source type enum values"
  - "Aura module barrel export at src/modules/aura/index.ts"
  - "Integration tests covering all 8 award/spend/getBalance behaviors"

affects:
  [attendance-module, challenges-module, social-module, admin-aura-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service class with DI (db + logger via constructor, not Fastify decorator) for testability"
    - "MySQL transactions with FOR UPDATE row locking for atomic balance operations"
    - "ON DUPLICATE KEY UPDATE for balance upsert pattern"

key-files:
  created:
    - el-templo-api/src/modules/aura/service.ts
    - el-templo-api/src/modules/aura/types.ts
    - el-templo-api/src/modules/aura/index.ts
    - el-templo-api/test/unit/aura-service.test.ts
  modified: []

key-decisions:
  - "AuraService uses constructor DI (db + logger params) rather than Fastify decorator — keeps it testable and importable by other services"
  - "AuraSourceType defined as TypeScript union type matching the 8 enum values for compile-time safety"
  - "InsufficientBalanceError exported as named class for consumers to catch specific error types"

patterns-established:
  - "Service DI pattern: new ServiceClass(db, logger) for non-route services"
  - "Economy transaction pattern: ledger insert + balance upsert in single MySQL transaction"

requirements-completed: [RSTRC-02, RSTRC-03, RSTRC-04]

# Metrics
duration: 5min
completed: 2026-03-08
---

# Phase 45 Plan 03: AuraService Summary

**AuraService with atomic award/spend/getBalance using MySQL transactions, typed source enum, and 11 integration tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-08T15:35:02Z
- **Completed:** 2026-03-08T15:40:20Z
- **Tasks:** 2 (TDD: 3 commits for task 1)
- **Files modified:** 4

## Accomplishments

- AuraService.award() creates ledger entry and atomically upserts balance via ON DUPLICATE KEY UPDATE
- AuraService.spend() uses FOR UPDATE row locking to prevent race conditions, rejects insufficient balance
- AuraService.getBalance() returns cached balance or 0 for non-existent users
- Duplicate awards rejected at DB level by unique constraint on (userId, sourceType, referenceType, referenceId)
- All 11 integration tests pass against eltemplo_test, full suite of 211 tests passes

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED): Add failing tests for AuraService** - `d9808b7` (test)
2. **Task 1 (TDD GREEN): Implement AuraService** - `c27a7ce` (feat)
3. **Task 2: Create aura module barrel export** - `9542eb1` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/aura/types.ts` - AwardInput, SpendInput, AuraBalance interfaces + AuraSourceType union
- `el-templo-api/src/modules/aura/service.ts` - AuraService class with award/spend/getBalance + InsufficientBalanceError
- `el-templo-api/src/modules/aura/index.ts` - Barrel export for aura module
- `el-templo-api/test/unit/aura-service.test.ts` - 11 integration tests covering all behaviors

## Decisions Made

- AuraService receives Drizzle DB instance and Pino logger via constructor (dependency injection) rather than accessing Fastify decorators. This keeps the service testable without a full Fastify app context and importable by other modules' services
- Defined AuraSourceType as a TypeScript union type rather than leaving sourceType as `string`, providing compile-time safety when calling award()
- Exported InsufficientBalanceError alongside AuraService so consuming modules can catch specific error types

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed aura_config column name in test seed SQL**

- **Found during:** Task 1 (GREEN phase)
- **Issue:** Test seed used `source_type` column name but the actual aura_config table column is `aura_config_source_type` (separate enum per table, decided in Plan 01)
- **Fix:** Changed seed SQL to use `aura_config_source_type`
- **Files modified:** el-templo-api/test/unit/aura-service.test.ts
- **Committed in:** c27a7ce (Task 1 GREEN commit)

**2. [Rule 1 - Bug] Fixed TypeScript strict type errors**

- **Found during:** Task 2 (barrel export + tsc check)
- **Issue:** `sourceType: string` not assignable to enum union; `ResultSetHeader` cast to array; unused `and` import
- **Fix:** Created AuraSourceType union type, used `unknown` intermediate cast, removed unused import
- **Files modified:** el-templo-api/src/modules/aura/types.ts, el-templo-api/src/modules/aura/service.ts
- **Committed in:** 9542eb1 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed issues above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- AuraService ready for consumption by future modules (attendance, challenges, social)
- Import pattern: `import { AuraService } from "../aura"` then `new AuraService(db, log)`
- No API routes registered (per user decision) — service is internal only for now

---

_Phase: 45-architecture-foundation_
_Completed: 2026-03-08_

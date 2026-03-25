---
phase: 54-quick-fixes-dry-utility-extraction
plan: 01
subsystem: api
tags: [error-handling, dry, fastify, typescript]

# Dependency graph
requires:
  - phase: 53-codebase-health
    provides: existing shared/errors.ts with AppError, NotFoundError, ValidationError
provides:
  - BadRequestError and ConflictError in shared/errors.ts
  - Shared handleServiceError function with STATUS_LABELS for consistent API error responses
  - All catch blocks typed as err:unknown across the entire API
affects: [54-02, 54-03, 55-pattern-fixes]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared-error-handler, status-label-map, instanceof-AppError-dispatch]

key-files:
  created:
    - el-templo-api/src/modules/shared/error-handler.ts
  modified:
    - el-templo-api/src/modules/shared/errors.ts
    - el-templo-api/src/modules/shared/index.ts
    - el-templo-api/src/modules/payments/service.ts
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/modules/scheduling/service.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/payments/routes.ts
    - el-templo-api/src/modules/attendance/routes.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/src/modules/admin/routes.ts
    - el-templo-api/src/modules/attendance/index.ts
    - el-templo-api/src/modules/payments/index.ts
    - el-templo-api/src/modules/scheduling/index.ts
    - el-templo-api/src/modules/subscriptions/index.ts
    - el-templo-api/src/plugins/auth.ts
    - el-templo-api/src/index.ts

key-decisions:
  - "instanceof AppError dispatch instead of per-subclass instanceof chains -- single check covers all error subclasses"
  - "STATUS_LABELS map for human-readable HTTP status labels in two-field {error, message} API response format"
  - "Keep InsufficientBalanceError special handling in subscriptions -- extends Error not AppError, domain-specific"
  - "Skip journeys/routes.ts -- throws plain Error not AppError, handleServiceError would change status from 400 to 500"
  - "Remove error class re-exports from module barrels -- no external consumers, prevents stale transitive exports"

patterns-established:
  - "Shared handleServiceError: all route catch blocks call handleServiceError(err, reply, request.log, context)"
  - "Error class imports: services import from ../shared/errors, routes import handler from ../shared/error-handler"
  - "Two-field error response: { error: STATUS_LABEL, message: err.message } for all AppError subclasses"

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-03-11
---

# Phase 54 Plan 01: API Error Consolidation Summary

**Consolidated 12 duplicate error classes from 4 services into shared/errors.ts and replaced 3 local handleServiceError functions + inline instanceof chains with a single shared handler using STATUS_LABELS map**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-11T14:55:00Z
- **Completed:** 2026-03-11T15:20:00Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments
- Eliminated 12 duplicate error class definitions (BadRequestError, NotFoundError, ConflictError) from payments, attendance, scheduling, and subscriptions services
- Created shared handleServiceError using instanceof AppError dispatch with STATUS_LABELS map for consistent two-field {error, message} API responses
- Replaced 3 local handleServiceError implementations (admin, analytics, scheduling routes) and 5+ inline instanceof chains (payments, attendance, subscriptions routes) with shared import
- Typed all remaining untyped catch blocks (auth.ts, index.ts) as catch (err: unknown)
- Cleaned up 4 module barrel files removing stale error class re-exports

## Task Commits

Each task was committed atomically:

1. **Task 1: Consolidate error classes and extract handleServiceError** - `4fbc17e` (feat)
2. **Task 2: Replace inline error classes and handlers across all modules** - `f6ac754` (refactor)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `el-templo-api/src/modules/shared/error-handler.ts` - New shared handler with STATUS_LABELS map and instanceof AppError dispatch
- `el-templo-api/src/modules/shared/errors.ts` - Added BadRequestError (400) and ConflictError (409) extending AppError
- `el-templo-api/src/modules/shared/index.ts` - Barrel updated with new error classes and handleServiceError
- `el-templo-api/src/modules/*/service.ts` (4 files) - Removed inline error classes, import from shared/errors
- `el-templo-api/src/modules/*/routes.ts` (6 files) - Replaced local handlers/instanceof chains with shared handleServiceError
- `el-templo-api/src/modules/*/index.ts` (4 files) - Removed stale error class re-exports
- `el-templo-api/src/plugins/auth.ts` - Typed catch block as err: unknown
- `el-templo-api/src/index.ts` - Typed catch block as err: unknown

## Decisions Made
- **instanceof AppError over per-subclass checks:** Single instanceof check + statusCode/message covers all current and future AppError subclasses. Eliminates need to update handler when adding new error types.
- **STATUS_LABELS map:** Maps numeric status codes to human-readable labels ("Bad Request", "Not Found", etc.) for the `error` field in API responses. Preserves existing two-field `{ error, message }` contract that tests expect.
- **InsufficientBalanceError kept separate:** It extends plain Error (not AppError), so handleServiceError would treat it as unknown -> 500. Kept explicit instanceof check before calling handleServiceError in subscriptions assign route.
- **journeys/routes.ts unchanged:** Uses plain Error throws, not AppError. Replacing with handleServiceError would change 400 responses to 500. Already typed with err: unknown.
- **members/routes.ts unchanged:** Uses isDuplicateKeyError for MySQL-specific error handling. Already typed with err: unknown.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed handleServiceError response format to match API contract**
- **Found during:** Task 2 (after initial commit, test failures revealed mismatch)
- **Issue:** Initial handleServiceError sent single-field `{ error: err.message }` but all tests expected two-field `{ error: "Label", message: "description" }` format
- **Fix:** Added STATUS_LABELS map and switched to `{ error: label, message: err.message }` / `{ error: "Server Error", message: "Error interno del servidor" }` format
- **Files modified:** el-templo-api/src/modules/shared/error-handler.ts
- **Verification:** All 407 tests pass
- **Committed in:** f6ac754 (Task 2 commit)

**2. [Rule 3 - Blocking] Removed stale error class re-exports from module barrels**
- **Found during:** Task 2 (TypeScript compilation errors after removing inline classes from services)
- **Issue:** 4 barrel index.ts files re-exported error classes from service files which no longer export them
- **Fix:** Removed error class names from barrel export statements (no external consumers confirmed via grep)
- **Files modified:** attendance/index.ts, payments/index.ts, scheduling/index.ts, subscriptions/index.ts
- **Verification:** tsc --noEmit passes (only pre-existing scheduling type errors remain)
- **Committed in:** f6ac754 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes essential for correctness. Response format fix prevented 23 test failures. Barrel fix prevented 10 TypeScript compilation errors. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in scheduling/service.ts (4 errors: missing SlotMemberView/SlotMemberStatus types, unknown properties on WeeklySlotView/SlotDetailView) -- confirmed pre-existing, not caused by our changes. Logged as out-of-scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Shared error infrastructure ready for any new API modules
- All route handlers follow consistent error handling pattern
- Next plan (54-02) can proceed with frontend extractError + formatDate DRY extraction

---
*Phase: 54-quick-fixes-dry-utility-extraction*
*Completed: 2026-03-11*

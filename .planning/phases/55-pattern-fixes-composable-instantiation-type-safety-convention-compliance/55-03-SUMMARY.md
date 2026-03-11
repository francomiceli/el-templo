---
phase: 55-pattern-fixes-composable-instantiation-type-safety-convention-compliance
plan: 03
subsystem: api
tags: [drizzle, typescript, type-safety, performance]

requires:
  - phase: 55-02
    provides: Type safety and convention compliance across frontend apps
provides:
  - Drizzle typed partials for all service update patterns
  - CtaType union type for blog CTA narrowing
  - Optimized getMorososCount COUNT query
affects: [blog, payments, subscriptions, members, scheduling, gladius]

tech-stack:
  added: []
  patterns:
    - "Drizzle typed partial: Partial<typeof table.$inferInsert> for .set() calls"
    - "CtaType union type exported from blog service for cross-layer sharing"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/blog/service.ts
    - el-templo-api/src/modules/blog/routes.ts
    - el-templo-api/src/modules/scheduling/service.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/gladius/service.ts
    - el-templo-api/src/modules/payments/service.ts
    - el-templo-admin/src/composables/useBlogApi.ts

key-decisions:
  - "Cast gender and level fields in members/service.ts to enum types surfaced by typed partial"
  - "Move correlated subquery from HAVING to WHERE in getMorososCount for correct per-row COUNT"

patterns-established:
  - "Drizzle typed partial: use Partial<typeof table.$inferInsert> instead of Record<string, unknown> for .set() calls"

requirements-completed: []

duration: 7min
completed: 2026-03-11
---

# Phase 55 Plan 03: API Type Safety Summary

**Drizzle typed partials in 5 services (8 instances), CtaType union across blog stack, COUNT-based getMorososCount**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-11T21:55:10Z
- **Completed:** 2026-03-11T22:03:03Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Replaced all 8 `Record<string, unknown>` instances across 5 service files with `Partial<typeof table.$inferInsert>` -- Drizzle now catches misspelled columns and wrong value types at compile time
- Narrowed ctaType from bare `string` to `"trial" | "franchise" | "app"` union across blog service, routes, and admin composable
- Replaced getMorososCount full-fetch pattern with efficient COUNT query using correlated subquery in WHERE clause

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace Record<string, unknown> with Drizzle typed partials** - `042873c` (refactor)
2. **Task 2: Fix ctaType loose string type and getMorososCount full-fetch** - `21fa665` (fix)

## Files Created/Modified

- `el-templo-api/src/modules/blog/service.ts` - CtaType export, blogPosts and blogTags typed partials
- `el-templo-api/src/modules/blog/routes.ts` - Import CtaType, narrow interface fields
- `el-templo-api/src/modules/scheduling/service.ts` - activities typed partial
- `el-templo-api/src/modules/members/service.ts` - users typed partial with enum casts
- `el-templo-api/src/modules/subscriptions/service.ts` - subscriptionPlans and subscriptions typed partials (3 instances)
- `el-templo-api/src/modules/gladius/service.ts` - gladiusProducts typed partial
- `el-templo-api/src/modules/payments/service.ts` - COUNT-based getMorososCount
- `el-templo-admin/src/composables/useBlogApi.ts` - ctaType union in CreateBlogPostData

## Decisions Made

- Cast `gender` and `level` in members/service.ts to their enum union types -- the typed partial correctly surfaced that `UpdateMemberInput` uses loose `string` types while the schema expects enum unions. Casting at the assignment is the correct fix (runtime validation happens at the route layer).
- Moved the correlated subquery from HAVING to WHERE in getMorososCount -- HAVING without GROUP BY treats the entire result as one group (giving count of 0 or 1), while WHERE correctly filters per-row before counting.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added enum type casts for gender and level in members/service.ts**

- **Found during:** Task 1 (Drizzle typed partials)
- **Issue:** `Partial<typeof schema.users.$inferInsert>` requires `gender` to be `"male" | "female" | "other" | null` and `level` to be `"alfa" | "delta" | "sigma" | "omega" | "spartan"`, but `UpdateMemberInput` defines them as `string | null` and `string`
- **Fix:** Added explicit type casts at the assignment points
- **Files modified:** el-templo-api/src/modules/members/service.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 042873c (Task 1 commit)

**2. [Rule 1 - Bug] Rewrote getMorososCount to use WHERE instead of HAVING**

- **Found during:** Task 2 (getMorososCount optimization)
- **Issue:** Plan suggested HAVING clause, but COUNT(\*) without GROUP BY aggregates everything into one row -- HAVING then filters that single aggregated row, returning 0 or 1 instead of the actual count
- **Fix:** Moved the correlated subquery condition to WHERE clause where it correctly filters per subscription row before the COUNT aggregation
- **Files modified:** el-templo-api/src/modules/payments/service.ts
- **Verification:** All 394 tests pass including morosos count test
- **Committed in:** 21fa665 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes essential for correctness. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 55 complete -- all 3 plans executed
- API type safety hardened across all service update patterns
- Ready for next phase

## Self-Check: PASSED

All 8 modified files verified. Both commit hashes (042873c, 21fa665) confirmed in git log.

---

_Phase: 55-pattern-fixes-composable-instantiation-type-safety-convention-compliance_
_Completed: 2026-03-11_

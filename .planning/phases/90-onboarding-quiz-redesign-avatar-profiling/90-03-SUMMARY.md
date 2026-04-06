---
phase: 90-onboarding-quiz-redesign-avatar-profiling
plan: 03
subsystem: api, admin-ui, testing
tags: [fastify, drizzle, vue, quasar, avatar-profiling, member-management]

requires:
  - phase: 90-01
    provides: avatar_type column on member_profiles table, avatar resolution service

provides:
  - avatarType field in GET /members list response
  - avatarType field in GET /members/:id detail response
  - avatarType query param filter on GET /members (A-K or 'none')
  - Avatar badge on admin member detail page
  - Avatar filter dropdown on admin members list page
  - Integration tests for avatarType filter and response field

affects: [admin-members, member-profiles, avatar-analytics]

tech-stack:
  added: []
  patterns:
    - "Avatar type filter uses EXISTS/NOT EXISTS subquery pattern (same as segment filter)"
    - "Avatar type subquery in select clause (same as segment subquery)"
    - "AVATAR_LABELS constant for display labels shared between detail and filter"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-api/test/members/members.test.ts

key-decisions:
  - "avatarType filter uses parameterized SQL via drizzle-orm template literals (mitigates T-90-08 injection threat)"
  - "avatarType=none uses NOT EXISTS subquery to catch both missing profile rows and null avatar_type"

patterns-established:
  - "Avatar filter pattern: EXISTS subquery on member_profiles.avatar_type, consistent with segment filter"

requirements-completed: [AVA-07]

duration: 13min
completed: 2026-04-06
---

# Phase 90 Plan 03: Admin Avatar Visibility Summary

**avatarType in member list/detail API with filter support, avatar badge on admin detail page, avatar filter dropdown on members list, and 5 integration tests**

## Performance

- **Duration:** 13 min
- **Started:** 2026-04-06T18:11:36Z
- **Completed:** 2026-04-06T18:24:36Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- API returns avatarType in both member list and detail responses, with filter support (A-K values + 'none' for members without avatar)
- Admin member detail page shows terracotta outline avatar badge when member has an avatar type assigned
- Admin members list page has Avatar dropdown filter with all 11 avatar options plus "Sin avatar" for null filtering
- 5 integration tests verify avatarType in list/detail responses, filter by specific type, filter by none, and null handling

## Task Commits

Each task was committed atomically:

1. **Task 1: API -- avatarType in member list and detail, plus filter support** - `dc3240ab` (feat)
2. **Task 2: Admin UI -- avatar badge on detail + filter on list** - `9beb778b` (feat)
3. **Task 3: Integration tests for avatarType filter and response field** - `9d90acda` (test)

## Files Created/Modified

- `el-templo-api/src/modules/members/types.ts` - Added avatarType to MemberListParams and MemberListItem
- `el-templo-api/src/modules/members/service.ts` - Added avatarType filter condition, subquery in select, and export support
- `el-templo-api/src/modules/members/routes.ts` - Added avatarType to list querystring, detail response, and export route
- `el-templo-api/src/modules/members/schemas.ts` - Added avatarType to JSON schemas for list item, profile, querystring, and export
- `el-templo-admin/src/types/member.ts` - Added avatarType to MemberListItem, MemberListParams, and AVATAR_LABELS constant
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` - Added avatar badge after segment badge in header
- `el-templo-admin/src/pages/AlumnosPage.vue` - Added Avatar QSelect filter with A-K options and Sin avatar
- `el-templo-api/test/members/members.test.ts` - Added 5 integration tests for avatarType filter and response

## Decisions Made

- avatarType=none filter uses NOT EXISTS subquery to catch both members with no profile row and members with null avatar_type (covers both cases gracefully)
- All SQL uses parameterized queries via drizzle-orm template literals (T-90-08 injection threat mitigated)
- Avatar badge uses `color="primary"` (terracotta in admin Quasar theme) with `outline` style, consistent with UI-SPEC

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Avatar type is now visible in admin for both individual member detail and list filtering
- Ready for Plan 02 (avatar quiz frontend) to complete the member app onboarding flow
- All integration tests passing (656 total, 5 new avatarType tests)

---

_Phase: 90-onboarding-quiz-redesign-avatar-profiling_
_Completed: 2026-04-06_

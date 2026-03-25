---
phase: 79-behavioral-segmentation
plan: 01
subsystem: api
tags: [segmentation, behavioral-analytics, member-profiles, settings]
dependency_graph:
  requires:
    [
      member-profiles-table,
      system-settings-table,
      attendance-table,
      subscriptions-table,
    ]
  provides:
    [
      segmentation-service,
      segment-calculation,
      login-tracking,
      segment-settings-api,
      segment-member-filter,
    ]
  affects: [auth-routes, member-routes, settings-routes, member-list-api]
tech_stack:
  added: []
  patterns:
    [
      constructor-di,
      plan-relative-thresholds,
      fire-and-forget-graceful-degradation,
    ]
key_files:
  created:
    - el-templo-api/src/modules/segmentation/types.ts
    - el-templo-api/src/modules/segmentation/service.ts
    - el-templo-api/src/modules/segmentation/index.ts
    - el-templo-api/src/db/schema/member-profiles.ts
    - el-templo-api/src/db/schema/member-logins.ts
    - el-templo-api/src/db/migrations/0057_behavioral_segmentation.sql
    - el-templo-api/test/segmentation/segmentation.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/settings/service.ts
    - el-templo-api/src/modules/settings/routes.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/test/helpers.ts
decisions:
  - "New member_logins table for login tracking (lightweight, dedicated table vs extending onboarding_analytics)"
  - "1-hour cooldown on segment recalculation to avoid DB writes on every /auth/me call"
  - "Digital Warrior threshold set at 4+ app usage signals (logins + session completions) in 28-day window"
  - "Segment subquery approach in member list (not JOIN) to avoid affecting existing query performance"
  - "member_profiles schema recreated in worktree with segment columns (worktree was at revert commit)"
metrics:
  duration: 8min
  completed: "2026-03-24T17:12:00Z"
  tasks: 2
  files: 16
---

# Phase 79 Plan 01: Behavioral Segmentation Backend Summary

SegmentationService with 6 plan-relative behavioral segments (nuevo_guerrero, espartano, intermitente, en_riesgo, digital_warrior, ghost), calculated on /auth/me login using configurable system_settings thresholds and 28-day rolling attendance window. 19 integration tests covering all segment rules, settings CRUD, and member list filtering.

## Commits

| Task | Commit     | Description                                             |
| ---- | ---------- | ------------------------------------------------------- |
| 1    | `8775bd42` | Schema, migration, SegmentationService, API integration |
| 2    | `7be64291` | 19 integration tests across 5 groups                    |

## What Was Built

### Task 1: Schema, Migration, Types, and SegmentationService

**Schema changes:**

- `member_profiles` table extended with `member_segment` enum (6 values) and `segment_updated_at` timestamp (both nullable)
- New `member_logins` table for tracking login events (userId + loggedInAt with composite index)
- Migration `0057_behavioral_segmentation.sql`: ALTER TABLE, CREATE TABLE, seed 6 system_settings rows, DELETE grace_period_days

**Segmentation module (`src/modules/segmentation/`):**

- `types.ts`: MemberSegment type, SEGMENT_SETTINGS_KEYS, SEGMENT_DEFAULTS, SegmentThresholds interface, SEGMENT_LABELS/COLORS/VALUES for admin UI
- `service.ts`: SegmentationService with constructor DI (db, log):
  - `getThresholds()` — loads all segment.\* keys from system_settings with defaults
  - `calculateSegment(userId)` — full 6-segment logic with priority ordering
  - `calculateAndUpdate(userId)` — calculate + persist with 1-hour cooldown
  - `recordLogin(userId)` — lightweight login event insertion

**Segment calculation priority:**

1. Nuevo Guerrero (first N days after registration, overrides all)
2. Ghost (inactive 8+ weeks, no activity at all)
3. En Riesgo (inactive 2-8 weeks)
4. Digital Warrior (low attendance + high app usage)
5. Espartano (80%+ plan budget)
6. Intermitente (40-80% plan budget)
7. En Riesgo (fallback, <40% budget)

**Settings module extension:**

- `SettingsService.getSegmentThresholds()` and `updateSegmentThresholds()` methods
- `GET /api/admin/settings/segments` and `PUT /api/admin/settings/segments` routes (admin-only)

**Auth integration:**

- GET /auth/me now records login + triggers segment recalculation for member role users
- Returns `segment` field in response
- Fire-and-forget pattern with graceful degradation on errors

**Member list integration:**

- `segment` field added to MemberListItem type and Fastify response schema
- `segment` filter parameter in listMembersSchema querystring
- Member detail endpoint returns `segment` and `segmentUpdatedAt`
- Segment queried via subquery from member_profiles (not JOIN, to preserve performance)

### Task 2: Integration Tests

19 test cases in 5 groups:

- **Segment Calculation Logic** (8 tests): All 6 segments + edge cases
- **Plan-Relative Thresholds** (3 tests): Different plans, same attendance
- **/auth/me Integration** (3 tests): Login tracking, segment response, non-member exclusion
- **Settings API** (4 tests): GET/PUT, validation, RBAC
- **Member List Filter** (3 tests): Filter by segment, segment in list/detail

## Decisions Made

1. **New member_logins table** (not extending onboarding_analytics): Cleaner separation of concerns. Login tracking is high-frequency and unrelated to onboarding events.

2. **1-hour recalculation cooldown**: Avoids DB writes on every /auth/me call. Segment changes are gradual (28-day window), so hourly recalculation is more than sufficient.

3. **Digital Warrior threshold at 4+ signals**: Approximately 1 per week in a 28-day window. Combines session completions and distinct login days.

4. **Subquery for segment in member list**: Using a correlated subquery `(SELECT mp.member_segment FROM member_profiles mp WHERE mp.user_id = users.id LIMIT 1)` instead of a LEFT JOIN preserves the existing query structure and avoids potential row duplication.

5. **member_profiles recreated**: The worktree was at the revert commit (Phase 78 code removed from production). The schema file was recreated with the segment columns included from the start.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree missing Phase 78 files**

- **Found during:** Task 1 setup
- **Issue:** Worktree was at commit `2a173e7a` (revert of Phase 78), so member-profiles.ts and related files did not exist
- **Fix:** Created member-profiles.ts from scratch with both onboarding and segment columns included
- **Files created:** `el-templo-api/src/db/schema/member-profiles.ts`
- **Commit:** `8775bd42`

**2. [Rule 2 - Missing functionality] Test helper cleanup for new tables**

- **Found during:** Task 1
- **Issue:** `cleanAllTestData()` in test helpers did not include member_logins and member_profiles tables
- **Fix:** Added deletion of both tables in Layer 1 of cleanup
- **Files modified:** `el-templo-api/test/helpers.ts`
- **Commit:** `8775bd42`

## Known Stubs

None. All segment calculation logic is fully wired to real data sources.

## Self-Check: PASSED

All 7 created files exist. Both commits (8775bd42, 7be64291) verified in git log.

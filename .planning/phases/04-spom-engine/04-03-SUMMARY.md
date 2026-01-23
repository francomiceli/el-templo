---
phase: 04-spom-engine
plan: 03
subsystem: api-data-access
tags: [spom, api, fastify, endpoints, authentication]
dependency-graph:
  requires: ["04-01"]
  provides: ["spom-api-endpoints", "exercise-query-api", "spom-week-management"]
  affects: ["05-session-generation"]
tech-stack:
  added: []
  patterns: ["service-class", "fastify-plugin", "json-schema-validation"]
key-files:
  created:
    - el-templo-api/src/modules/spom/service.ts
    - el-templo-api/src/modules/spom/schemas.ts
    - el-templo-api/src/modules/spom/routes.ts
    - el-templo-api/src/plugins/spom.ts
  modified:
    - el-templo-api/src/app.ts
decisions:
  - id: "use-json-schema"
    choice: "Use plain JSON Schema objects instead of @sinclair/typebox"
    reason: "Consistent with existing auth module pattern, no new dependency"
metrics:
  duration: "3 min"
  completed: "2026-01-23"
---

# Phase 4 Plan 3: SPOM API Endpoints Summary

**One-liner:** REST API for SPOM week management and exercise queries using service-class pattern with authentication

## What Was Built

### SpomService Class
Central business logic for SPOM data access with methods:
- `getCurrentWeek()` - Get current SPOM week from singleton config
- `updateCurrentWeek(week)` - Update SPOM week (admin operation)
- `getSpomRule(week, route)` - Lookup intensity/wave/pattern for week+route
- `queryExercises(filters)` - Query exercises by route, effort, level, difficulty
- `getIntensityRule(intensity)` - Get reps budget and difficulty for intensity level
- `getContractionRule(intensity, totalExercises)` - Get CON/EXC/ISO distribution
- `getWeeklyRotator(week, day, levelGroup)` - Get route assignments per day/level
- `getTableCounts()` - Get row counts for all SPOM tables

### API Endpoints (5 total)
| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| /spom/week | GET | Get current SPOM week | Required |
| /spom/week | PUT | Update SPOM week | Admin only |
| /spom/lookup | GET | SPOM rule by week+route | Required |
| /spom/exercises | GET | Query exercises with filters | Required |
| /spom/tables | GET | Table row counts | Required |

### Validation Schemas
- `updateSpomWeekSchema` - Validates week 1-52
- `exerciseQuerySchema` - Validates route, effort, level, difficulty, limit
- `spomLookupSchema` - Validates week and route params

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 04ece63 | feat | SpomService with query methods and validation schemas |
| 20fda44 | feat | SPOM routes and Fastify plugin |
| 28b0f76 | feat | Register SPOM plugin in app.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed schema library mismatch**
- **Found during:** Task 1
- **Issue:** Plan specified @sinclair/typebox but project uses plain JSON Schema objects
- **Fix:** Rewrote schemas using plain JSON Schema format with TypeScript interfaces
- **Files modified:** el-templo-api/src/modules/spom/schemas.ts
- **Commit:** 04ece63

**2. [Rule 2 - Missing Critical] Initialized spom_config singleton**
- **Found during:** Task 3 verification
- **Issue:** spom_config table was empty, causing 500 error on PUT /spom/week
- **Fix:** Inserted initial row with id=1, current_week=1
- **Database:** Manual INSERT during testing (will be part of migration/seed in production)

## Verification Results

All tests passed:
- GET /spom/week returns `{"currentWeek":1}`
- PUT /spom/week updates and returns new week with timestamp
- GET /spom/lookup returns 404 when no matching rule (expected - data import pending)
- GET /spom/exercises returns empty array (expected - exercise data pending)
- GET /spom/tables returns accurate row counts for all 8 SPOM tables
- Unauthenticated requests return 401
- Non-admin users blocked from PUT /spom/week (403)

## Next Phase Readiness

Phase 5 (Session Generation) can now:
- Query current SPOM week via API
- Look up SPOM rules by week+route
- Query exercises with filters
- Access intensity/contraction rules via service methods

**Dependencies satisfied:**
- SpomService exportable for direct use in session generation engine
- All query methods ready for Phase 5 pipeline stages

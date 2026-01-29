---
phase: 10-session-completion
plan: 01
subsystem: backend-api
tags: [drizzle, fastify, database, session-completion]
requires: [09-level-specific-sessions]
provides: [completed-sessions-table, completion-endpoint, total-days-trained]
affects: [10-02, 10-03, 10-04]
tech-stack:
  added: []
  patterns: [upsert-pattern, json-schema-validation]
key-files:
  created:
    - el-templo-api/src/db/schema/completed-sessions.ts
    - el-templo-api/src/db/migrations/0004_sudden_gertrude_yorkes.sql
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/modules/sessions/schemas.ts
    - el-templo-api/src/modules/sessions/routes.ts
decisions:
  - id: 10-01-upsert
    choice: "Check-then-update pattern for upsert"
    rationale: "Clear logic, explicit control over insert vs update paths"
  - id: 10-01-totaldays
    choice: "COUNT DISTINCT date for totalDaysTrained"
    rationale: "Simple SQL, handles same-day re-completions correctly"
metrics:
  duration: 4min
  completed: 2026-01-29
---

# Phase 10 Plan 01: Backend Completion API Summary

Backend infrastructure for persisting session completion records with RPE, notes, and blocks completed.

## What Was Built

### 1. Database Schema (`completed-sessions.ts`)
- `completed_sessions` table with:
  - `id` (auto-increment primary key)
  - `userId` (FK to users)
  - `dayId` (session identifier like "W1-lunes-alfa")
  - `date` (YYYY-MM-DD string)
  - `branchId` (FK to branches)
  - `startedAt`, `completedAt` (timestamps)
  - `rpe` (nullable integer 1-10)
  - `notes` (nullable text)
  - `blocksCompleted` (JSON array of block role strings)
- Indexes on `userId`, `date`, `branchId` for query performance

### 2. Types and Validation (`schemas.ts`)
- `CompleteSessionInput` TypeScript interface
- `completeSessionSchema` JSON Schema for Fastify validation:
  - Required: dayId, date, startedAt, blocksCompleted
  - Optional: rpe (1-10 or null), notes
  - Date pattern: YYYY-MM-DD

### 3. API Endpoint (`routes.ts`)
- `POST /api/sessions/complete`
- Authentication required (`fastify.authenticate`)
- Upsert behavior: same dayId+userId updates existing record
- Returns `{ success, completedSessionId, totalDaysTrained }`
- totalDaysTrained = COUNT DISTINCT date per user

## Commits

| Hash | Message |
|------|---------|
| 90e93b2 | feat(10-01): add completed_sessions database schema |
| 7b70308 | feat(10-01): add session completion types and validation schema |
| 9285388 | feat(10-01): add POST /sessions/complete endpoint |

## Verification Results

1. Database table created with all columns and indexes
2. TypeScript compiles without errors
3. Endpoint accepts valid completion payloads
4. Upsert: same dayId+userId updates existing (completedSessionId=1 preserved)
5. New dayId creates new record (totalDaysTrained increments)
6. Invalid payloads (RPE > 10, missing fields) return 400

## Deviations from Plan

None - plan executed exactly as written.

## Technical Notes

- `blocksCompleted` stores role strings like `["INITIUM", "NUCLEUS", "DEUTEROS_1", "ATHLOS_EPIKOS"]`
- User's branchId is looked up at completion time (not passed from frontend)
- `completedAt` is set server-side to prevent client clock manipulation

## Next Phase Readiness

Plan 10-02 (Celebration Screen) can call this endpoint when user completes session.
Plan 10-03 (RPE Input) builds the UI for collecting rpe/notes.
Plan 10-04 (Wiring) connects frontend to this API.

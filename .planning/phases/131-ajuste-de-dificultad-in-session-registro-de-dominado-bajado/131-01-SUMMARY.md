---
phase: 131-ajuste-de-dificultad-in-session-registro-de-dominado-bajado
plan: 01
subsystem: el-templo-api / training (skill tree)
tags: [exercise-adjustments, skill-tree, member-scope, drizzle, migration]
requires:
  - "Phase 126 ExerciseProgressionService.getNeighbor (adjacency primitive)"
  - "exercises + exercise_progressions tables"
provides:
  - "exercise_adjustments table (per-member dominado/bajado log)"
  - "POST /api/exercise-adjustments member-scoped endpoint"
  - "ExerciseAdjustmentService.adjust(memberId, exerciseId, direction, ctx)"
affects:
  - "Plan 02 (tree % enrichment + coach view) reads exercise_adjustments latest-per-node"
  - "Plan 03 (player UI buttons) calls POST /api/exercise-adjustments"
tech-stack:
  added: []
  patterns:
    - "fp plugin (dependencies [database, auth], prefix /api/exercise-adjustments)"
    - "constructor DI service reusing Phase 126 primitive"
    - "member-scope via request.user.userId only; body additionalProperties:false"
key-files:
  created:
    - el-templo-api/src/db/schema/exercise-adjustments.ts
    - el-templo-api/src/db/migrations/0142_create_exercise_adjustments.sql
    - el-templo-api/src/modules/exercise-adjustments/service.ts
    - el-templo-api/src/modules/exercise-adjustments/routes.ts
    - el-templo-api/src/modules/exercise-adjustments/schemas.ts
    - el-templo-api/src/modules/exercise-adjustments/index.ts
    - el-templo-api/src/plugins/exercise-adjustments.ts
    - el-templo-api/test/exercise-adjustments.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/app.ts
decisions:
  - "to_exercise_id persisted (D-05 discretion) for the Plan 02 coach view"
  - "FKs use default RESTRICT (no cascade): adjustment rows are a historical log"
  - "additionalProperties:false on the body rejects spoofed memberId/userId (defense in depth on top of request.user.userId scoping)"
metrics:
  duration: ~25m
  completed: 2026-06-05
---

# Phase 131 Plan 01: exercise_adjustments registry + member-scoped adjustment endpoint Summary

Backend foundation for the in-session difficulty adjustment: a new `exercise_adjustments` log table (migration 0142), an `ExerciseAdjustmentService` that reuses Phase 126's `getNeighbor` to resolve the neighbor and persist a `dominado|bajado` record for the origin exercise, and a strictly member-scoped `POST /api/exercise-adjustments` endpoint. Chain-end taps are a graceful no-op (no row). Level/SPOM are never touched.

## What was built

### Task 1 — schema + migration (commit `f58844e8`)

- `exercise-adjustments.ts` Drizzle table `exerciseAdjustments`:
  - `id` PK; `member_id` FK→users; `exercise_id` FK→exercises (origin node); `to_exercise_id` nullable FK→exercises (resolved neighbor served); `status` `mysqlEnum("status", ["dominado","bajado"])` NOT NULL; `day_id` varchar(50); `date` varchar(10); `created_at` timestamp defaultNow.
  - Indexes on `member_id` and `exercise_id`. Append-style log (no unique constraint).
- Re-exported from `schema/index.ts`.
- Hand-written `0142_create_exercise_adjustments.sql`: `CREATE TABLE exercise_adjustments` with `status ENUM('dominado','bajado') NOT NULL`. Enum values + first-arg match the Drizzle schema exactly (enum-drift guard). No `;` inside any comment line. FK constraint names follow Drizzle's auto-generated convention.

### Task 2 — service + endpoint + tests (commit `cef3129e`)

- `ExerciseAdjustmentService.adjust(memberId, exerciseId, direction, ctx)`:
  - Instantiates `ExerciseProgressionService` and calls `getNeighbor(exerciseId, direction)` — reuses the Phase 126 primitive, no reimplementation.
  - Maps `up`→`dominado`, `down`→`bajado` (D-02).
  - Neighbor null → `{ neighbor: null, message }`, NO row written (chain end / off-graph / invalid exercise).
  - Neighbor present → INSERT one row (member_id, exercise_id=origin, to_exercise_id=neighbor.id, status, day_id, date) and return `{ neighbor, message: null }`.
  - Writes ONLY `exercise_adjustments` — never `users.level` or SPOM (D-06). `catch (err: unknown)` + `instanceof Error`, structured logging via injected logger.
- `routes.ts`: `POST /` with `onRequest:[fastify.authenticate]`; `const { userId } = request.user`; member_id comes ONLY from `request.user.userId` (D-04).
- `schemas.ts`: request body (`additionalProperties:false`, direction enum up/down, dayId/date), 200/401 responses.
- `plugins/exercise-adjustments.ts`: fp, dependencies `["database","auth"]`, prefix `/api/exercise-adjustments`; registered in `app.ts` next to tree-progress/tree-editor.
- `test/exercise-adjustments.test.ts`: six integration tests — swap up→dominado, swap down→bajado, chain-end null no-op (no row), member-scope (spoofed body id rejected + row owned by token user), invalid exerciseId no-op, 401 without token.

## Contract for Plans 02-03

**Endpoint:** `POST /api/exercise-adjustments` (authenticated member).

**Request body:**

```jsonc
{
  "exerciseId": number,   // ORIGIN exercise (tree node) the member tapped
  "direction": "up" | "down",
  "dayId": string,        // session ref, e.g. "W1-lunes-sigma" (max 50)
  "date": "YYYY-MM-DD"
}
```

No member/user id in the body (member is the token user; extra props rejected).

**Response (200):**

```jsonc
{
  "neighbor": {           // null at chain end / off-graph
    "id": number,
    "name": string,
    "dificultadLineal": number,
    "contraction": "CON" | "EXC" | "ISO",
    "position": string | null
  } | null,
  "message": string | null  // non-null only when neighbor is null (no-op)
}
```

`401` without a token.

**Table `exercise_adjustments`** (latest-per-node = latest row by member_id+exercise_id):
`id, member_id, exercise_id (origin), to_exercise_id (neighbor served, nullable), status ('dominado'|'bajado'), day_id, date, created_at`. Plan 02 reads `status='dominado'` rows to enrich the tree % "reached" seam; the coach view reads the dominado/bajado log per member.

## Deviations from Plan

None — plan executed as written. The migration uses default RESTRICT FKs (no cascade) because adjustment rows are a historical log and exercises are never hard-deleted (soft-merged via `canonical_exercise_id`); this is within the plan's "Claude's discretion" on names/indexes.

## Verification

- `pnpm tsc --noEmit` (el-templo-api): exit 0 (run after both tasks).
- Migration 0142 contains `CREATE TABLE exercise_adjustments` with `ENUM('dominado','bajado')`; no `;` inside comments; committed alongside the schema.
- Endpoint reads `request.user.userId` only; no `body.memberId`/`body.userId` read in routes.
- Plugin registered in `app.ts`.
- Integration tests written for CI (NOT run locally per project policy). Confirm with the user before pushing to staging so CI applies 0142 and runs the new test.

## Known Stubs

None. The endpoint is fully wired (service → getNeighbor → DB). Coach read path and player UI are deferred to Plans 02/03 by design (D-04/D-05 split).

## Self-Check: PASSED

- Files created: all 8 new files present; 2 modified files present.
- Commits: `f58844e8` (Task 1), `cef3129e` (Task 2) — both on branch `staging`.

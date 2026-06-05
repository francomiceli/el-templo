---
phase: 131-ajuste-de-dificultad-in-session-registro-de-dominado-bajado
plan: 02
subsystem: el-templo-api / tree-progress + el-templo-admin / alumnos
tags:
  [
    exercise-adjustments,
    tree-progress,
    reached-seam,
    coach-view,
    TRAINING_ROLES,
    ADJUST-04,
  ]
requires:
  - "Plan 131-01 exercise_adjustments table + member-scoped POST"
  - "Phase 127 buildMemberTree reached seam (level + completed-session proxies)"
  - "Phase 128 tree-editor TRAINING_ROLES onRequest gate pattern"
provides:
  - "buildMemberTree reached = level OR completed OR latest-dominado (latest-per-node wins)"
  - "ExerciseAdjustmentCoachService.listMemberAdjustments(memberId)"
  - "GET /api/admin/exercise-adjustments/:memberId (TRAINING_ROLES, 403 for members)"
  - "admin useExerciseAdjustmentsApi composable + AlumnoDetail Entrenamiento-tab section"
affects:
  - "Plan 03 (player UI buttons) POSTs adjustments that now feed both the tree % and the coach view"
tech-stack:
  added: []
  patterns:
    - "separate coach plugin (/api/admin/exercise-adjustments) so the role gate never touches the member POST"
    - "latest-per-node reduce in JS (MAX created_at, id tie-break) for the dominado set"
    - "two alias(exercises) LEFT joins (origin + served neighbor) for human-readable names"
key-files:
  created:
    - el-templo-api/src/modules/exercise-adjustments/coach-service.ts
    - el-templo-api/src/modules/exercise-adjustments/coach-routes.ts
    - el-templo-api/src/plugins/exercise-adjustments-coach.ts
    - el-templo-api/test/exercise-adjustments-coach.test.ts
    - el-templo-admin/src/composables/useExerciseAdjustmentsApi.ts
    - el-templo-admin/src/types/exercise-adjustments.ts
  modified:
    - el-templo-api/src/modules/tree-progress/service.ts
    - el-templo-api/src/modules/exercise-adjustments/schemas.ts
    - el-templo-api/src/modules/exercise-adjustments/index.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/tree-progress/member-tree.test.ts
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
decisions:
  - "Coach GET lives in a SEPARATE plugin under /api/admin/exercise-adjustments (not the member POST plugin) so the TRAINING_ROLES plugin-wide hook cannot lock out the member-scoped POST — matches the threat-model boundary and the 128 tree-editor split"
  - "Reached AUGMENTED not replaced (D-05/D-06): third OR branch only; level/SPOM untouched"
  - "Latest-per-node computed in JS (MAX created_at, id tie-break) — deterministic for same-second taps; a later bajado un-counts an earlier dominado"
  - "Composable suppresses the toast on 403/404 (isExpectedClientError) so non-coach viewers of AlumnoDetail don't get a spurious negative notify; page silences 403 to an empty list"
metrics:
  duration: ~35m
  completed: 2026-06-05
---

# Phase 131 Plan 02: tree-% enrichment + coach view of dominado/bajado Summary

Closes ADJUST-04. The Phase-127 tree-progress "reached" seam now counts a node as reached when the member's LATEST `exercise_adjustments` record for it is `dominado` (a third OR branch on top of the existing level-ceiling and completed-session proxies; latest-per-node wins so a later `bajado` un-counts it). A new coach/owner-gated `GET /api/admin/exercise-adjustments/:memberId` exposes a member's dominado/bajado log, surfaced in the admin AlumnoDetail Entrenamiento tab. No level/SPOM writes (D-06); no new dependencies.

## What was built

### Task 1 — enrich the 127 reached seam (commit `e5716fc7`)

- `tree-progress/service.ts`: new `loadDominatedExerciseIds(db, userId)` mirrors `loadCompletedExerciseIds` — reads the member's `exercise_adjustments` rows, reduces to the latest row per `exercise_id` (MAX `created_at`, `id` as deterministic tie-break for equal timestamps), and returns the set whose latest status is `dominado`. Wired into the existing `Promise.all` and the per-node `reached` expression gains a third OR branch: `dl <= ceiling || completed.has(id) || dominated.has(id)`.
- Seam header comment rewritten to document branch (c) as AUGMENTING (not replacing) branches (a)/(b), latest-per-node wins, read-only (no level/SPOM write — D-06).
- `test/tree-progress/member-tree.test.ts` extended with Tests A (a latest `dominado` marks an above-ceiling node reached → 100%), B (a later `bajado` after a `dominado` un-counts it → not reached), C (no regression: level-ceiling proxy still works with no adjustment rows). `beforeEach` now wipes `exercise_adjustments` first (FK order).

### Task 2 — coach read endpoint + admin view (commit `5846fbe2`)

- `coach-service.ts`: `ExerciseAdjustmentCoachService.listMemberAdjustments(memberId)` — SELECT the member's rows, two `alias(exercises)` LEFT joins (origin + served neighbor) for human-readable names, newest first (`desc(createdAt), desc(id)`). Read-only; performs no authorization (the route owns the gate).
- `coach-routes.ts` + `plugins/exercise-adjustments-coach.ts`: a SEPARATE plugin mounted under `/api/admin/exercise-adjustments` with a plugin-wide `onRequest` hook (authenticate then 403 unless `TRAINING_ROLES`), mirroring the 128 tree-editor gate. Kept separate from the member POST plugin so the role gate never locks out the member's own endpoint.
- `schemas.ts`: `memberAdjustmentsResponseSchema` (array of plain-const row schema).
- `app.ts`: registers the new coach plugin next to the member plugin.
- `test/exercise-adjustments-coach.test.ts`: coach 200 (records newest-first, origin + neighbor names resolved), owner 200, member token 403 (T-131-05), no-token 401, empty-log → `[]`.
- Admin: `types/exercise-adjustments.ts` (`MemberAdjustment` row), `useExerciseAdjustmentsApi.ts` composable (mirrors `useTreeEditorApi`: `api.get`, `extractError`, `Notify`, `createLogger`, `cleanup()`, no `onUnmounted`, no `console.*`, no `any`; suppresses the toast on expected 403/404), and an "Ajustes de dificultad (dominado / bajado)" section in the AlumnoDetail Entrenamiento tab (warm palette — `green-8`/`deep-orange-7`, no blue; loading spinner + empty placeholder).

## Deviations from Plan

**1. [Rule 3 — Blocking] `pnpm typecheck` script does not exist.**

- **Found during:** Task 1 verification.
- **Issue:** The plan's acceptance criteria run `pnpm typecheck`, but the api package.json has no such script.
- **Fix:** Used the project-policy gate `pnpm tsc --noEmit` (CLAUDE.md / project_policy) instead. Exit 0 after each task.
- **Files modified:** none (tooling only).

**2. [Rule 2 — Critical correctness] Coach GET mounted under `/api/admin/exercise-adjustments` via a separate plugin, not on the member POST plugin.**

- **Found during:** Task 2.
- **Issue:** The plan body mentioned adding the GET to the existing `routes.ts`, but the threat-model boundary and `key_links` reference `/api/admin/exercise-adjustments/:memberId`. Mounting it on the member plugin (prefix `/api/exercise-adjustments`) would mismatch the boundary, and a plugin-wide role hook there would lock out the member POST.
- **Fix:** Created a dedicated `coach-routes.ts` + `exercise-adjustments-coach` plugin under `/api/admin/exercise-adjustments`, mirroring the 128 tree-editor split. The member POST plugin is untouched (still authenticate-only).
- **Files modified:** `coach-routes.ts`, `exercise-adjustments-coach.ts`, `app.ts`, `index.ts` (new exports); `routes.ts` comment updated.

**3. [Rule 2 — UX correctness] Composable suppresses the toast on expected 403/404.**

- **Found during:** Task 2 (AlumnoDetail loads for `gestion`/`recepcion` roles too, which get 403 on this coach-only endpoint).
- **Fix:** `fetchMemberAdjustments` only `Notify`s + `log.error`s on non-expected errors (`isExpectedClientError`); the page silences 403 to an empty list. Avoids a spurious negative toast for non-coach viewers.

## Verification

- `pnpm tsc --noEmit` (el-templo-api): exit 0 (after both tasks).
- `pnpm run lint` (el-templo-admin): 0 errors (6 pre-existing warnings in unrelated files).
- `pnpm run build` (el-templo-admin): Build succeeded (includes the Vue/TS type check).
- Grep gates: `dominated`/`exerciseAdjustments` present in tree-progress/service.ts; NO `update(schema.users)`/`users.level =` in it; `TRAINING_ROLES` present in coach-routes.ts; `useExerciseAdjustmentsApi`/`dominado` present in AlumnoDetailPage.vue; `cleanup` present and no real `onUnmounted`/`console.` in the composable.
- Integration tests written for CI (NOT run locally per project policy). Confirm with the user before pushing to staging so CI runs the new tree-progress + coach tests.

## Known Stubs

None. The seam, the endpoint, the composable, and the admin section are fully wired (composable → real GET → real service → DB joins).

## Threat Flags

None. No new trust boundaries beyond the two in the plan's threat register (both mitigated): the coach GET is gated by `TRAINING_ROLES` (T-131-05), and `buildMemberTree` / `loadDominatedExerciseIds` remain keyed on the route-supplied `request.user.userId` (T-131-06). No level/SPOM writes (T-131-07). No new dependencies (T-131-SC).

## TDD Gate Compliance

Task 1 was `tdd="true"`. The plan's RED/GREEN gates were satisfied in a single `feat` commit (tests + implementation together) because the project policy forbids running the suite locally (CI-only), so a separate failing-RED commit cannot be locally verified. Tests A/B/C are committed and will run in CI; the implementation and its tests landed atomically in `e5716fc7`.

## Self-Check: PASSED

- Files created: all 6 new files present (coach-service, coach-routes, coach plugin, coach test, admin composable, admin types).
- Commits: `e5716fc7` (Task 1), `5846fbe2` (Task 2) — both on branch `staging`.

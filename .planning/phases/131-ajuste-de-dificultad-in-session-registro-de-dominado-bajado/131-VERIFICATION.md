---
phase: 131-ajuste-de-dificultad-in-session-registro-de-dominado-bajado
verified: 2026-06-05T12:00:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Visual UAT — in-session adjustment end to end"
    expected: "Per-exercise '↓ más fácil' / 'más difícil ↑' buttons appear in the player on a real exercise slide (warm palette, no blue). Tapping swaps ONLY the exercise identity (name/contraction/videoUrl); reps/seconds/format/dose unchanged. One step per tap. Chain-end shows 'ya estás en el extremo de la cadena' and makes no change."
    why_human: "Visual UI behavior and correct neighbor rendering cannot be verified by grep. Requires an active presencial session in a deployed environment (CI/staging with migration 0142 applied)."
  - test: "Dominado record visible in admin alumno detail (coach view)"
    expected: "After tapping 'más difícil ↑', the admin AlumnoDetailPage Entrenamiento tab shows the dominado record (exercise name, status badge, neighbor name, date) for that member. A member token correctly gets 403 (blocked by TRAINING_ROLES gate)."
    why_human: "UI rendering of the AlumnoDetailPage section cannot be verified by code inspection alone. Requires a staging deploy and a coach/owner session."
  - test: "Dominado node counted as reached in tree % (Mi Templo)"
    expected: "A tree node the member has a latest 'dominado' record for (above their level ceiling, not in completed sessions) shows reached=true and contributes to the % in Mi Templo / tree view. A later 'bajado' un-counts it."
    why_human: "The % display in the member app requires visual verification in a real session context after the backend seam is exercised."
  - test: "Migration 0142 applied cleanly in CI"
    expected: "CI pipeline applies migration 0142 via the project runner (pnpm db:migrate) without errors. Integration tests for exercise-adjustments.test.ts, exercise-adjustments-coach.test.ts, and tree-progress/member-tree.test.ts all pass."
    why_human: "Integration tests are CI-only per project policy (CLAUDE.md). Local gate is tsc/build only. Requires push to staging for CI to run the new tests and apply 0142."
---

# Phase 131: Ajuste de dificultad in-session — Verification Report

**Phase Goal:** Durante la sesión el miembro sube/baja la dificultad de un ejercicio puntual desde el player; el árbol (126) le sirve el vecino correcto (conservando ruta/contracción/formato/dosis del bloque, sólo cambia el ejercicio); el cambio persiste en un registro nuevo dominado/bajado (distinto del completado+RPE) que alimenta el % del árbol (127) y ve el coach. NO cambia nivel ni SPOM.
**Verified:** 2026-06-05
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                                         | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ADJUST-03: `exercise_adjustments` table + migration 0142 exist, with status enum `dominado\|bajado`, FKs to users+exercises, per-member append log, distinct from `completed_sessions.rpe`                    | VERIFIED | `0142_create_exercise_adjustments.sql`: `CREATE TABLE exercise_adjustments` with `ENUM('dominado','bajado')`, three FK constraints, two indexes, no `;` in comments. `exercise-adjustments.ts` Drizzle schema with `mysqlEnum("status", ["dominado","bajado"])` (first-arg matches column name — enum-drift guard honored). Re-exported from `schema/index.ts`.                                                                                                                                                                                                                                                                       |
| 2   | ADJUST-01: Player shows per-exercise `↓ más fácil` / `más difícil ↑` buttons; `useExerciseAdjustment` composable calls POST member-scoped endpoint; member_id from `request.user.userId` only                 | VERIFIED | `BlockProgressionView.vue`: buttons with `canAdjustCurrentSlide` gate, emit `adjust` with `{exerciseId, direction, blockId}`. `useExerciseAdjustment.ts`: POSTs to `/exercise-adjustments`, `cleanup()` present, no `onUnmounted`, no `console.*`. `routes.ts`: `onRequest:[fastify.authenticate]`; handler reads `const { userId } = request.user`; no `body.memberId`/`body.userId`. `additionalProperties:false` on body schema.                                                                                                                                                                                                   |
| 3   | ADJUST-02: `getNeighbor` (Phase 126) reused (up=dominado, down=bajado); swap preserves route/contraction/format/dose; chain-end null is graceful no-op; effort never crossed; no level/SPOM change            | VERIFIED | `service.ts`: instantiates `ExerciseProgressionService` and calls `getNeighbor`; `up→dominado`, `down→bajado` mapping explicit; null neighbor → `{ neighbor: null, message }`, NO insert. `DayPlayer.vue`: swap replaces only `exerciseId/exerciseName/contraction/videoUrl` spreading the rest (`reps/seconds/format/dose/sortOrder` preserved); `neighbor===null` → `$q.notify` info, no mutation. `grep` confirms no `users.level`/SPOM write anywhere in service.                                                                                                                                                                 |
| 4   | ADJUST-04: Phase 127 `buildMemberTree` "reached" seam augmented with latest-dominado-per-node; later `bajado` un-counts; coach/owner-gated GET endpoint (403 for members); admin AlumnoDetail renders the log | VERIFIED | `tree-progress/service.ts`: `loadDominatedExerciseIds()` reads `exercise_adjustments` for the member, reduces to latest-per-node (MAX `created_at`, id tie-break), returns set of `dominado` exercise ids. Third OR branch in `reached`: `dl <= ceiling \|\| completedExerciseIds.has \|\| dominatedExerciseIds.has`. `coach-routes.ts`: plugin-wide `onRequest` hook checks `TRAINING_ROLES`, returns 403 otherwise. Separate plugin under `/api/admin/exercise-adjustments` so member POST is not locked out. `AlumnoDetailPage.vue`: renders `useExerciseAdjustmentsApi` data with status badges (green-8/deep-orange-7, no blue). |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact                                                                              | Expected                                                                                                     | Status   | Details                                                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/exercise-adjustments.ts`                                 | Drizzle table `exerciseAdjustments` + status enum                                                            | VERIFIED | `mysqlEnum("status", ["dominado","bajado"])`, all FK references, indexes.                                                                                                         |
| `el-templo-api/src/db/migrations/0142_create_exercise_adjustments.sql`                | CREATE TABLE with ENUM, no `;` in comments                                                                   | VERIFIED | Single additive DDL; 3 FK constraints with Drizzle naming convention; no `;` in any comment line confirmed.                                                                       |
| `el-templo-api/src/modules/exercise-adjustments/service.ts`                           | `ExerciseAdjustmentService.adjust()` with getNeighbor + AdjustmentNeighbor (videoUrl)                        | VERIFIED | Constructor DI; calls `getNeighbor`; maps direction→status; null no-op; inserts row then fetches `exercises.videoUrl` for neighbor; returns `AdjustmentNeighbor` with `videoUrl`. |
| `el-templo-api/src/modules/exercise-adjustments/routes.ts`                            | POST `/` member-scoped                                                                                       | VERIFIED | `onRequest:[authenticate]`; reads `request.user.userId` only; no body member/user id.                                                                                             |
| `el-templo-api/src/modules/exercise-adjustments/coach-service.ts`                     | `ExerciseAdjustmentCoachService.listMemberAdjustments()`                                                     | VERIFIED | Two `alias(exercises)` LEFT joins for human-readable names; newest-first order.                                                                                                   |
| `el-templo-api/src/modules/exercise-adjustments/coach-routes.ts`                      | GET `/:memberId` TRAINING_ROLES gated                                                                        | VERIFIED | Plugin-wide `onRequest` hook: authenticate then 403 unless `TRAINING_ROLES`.                                                                                                      |
| `el-templo-api/src/plugins/exercise-adjustments.ts` + `exercise-adjustments-coach.ts` | fp plugins registered in app.ts                                                                              | VERIFIED | Both plugins present in `app.ts` lines 125 + 129.                                                                                                                                 |
| `el-templo-api/src/modules/tree-progress/service.ts`                                  | buildMemberTree reached has third OR branch for dominado                                                     | VERIFIED | `loadDominatedExerciseIds` loader; `Promise.all` includes it; per-node `reached` expression has three branches. Seam header comment updated for phase 131.                        |
| `el-templo-api/test/exercise-adjustments.test.ts`                                     | 6 integration tests (swap dominado/bajado, chain-end null/no-row, member-scope, invalid exercise, 401)       | VERIFIED | All 6 test cases present (tests 1–6). CI-only per project policy.                                                                                                                 |
| `el-templo-api/test/exercise-adjustments-coach.test.ts`                               | Coach 200, owner 200, member 403, no-token 401                                                               | VERIFIED | Tests 1–4 present.                                                                                                                                                                |
| `el-templo-api/test/tree-progress/member-tree.test.ts`                                | Tests A (dominado marks reached), B (bajado un-counts), C (no regression)                                    | VERIFIED | Tests A/B/C present at lines 356/395/438.                                                                                                                                         |
| `el-templo-app/src/modules/training/composables/useExerciseAdjustment.ts`             | `adjustExercise`, `isSubmitting`, `cleanup()`; no `onUnmounted`; no `console.*`                              | VERIFIED | All present. `cleanup()` is a no-op function (no timers/listeners).                                                                                                               |
| `el-templo-app/src/modules/training/components/BlockProgressionView.vue`              | Per-exercise más fácil/difícil buttons; emit `adjust` with blockId                                           | VERIFIED | Buttons in detail row gated by `canAdjustCurrentSlide`; emit carries `{exerciseId, direction, blockId}` (WR-01 fix applied).                                                      |
| `el-templo-app/src/modules/training/pages/DayPlayer.vue`                              | Swap targets exact block by blockId; clears completion for swapped-out exercise; assigns `neighbor.videoUrl` | VERIFIED | `blocks.find(b => b.blockId === payload.blockId)` (WR-01); `clearExerciseCompletion(block.role, payload.exerciseId)` (WR-02); `videoUrl: neighbor.videoUrl` (WR-03).              |
| `el-templo-admin/src/composables/useExerciseAdjustmentsApi.ts`                        | `cleanup()`, no `onUnmounted`, no `console.*`, calls `/admin/exercise-adjustments/:memberId`                 | VERIFIED | All present. Suppresses toast on expected 403/404.                                                                                                                                |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue`                                      | Renders dominado/bajado section via the composable                                                           | VERIFIED | `useExerciseAdjustmentsApi` imported and used; section at line 517 with status badges.                                                                                            |

---

### Key Link Verification

| From                                   | To                                          | Via                                                                 | Status   | Details                                                                                                                        |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `exercise-adjustments/service.ts`      | `ExerciseProgressionService.getNeighbor`    | constructor DI + direct call                                        | VERIFIED | `new ExerciseProgressionService(db, log)` in constructor; `this.progression.getNeighbor(exerciseId, direction)` in `adjust()`. |
| `exercise-adjustments/routes.ts`       | `request.user.userId`                       | `onRequest:[authenticate]`                                          | VERIFIED | `const { userId } = request.user`; body carries no member id; `additionalProperties:false`.                                    |
| `exercise-adjustments/coach-routes.ts` | `TRAINING_ROLES` gate                       | plugin-level `onRequest` hook                                       | VERIFIED | `TRAINING_ROLES` imported from shared/permissions; `authenticate` then 403 if role not in set.                                 |
| `tree-progress/service.ts`             | `exercise_adjustments` latest-dominado set  | `loadDominatedExerciseIds` in `Promise.all`                         | VERIFIED | Loader queries `exerciseAdjustments` scoped by `memberId = userId`; result included in `reached` OR expression.                |
| `app.ts`                               | Both exercise-adjustments plugins           | `app.register(...)`                                                 | VERIFIED | Lines 125 (member plugin) and 129 (coach plugin).                                                                              |
| `BlockProgressionView.vue`             | `useExerciseAdjustment` composable          | `@adjust="onAdjustExercise"` in DayPlayer                           | VERIFIED | `DayPlayer.vue` line 80: `@adjust="onAdjustExercise"`; composable instantiated at line 137-140.                                |
| `useExerciseAdjustment.ts`             | `POST /exercise-adjustments`                | `api.post('/exercise-adjustments', ...)`                            | VERIFIED | `api.post<AdjustmentResponse>('/exercise-adjustments', { exerciseId, direction, dayId, date })`.                               |
| `DayPlayer.vue`                        | `session.blocks[*].exercises[i]` swap       | `block.exercises[idx] = {...current, exerciseId: neighbor.id, ...}` | VERIFIED | Swap targets block by `blockId`, replaces identity fields only (WR-01/WR-02/WR-03 fixes all present).                          |
| `AlumnoDetailPage.vue`                 | `GET /admin/exercise-adjustments/:memberId` | `useExerciseAdjustmentsApi` composable                              | VERIFIED | Composable calls `api.get('/admin/exercise-adjustments/${memberId}')`; page uses result.                                       |

---

### Data-Flow Trace (Level 4)

| Artifact                   | Data Variable          | Source                                                                                                                                                                                | Produces Real Data                           | Status  |
| -------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------- |
| `service.ts` adjust()      | `neighbor`             | `ExerciseProgressionService.getNeighbor()` (Phase 126 adjacency graph)                                                                                                                | Yes — DB query through the progression graph | FLOWING |
| `service.ts` adjust()      | inserted row           | `db.insert(schema.exerciseAdjustments).values(...)`                                                                                                                                   | Yes — real DB insert                         | FLOWING |
| `service.ts` adjust()      | `neighbor.videoUrl`    | `db.select({videoUrl: schema.exercises.videoUrl}).where(eq(exercises.id, neighbor.id))`                                                                                               | Yes — single keyed DB read                   | FLOWING |
| `tree-progress/service.ts` | `dominatedExerciseIds` | `loadDominatedExerciseIds` → `db.select().from(exerciseAdjustments).where(memberId=userId)`                                                                                           | Yes — real DB read                           | FLOWING |
| `AlumnoDetailPage.vue`     | `memberAdjustments`    | `useExerciseAdjustmentsApi.fetchMemberAdjustments(memberId)` → `api.get('/admin/exercise-adjustments/:id')` → `coach-service.listMemberAdjustments()` → real DB query with LEFT JOINs | Yes                                          | FLOWING |

---

### Post-Review Fixes (commits 25b8b966, ee1f244a, 10b4949c)

All three WARNINGs from the code review (131-REVIEW.md) were fixed before this verification:

| Warning                                                         | Fix Applied                                                                                                                                               | Evidence                                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| WR-01: Swap targeted first matching block (not tapped block)    | `blockId` added to `adjust` emit; `DayPlayer.onAdjustExercise` finds block by `b.blockId === payload.blockId`                                             | `BlockProgressionView.vue:215, 517`; `DayPlayer.vue:375`                                         |
| WR-02: Orphaned `exerciseId` in `exercisesCompleted` after swap | `player.value.clearExerciseCompletion(block.role, payload.exerciseId)` called before swap                                                                 | `DayPlayer.vue:382–389`; `useSessionPlayer.ts:349` (method exists)                               |
| WR-03: `videoUrl` nulled with no in-session refetch             | Endpoint now returns `neighbor.videoUrl`; service fetches `exercises.videoUrl` for the resolved neighbor; DayPlayer assigns `videoUrl: neighbor.videoUrl` | `service.ts:43–52, 143–148`; `schemas.ts:36`; `useExerciseAdjustment.ts:22`; `DayPlayer.vue:402` |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED for migration-apply (CI gate) and UI behavior (human UAT). All other checks are static/tsc:

| Behavior                                           | Command                                                  | Result                                                              | Status |
| -------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- | ------ |
| API typecheck (el-templo-api)                      | `cd el-templo-api && pnpm tsc --noEmit`                  | exit 0 (no output)                                                  | PASS   |
| Admin build/type check (el-templo-admin)           | `cd el-templo-admin && pnpm run build`                   | Build succeeded                                                     | PASS   |
| Migration has CREATE TABLE + no `;` in comments    | `grep -c "CREATE TABLE exercise_adjustments" 0142_*.sql` | 1                                                                   | PASS   |
| Endpoint reads request.user.userId only            | `grep "body.memberId\|body.userId" routes.ts`            | no output                                                           | PASS   |
| No debt markers (TBD/FIXME/XXX)                    | grep across all modified files                           | no output                                                           | PASS   |
| No console.log in modified server/composable files | grep across service/composable files                     | comment-only reference in tree-progress/service.ts; no actual calls | PASS   |

---

### Probe Execution

Step 7c: No probe scripts declared or found for this phase. Integration tests are CI-only per project policy.

---

### Requirements Coverage

| Requirement | Source Plan    | Description                                                              | Status    | Evidence                                                                                                            |
| ----------- | -------------- | ------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------- |
| ADJUST-01   | 131-01, 131-03 | Member can request ↓/↑ per exercise from the player                      | SATISFIED | Buttons in BlockProgressionView; useExerciseAdjustment composable; POST endpoint wired member-scoped                |
| ADJUST-02   | 131-01, 131-03 | Tree serves one-step neighbor preserving format/dose; chain-end graceful | SATISFIED | getNeighbor reused; swap replaces identity only; null→notify; blockId targeting exact occurrence; videoUrl returned |
| ADJUST-03   | 131-01         | New `exercise_adjustments` table, distinct from completed_sessions.rpe   | SATISFIED | Schema + migration 0142; append-style log; status enum dominado/bajado; no unique constraint                        |
| ADJUST-04   | 131-02         | Dominado feeds tree % + visible to coach                                 | SATISFIED | Third OR branch in buildMemberTree; separate TRAINING_ROLES-gated plugin; admin AlumnoDetail section                |

---

### Anti-Patterns Found

No blockers or warnings found.

| File                              | Pattern                                                                                    | Severity | Assessment                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| All modified files                | TBD/FIXME/XXX                                                                              | —        | None found                                                                                                      |
| All composables                   | onUnmounted inside                                                                         | —        | None (only in comments)                                                                                         |
| All files                         | console.log/warn/error                                                                     | —        | None (tree-progress comment: `No console.log.` is documentation, not a call)                                    |
| `exercise-adjustments/schemas.ts` | `errorResponseSchema` on member POST but handler has no try/catch (IN-03 from code review) | INFO     | Non-blocking; response schema implies a contract the handler doesn't actively shape. Not a stub or debt marker. |
| `useExerciseAdjustment.ts`        | `contraction: string` instead of `'CON'\|'EXC'\|'ISO'` union (IN-04 from code review)      | INFO     | Type is looser than backend. No runtime impact since contraction is fixed by getNeighbor. Not a stub.           |

The two INFO items from the code review are carried forward as known, non-blocking issues. Neither represents a TBD/FIXME/debt marker; neither blocks the phase goal.

---

### Human Verification Required

#### 1. Visual UAT — in-session adjustment end to end

**Test:** As a member with an active presencial session, open a day and enter the player (DayPlayer). On a real exercise slide, confirm "↓ más fácil" and "más difícil ↑" buttons appear. Tap "más difícil ↑": verify the exercise name/contraction/video change to the harder neighbor; reps/seconds/format/dose must be unchanged; exactly one step. Tap "↓ más fácil": swaps to the easier neighbor. Tap repeatedly in one direction until the chain end: confirm the message "ya estás en el extremo de la cadena" appears and no change occurs.
**Expected:** Buttons visible (warm palette, no blue); each tap produces exactly one step; block prescription preserved; chain-end message shown; no level or SPOM change.
**Why human:** Visual UI behavior, correct neighbor rendering with video, and dose-preservation confirmation require an active session in a deployed environment.

#### 2. Dominado record visible in admin alumno detail (coach view)

**Test:** After performing an adjustment as a member, log in as a coach/owner and open that member's AlumnoDetailPage. Go to the Entrenamiento tab and find the "Ajustes de dificultad (dominado / bajado)" section. Confirm the record appears with the correct status badge, exercise name, served neighbor, and date.
**Expected:** Record visible to coach/owner; member token returns 403 (already covered by integration test in CI but visual confirmation needed for the UI section).
**Why human:** The rendered AlumnoDetailPage section requires visual inspection in a staging environment.

#### 3. Dominado node counted as reached in tree % (Mi Templo)

**Test:** After a member taps "más difícil ↑" on a node above their level ceiling (not yet in completed sessions), check their tree view in the member app. The dominated node should appear reached and contribute to the subfamily %. Confirm a subsequent "↓ más fácil" tap (which records bajado as the latest record for that node) un-counts it.
**Expected:** Node shows reached=true after dominado; reverts after bajado becomes the latest record for that node.
**Why human:** The member app tree display requires visual verification in a real session context.

#### 4. Migration 0142 applied cleanly in CI (and integration tests pass)

**Test:** Push the current staging branch to origin/staging and let CI run. Confirm: (a) migration 0142 applies via the project runner without errors; (b) `exercise-adjustments.test.ts` (6 tests), `exercise-adjustments-coach.test.ts` (4 tests), and `tree-progress/member-tree.test.ts` (Tests A/B/C + prior tests) all pass green.
**Expected:** CI green; all new tests pass; no migration errors.
**Why human:** Integration tests are CI-only per project policy; migration apply requires a live database.

---

### Gaps Summary

No gaps. All 4 must-have truths (ADJUST-01/02/03/04) are verified by source inspection. The three post-review fixes (WR-01 blockId targeting, WR-02 completion clear, WR-03 videoUrl returned) are all confirmed present in the codebase. Both typechecks (api tsc, admin build) pass locally. Four items require human/CI confirmation before the phase can be considered fully closed.

---

_Verified: 2026-06-05_
_Verifier: Claude (gsd-verifier)_

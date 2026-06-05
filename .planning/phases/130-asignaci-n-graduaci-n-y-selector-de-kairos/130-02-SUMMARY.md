---
phase: 130-asignaci-n-graduaci-n-y-selector-de-kairos
plan: 02
subsystem: api
tags: [kairos, levels, graduation, completed-sessions, drizzle, mysql, members]

# Dependency graph
requires:
  - phase: 130-01
    provides: "users.level DEFAULT kairos + users.level_override boolean (sticky coach override contract)"
provides:
  - "KAIROS_GRADUATION_THRESHOLD constant (12) — single source of truth for the graduation threshold (D-02)"
  - "GraduationService.maybeGraduateKairos(userId): one-way kairos→alfa promotion at threshold, skips level_override=true, guarded WHERE level='kairos' (idempotent/race-safe)"
  - "Event-driven graduation wired into all 3 completed-session insert paths (sessions, goal-plans, attendance presencial), each guarded; NO cron"
  - "5 behavior tests: threshold, below-threshold, override-skip, one-way, idempotent (run in CI)"
affects:
  - "130-03 / 130-04 (selectors): graduation moves members kairos→alfa, so the selector must keep rendering both tiers"
  - "131 (in-session adjustment): builds on the kairos level lifecycle"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Event-driven side effect off a completion write: graduation fires inline after the completed-session insert/update, mirroring the existing AURA-award pattern, never via cron (D-02)"
    - "Guarded one-way state transition: UPDATE ... WHERE id=? AND level='kairos' makes the promotion idempotent and race-safe (a concurrent manual change to alfa is never clobbered)"
    - "Graceful degradation: every graduation call is try/catch-wrapped so a graduation failure can never fail (or roll back) the session completion it hangs off"

key-files:
  created:
    - el-templo-api/src/modules/members/graduation-service.ts
    - el-templo-api/test/kairos/kairos-graduation.test.ts
  modified:
    - el-templo-api/src/modules/shared/training-constants.ts
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/src/modules/goal-plans/routes.ts
    - el-templo-api/src/modules/attendance/service.ts

key-decisions:
  - "Threshold lives as KAIROS_GRADUATION_THRESHOLD = 12 in training-constants.ts (next to TRAINING_LEVELS), the single place the number exists — no inline literal in the service"
  - "Graduation count is TOTAL completed_sessions for the user (all levels), not per-level — a kairos member's lifetime completion volume drives promotion"
  - "The override skip (D-03) is enforced twice: an early return on level_override=true AND the guarded WHERE level='kairos' write, so a manually-placed member can never be auto-reverted"
  - "attendance/service.ts instantiates GraduationService inline inside recordPresencialSession (the method has no class-level service field); sessions/goal-plans instantiate once at plugin scope following each file's existing service-DI convention"

patterns-established:
  - "Auto-graduation is a guarded post-completion side effect, one-way only (kairos→alfa); higher graduations stay coach-driven (out of scope, deferred)"
  - "level_override is honored by both an early-return guard and a level-scoped UPDATE — the sticky contract from 130-01 is fully respected"

requirements-completed: [KAIROS-05]

# Metrics
duration: ~12m
completed: 2026-06-05
---

# Phase 130 Plan 02: Kairos Auto-Graduation Summary

**Event-driven one-way kairos→alfa auto-graduation: a `GraduationService` promotes a kairos member to alfa once they reach a single named threshold (12) of completed sessions, skips coach-overridden members (D-03), and is wired as a guarded side effect into all three completed-session insert paths — no cron.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-06-05
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- **`KAIROS_GRADUATION_THRESHOLD = 12`** added to `training-constants.ts` as the single source of truth (D-02), with a doc comment citing the one-way/override-skip semantics. No inline literal exists anywhere else.
- **`GraduationService.maybeGraduateKairos(userId)`**: reads `level` + `level_override`; early-returns on non-kairos (one-way) or `level_override=true` (D-03); counts TOTAL completed_sessions; on reaching the threshold runs a guarded `UPDATE users SET level='alfa' WHERE id=? AND level='kairos'` (idempotent, race-safe); logs the promotion via the injected Pino logger. No `any`, `catch (err: unknown)` discipline.
- **Wired into all three completion paths**, each guarded by its own try/catch so graduation never fails the completion:
  - `sessions/routes.ts` — after the AURA award, plugin-scope `graduationService`.
  - `goal-plans/routes.ts` — after the AURA award, plugin-scope `graduationService`.
  - `attendance/service.ts` — inside `recordPresencialSession` after the mirror insert, nested guard so it can never break the attendance mirror.
- **5 behavior tests** (`test/kairos/kairos-graduation.test.ts`) exercising the service directly: graduates at threshold; does NOT below threshold; skips `level_override=true` past threshold; never demotes/re-evaluates an alfa member (one-way); idempotent on an already-graduated member. Runs in CI per project policy.

## Task Commits

1. **Task 1: GraduationService + threshold constant** — `29a37f0d` (feat)
2. **Task 2: Wire graduation into all three completed-session insert sites** — `31886ab7` (feat)

**Plan metadata:** committed with this SUMMARY + STATE/ROADMAP/REQUIREMENTS update.

_Note: per project policy the integration suite runs in CI, not locally; TDD tasks here were authored test+impl together and committed as one feat each (test seeds the service directly)._

## Files Created/Modified

- `el-templo-api/src/modules/members/graduation-service.ts` — new GraduationService with the one-way, override-aware, guarded promotion.
- `el-templo-api/src/modules/shared/training-constants.ts` — added `KAIROS_GRADUATION_THRESHOLD = 12`.
- `el-templo-api/src/modules/sessions/routes.ts` — import + plugin-scope instance + guarded call after AURA award.
- `el-templo-api/src/modules/goal-plans/routes.ts` — import + plugin-scope instance + guarded call after AURA award.
- `el-templo-api/src/modules/attendance/service.ts` — import + guarded inline call inside `recordPresencialSession`.
- `el-templo-api/test/kairos/kairos-graduation.test.ts` — 5 behavior tests.

## Decisions Made

- **Threshold as a single constant** next to `TRAINING_LEVELS` — verified no inline `= 12` exists in the service (D-02).
- **Total completed_sessions count** (all levels), not per-level, drives graduation.
- **Override enforced twice** (early return + level-scoped WHERE) so a coach decision is never reverted.
- **attendance** instantiates the service inline (no class-level field on `AttendanceService`); the other two follow each file's existing plugin-scope service-DI convention.

## Deviations from Plan

None - plan executed exactly as written. Both tasks completed as specified; the graduation hook was placed at each documented insert site (sessions ~777, goal-plans ~311, attendance ~731) following the AURA-award pattern, guarded, with no new cron.

## Issues Encountered

None. `pnpm tsc --noEmit` (api) exited 0 after each task.

## Threat Surface

All plan `<threat_model>` mitigations are in place:

- **T-130-04 (Elevation of Privilege):** promotion is server-internal only, capped one-way kairos→alfa via the guarded `WHERE level='kairos'`; no client input chooses the target level.
- **T-130-05 (Tampering / override bypass):** `level_override=true` is checked before the write AND the write is level-scoped/idempotent, so a member cannot grind past a coach's manual placement.
- **T-130-06 (DoS on completion):** every call is try/catch-guarded — a graduation error degrades gracefully and never blocks session completion.
- **T-130-SC:** no new packages installed.

No new security surface introduced beyond the plan's threat model.

## Verification

- `pnpm tsc --noEmit` (api) exits 0 after each task.
- `grep KAIROS_GRADUATION_THRESHOLD training-constants.ts` → present; `grep "= 12" graduation-service.ts` → none (no inline literal).
- `grep maybeGraduateKairos` across sessions/routes.ts + goal-plans/routes.ts + attendance/service.ts → all 3 present, each guarded.
- No new cron/scheduler file added.
- Behavior tests authored under `test/kairos/kairos-graduation.test.ts`; run in CI (not run locally per project policy).

## Next Phase Readiness

- KAIROS-05 realized: kairos members auto-graduate to alfa at the configurable threshold, one-way, event-driven, skipping coach-overridden members.
- Ready for 130-03 / 130-04 (kairos selector tiles in admin + app). The level lifecycle (born kairos → auto-graduate to alfa, or coach manual jump) is now complete on the backend.
- Nothing pushed; all work on `staging`, master untouched. CI run (and UAT) pending per the milestone workflow.

## Self-Check: PASSED

---

_Phase: 130-asignaci-n-graduaci-n-y-selector-de-kairos_
_Completed: 2026-06-05_

---
phase: 08-timer-system
plan: 04
subsystem: training-player
tags: [timer, protocol, dayplayer, capacitor, background-detection]
dependency-graph:
  requires: ["08-01", "08-02", "08-03"]
  provides: ["Full timer integration in DayPlayer page"]
  affects: ["09-level-sessions"]
tech-stack:
  added: ["@capacitor/app@8.0.0"]
  patterns: ["protocol-timer-per-block", "background-auto-stop", "timer-recreation-on-block-advance"]
key-files:
  created: []
  modified:
    - el-templo-app/src/modules/training/composables/useSessionPlayer.ts
    - el-templo-app/src/modules/training/pages/DayPlayer.vue
    - el-templo-app/package.json
decisions:
  - id: "08-04-01"
    decision: "Protocol timer managed by DayPlayer, not useSessionPlayer"
    rationale: "Session player handles session-level concerns; protocol timers are per-block and UI-coupled"
  - id: "08-04-02"
    decision: "Timer recreated on block advance via watch on currentBlockIndex"
    rationale: "Each block may have different protocol type; clean lifecycle per block"
  - id: "08-04-03"
    decision: "handleTimerComplete() separate from completeBlock()"
    rationale: "Timer-triggered completion needs timer cleanup before block advance; manual completion does not"
  - id: "08-04-04"
    decision: "@capacitor/app installed for background detection"
    rationale: "appStateChange listener needed to auto-stop protocol timer on app background"
metrics:
  duration: "3 min"
  completed: "2026-01-27"
---

# Phase 8 Plan 4: DayPlayer Timer Integration Summary

**Wire protocol timers into DayPlayer page with timer lifecycle, auto-completion, background detection, and conditional button state management.**

## Tasks Completed

### Task 1: Update useSessionPlayer for timer awareness
- **Commit:** `8c3b6d4`
- Added `currentBlockFormat` computed property for protocol timer creation
- Added `completeBlockAuto()` method as semantic alias for timer-triggered completion
- No breaking changes to existing API

### Task 2: Integrate timer into DayPlayer page
- **Commit:** `e4850e5`
- **Imports:** Added TimerControls component, useProtocolTimer, useTimerAudio, parseProtocolType, getProtocolParams, Capacitor App
- **Protocol timer state:** `protocolTimer` ref, `timerStarted` ref, `protocolType` computed, `hasTimer` computed
- **Template changes:**
  - BlockHeader receives `showTimer`, `timerDisplay`, `timerColorClass` props
  - Action area conditionally renders Complete Block button (STRAIGHT_SETS) or TimerControls (timed blocks)
  - FOR_TIME shows additional "Listo!" button alongside timer controls
- **Event handlers:** `onTimerStart()`, `onTimerStop()`, `onTimerResume()`, `onForTimeDone()`, `handleTimerComplete()`
- **Timer lifecycle:** `createProtocolTimerForBlock()` called via watch on `currentBlockIndex`
- **Background detection:** Capacitor App `appStateChange` listener auto-stops protocol timer
- **Cleanup:** onUnmounted cleans up player, protocol timer, and app state listener
- **Installed** `@capacitor/app@8.0.0` for background detection

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 08-04-01 | Protocol timer managed by DayPlayer, not useSessionPlayer | Session player handles session-level concerns; protocol timers are per-block and UI-coupled |
| 08-04-02 | Timer recreated on block advance via watch on currentBlockIndex | Each block may have different protocol type; clean lifecycle per block |
| 08-04-03 | handleTimerComplete() separate from completeBlock() | Timer-triggered completion needs timer cleanup before block advance |
| 08-04-04 | @capacitor/app installed for background detection | appStateChange listener needed to auto-stop protocol timer on app background |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed @capacitor/app dependency**
- **Found during:** Task 2
- **Issue:** Plan references `App` from `@capacitor/app` but package was not installed
- **Fix:** Ran `pnpm add @capacitor/app` to install v8.0.0
- **Files modified:** `el-templo-app/package.json`, `el-templo-app/pnpm-lock.yaml`
- **Commit:** `e4850e5`

## Verification

1. TypeScript compiles with no new errors (pre-existing Quasar wrapper errors only)
2. Dev server starts successfully on port 9001
3. Straight Sets blocks unchanged - no timer, Complete Block button
4. Timed blocks show TimerControls with start/stop/play
5. BlockHeader receives timer display props when timer is running
6. Background detection registered via Capacitor App plugin
7. Protocol timer recreated on block advance

## Next Phase Readiness

Phase 8 (Timer System) is now **complete** with all 4 plans delivered:
- 08-01: Timer format parsing (TDD)
- 08-02: Core timer composables (useProtocolTimer, useTimerAudio)
- 08-03: Timer UI components (BlockHeader update, TimerControls)
- 08-04: DayPlayer integration (this plan)

**Ready for Phase 9** (Level-Specific Sessions). Timer accuracy testing on real devices remains a concern flagged in STATE.md.

---
phase: quick
plan: 001
subsystem: training-module
tags: [timer-removal, saberes, format-info, ui-cleanup]

dependency-graph:
  requires: [phase-08-timer-system]
  provides: [simplified-session-flow, educational-content, format-explanations]
  affects: [day-player, session-completion]

tech-stack:
  removed: [useProtocolTimer, useTimerAudio, timerFormats, TimerControls]
  added: [formatExplanations]

key-files:
  deleted:
    - el-templo-app/src/modules/training/composables/useProtocolTimer.ts
    - el-templo-app/src/modules/training/composables/useTimerAudio.ts
    - el-templo-app/src/modules/training/utils/timerFormats.ts
    - el-templo-app/src/modules/training/utils/__tests__/timerFormats.test.ts
    - el-templo-app/src/modules/training/components/player/TimerControls.vue
  created:
    - el-templo-app/src/modules/training/utils/formatExplanations.ts
    - el-templo-app/src/modules/training/pages/Saberes.vue
  modified:
    - el-templo-app/src/modules/training/pages/DayPlayer.vue
    - el-templo-app/src/modules/training/stores/sessionPlayerStore.ts
    - el-templo-app/src/modules/training/components/player/BlockHeader.vue
    - el-templo-app/src/modules/training/routes.ts
    - el-templo-app/src/layouts/MainLayout.vue

decisions:
  - id: timer-removal
    choice: "Remove all protocol timer functionality"
    rationale: "Simplify session flow - timers not needed for MVP"
  - id: format-info-dialog
    choice: "Use q-dialog for format explanation instead of tooltip"
    rationale: "More space for descriptive text, better mobile UX"
  - id: saberes-expansion-items
    choice: "Use q-expansion-item with group for single-open behavior"
    rationale: "Clean accordion UI, only one section open at a time"

metrics:
  duration: "3 min"
  completed: "2026-01-30"
---

# Quick Task 001: Remove Timers and Add Saberes/Info Summary

Removed all timer functionality from session player and added educational features.

## One-liner

Timer removal (useProtocolTimer, TimerControls, timerFormats), Saberes educational page with block/route/format/intensity explanations, format info icon in BlockHeader.

## What Was Done

### Task 1: Remove All Timer Functionality
- Deleted 5 timer-related files (~1200 lines removed)
- Cleaned DayPlayer.vue: removed timer imports, state, handlers, and background detection
- Removed protocolTimerStartedAt and protocolTimerAccumulatedMs from sessionPlayerStore
- "Completar {BlockName}" button now always visible for all blocks
- Reduced padding-bottom from 160px to 100px since timer controls no longer stack

### Task 2: Add Saberes Link to Navigation
- Created Saberes.vue educational page with 4 expandable sections:
  - **Bloques**: Initium, Nucleus, Deuteros, Athlos/Epikos
  - **Rutas**: Strength, Power, Endurance, Hypertrophy, Skill
  - **Formatos**: EMOM, AMRAP, For Time, Tabata, Series
  - **Intensidad**: 30-50%, 50-70%, 70-85%, 85-100%
- Added route /training/saberes with auth requirement
- Added "Saberes" link with menu_book icon to MainLayout drawer

### Task 3: Add Format Info Icon in Session
- Created formatExplanations.ts with FORMAT_EXPLANATIONS mapping
- Updated BlockHeader.vue to show info_outline icon when format has explanation
- Info icon opens q-dialog with format name and description
- Removed timer-related props (showTimer, timerDisplay, timerColorClass)
- Added format prop for explanation lookup

## Commits

| Hash | Message |
|------|---------|
| 2694d37 | refactor(quick-001): remove timer functionality and add format info |
| 0a84b89 | feat(quick-001): add Saberes educational guide page |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- [x] No timer imports or references remain in code
- [x] Saberes link visible in navigation drawer
- [x] Format info icon visible during session (when block has known format)
- [x] Session flow still works (block progression, completion)

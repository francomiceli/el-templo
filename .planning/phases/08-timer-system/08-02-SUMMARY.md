---
phase: 08-timer-system
plan: 02
subsystem: training
tags: [timer, web-audio-api, capacitor-haptics, vue-composables, emom, amrap, for-time]

# Dependency graph
requires:
  - phase: 07-day-player
    provides: useSessionPlayer composable with session elapsed timer pattern
provides:
  - useProtocolTimer composable with EMOM/AMRAP/FOR_TIME/STRAIGHT_SETS modes
  - useTimerAudio composable with Web Audio API beeps and Capacitor haptics
  - Drift-correcting Date.now() anchor pattern for accurate timing
  - Timer color warnings (amber at 10s, red at 5s)
affects: [08-03-timer-ui, 08-04-block-integration, day-player-block-header]

# Tech tracking
tech-stack:
  added: ['@capacitor/haptics v8.0.0']
  patterns: ['Web Audio API for programmatic sound generation', 'Drift-correcting timer with Date.now() anchor', 'cleanup() method pattern for composables']

key-files:
  created:
    - el-templo-app/src/modules/training/composables/useTimerAudio.ts
    - el-templo-app/src/modules/training/composables/useProtocolTimer.ts
  modified:
    - el-templo-app/package.json

key-decisions:
  - "Web Audio API OscillatorNode for beeps instead of MP3 files - avoids external file dependencies"
  - "Haptic feedback wrapped in try/catch for graceful web fallback"
  - "cleanup() method exposed instead of onUnmounted - per Phase 7 decision for composable safety"
  - "STRAIGHT_SETS returns no-op timer - avoids conditional logic in consuming components"
  - "100ms polling interval for smooth display without battery drain"

patterns-established:
  - "Drift-correcting timer: Store anchorTime + accumulatedMs, calculate elapsed from Date.now() delta"
  - "Audio unlock on user interaction: unlockAudio() called from Start button to bypass autoplay restrictions"
  - "Timer warnings: playWarning() at 5s/10s remaining with deduplication via lastWarningSeconds tracker"

# Metrics
duration: 12min
completed: 2026-01-27
---

# Phase 08 Plan 02: Timer System Summary

**Protocol timer composables with drift-correcting timing, Web Audio API beeps, and Capacitor haptics for EMOM/AMRAP/FOR_TIME workout modes**

## Performance

- **Duration:** 12 min
- **Started:** 2026-01-27T17:53:35Z
- **Completed:** 2026-01-27T18:06:23Z
- **Tasks:** 2
- **Files modified:** 4 (package.json, pnpm-lock.yaml, 2 new composables)

## Accomplishments

- Created useTimerAudio composable generating beeps via Web Audio API (no external files)
- Created useProtocolTimer composable with unified interface for all 4 protocol types
- Implemented drift-correcting timing pattern using Date.now() anchor timestamps
- Integrated haptic feedback via @capacitor/haptics with web fallback
- Timer color warnings: amber at 10s, red at 5s remaining

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create useTimerAudio composable** - `4f66785` (chore)
2. **Task 2: Create useProtocolTimer composable** - `8e1b8b6` (feat)

## Files Created/Modified

- `el-templo-app/src/modules/training/composables/useTimerAudio.ts` - Audio cue generation via Web Audio API OscillatorNode, haptic feedback via Capacitor
- `el-templo-app/src/modules/training/composables/useProtocolTimer.ts` - Unified timer for EMOM (60s countdown per round), AMRAP (duration countdown), FOR_TIME (count-up), STRAIGHT_SETS (no-op)
- `el-templo-app/package.json` - Added @capacitor/haptics v8.0.0
- `el-templo-app/pnpm-lock.yaml` - Dependency lock

## Decisions Made

**1. Web Audio API instead of MP3 files**
- **Rationale:** Programmatic tone generation via OscillatorNode avoids external file dependencies, simplifies deployment, and provides consistent beeps across platforms
- **Impact:** No asset management, smaller bundle size

**2. Haptic feedback with try/catch**
- **Rationale:** Capacitor Haptics not available on web, try/catch provides graceful degradation
- **Impact:** Same codebase works on web and native without platform detection

**3. cleanup() method pattern**
- **Rationale:** Per Phase 7 decision, composables must NOT use onUnmounted internally (unsafe if called from computed context)
- **Impact:** Consuming components must call cleanup() explicitly on unmount

**4. STRAIGHT_SETS returns no-op timer**
- **Rationale:** Avoids conditional logic in consuming components - timer always exists, just returns zero values for non-timed protocols
- **Impact:** Simplified component code, consistent API surface

**5. 100ms polling interval**
- **Rationale:** Smooth display updates without battery drain - 100ms is imperceptible to users but much lighter than 10ms/16ms
- **Impact:** Battery-efficient, still updates 10x per second

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used pnpm instead of npm**
- **Found during:** Task 1 (Installing @capacitor/haptics)
- **Issue:** npm install commands were timing out, project uses pnpm (symlinks in node_modules/.pnpm/)
- **Fix:** Detected pnpm from node_modules structure, switched to `pnpm install @capacitor/haptics`
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** Package installed successfully in 2.9s
- **Committed in:** 4f66785 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary to complete installation. No scope changes.

## Issues Encountered

**Issue 1: npm install timeouts**
- **Problem:** Initial npm install commands were timing out after 60s
- **Root cause:** Project uses pnpm, not npm (evident from node_modules/.pnpm/ symlinks)
- **Resolution:** Switched to pnpm for package installation
- **Prevention:** Check for pnpm-lock.yaml or .pnpm directories before running npm

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 8 Plan 3 (Timer UI):**
- useProtocolTimer provides reactive display state (displayText, timerColorClass, progress)
- useTimerAudio provides cue methods (playBeep, playComplete, playWarning, unlockAudio)
- All timer protocols implemented and verified
- Audio context unlock pattern documented

**Ready for Phase 8 Plan 4 (Block Integration):**
- Timer composables follow Phase 7 cleanup() pattern
- STRAIGHT_SETS handled as no-op (no conditional logic needed)
- Stop/resume/start controls all implemented

**Blockers/Concerns:**
- None - implementation matches research patterns
- Real device testing still needed (Phase 7 blocker) for background behavior and audio autoplay

---
*Phase: 08-timer-system*
*Completed: 2026-01-27*

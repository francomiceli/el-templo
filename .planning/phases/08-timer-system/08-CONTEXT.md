# Phase 8: Timer System - Context

**Gathered:** 2026-01-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Members can execute timed workout protocols (EMOM, AMRAP, For Time) with reliable background handling and stop/resume controls. Straight Sets mode remains unchanged from Phase 7. Timer integrates into existing Day Player block flow.

</domain>

<decisions>
## Implementation Decisions

### Timer display & placement
- Protocol timer placed in the **BlockHeader row** — block name left, timer right
- Existing session elapsed timer in top-right header stays as-is (always running)
- EMOM shows round counter alongside countdown: "3/8 — 0:42"
- Timer text changes color as time runs low: amber at 10s, red at 5s (creates urgency)

### Mode transitions & flow
- Timed blocks show a **"Start Timer" button** at the bottom (replaces "Complete Block")
- User taps Start Timer → protocol begins immediately (no 3-2-1 countdown)
- After timer finishes: block **auto-completes** → splash → next block (no extra tap)
- "For Time" mode: visible **count-up timer** from 0:00, user taps "Done" when finished — final time recorded
- Straight Sets: **no changes** from Phase 7 — exercise list + Complete Block button as-is

### Stop/resume & background behavior
- **No pause on timers** — once started, the protocol clock runs
- **Stop/Play toggle** for the block timer only: Stop button freezes block timer, transforms to Play to resume
- **Session timer always runs** regardless of block timer state — cannot be stopped
- **App backgrounding auto-stops** the block timer (equivalent to pressing Stop) — user taps Play to resume when returning
- This gives users an escape hatch for interruptions (fatigue, phone calls, etc.) without abandoning the block

### Claude's Discretion
- Audio/haptic cue implementation (was not selected for discussion — standard approach)
- Timer font size and exact styling within BlockHeader row
- EMOM round reset animation
- For Time "Done" button placement relative to timer
- Technical approach for background detection and timer state management

</decisions>

<specifics>
## Specific Ideas

- Timer lives in the same row as block name (BlockHeader component) — not a new section or overlay
- The stop/play pattern was driven by the need to handle real-world interruptions without losing block progress
- Session timer is sacred — it always reflects real elapsed time from session start

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-timer-system*
*Context gathered: 2026-01-27*

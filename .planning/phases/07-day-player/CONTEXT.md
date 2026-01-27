# Phase 7: Day Player - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Members execute sessions through guided 5-block flow (Initium → Nucleus → Deuteros choice → Athlos) with exercise display, video placeholders, format indicators, and block completion. Timers are Phase 8; RPE/completion logging is Phase 9.

</domain>

<decisions>
## Implementation Decisions

### Block Flow & Navigation
- Strict linear progression: must complete blocks in order
- **Deuteros choice:** User picks ONE of Deuteros 1 or Deuteros 2 (not both)
  - Presented as swipeable choice showing what's worked in each (e.g., "Deuteros 1: Handstand Push Up" vs "Deuteros 2: Dragon Squat")
  - Once chosen, must complete that Deuteros to proceed to Athlos
- Progress bar based on 4 blocks (not 5, since only one Deuteros is done)
- Can view completed blocks (read-only), cannot go back and modify
- Block-level resume: if user leaves mid-session, resumes at start of current block
- Info header showing: Day + route name + elapsed time (e.g., "Lunes · Front Lever · 12:34")

### Exercise Display
- Collapsed list with expand: see exercise names, tap to expand current one
- Expanded exercise shows full detail: name, reps/duration, rest, contraction type, tempo, notes, difficulty
- Persistent video area at top (~40% of screen height)
- Video auto-loops when exercise is selected
- Video changes when different exercise is selected/expanded

### Visual Identity
- Subtle accent colors only (same layout, accent color changes for header/buttons)
- Use existing Quasar/app palette (vanilla design until visual identity files arrive)
- Block name displayed above exercise list as section title (e.g., "NUCLEUS")
- Text labels only, no icons for block types

### Screen & Session State
- Screen wake lock: Claude's discretion (implement appropriate behavior)
- No explicit pause button needed - user just stops, resumes at current block
- Exit confirmation only if mid-block (unsaved progress); no confirmation between blocks
- Silent operation - no audio/haptics in Day Player (timers handled in Phase 8)

### Session Start
- Motivational splash screen on entry (both fresh start and resume)
- Shows session info + motivating message
- Duration: 3-4 seconds, then auto-proceeds to first incomplete block
- "Complete Block" button at bottom of each block to advance

### Block Completion
- Explicit "Complete Block" button (not auto-advance)
- Rationale: some formats require exercises done in series/circuits, not one-at-a-time

### Claude's Discretion
- Screen wake lock implementation details
- Exact splash screen content and animation
- Progress bar visual style
- Specific accent colors per block type (using existing palette)

</decisions>

<specifics>
## Specific Ideas

- Deuteros swipeable choice should clearly show the route/skill being trained in each option
- Video area is persistent (always visible), content changes with selected exercise
- Block-level resume means no complex state persistence needed - just track which block is current

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-day-player*
*Context gathered: 2026-01-26*

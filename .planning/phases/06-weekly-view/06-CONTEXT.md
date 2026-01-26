# Phase 6: Weekly View - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Display the member's 7-day training week with today's session prominent, adjacent days peeking, and navigation to Day Player. Members can swipe through days, expand blocks to preview exercises, and launch today's session. This phase is view/navigation only — session execution is Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Calendar Layout
- Horizontal scroll with today auto-centered on entry
- Large day cards (1-2 visible at a time) for focus on current session
- Yesterday and tomorrow peek at sides with reduced opacity (0.7)
- Current week only — no prev/next week navigation
- Main content: vertical list of 5 blocks for the centered day

### Day States & Visual Treatment
- Today is prominent: border highlight + background color + larger/elevated
- Other days appear disabled (muted/faded styling)
- Completed days: solid green/success styling (entire card)
- No intensity indicator on weekly view (blocks have different intensities, skip aggregation)
- All 7 days show as training days (no rest day concept for Phase 6)

### Session Preview (Block List)
- Centered day shows its 5 blocks in a vertical scrollable list
- Each block card displays: block name, route, exercise count, and format
- Blocks are expandable — tap to see exercise list preview
- Swipe horizontally to center a different day and view its blocks

### Navigation Flow
- Prominent fixed "Start" button at bottom for today's session
- Start button only appears when viewing today (not past/future days)
- Tapping completed day shows read-only summary (what was done, RPE, duration)
- Session resume logic deferred to Phase 7/8 scope

### Claude's Discretion
- Exact spacing, typography, and elevation values
- Animation timing for horizontal swipe and block expand
- Loading states and skeleton screens
- Error handling when session data unavailable

</decisions>

<specifics>
## Specific Ideas

- "Today's session protagonism" — the current day should dominate the view, adjacent days are context only
- Adjacent days at 0.7 opacity to reinforce focus on today
- Vertical block list as main content, horizontal swipe for day navigation

</specifics>

<deferred>
## Deferred Ideas

- **Rest day selection**: Allow member or coach to mark specific days as rest days (noted for future phase, update roadmap)
- **Week navigation**: View past/future weeks for history or planning
- **Session resume**: Pick up partially completed session where left off (Phase 7/8 scope)

</deferred>

---

*Phase: 06-weekly-view*
*Context gathered: 2026-01-26*

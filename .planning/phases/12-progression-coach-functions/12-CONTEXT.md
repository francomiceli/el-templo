# Phase 12: Progression & Coach Functions - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Member-facing progression tracking: level display, RPE history visualization, training stats, and coach evaluation requests. Coach panel and management functions deferred to a future phase pending real-world feedback.

**Scope narrowed during discussion:** Original roadmap included coach member list, promotions, block overrides, and rest day marking. These require more domain feedback and will follow the Admin panel phase.

</domain>

<decisions>
## Implementation Decisions

### Mi Camino Page
- Single page combining profile and progression (not separate pages)
- Page name: "Mi Camino" (the member's journey)
- Accessible from main navigation with notification badge when evaluation eligible

### RPE Trend Display
- Line chart visualization (not list or table)
- Default timeframe: last 4 weeks
- Shows trend over time for member self-assessment

### Training Stats
- Both cumulative and recent stats displayed:
  - Cumulative: total sessions completed, total days trained
  - Recent: sessions this week, training streak (consecutive days)

### Evaluation Request Flow
- Threshold: Average RPE ≤ 6 for 2+ weeks triggers eligibility
- Notification badge appears on profile/Mi Camino link when eligible
- Request button inside Mi Camino page (only shown when threshold met)
- After request: shows "Pending" status until coach acts
- Coach sees and processes requests in future Coach panel phase

### Claude's Discretion
- Chart library and styling
- Exact layout and component arrangement
- Stats card visual design
- How to calculate "streak" (consecutive calendar days vs training days)

</decisions>

<specifics>
## Specific Ideas

- "Mi Camino" name evokes the member's training journey
- Notification badge creates gentle nudge without being intrusive
- Pending status gives member visibility that request was received

</specifics>

<deferred>
## Deferred Ideas

**Moved to future phase (after Admin Panel):**
- Coach member list — what info per member, sorting, filtering
- Coach promotions — how coach promotes members, logging
- Block overrides — coach assigns GENERAL patterns (Animal Flow, Cardio)
- Rest day marking — who can mark, how far ahead, visual treatment

**Rationale:** Coach functions need real-world feedback from actual coaches using the system before designing the interface.

</deferred>

---

*Phase: 12-progression-coach-functions*
*Context gathered: 2026-01-29*

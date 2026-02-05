# Phase 14: Admin Session Review UI - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Coaches can view algorithm-generated sessions and approve them for member visibility. Includes session list, review workflow, details display, and rejection/discard handling. Session editing (modifying exercises, prescriptions) is Phase 15.

**Key constraint:** This is the first phase of the Admin App — a separate Quasar SPA from the member app.

</domain>

<decisions>
## Implementation Decisions

### Admin App Architecture
- **Separate Quasar SPA** — not part of the member app
- **Fully separate codebase** — no monorepo, duplicate types as needed
- **Simplified admin style** — clean/neutral design, prioritize usability over brand aesthetics (no navy/bronze/marble)
- **Mobile browser support required** — responsive design for coaches using phones

### Session List View
- **Grouped by week** — Week 20, Week 21... expand to see days
- **Tab per day** — Tabs for Mon/Tue/Wed... showing level groups within
- **Summary-level detail** — Day, level group, status, format names, exercise count, plus algorithm transparency data (difficulty, contraction type, etc.)
- **Full filters** — Status, level group, date range, format type
- **Sort by status within day** — Pending first (needs action), then approved/rejected
- **Show coach name** — Display who approved/rejected with timestamp
- **Manual refresh** — Button to reload, no auto-refresh
- **Bulk approve with confirmation** — "Approve all" per day, requires confirmation dialog

### Review Workflow States
- **Status model:** pending_review → approved | discarded
- **Pending directly** — Generated sessions go straight to pending_review (no draft status)
- **Any admin can approve** — All users with admin role can approve any session
- **Auto-approve before session day** — If not reviewed by midnight before the day, auto-approve
- **Auto-approved marked** — Badge or icon distinguishes auto-approved from coach-approved
- **Revert allowed** — Admin can unapprove (move approved back to pending) without requiring a reason
- **In-app badge for pending count** — Admin menu shows badge with pending session count
- **Alert when running low** — Alert when only current week has sessions (1 week threshold)

### Generation & Regeneration
- **Manual trigger** — Admin clicks "Generate Week X" to generate all days and levels
- **Hierarchical regeneration:**
  - Week → all days, all levels
  - Day → all levels for that day
  - Day + Level → specific level within a day
- **Ask per day when generating** — Prompt which days to regenerate if some already have approved sessions
- **Only future weeks regenerable** — Cannot regenerate current week or past weeks
- **Regenerate → discard** — Old session moves to discarded bucket, new one generated

### Session Visibility & Editability
- **Empty state for missing sessions** — Member sees "Session not available yet" if no approved session
- **Past sessions locked** — Read-only historical record after the day passes
- **Current/future always editable** — Admin can edit approved sessions anytime, members see latest version
- **Branch timezone** — Each branch defines its own timezone for determining past/current/future
- **In-progress members keep old session** — If session regenerated while member is mid-workout, they finish original

### Session Details Display
- **Vertical cards per block** — Each block as a card, scrolls vertically
- **Block header shows stats** — Total reps, exercise count, avg difficulty in card header
- **Format badge in header** — EMOM, AMRAP, etc. as colored badge next to block name
- **Toggleable algorithm details** — Essential info by default, "Show algorithm details" toggle for difficulty, fallback tier, SPOM intensity
- **Contraction as text label** — "Concéntrico", "Excéntrico", "Isométrico"
- **No video playback** — Admin view focuses on data, not video
- **No comparison to coach examples** — Just show the generated session as-is
- **One day at a time navigation** — Navigate day-by-day, full details per day
- **Preview as member** — Separate view to see exactly what members will see

### Rejection & Discarded Sessions
- **Rejection for notes only** — No "rejected" status; rejection means recording why before regenerating
- **Free text rejection notes** — Custom text for future algorithm refinement (AI-readable feedback)
- **Optional with prompt** — Prompted for reason when discarding but can skip
- **Discarded bucket browsable** — View all discarded sessions in UI
- **Restore (move) from discarded** — Can move discarded session back to pending, removing from discarded pile
- **Retained forever** — Discarded sessions kept for historical analysis, no auto-delete
- **Export deferred** — CSV/JSON export of discarded sessions is a future phase

### Claude's Discretion
- Discarded sessions filter options (reasonable defaults)
- Exact badge/icon designs for status indicators
- Navigation patterns within the admin app
- API endpoint structure and naming
- Database schema for pending/discarded sessions separation

</decisions>

<specifics>
## Specific Ideas

- Session rows should show "as much detail as possible" — every variable that helps coaches understand why a session is built that way (difficulty, contraction type, etc.). Reference coach example sheets for what data matters.
- Rejection notes should be useful for future algorithm refinements — structured enough for AI analysis, flexible enough for unexpected issues.
- "Discarded" bucket concept — sessions don't get deleted, they go to a separate bucket for potential future reuse or analysis.

</specifics>

<deferred>
## Deferred Ideas

- **Export functionality** — CSV/JSON export of discarded sessions for offline analysis (future phase)
- **Push/email notifications** — Notify coaches when new sessions need review (only in-app badge for now)
- **Scheduled auto-generation** — Server-triggered generation on schedule (manual trigger only for now)

</deferred>

---

*Phase: 14-admin-session-review-ui*
*Context gathered: 2026-02-05*

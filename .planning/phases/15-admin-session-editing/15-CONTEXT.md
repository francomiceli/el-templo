# Phase 15: Admin Session Editing - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Coaches can modify pending (and approved) sessions before/after approval — swap exercises, adjust prescriptions, change formats, add/remove exercises. Editing an approved session auto-reverts it to pending. Creating sessions from scratch is Phase 16.

</domain>

<decisions>
## Implementation Decisions

### Exercise Swap Experience
- Smart filtered list: show only exercises matching the slot's constraints (contraction type, scope)
- Filter by contraction type, sort by closest linear difficulty — coach sees more options, best matches first
- Swap pool respects cross-route logic from 13-08: pattern_2 exercises included for non-INITIUM blocks based on intensity
- Each exercise in swap list shows: name, CON/EXC/ISO badge, linear difficulty number
- Pattern badge on each exercise indicating which pattern it comes from (e.g., pattern_1, pattern_2)
- One exercise swap at a time — swap, see result, decide on next
- Inline swap button on each exercise card (no separate edit mode)
- Swap picker opens as a centered dialog/modal
- Swapped exercise gets re-prescribed by the algorithm within the block's budget (not inherited from original)

### Edit Constraints & Validation
- Soft warnings throughout — system shows warnings but allows coach override
- Contraction mix: display live contraction breakdown badge, turns red if mix violates intensity rules — coach can override
- Exercise count: soft cap at 3 for non-INITIUM blocks with warning, coach can add more
- Format change: dropdown shows only compatible formats (compatibility score > 0) for the block/level/intensity, sorted by score
- Format change triggers automatic re-prescription of all exercises in the block
- Live validation: warnings update in real-time as coach makes changes
- Editing an approved session automatically reverts it to pending (needs re-approval)
- Full prescription editing: reps, sets, rest, tempo, notes, and format-specific rounds

### Edit History & Audit Trail
- Simple log: record "Coach X edited session Y at time Z" — no field-level detail
- Backend only — stored in database for debugging/auditing, not surfaced in admin UI
- No manual "edited" flag — log entries implicitly track this
- Full revert capability: "Reset to algorithm" button restores original generated state
- Original algorithm output stored as snapshot when first generated — revert restores from snapshot

### Member Preview
- Preview button in sessions list actions column AND in the edit page
- Opens a modal with simplified read-only representation of the session
- Not pixel-identical to member app — shows same data (blocks, exercises, reps, format info) in clean layout
- Level-specific preview: dropdown to select which member level to preview

### Format Handling & Reps Budget
- Visual budget bar showing current total reps vs original budget per block
- Single bar (no distinction between algorithm vs coach-modified reps)
- Color thresholds: green (within budget), yellow (within 10% over), red (more than 10% over)
- No auto-adjust when coach changes individual exercise reps — budget bar reflects changes passively
- Format-specific parameters are fully editable: EMOM interval, AMRAP time cap, Complex rounds, etc.
- Format change auto-applies re-prescription with toast notification (no confirmation dialog)
- New exercises added to a block start with blank prescription — coach fills in manually

### Claude's Discretion
- Exact modal layout and sizing for swap picker
- Search/filter UX within the swap dialog
- Snapshot storage mechanism (JSON column, separate table, etc.)
- Budget bar visual design and positioning
- Toast notification styling and duration
- Validation warning icon/color design

</decisions>

<specifics>
## Specific Ideas

- "There are cases where the format can take multiple shapes, for example a complex can have 2, 3, 4 or more rounds" — format params must be flexible
- Cross-route exercises should show their pattern origin badge so coaches understand why an exercise appears in the pool
- Budget bar color thresholds match the algorithm's existing 10% tolerance rule

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-admin-session-editing*
*Context gathered: 2026-02-06*

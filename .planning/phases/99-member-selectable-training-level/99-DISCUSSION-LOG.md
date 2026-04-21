# Phase 99: Member-Selectable Training Level - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 99-member-selectable-training-level
**Areas discussed:** Dropdown trigger & chevron layout, Selected level highlight in the menu, Admin member-detail summary format, Mid-session detection strategy

---

## Dropdown trigger & chevron layout

**Question:** How should the header badge turn into a dropdown trigger?

| Option                                    | Description                                                                                                                                                                                                                               | Selected |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| q-menu anchored to whole badge            | Entire badge (Greek letter + level name + chevron) is the tap target; tapping anywhere opens a q-menu below/beside it. Minimal visual change — badge keeps its current look with a chevron appended. Best for mobile (generous tap area). | ✓        |
| q-btn-dropdown replaces badge             | Badge becomes a full Quasar dropdown button with built-in chevron and click-state. More 'button-like' visual — clearer affordance but changes the look significantly. Slightly larger footprint.                                          |          |
| Separate chevron button next to the badge | Badge stays read-only; a small chevron icon to its right is the dropdown trigger. Cleaner read-mode (badge looks like a label). Two tap targets to teach — discoverability risk.                                                          |          |
| q-select styled as a badge                | Use Quasar's form select component, restyled to look like the badge. Most 'form-correct' but fights the component defaults (label, outline, validation slots). Not recommended — more CSS than feature.                                   |          |

**User's choice:** q-menu anchored to whole badge
**Notes:** Chevron inline after level name (follow-up not asked — single obvious option).

---

## Selected level highlight in the menu

**Question:** How should the dropdown menu indicate which level is currently active (selected / being used for training right now)?

| Option                                    | Description                                                                                                                                                           | Selected |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Subtle background highlight on active row | Row matching activeLevel gets a soft accent background. Scannable at a glance. Doesn't conflict with '(Tu Nivel)' marker which stays on the row matching users.level. | ✓        |
| No visual marker                          | Clean list of 5 level names + '(Tu Nivel)' on one. Matches the SPEC literally — badge already shows active level. Cleanest minimum.                                   |          |
| Checkmark icon on active row              | Small check icon left of the active row label. Explicit marker but adds an icon column — throws off alignment if only one row has it.                                 |          |
| Bold text on active row                   | Active row font weight is heavier. Minimal visual cost but the '(Tu Nivel)' row could end up double-emphasized if user is viewing their own level.                    |          |

**User's choice:** Subtle background highlight on active row
**Notes:** SPEC's "no explicit marker" clause was revisited and the user accepted adding a subtle cue — the SPEC does not conflict because it was never prescriptive about visual treatment, only that we wouldn't add a "selected" label-style marker.

---

## Admin member-detail summary format

**Question:** How should the admin member detail page show "X sessions trained per level (last 30 days)"?

| Option                            | Description                                                                                                                | Selected                                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| Colored chips row                 | Row of small pills: '12 Sigma'                                                                                             | '4 Omega' etc, colored by level. Scannable, proportional visual weight, empty state is just 'no training last 30d'. Fits next to the existing level badge. | ✓   |
| Plain text line                   | One-liner: 'Ultimos 30 dias: 12 sigma, 4 omega, 1 alfa'. Smallest footprint, easiest to style. Less visual pop.            |                                                                                                                                                            |
| Table row in existing stats table | Add 'Entrenamientos por nivel (30d)' row to the member's stats table if one exists. Consistent with other data but buried. |                                                                                                                                                            |
| Tooltip on level badge            | Hovering the existing level badge shows the breakdown. Compact but hidden by default. Bad on mobile.                       |                                                                                                                                                            |

**User's choice:** Colored chips row
**Notes:** Chip colors per level if a brand palette exists — otherwise neutral. Researcher surfaces the palette.

---

## Mid-session detection strategy

**Question:** How should we detect that "an exercise has been started" to trigger the confirmation dialog on level switch?

| Option                                                        | Description                                                                                                                                                                            | Selected |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Read existing training store state                            | The DayPlayer/training store already tracks exercise progress. Add a thin getter 'anyExerciseStarted' computed from existing state — no new tracking. Researcher verifies granularity. | ✓        |
| Add a dedicated boolean to DayPlayer                          | Small reactive ref in DayPlayer that flips to true on first interaction. Simple, localized.                                                                                            |          |
| Refactor training store for granular state                    | If the store's state is coarse, improve it as part of this phase. Bigger scope.                                                                                                        |          |
| Skip detection — always confirm on /mi-templo training screen | Always show the dialog if user is on the player route. False positives but zero risk of silent data loss.                                                                              |          |

**User's choice:** Read existing training store state
**Notes:** Researcher must confirm store granularity. If insufficient, planner escalates and picks option 2 or 3.

---

## Area-selection turn

**Question:** Which implementation areas do you want to discuss for Phase 99? (multiSelect)

Selected: all four areas.

## Closeout turn

**Question:** All four areas covered. Anything else to pin down before writing CONTEXT.md?
**User's choice:** I'm ready for context. Remaining items (localStorage key format, rename migration strategy, chip colors, exact icon choices) fall under Claude's discretion and the planner handles them.

---

## Claude's Discretion

- Exact Quasar icon name for the chevron (`keyboard_arrow_down` vs `expand_more`) — whichever matches existing header icons.
- Q-menu placement props (`anchor`, `self`).
- Chip component shape (`q-chip` vs custom).
- Timer-discarding mechanics on confirm.
- CSS accent token for the subtle highlight on the active menu row.
- localStorage key versioning strategy (decision captured: simple string `eltemplo.selectedLevel:<userId>`, no version suffix — invalid values are cleared on hydrate).

## Deferred Ideas

- Full coach "ready for promotion" workflow.
- Per-level goal-plan progression counters.
- Streak / AURA scaling by level.
- Onboarding / coachmark for the new dropdown.
- Syncing `selectedLevel` across devices.
- Restricting the dropdown on ROM days or during active goal plans.

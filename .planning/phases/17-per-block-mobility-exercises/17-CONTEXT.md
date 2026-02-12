# Phase 17: Per-Block Mobility Exercises - Context

**Gathered:** 2026-02-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Add 1 route-based mobility exercise per non-INITIUM block across the full stack — session generation pipeline, DB schema, API response, admin editing UI, member app display, and PDF output. Mobility exercises are "Descanso Activo" (active rest) — displayed separately from main exercises, optional for members, fully editable by coaches.

</domain>

<decisions>
## Implementation Decisions

### Member App Display
- "Descanso Activo" appears as a **separate section at the end of each block**, after the last main exercise, before block-complete action
- Uses the same exercise card style as main exercises, with a "Descanso Activo" label above
- Reuses the **existing video placeholder** component for showing exercise demonstration
- **Display only** — no completion tracking, no checkmark, no interaction. Member sees it and does it on their own
- Does NOT block auto-advance or block completion

### Admin Editing Rules
- **Exactly 1 mobility exercise per non-INITIUM block** — pipeline generates 1, coach can swap but NOT add a second
- **Not removable** — every non-INITIUM block must always have exactly 1 mobility exercise, coach can only swap it
- Admin block cards show "Descanso Activo" section with **same visual treatment as member app** (labeled section at bottom of block card)
- Swap dialog shows **route-relevant mobility exercises first**, with option to see all mobility exercises

### Prescription Defaults
- Prescription style determined by **contraction type**: ISO = seconds, CON = reps (researcher validates against examples.txt)
- Default values **inferred from examples.txt data** (e.g., 20'' for time-based, 6-10 for rep-based)
- **Intensity does NOT affect mobility prescription** — same prescription regardless of block intensity (mobility is active rest)
- **Same mobility for all levels** — not level-specific, universal across Alfa/Delta/Sigma/Omega/Spartan

### PDF Mobility Rendering
- PDF already has a **hardcoded "movilidad" row** correctly placed in each block — replace hardcoded text with actual mobility exercise name and prescription
- No structural PDF changes needed, just data substitution

### Mobility Exercise Selection Logic
- Mobility exercises identified by **pattern = 'MOVILIDAD'** in exercises table
- Route-to-mobility mapping uses `mobilityRelated` column as starting point, but **examples.txt provides ground truth** for edge cases
- The SPOM route for each block determines which mobility exercises are relevant
- Existing `ROUTE_TO_MOBILITY_ROUTES` mapping should be **validated and refined** using examples.txt + exercises table cross-reference
- When multiple valid mobility exercises exist for a route: **random selection** from the valid pool
- Coaches can then swap to any related mobility exercise in admin panel

### Claude's Discretion
- PDF mobility row text format (exercise name + prescription representation)
- Exact swap dialog filtering UX (reuse existing ExerciseSwapDialog with mode/filter, or separate component)
- How to handle routes with no mapped mobility exercises (fallback strategy)
- Internal pipeline stage placement (where in the 9-stage pipeline mobility selection occurs)

</decisions>

<specifics>
## Specific Ideas

- Examples file at `.docs/mobility-examples/examples.txt` contains 21 real ROUTE → MOBILITY EXERCISE → REPS/SECS mappings from coach-built sessions
- `mobilityRelated` column in exercises table is "not specific enough in some cases" — use examples.txt to supplement and validate
- Contraction type on the mobility exercise itself drives reps vs seconds: ISO exercises = seconds (hold), CON exercises = reps
- Pipeline is deterministic but mobility selection uses random pick from valid pool (coaches adjust in admin)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-per-block-mobility-exercises*
*Context gathered: 2026-02-12*

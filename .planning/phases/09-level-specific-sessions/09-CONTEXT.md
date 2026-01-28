# Phase 9: Level-Specific Sessions - Context

**Gathered:** 2026-01-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Differentiate sessions by member's actual level (Alfa, Delta, Sigma, Omega) instead of treating level groups as a single bucket. The exercise selection pipeline filters by the member's individual level. Routes, formats, and SPOM intensity are shared — only exercises differ by level. Fix level display from "ALFA_DELTA" to the member's actual level name. Handle all levels, not just Alfa/Delta.

</domain>

<decisions>
## Implementation Decisions

### Exercise selection by level
- Exercises have an `exercise_level` column with values like "alfa", "delta", "sigma", "omega"
- Filter exercises by member's actual level (e.g., exercise_level='alfa' for Alfa members)
- Do NOT include null/untagged exercises — strict level matching
- Fallback order when not enough level-specific exercises: widen to level group (ALFA_DELTA, SIGMA, OMEGA)
- Each level gets completely different exercises, not the same exercises at different difficulty

### High-intensity level shift (90-95%)
- At block intensity 90% or 95%, pull some exercises from one level above the member's current level
- Alfa at 90-95% → lowest-difficulty Delta exercises
- Delta at 90-95% → lowest-difficulty Sigma exercises
- Same pattern continues up the chain (Sigma → Omega)
- Omega at 90-95% stays Omega (no level above)
- This is a design decision to implement, not derived from spec

### Shared elements across levels
- Block FORMAT is the same for ALL levels — if Nucleus is EMOM, it's EMOM for everyone
- Routes are shared between Alfa and Delta (same weekly rotator row for ALFA_DELTA group)
- SPOM intensity: Alfa and Delta share the same intensity. Sigma and Omega may have different intensities — Claude should check the SPOM data to determine if level-group dimension exists
- Reps/seconds prescription: same for all levels, determined by intensity and format rules, not by level

### Session caching
- Cache key should include member's level: (week, day, level) instead of (week, day, levelGroup)
- Alfa and Delta get separate cached sessions even though they share routes
- Promotion naturally handled: newly promoted member gets/generates their new level's session

### Level group cleanup
- ALFA_DELTA level group only exists for route sharing in the weekly rotator
- If `levelGroup` field has no other use, consider removing it to avoid confusion
- Claude should investigate whether levelGroup is used elsewhere before removing

### Prescription logic
- Current Phase 5 prescription logic should be reviewed against the spec
- Claude should check if intensity/format combinations are handled correctly
- Reps/seconds are related to block intensity and block format — investigate docs deeply to understand the full prescription model

### Level display in UI
- Fix display from "ALFA_DELTA" to member's actual level: "ALFA", "DELTA", "SIGMA", "OMEGA"
- Uppercase formatting for level names
- No color-coding or visual badges — just the text name
- Keep placement as-is (wherever level currently shows)

### Level transition behavior
- Sessions are generated per day, not per member
- Member sees sessions based on their current level
- On promotion, member immediately sees sessions for their new level
- Old level sessions are not deleted — member simply can't see them anymore
- No session regeneration needed on promotion

### Scope: all levels
- Implement level-specific logic for all levels (Alfa, Delta, Sigma, Omega), not just Alfa/Delta
- Build the pipeline generically so the same pattern works across all levels
- This keeps the code clean and avoids retrofitting later

### Claude's Discretion
- Whether to remove levelGroup field entirely or keep for rotator use only
- SPOM data structure investigation (does it have level-group dimension for Sigma/Omega?)
- Prescription logic gap analysis against spec docs
- Exact fallback behavior when widening to level group
- How "some" exercises at high intensity come from one level up (proportion/count)

</decisions>

<specifics>
## Specific Ideas

- "High intensity blocks use exercises from the upper level with fewer reps/seconds to hold"
- The one-level-up rule at 90-95% intensity is a training principle: harder exercises, lower volume
- "Alfa and Delta share the ROUTES" — the level group concept is about route sharing, not exercise sharing
- "Sessions are not generated for the MEMBER, they are generated for the DAY" — level is a filter on day-level sessions

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-level-specific-sessions*
*Context gathered: 2026-01-27*

# Phase 20: Per-Member Personalized Sessions - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Members can select personalized "journeys" based on body zones they want to work. The session generation algorithm (SPOM) produces zone-biased sessions. Coaches generate and manage journey sessions from admin. Members access journey sessions alongside regular Entrenamiento. Premium gating is a future phase.

</domain>

<decisions>
## Implementation Decisions

### Journey Structure

- 6 journey types across 3 difficulty tiers:
  - **Principiante**: Tren Superior, Tren Inferior
  - **Intermedio**: Empuje, Tracción
  - **Avanzado**: Planche, Front Lever
- General/complete route = existing Entrenamiento (unchanged)
- Journey names displayed in Spanish (Tren Superior, Tren Inferior, Empuje, Tracción, Planche, Front Lever)
- One active journey at a time per member
- Member-driven selection (coaches cannot assign journeys)

### Journey Selection (Member App)

- New "Journey" option in the left panel navigation (alongside Entrenamiento)
- Journey selection screen shows 6 journeys grouped in 3 rows by difficulty tier with labels (Principiante, Intermedio, Avanzado)
- Visual cards for each journey following brand guidelines from `.docs/new-brand-visual/visual-brand.txt`
- No restrictions on picking advanced journeys — informational descriptions explain difficulty, anyone can pick any journey
- Member must pick a journey before seeing sessions (pick-first flow)
- Flow: Journey selection → Journey overview/intro → Confirm → Duration picker → Session

### Journey Overview Screen

- Appears after selecting a journey, before confirming
- Content: targeted body zones, expected exercise types, difficulty level, who it's ideal for
- Static/hardcoded descriptions (not coach-managed)
- Thorough info so members make a conscious choice

### Session Duration

- 3 time formats: 20, 40, and 60 minutes
- Duration selected per-session (not locked to journey), always neutral (no pre-selection)
- Encouraging message for shorter sessions ("Si estás cansado o con poco tiempo, es mejor hacer una sesión más corta")
- Duration is a front-end filter — coaches generate 6 full sessions per semana, member sees blocks based on duration:
  - 20 min: Initium + Nucleus
  - 40 min: Initium + Nucleus + Deuteros (single, no choice between two)
  - 60 min: Initium + Nucleus + Deuteros + Athlos/Epikos (coach sets which final block)
- Same core, scaled: 20 min is the core, 40 adds accessory, 60 adds final block
- Duration-specific progression tracking (each duration tracks its own semana independently)

### SPOM Bias Logic

- 100% bias — no cross-zone exercise mixing
  - Tren Superior: only upper-body exercises (zero leg work)
  - Tren Inferior: only lower-body exercises
  - Empuje: specific push exercises (more constrained subset)
  - Tracción: specific pull exercises (more constrained subset)
  - Planche: exclusively planche-specific exercises
  - Front Lever: exclusively front-lever-specific exercises
- Zone-specific warm-up (Initium matches the journey zone)
- Work with existing exercise tags/categorization — no new columns for exercise database
- Researcher should investigate SPOM pipeline to understand how exercises are currently categorized

### Member App Navigation (Active Journey)

- Journey nav goes straight to duration picker → session (no dashboard)
- Same session flow as Entrenamiento (one session at a time, following semana progression)
- Both Entrenamiento and Journey are independent, parallel routes — member can access both
- Clear indicator showing which journey the member is on (prominent header/badge)
- If no sessions generated for current semana, silently fall back to most recent available session
- Journey progress indicator shown after completing a session (current semana + total sessions + duration breakdown)

### Journey Lifecycle

- Switching journeys: old progress is archived (visible in history), new journey starts from scratch
- Warning alert when changing journey that progress will reset
- Free to switch at any time, no cooldown
- One active journey at a time
- Change journey option lives in Mi Camino

### Mi Camino Integration

- Journey progress and history live in Mi Camino (not a separate dashboard)
- Archived journeys shown as summary cards: journey name, dates active, semanas completed, total sessions, duration breakdown
- Change journey accessible from Mi Camino

### Admin — Session Generation

- New tab/view in the generation view for personalized plans (alongside existing general generation)
- Coaches generate 6 journey variations per semana (not 18 — duration is front-end)
- Can generate all 6 at once or specific ones
- Coach sets Athlos/Epikos for 60-min final block

### Admin — Sesiones View

- Two tabs: "General" (existing Entrenamiento sessions) and "Personalizadas" (journey sessions)
- Personalizadas tab mirrors General layout: shows by day (Lunes: Upper, Lower, Push, Pull...)
- Coaches can manage and modify journey sessions like regular sessions

### Admin — Alumnos View (New)

- New "Alumnos" option in admin sidebar
- Shows ALL members (not just those with active journeys)
- Members with active journeys show their journey; others show "Sin journey"
- Actions column with button to view specific member's journey progress
- Detail view: active journey, current semana, sessions completed, duration breakdown, session history
- Shows both Entrenamiento AND journey progress
- Search by name + filters by active journey type and activity level

### Claude's Discretion

- Generation view tab organization for personalized plans
- Post-session return destination (journey or home)
- Loading states and transitions
- Exact card layout and spacing following brand guidelines
- Admin alumnos view column layout and design

</decisions>

<specifics>
## Specific Ideas

- Session block names follow existing convention: Initium, Nucleus, Deuteros, Athlos/Epikos
- The 4 original journey names evolved into 6 during discussion (Upper/Lower → Push/Pull → Planche/Front Lever progression)
- Client context: "Most clients should begin with the general or complete route, which integrates the standard Temple program into a balanced progression. From there, training can be divided into upper and lower body splits, then further into push and pull divisions, and finally into advanced-specific routes."
- Duration framework from client: "The timing of each block should be clearly defined to ensure consistency, intensity, and progression regardless of the session's duration"
- "Specific front lever and planche routes should be designed for more advanced athletes who already have a solid foundation and a clear technical goal"
- Follow `.docs/new-brand-visual/visual-brand.txt` for journey card visual design

</specifics>

<deferred>
## Deferred Ideas

- **Premium gating**: Journey feature will eventually be premium-only. Mi Camino will show "Unlock Journey data with a premium plan" for non-premium members. Implement in a separate phase.
- **Coach-managed journey descriptions**: Currently hardcoded. Could become admin-editable in a future phase.
- **Coach journey assignment/recommendation**: Coaches can see but not assign journeys. Could be added later.

</deferred>

---

_Phase: 20-per-member-personalized-sessions_
_Context gathered: 2026-02-20_

# Phase 40: Day Player Redesign - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesign the DayPlayer workout experience in el-templo-app with Instagram Stories-style exercise progression, consolidated between-block transition screens with mobility reminder + motivational quotes, and brand-aligned UI using Phase 39 design tokens. The session flow (splash → deuteros choice → block progression → celebration → summary) stays the same, but the exercise navigation and visual treatment changes fundamentally.

</domain>

<decisions>
## Implementation Decisions

### Stories Navigation UX

- **Tap zones** for exercise-to-exercise navigation: tap right side → next exercise, tap left → previous
- No swipe gestures — tap zones only
- **Segmented progress bars** at top of story area, one per exercise (Instagram Stories style)
- Two visual states: filled (gold/brand color) = completed, empty = not completed. Active segment has animation/glow
- **Header overlay on video**: back arrow, block name, and timer overlaid on top of video area with semi-transparent gradient (not a separate header row)
- Tapping is purely navigation — does NOT mark exercises complete

### Exercise Story Card

- **Split card layout**: top ~70% video, bottom ~30% exercise info
- When no video available: **exercise name hero** — large styled name centered on dark branded background with contraction badge
- Bottom 30% shows **full exercise detail**: name, dose (renamed from "Dosis" to "Cantidad"), contraction, notes, position

### Exercise Completion

- Exercises can ONLY be marked complete via a dedicated "Completar" button when that exercise is the active story slide
- No checkboxes in compact list or anywhere else
- No long-press or swipe gestures for completion

### Compact Exercise List (below current exercise detail)

- Always-visible compact row list showing all exercises in the current block
- Each row: exercise name + quick dose info (e.g. "8 reps")
- **No left-side icons** on any exercise row
- Tapping a row navigates to that exercise's story slide
- Completed exercises: green check icon on the **right** side of the row, name stays normal (no strikethrough)
- List always shows all exercises (no scroll cap) — page scrolls if needed

### Mobility Exercise

- Mobility gets its **own story slide** at the end of block exercises, with its own video/name hero and segmented bar slot
- Mobility ALSO appears in the compact exercise list as a navigable row
- In the between-block transition card: mobility shows as **name only (no video)** — serves as a reminder

### Block Completion Flow

- After all exercises are individually completed via the "Completar" button:
  - A **final story slide** appears — top half shows the mobility exercise (video or name hero), bottom half shows block summary
  - "Completar Bloque" button at the bottom
- Wait — CORRECTION per user: instead of block summary in bottom half, show the **motivational quote**
- This screen IS the between-block transition — no separate transition splash needed

### Between-block Transition (Unified Screen)

- **Card overlay on blurred background** (current player view blurs behind)
- Top half: mobility exercise reminder (**name only, no video** in this screen)
- Bottom half: motivational quote (from API, following PDF builder quote pattern)
- Button: "Siguiente Bloque" (or "Finalizar Sesion" for last block)
- **User-controlled dismissal only** — button tap, no auto-advance, no tap-anywhere
- One screen between blocks — replaces current SplashScreen transition

### Initial Splash Screen

- **Redesigned** to match new card-overlay-on-blur style
- Shows session info (day, level) + welcome quote
- User taps "Comenzar" button to start

### Celebration Screen

- **Redesigned** to card-overlay-on-blur style (same as transitions)
- **Flame icon** instead of trophy
- Final quote + "Ver Resumen" button
- No auto-advance — user controls when to proceed

### Rename

- "Dosis" → "Cantidad" throughout the entire player

### Claude's Discretion

- Exact spacing, typography sizes, and animation details
- Segmented bar animation/glow implementation
- Blur intensity for card overlay backgrounds
- Tap zone size proportions (left vs right)
- Compact list row height and visual density
- Quote typography styling (serif/italic/etc.)

</decisions>

<specifics>
## Specific Ideas

- The navigation should feel exactly like Instagram Stories — tap right for next, progress bars at top
- Between-block screens consolidate mobility reminder + quote into ONE screen (not separate)
- The "final story slide" after all exercises are completed shows mobility (top) + quote (bottom) + action button
- Flame icon for celebration, not trophy
- Quote content already exists in the system — API-served, follow PDF builder pattern for fetching

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `useSessionPlayer.ts`: Core composable managing block flow, timer, exercise navigation, persistence — will need extension for story-style navigation but core logic stays
- `sessionPlayerStore`: IndexedDB-based progress persistence — reusable as-is
- `ExerciseCard.vue`: Has dose/contraction formatting logic that can be reused in new split card
- `VideoPlaceholder.vue`: Video playback with autoplay/error handling — can be adapted for story card
- `blockColors.ts`, `formatExplanations.ts`, `levelDisplay.ts`: Utility modules, reusable as-is
- `useWakeLock.ts`, `useSessionCompletion.ts`: Composables unchanged by redesign

### Established Patterns

- Vue 3 Composition API with TypeScript throughout
- Quasar UI framework (q-btn, q-icon, q-card, q-dialog, q-spinner-dots, q-badge, etc.)
- Pinia stores for state management
- `createLogger()` for all logging
- Brand colors via `quasar.variables.scss` ($cream, $primary, $secondary, $positive)
- Montserrat font for headings, Roboto Mono for timer

### Integration Points

- Route: `training/session/:date` → DayPlayer.vue (unchanged)
- WeekStore feeds session data into DayPlayer
- API: quotes endpoint needed (check PDF builder pattern for existing endpoint)
- Session completion flow (RPE slider, summary, API save) stays the same
- DeuterosSelector.vue: choice screen stays, may need visual refresh

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 40-day-player-redesign_
_Context gathered: 2026-03-02_

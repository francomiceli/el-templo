# Phase 80: "Tu Día" Daily Game Plan - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Reorganize the Mi Camino home screen into a personalized daily briefing ("Tu Día") with contextual cards: enhanced session CTA showing today's route, booking status, weekly progress bar, and segment-driven greeting with card ordering. Add RPE-based contextual message to post-session flow. Add weekly summary card (Mon-Sun cycle). Remove standalone TuCaminoCard (merged into greeting). Non-onboarded members redirect to onboarding. Rest days show recovery tip card.

</domain>

<decisions>
## Implementation Decisions

### Tu Día Layout & Structure

- **D-01:** Enhance existing Mi Camino page — NOT a replacement or new page. Reorganize cards with Tu Día content at top, existing stats/RPE trend below.
- **D-02:** Remove TuCaminoCard component (Phase 78). Its purpose is absorbed by the segment-driven greeting which provides richer contextual messaging.
- **D-03:** Non-onboarded members get redirected to /onboarding (mandatory). The router guard from Phase 78 already handles this. Tu Día does NOT need a fallback view.

### Daily Action Cards

- **D-04:** Four card types on Tu Día (in default order):
  1. **Segment-driven greeting** — Replaces static "Bienvenido". Montserrat heading with member name + contextual message based on segment (e.g., Espartano: "Imparable esta semana", En Riesgo: "Hoy es un buen día para volver").
  2. **Enhanced session CTA** — Shows today's training route (body area like "Empuje", "Tracción", "Piernas") from weekly view API data. Shows personalizada vs general indicator. After completion: shows RPE + duration. On rest days: replaced by rest day card.
  3. **Booking status card** — If booked: next class time + countdown. If not booked: "Reservá tu próxima clase" CTA. Only for physical branch members (not virtual branch).
  4. **Weekly progress bar** — Sessions completed this week (Mon-Sun) vs plan budget. Visual bar fill. Segment-driven motivational text below (e.g., "2 de 3 sesiones — ¡una más!").

- **D-05:** Rest day card — When no session is scheduled for today, replace the session CTA with "Hoy es día de descanso" card + short recovery/mobility tip. Booking CTA and weekly progress still show.

### Personalization Engine

- **D-06:** Segment drives TWO things: greeting text AND card ordering. Not different cards per segment — same cards, different emphasis.
- **D-07:** Card ordering by segment:
  - **Espartano/Intermitente:** Session CTA first (action-oriented)
  - **En Riesgo/Nuevo Guerrero:** Booking CTA first (lower barrier, gentle re-engagement)
  - **Digital Warrior:** Session CTA first (encourage physical attendance)
  - **Ghost:** Booking CTA first (just get them back to the gym)
- **D-08:** Segment greeting messages (Spanish, brand voice):
  - Nuevo Guerrero: "¡Bienvenido, {name}! Tu camino recién empieza"
  - Espartano: "Imparable, {name}"
  - Intermitente: "Buen momento para entrenar, {name}"
  - En Riesgo: "Te extrañamos, {name}. Hoy es un buen día para volver"
  - Digital Warrior: "Tu cuerpo te espera, {name}"
  - Ghost: "El Templo sigue acá, {name}. Volvé cuando quieras"
- **D-09:** Members without a segment (edge case — shouldn't happen with Phase 79) get default greeting "Bienvenido, {name}".

### Today's Route Data Source

- **D-10:** Reuse the existing `/api/training/weekly` endpoint to get today's session data. Call on Mi Camino mount, extract today's entry for route/body area. No new endpoint needed.
- **D-11:** Route display uses the same `getSessionRouteName()` logic from DayCard.vue — extracts NUCLEUS block route name.

### Post-Session RPE Enhancement

- **D-12:** After RPE rating on SessionSummary screen, show a contextual message based on RPE value:
  - RPE 1-3: "Podrías subir la intensidad en tu próxima sesión"
  - RPE 4-6: "Buen balance — seguí así"
  - RPE 7-8: "Buen esfuerzo. Descansá bien hoy"
  - RPE 9-10: "Entrenaste al máximo. Considerá un día de recuperación mañana"
- **D-13:** This is a simple rule-based text addition to the existing SessionSummary component. No AI, no complex logic. Just RPE value → message mapping.

### Weekly Summary

- **D-14:** Weekly summary is a card on the Tu Día page (not a separate screen). Always visible below the daily action cards.
- **D-15:** Contents: sessions completed this week, total training duration, average RPE, streak count (note: streak tracking is Phase 81 scope — show placeholder or skip until then).
- **D-16:** Week resets Monday. Week = Monday 00:00 to Sunday 23:59.
- **D-17:** Data source: aggregate from completed_sessions table for the current week. Backend endpoint needed (or extend existing progression stats).

### Claude's Discretion

- Card component design (new components vs refactoring GeneralContent.vue)
- Weekly summary data endpoint (extend existing progression API vs new endpoint)
- Animation/transitions when cards reorder based on segment
- Recovery tip content for rest days (can be static rotation or randomized)
- Whether weekly progress bar uses q-linear-progress or custom styled div
- Mobile scroll behavior with reorganized card layout

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research & Strategy

- `.planning/research/app-engagement-upselling-research.md` — BetterMe/Freeletics teardown, daily game plan concept, personalization approach

### Requirements

- `.planning/REQUIREMENTS-v4.4.md` — ENG-08 (Tu Día home screen), ENG-09 (post-session RPE recommendation), ENG-10 (weekly summary)

### Prior Phase Context

- `.planning/phases/78-onboarding-user-profiling/78-CONTEXT.md` — Onboarding profile schema, TuCaminoCard (being removed), router guard pattern
- `.planning/phases/79-behavioral-segmentation/79-CONTEXT.md` — Segment definitions, segment on member_profiles, greeting strategy per segment

### Existing Code (integration points)

- `el-templo-app/src/modules/progression/pages/MiCamino.vue` — Current home screen to reorganize
- `el-templo-app/src/modules/progression/components/GeneralContent.vue` — Current card layout (session CTA, booking CTA, stats)
- `el-templo-app/src/modules/training/components/DayCard.vue` — `getSessionRouteName()` for route display + `getRouteName()` utility
- `el-templo-app/src/modules/training/components/player/SessionSummary.vue` — Post-session screen where RPE message goes
- `el-templo-app/src/modules/training/components/player/RpeSlider.vue` — Existing RPE input component
- `el-templo-app/src/modules/progression/stores/progressionStore.ts` — Current stats fetching
- `el-templo-app/src/modules/progression/composables/useProgressionApi.ts` — API calls for stats
- `el-templo-app/src/modules/onboarding/components/TuCaminoCard.vue` — Being removed in this phase
- `el-templo-api/src/modules/segmentation/types.ts` — MemberSegment type and SEGMENT_LABELS
- `el-templo-app/src/stores/useUserStore.ts` — Has segment from /auth/me response

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **GeneralContent.vue**: Current card container with session CTA + booking CTA. Can be refactored to accept card ordering.
- **DayCard.vue**: `getSessionRouteName()` + `getRouteName()` utilities for mapping route codes to Spanish labels.
- **RpeSlider.vue**: Existing RPE input (1-10 scale) in session summary.
- **progressionStore**: Already fetches todaySession, stats, rpeTrend, evaluation data.
- **useProgressionApi**: Composable for progression endpoints.
- **LevelDisplay component**: Greek letter + level name badge.

### Established Patterns

- **Module architecture**: progression module has pages, components, stores, composables, types
- **Pinia composition API**: progressionStore uses setup function pattern
- **q-card with flat bordered**: Standard card pattern throughout the app
- **Segment data available**: `/auth/me` now returns segment field (Phase 79), accessible via userStore

### Integration Points

- **MiCamino.vue**: Main page to reorganize — imports GeneralContent, TuCaminoCard, LevelDisplay
- **SessionSummary.vue**: Post-session screen where RPE contextual message goes
- **Weekly API**: `/api/training/weekly` returns sessions with routes per day
- **userStore.segment**: Segment available from login for card ordering and greeting

</code_context>

<specifics>
## Specific Ideas

- Today's route comes from the weekly view API's day-card route data (NUCLEUS block route), NOT from onboarding profile
- Segment-driven greeting replaces both the static "Bienvenido" AND the TuCaminoCard — cleaner, one component doing both jobs
- Card ordering is the subtle personalization — same cards everywhere, different priority based on behavior
- RPE messages are intentionally simple and actionable — no AI-generated recommendations, just rule-based advice
- Weekly progress bar is the key engagement hook — "2 de 3" creates natural motivation to complete the week

</specifics>

<deferred>
## Deferred Ideas

- **Streak tracking and display** — Phase 81 scope. Weekly summary can show placeholder until then.
- **Time-of-day awareness** (morning vs evening greeting) — Nice to have but adds complexity. Future enhancement.
- **Next session preview after RPE** — "Mañana: Tracción" shown on summary screen. Skipped for now to keep RPE flow simple.
- **Push notification for weekly summary** — ENG-10 mentions "optionally as push notification". Push is Phase 84 scope.
- **Goal progress tracker** — Evolving TuCaminoCard into progress toward stated goal. Needs progress metrics we don't have yet.

</deferred>

---

_Phase: 80-tu-dia-daily-game-plan_
_Context gathered: 2026-03-24_

# Phase 82: Progressive Profiling & Check-ins - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add 3 daily check-in questions (energy, soreness, sleep) as a swipeable card row on Tu Día. Questions surface progressively (energy after 1st session, soreness after 3rd, sleep after 1 week) then all remain available permanently. Answers stored in a new check_in_responses table and produce visible changes in Tu Día messaging. Not dismissable — cards stay until answered, then rotate order on schedule. Goal reassessment deferred.

</domain>

<decisions>
## Implementation Decisions

### Check-in Questions

- **D-01:** Three check-in types:
  - **Energy:** "¿Cómo te sentís hoy?" — Bajo / Normal / Alto (3 buttons)
  - **Soreness:** "¿Tenés alguna molestia?" — Ninguna / Leve / Moderada + body area selector if not Ninguna
  - **Sleep:** "¿Cómo dormiste?" — Mal / Ok / Bien (3 buttons)
- **D-02:** All questions use quick-tap button format (2-3 options). No text input, no sliders, no forms. Tap → answer stored → card marks as answered.
- **D-03:** Check-in answers serve dual purpose: data collection for coaches/admin AND immediate visible feedback to the member via Tu Día messaging.

### Progressive Triggers

- **D-04:** Questions unlock progressively:
  - Energy: available after 1st completed session
  - Soreness: available after 3rd completed session
  - Sleep: available after 1 week of membership
- **D-05:** Once unlocked, a question stays available permanently. It doesn't disappear after being answered — it resets daily for a new answer.

### Display Format

- **D-06:** Horizontal swipeable row on Tu Día page. Shows one check-in card at a time with subtle swipe indicator (dots or peek of next card). All unlocked questions available via swipe.
- **D-07:** First card in the row rotates order based on schedule — so the most visible question changes from day to day. Members who don't swipe still see different questions over time.
- **D-08:** Check-in cards are NOT dismissable. They stay visible until answered. When the daily schedule rotates, unanswered questions from yesterday just appear in the new order.
- **D-09:** After answering a question, the card visually marks as completed (checkmark, muted styling) but stays in the row so the member can see they already answered.

### Tu Día Impact

- **D-10:** Check-in answers produce visible changes in Tu Día session CTA messaging:
  - Low energy → "Sesión liviana sugerida"
  - Sore (moderate+) → "Considerá movilidad hoy"
  - Bad sleep → "Escuchá tu cuerpo hoy"
  - Normal/good answers → no change to default messaging
- **D-11:** Only today's answers affect today's messaging. Yesterday's answers don't carry over.
- **D-12:** The impact is messaging only — we are NOT actually changing the session content or SPOM generation. Just the CTA text and subtitle.

### Data Storage

- **D-13:** New `check_in_responses` table: userId, questionType (enum: energy/soreness/sleep), value (varchar), bodyArea (varchar, nullable — only for soreness), createdAt. One row per answer per day.
- **D-14:** Keeps full history — can track trends over time. No overwrite, each daily answer is a new row.

### Skip Behavior

- **D-15:** No skip button. No X to dismiss. Cards persist until answered or until the next day's rotation replaces them.
- **D-16:** No penalty for not answering. Tu Día just shows default messaging without check-in adaptations.
- **D-17:** Maximum one new answer per question per day (prevent spam-tapping different values).

### Goal Reassessment

- **D-18:** DEFERRED from this phase. Monthly goal reassessment comes in a future phase when we have goal-driven content to show value to the member. Currently the onboarding answers don't produce visible value, so asking to update them feels hollow.

### Claude's Discretion

- Swipeable row implementation (q-carousel, horizontal scroll, or custom)
- Check-in card component design (matching Tu Día card visual language)
- Progressive trigger detection logic (count completed sessions, check registration date)
- Daily rotation algorithm for card ordering
- Body area selector UX for soreness question (anatomical diagram vs simple list)
- Admin visibility of check-in data (can defer to a future phase)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements

- `.planning/REQUIREMENTS-v4.4.md` — ENG-04 (progressive profiling), ENG-15 (periodic check-ins), ENG-16 (goal reassessment — deferred), ENG-17 (feedback loop — visible changes)

### Prior Phase Context

- `.planning/phases/78-onboarding-user-profiling/78-CONTEXT.md` — member_profiles schema, D-14 (profile locked after onboarding)
- `.planning/phases/80-tu-dia-daily-game-plan/80-CONTEXT.md` — Tu Día card layout, MiCamino structure, segment-driven card ordering
- `.planning/phases/81-streaks-engagement-mechanics/81-CONTEXT.md` — StreakRow inline component pattern on Tu Día

### Existing Code (integration points)

- `el-templo-app/src/modules/progression/pages/MiCamino.vue` — Tu Día page where check-in row goes
- `el-templo-app/src/modules/progression/components/SessionCtaCard.vue` — CTA messaging to adapt based on check-in answers
- `el-templo-api/src/db/schema/member-profiles.ts` — member_profiles table (reference, not modified)
- `el-templo-api/src/db/schema/completed-sessions.ts` — Session completion data for progressive trigger counting
- `el-templo-api/src/modules/progression/routes.ts` — Progression API to extend with check-in endpoints

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Tu Día card components** (Phase 80) — SessionCtaCard, BookingStatusCard, WeeklySummaryCard patterns for card design
- **StreakRow** (Phase 81) — Inline row between greeting and cards, similar placement pattern
- **OnboardingQuestion.vue** (Phase 78) — Button-based question card with selection state (visual reference for check-in cards)
- **q-carousel** (Quasar) — Built-in swipeable component, could be used for the horizontal row

### Established Patterns

- Tu Día cards use q-card flat bordered with 12px border-radius
- Button options use the same quick-tap pattern as onboarding (highlight on select)
- Progression store for frontend state management
- Constructor DI for backend services

### Integration Points

- MiCamino.vue — check-in swipeable row goes between StreakRow and the card template loop
- SessionCtaCard.vue — messaging adapts based on today's check-in answers
- New API endpoints needed: POST /check-ins (answer), GET /check-ins/today (current state)

</code_context>

<specifics>
## Specific Ideas

- Check-in cards must feel quick and effortless — tap one of 2-3 buttons, done. No forms, no typing.
- The swipeable row is key UX: member sees one question, can swipe to see more. First question rotates daily so even non-swipers see variety.
- Impact is messaging-only for now — we don't change the actual session. "Sesión liviana sugerida" is advice, not a different workout.
- Soreness body area selector needs to be simple — probably a short list (hombros, espalda, piernas, core, general) not an anatomical diagram.
- Push notification integration noted for Phase 84: post-training soreness question, morning energy question.

</specifics>

<deferred>
## Deferred Ideas

- **Goal reassessment** (ENG-16) — Monthly prompt to update primary goal. Deferred until goal-driven content exists to show value.
- **Admin check-in visibility** — Coaches seeing member check-in data in admin. Can come in a future admin enhancement.
- **Check-in trend charts** — Visualizing energy/sleep/soreness over time for the member. Future progressive profiling enhancement.
- **Session content adaptation** — Actually changing SPOM output based on check-in (e.g., lighter session when tired). Major scope, future phase.
- **Push notification check-ins** — Ask soreness after training, energy in the morning. Phase 84.

</deferred>

---

*Phase: 82-progressive-profiling-check-ins*
*Context gathered: 2026-03-24*

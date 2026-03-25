# Phase 80: "Tu Día" Daily Game Plan - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 80-tu-dia-daily-game-plan
**Areas discussed:** Tu Día content & layout, Personalization engine, Post-session RPE flow, Weekly summary, Non-onboarded member fallback, Tu Camino card fate, Today's route data source, Rest day handling

---

## Tu Día Layout Approach

| Option                     | Description                                       | Selected |
| -------------------------- | ------------------------------------------------- | -------- |
| Enhance Mi Camino          | Reorganize existing page with Tu Día cards at top | ✓        |
| Replace Mi Camino entirely | New page design from scratch                      |          |
| Separate tab/page          | Keep Mi Camino, add Tu Día as new tab             |          |

**User's choice:** Enhance Mi Camino (smart reorganization)

## Scope Level

| Option                      | Description                                       | Selected |
| --------------------------- | ------------------------------------------------- | -------- |
| Smart reorganization        | Contextual cards, segment-driven text, rule-based | ✓        |
| Full daily planner          | Time-of-day, meals, hydration, rest detection     |          |
| Minimal: just progress card | One new card, keep rest as-is                     |          |

**User's choice:** Smart reorganization

## Daily Action Cards

| Option                            | Description                                                 | Selected |
| --------------------------------- | ----------------------------------------------------------- | -------- |
| Enhanced session CTA with preview | Today's route, personalizada indicator, last session timing | ✓        |
| Booking status card               | Next class time or booking CTA                              | ✓        |
| Weekly progress bar               | Sessions vs budget with visual bar                          | ✓        |
| Segment-driven greeting           | Contextual message replacing static Bienvenido              | ✓        |

**User's choice:** All 4 selected
**Notes:** User clarified that session CTA should NOT use onboarding profile for training focus — should use the weekly view's day-card route (actual body area from SPOM engine).

## Session CTA Approach

| Option                      | Description                                   | Selected |
| --------------------------- | --------------------------------------------- | -------- |
| Enhanced CTA with context   | Route from weekly API, session type indicator | ✓        |
| Keep current CTA as-is      | Existing toggle                               |          |
| Show actual session preview | Pre-generate session, needs SPOM changes      |          |

**User's choice:** Enhanced CTA with context, but using weekly view route data (not onboarding profile)

## Personalization Engine

| Option                              | Description                                    | Selected |
| ----------------------------------- | ---------------------------------------------- | -------- |
| Greeting text + progress messaging  | Segment changes greeting and motivational text | ✓        |
| Different card ordering per segment | Different priority order based on segment      | ✓        |
| Different cards per segment         | Unique cards per segment type                  |          |

**User's choice:** Options 1 AND 2 — both greeting text and card ordering driven by segment

## Post-Session RPE Flow

| Option                          | Description                                                    | Selected |
| ------------------------------- | -------------------------------------------------------------- | -------- |
| Contextual message based on RPE | Rule-based text: RPE 1-3 → intensity tip, 7-8 → rest tip, etc. | ✓        |
| Next session preview            | Show tomorrow's route after RPE                                |          |
| Both: message + preview         | RPE tip + tomorrow preview                                     |          |

**User's choice:** Contextual message only

## Weekly Summary Location

| Option                       | Description                           | Selected |
| ---------------------------- | ------------------------------------- | -------- |
| Card on Tu Día page          | Always-visible card below daily cards | ✓        |
| Separate weekly recap screen | Dedicated page with more detail       |          |
| Monday morning modal         | Pop-up on first Monday login          |          |

**User's choice:** Card on Tu Día page

## Weekly Reset Cycle

| Option                  | Description                  | Selected |
| ----------------------- | ---------------------------- | -------- |
| Monday                  | Mon-Sun standard cycle       | ✓        |
| Based on plan start day | Per-member custom reset      |          |
| Rolling 7 days          | No reset, always last 7 days |          |

**User's choice:** Monday

## Non-Onboarded Member Fallback

| Option                              | Description                                | Selected |
| ----------------------------------- | ------------------------------------------ | -------- |
| Same cards, generic greeting        | All cards show, no personalization         |          |
| Redirect to onboarding              | Router guard enforces mandatory onboarding | ✓        |
| Minimal view with onboarding prompt | Banner prompting profile completion        |          |

**User's choice:** Redirect to onboarding (mandatory — already handled by Phase 78 router guard)

## TuCaminoCard Fate

| Option                       | Description                               | Selected |
| ---------------------------- | ----------------------------------------- | -------- |
| Merge into segment greeting  | Remove card, greeting absorbs its purpose | ✓        |
| Keep as-is                   | Stays at top showing goal                 |          |
| Evolve into progress tracker | Goal + progress toward it                 |          |

**User's choice:** Merge into segment greeting — remove TuCaminoCard

## Today's Route Data Source

| Option                   | Description                                | Selected |
| ------------------------ | ------------------------------------------ | -------- |
| Reuse weekly view API    | /api/training/weekly, extract today's data | ✓        |
| New lightweight endpoint | GET /api/training/today                    |          |
| From progression store   | Use todaySession if completed              |          |

**User's choice:** Reuse weekly view API

## Rest Day Handling

| Option                          | Description                           | Selected |
| ------------------------------- | ------------------------------------- | -------- |
| Rest day card with recovery tip | "Hoy es día de descanso" + tip        | ✓        |
| Hide session CTA only           | Other cards still show                |          |
| Optional session card           | Encourage extra training on rest days |          |

**User's choice:** Rest day card with recovery tip

## Claude's Discretion

- Card component design
- Weekly summary endpoint approach
- Transitions/animations
- Recovery tip content
- Progress bar implementation
- Mobile scroll behavior

## Deferred Ideas

- Streak tracking (Phase 81)
- Time-of-day greeting
- Next session preview after RPE
- Push notification for weekly summary (Phase 84)
- Goal progress tracker

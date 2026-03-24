# Phase 79: Behavioral Segmentation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 79-behavioral-segmentation
**Areas discussed:** Segment definitions & thresholds, Calculation trigger & freshness, Segment storage & admin UX, Transition rules & edge cases, Paused/expired subscription handling, Session completion as app usage signal, Configurable thresholds

---

## Segment Definitions (Count & Names)

| Option                       | Description                                                                | Selected              |
| ---------------------------- | -------------------------------------------------------------------------- | --------------------- |
| Keep all 6 as-is             | Nuevo Guerrero, Espartano, Intermitente, En Riesgo, Digital Warrior, Ghost | ✓ (with modification) |
| Drop Digital Warrior & Ghost | Defer app-usage-dependent segments                                         |                       |
| Simplify to 3 tiers          | Active, Regular, At Risk                                                   |                       |

**User's choice:** Keep all 6, use session completion data as app usage proxy for Digital Warrior/Ghost
**Notes:** User asked if segments are shown to users — clarified they're internal/admin only. User suggested using session completion tracking for online members instead of deferring Digital Warrior/Ghost.

## Attendance Thresholds

| Option                          | Description                                                        | Selected |
| ------------------------------- | ------------------------------------------------------------------ | -------- |
| Plan-relative %                 | Espartano=80%+, Intermitente=40-80%, En Riesgo=<40% of plan budget | ✓        |
| Fixed counts (3+, 1-2, <1/week) | Same for everyone regardless of plan                               |          |
| Custom thresholds               | User defines                                                       |          |

**User's choice:** Plan-relative percentage
**Notes:** Adapts to each member's subscription plan. A 2x/week plan at 100% = Espartano.

## Calculation Trigger

| Option                    | Description                            | Selected |
| ------------------------- | -------------------------------------- | -------- |
| On login only             | Recalculate on /auth/me                | ✓        |
| Daily cron job            | Background job for all members         |          |
| Both: login + weekly cron | Active users fresh + cron for inactive |          |

**User's choice:** On login only

## Lookback Window

| Option          | Description                 | Selected |
| --------------- | --------------------------- | -------- |
| Rolling 28 days | Last 4 weeks                | ✓        |
| Rolling 14 days | More responsive but twitchy |          |
| Calendar month  | Simpler but less responsive |          |

**User's choice:** Rolling 28 days

## Segment Storage

| Option                         | Description                    | Selected |
| ------------------------------ | ------------------------------ | -------- |
| Column on member_profiles      | Add segment + segmentUpdatedAt | ✓        |
| Separate member_segments table | History tracking               |          |
| Column on users table          | Simpler joins                  |          |

**User's choice:** Column on member_profiles

## Admin UX

| Option                         | Description                         | Selected |
| ------------------------------ | ----------------------------------- | -------- |
| Colored chip + filter dropdown | Chips on list rows, dropdown filter | ✓        |
| Text label + filter only       | Plain text, no color                |          |
| Dedicated segments dashboard   | Separate page with charts           |          |

**User's choice:** Colored chip + filter dropdown

## Transition Rules

| Option                        | Description                              | Selected |
| ----------------------------- | ---------------------------------------- | -------- |
| Fully dynamic                 | Segment reflects current 28-day behavior | ✓        |
| Grace period before downgrade | 2-week buffer                            |          |
| Never downgrade               | Once Espartano always Espartano          |          |

**User's choice:** Fully dynamic

## New Member Handling

| Option                         | Description               | Selected |
| ------------------------------ | ------------------------- | -------- |
| Nuevo Guerrero for 30 days     | Override all other logic  | ✓        |
| Unclassified until enough data | Show 'Sin datos'          |          |
| Derive from plan type          | Initial segment from plan |          |

**User's choice:** Nuevo Guerrero for first 30 days

## Paused/Expired Subscription Handling

| Option             | Description                         | Selected |
| ------------------ | ----------------------------------- | -------- |
| Ghost              | All inactive = Ghost                |          |
| En Riesgo          | All inactive = En Riesgo            |          |
| Tiered by duration | En Riesgo < 8 weeks, Ghost 8+ weeks | ✓        |

**User's choice:** Tiered — En Riesgo for 2-8 weeks inactive, Ghost for 8+ weeks. Applies regardless of subscription status.
**Notes:** User pointed out that 1-month vs 6-month inactive is fundamentally different. Led to the 2-tier split.

## App Usage Signal (Digital Warrior/Ghost)

| Option                            | Description                 | Selected |
| --------------------------------- | --------------------------- | -------- |
| Session completions only          | completed_sessions table    |          |
| Session completions + login count | Both signals combined       | ✓        |
| Just login timestamps             | Simplest but weakest signal |          |

**User's choice:** Session completions + login count

## Configurable Thresholds

| Option                     | Description                    | Selected |
| -------------------------- | ------------------------------ | -------- |
| system_settings + admin UI | Store in DB, build config card | ✓        |
| system_settings only       | DB storage, no admin UI        |          |
| Hardcoded constants        | Requires redeploy              |          |

**User's choice:** Both — system_settings storage + admin settings card in this phase
**Notes:** User also requested removing unused grace_period_days from system_settings since it's no longer tracked.

## Claude's Discretion

- Segment calculation service architecture
- Login tracking storage approach
- Admin settings card layout
- Segment chip component design
- Cache strategy for segment recalculation

## Deferred Ideas

- Segment history tracking (trend analysis)
- Member-facing segment badges (gamification — Phase 81)
- Segment-driven push notifications (Phase 84)
- Segment distribution dashboard (reports enhancement)

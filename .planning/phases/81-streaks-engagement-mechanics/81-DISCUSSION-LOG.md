# Phase 81: Streaks & Engagement Mechanics - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 81-streaks-engagement-mechanics
**Areas discussed:** Streak logic & persistence, Celebration animations, Streak display & UI placement, AURA rewards for milestones

---

## Rest Day Handling

| Option                    | Description                                                 | Selected |
| ------------------------- | ----------------------------------------------------------- | -------- |
| Plan-aware tolerance      | Rest days based on subscription schedule don't break streak | ✓        |
| Fixed 1-day gap tolerance | One rest day always OK, two breaks it                       |          |
| Weekly streak             | Count active weeks instead of days                          |          |

**User's choice:** Plan-aware tolerance

## Streak Storage

| Option                      | Description                                   | Selected |
| --------------------------- | --------------------------------------------- | -------- |
| Persist on member_profiles  | currentStreak, longestStreak, streakUpdatedAt | ✓        |
| Keep calculating on the fly | Current approach, gets slower over time       |          |
| Separate streaks table      | History tracking                              |          |

**User's choice:** Persist on member_profiles

## Celebration Approach

| Option                                | Description                                                       | Selected |
| ------------------------------------- | ----------------------------------------------------------------- | -------- |
| Enhance existing + milestone overlay  | Add streak count to CelebrationScreen, full-screen for milestones |          |
| Replace with unified celebration      | One adaptive celebration screen                                   |          |
| Keep current, add toast notifications | CelebrationScreen unchanged, milestones as toasts                 |          |

**User's choice:** None of the above — no celebration changes in this phase. Show streak as inline row on Tu Día only. When broken, just hide it.

## Milestone Animation

| Option               | Description                            | Selected       |
| -------------------- | -------------------------------------- | -------------- |
| Amber particle burst | Reuse OnboardingResult particle system | ✓ (for future) |
| Confetti library     | canvas-confetti dependency             |                |
| Simple scale + glow  | Minimal animation                      |                |

**User's choice:** Amber particle burst preferred for future milestone celebrations, but no celebrations in this phase.

## Streak Display

| Option                            | Description                           | Selected |
| --------------------------------- | ------------------------------------- | -------- |
| Inline row with fire icon + count | Subtle row between greeting and cards | ✓        |
| Small card with fire icon         | Full bordered card                    |          |
| Badge on greeting                 | Fire emoji next to name               |          |

**User's choice:** Inline row with fire icon + count. Only visible when streak > 0.

## AURA Rewards

| Option                   | Description                     | Selected                |
| ------------------------ | ------------------------------- | ----------------------- |
| Scaling bonuses          | Different amounts per milestone | ✓ (with custom amounts) |
| Flat bonus per milestone | Same amount for all milestones  |                         |
| Custom amounts           | User-defined                    |                         |

**User's choice:** Scaling bonuses with custom values:

- 7-day: +20 AURA
- 14-day: +35 AURA
- 30-day: +50 AURA
- 60-day: +100 AURA
- 100-day: +200 AURA
  **Notes:** Base session completion gives +10 AURA, so streak bonuses are designed to be meaningful on top of that.

## Claude's Discretion

- Streak service architecture
- Missed training day detection mechanism
- Backfill strategy for existing sessions
- Streak row component design
- 10 AURA per session implementation (if not already active)

## Deferred Ideas

- Milestone celebration screens (full-screen overlay with particles)
- Streak freeze / recovery mechanic
- Streak leaderboard
- Visual streak calendar (GitHub-style)
- Post-check-in streak (QR attendance)

# Phase 82: Progressive Profiling & Check-ins - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 82-progressive-profiling-check-ins
**Areas discussed:** Check-in questions & triggers, Goal reassessment flow, Data storage & profile enrichment, Skip behavior & frequency

---

## Check-in Questions

| Option | Description | Selected |
|--------|-------------|----------|
| Energy level | "Cómo te sentís hoy?" — Low/Normal/High | ✓ |
| Soreness/recovery | "Tenés alguna molestia?" — None/Mild/Moderate + body area | ✓ |
| Sleep quality | "Cómo dormiste?" — Bad/OK/Great | ✓ |
| Motivation check | "Qué tan motivado estás?" — 1-5 scale | |

**User's choice:** Energy, Soreness, Sleep — all three. Quick 2-3 button format. No motivation scale.
**Notes:** User emphasized these should be answered quickly with buttons, not forms.

## Check-in Format

| Option | Description | Selected |
|--------|-------------|----------|
| Card on Tu Día | Dismissible card in Tu Día flow | ✓ (modified) |
| Bottom sheet after login | Slide-up sheet | |
| Pre-session prompt | Ask before training | |

**User's choice:** Card on Tu Día, but NOT dismissable — stays until answered.

## Progressive Triggers

| Option | Description | Selected |
|--------|-------------|----------|
| Progressive schedule | Energy after 1st, soreness after 3rd, sleep after 1 week | ✓ |
| All from day one | All 3 immediately | |
| Only after 1 week | Nothing for first week | |

**User's choice:** Progressive schedule

## Check-in Impact

| Option | Description | Selected |
|--------|-------------|----------|
| Visible Tu Día messaging change | Low energy → "Sesión liviana sugerida" | ✓ |
| Collect data only | No visible impact | |
| Both: message + admin | Tu Día adapts + admin sees data | |

**User's choice:** Visible change in Tu Día messaging

## Goal Reassessment

| Option | Description | Selected |
|--------|-------------|----------|
| Defer goal reassessment | Only daily check-ins this phase | ✓ |
| Simple confirm/change | Monthly "still your goal?" prompt | |
| Full reassessment | Re-quiz all 4 fields | |

**User's choice:** Deferred — onboarding answers don't produce visible value yet, so asking to update feels hollow.

## Data Storage

| Option | Description | Selected |
|--------|-------------|----------|
| New check_in_responses table | Full history, one row per answer | ✓ |
| Columns on member_profiles | Only latest answer | |
| JSON column | Flexible but hard to query | |

**User's choice:** New table with history

## Skip Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Not dismissable, persist until answered | Cards stay, rotate on schedule | ✓ |
| Dismiss for today | X button, retry tomorrow | |
| Dismiss for 3 days | Cooldown period | |

**User's choice:** Not dismissable. Cards stay until answered. Schedule rotation replaces unanswered ones.

## Frequency & Display

| Option | Description | Selected |
|--------|-------------|----------|
| Swipeable row, all available | Horizontal swipe, one visible, others via swipe | ✓ |
| One per day max | Only one card visible | |
| Two per day max | Up to two cards | |

**User's choice:** Swipeable horizontal row with all unlocked questions. First card rotates order daily. Subtle swipe indicator.
**Notes:** User wants push notifications for check-ins (post-training soreness, morning energy) — noted for Phase 84.

## Claude's Discretion

- Swipeable row implementation
- Check-in card component design
- Progressive trigger detection logic
- Daily rotation algorithm
- Body area selector UX for soreness
- Admin visibility of check-in data

## Deferred Ideas

- Goal reassessment (ENG-16) — until goal-driven content exists
- Admin check-in visibility
- Check-in trend charts for members
- Session content adaptation based on check-ins
- Push notification check-ins (Phase 84)

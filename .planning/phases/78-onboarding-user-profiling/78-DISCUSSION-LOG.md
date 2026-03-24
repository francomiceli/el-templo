# Phase 78: Onboarding & User Profiling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 78-onboarding-user-profiling
**Areas discussed:** Quiz content & flow, Tu Camino path display, Trigger & skip logic, Profile data model, AURA reward amount, Transition animations, Quiz analytics, Brand voice & copy

---

## Quiz Content & Flow

### Visual flow style

| Option            | Description                                                               | Selected |
| ----------------- | ------------------------------------------------------------------------- | -------- |
| Full-screen cards | One question per screen, swipe/tap to advance. BetterMe-style, immersive. | ✓        |
| Stepper form      | Quasar q-stepper, all steps visible as progress bar.                      |          |
| Single page       | All questions on one scrollable page.                                     |          |

**User's choice:** Full-screen cards
**Notes:** None

### Questions selection

| Option                    | Description                                   | Selected |
| ------------------------- | --------------------------------------------- | -------- |
| Goal → Level → Days       | 3 questions: objective, experience, days/week |          |
| Goal → Skill test → Days  | Skill self-assessment instead of experience   |          |
| Goal → Level → Motivation | Motivation style instead of days/week         |          |

**User's choice:** Option 1 base, but noted days/week is redundant since members already have a plan with stipulated training days.

### Q3 replacement (since days/week excluded)

| Option               | Description                                   | Selected |
| -------------------- | --------------------------------------------- | -------- |
| Motivation style     | Discipline / Community / Results / Challenges | ✓ (both) |
| Training focus       | Upper / Lower / Core / Full body              | ✓ (both) |
| Physical limitations | Knee / Back / Shoulder / None                 |          |

**User's choice:** Liked both 1 and 2 — resulted in expanding to 4 questions.

### Question count

| Option                  | Description                                     | Selected |
| ----------------------- | ----------------------------------------------- | -------- |
| 4 questions             | Goal → Experience → Training Focus → Motivation | ✓        |
| 3, defer motivation     | Ask motivation in Phase 82                      |          |
| 3, defer training focus | Ask training focus in Phase 82                  |          |

**User's choice:** 4 questions

### Welcome screen

| Option             | Description                               | Selected |
| ------------------ | ----------------------------------------- | -------- |
| Yes, brief welcome | Logo + name + "4 preguntas" + Empezar CTA | ✓        |
| No, straight to Q1 | Jump to first question                    |          |

**User's choice:** Brief welcome screen

### Post-quiz result screen

| Option                          | Description                        | Selected |
| ------------------------------- | ---------------------------------- | -------- |
| Result card + Tu Camino preview | Summary of profile + path preview  |          |
| Straight to app                 | No result screen                   |          |
| AURA reward screen              | Result + AURA award for completing | ✓        |

**User's choice:** AURA reward screen

### Experience level granularity

| Option             | Description                               | Selected |
| ------------------ | ----------------------------------------- | -------- |
| 3 levels           | Beginner / Intermediate / Advanced        | ✓        |
| 4 levels           | De cero / Unos meses / 1-2 años / 2+ años |          |
| Skill-based hybrid | Concrete skill references per level       |          |

**User's choice:** 3 levels

---

## Tu Camino Path Display

### Relationship to Mi Camino

| Option             | Description                      | Selected |
| ------------------ | -------------------------------- | -------- |
| New section at top | Add card above existing content  | ✓        |
| Replace header     | Replace Bienvenido + level badge |          |
| Separate tab/page  | Own route, linked from Mi Camino |          |

**User's choice:** New section at top of Mi Camino

### Card content for v1

| Option                      | Description                         | Selected |
| --------------------------- | ----------------------------------- | -------- |
| Goal + next step + progress | Goal, milestone text, progress bar  |          |
| Goal + stats summary only   | Goal + key stats, no milestones     | ✓        |
| Full path visualization     | Vertical timeline of all milestones |          |

**User's choice:** Goal + stats summary only — milestone path deferred to later phases

### Edit quiz answers later

| Option                      | Description             | Selected |
| --------------------------- | ----------------------- | -------- |
| Yes, from profile settings  | View/update in settings |          |
| Yes, from Tu Camino card    | Edit icon on card       |          |
| No, locked after onboarding | Permanent answers       | ✓        |

**User's choice:** Locked after onboarding

---

## Trigger & Skip Logic

### When onboarding appears

| Option                   | Description                            | Selected |
| ------------------------ | -------------------------------------- | -------- |
| First login after deploy | All users without completed onboarding | ✓        |
| New registrations only   | Only post-ship registrations           |          |
| Post-register redirect   | Right after registration               |          |

**User's choice:** First login after deploy (covers existing members too)

### Skip capability

| Option                | Description                          | Selected |
| --------------------- | ------------------------------------ | -------- |
| Yes, with skip button | "Omitir" link, CTA to complete later |          |
| No skip allowed       | Mandatory before app access          | ✓        |
| Skip only on welcome  | Can bail before Q1                   |          |

**User's choice:** No skip — mandatory quiz

---

## Profile Data Model

### Storage location

| Option                    | Description                      | Selected |
| ------------------------- | -------------------------------- | -------- |
| New member_profiles table | 1:1 with users, clean separation | ✓        |
| Add columns to users      | Direct columns on users table    |          |
| JSON column on users      | Single profileData JSON          |          |

**User's choice:** New member_profiles table

### Onboarding flag location

| Option             | Description                              | Selected |
| ------------------ | ---------------------------------------- | -------- |
| On member_profiles | onboardingCompletedAt timestamp, derived | ✓        |
| Boolean on users   | onboardingCompleted boolean              |          |

**User's choice:** On member_profiles (derived from timestamp)

### Enum values

| Option             | Description                                  | Selected |
| ------------------ | -------------------------------------------- | -------- |
| As discussed       | 5 goals, 3 experience, 4 focus, 4 motivation | ✓        |
| Fewer goal options | Merge wellness into fitness                  |          |

**User's choice:** Full enum set as discussed

### Admin visibility

| Option                          | Description           | Selected |
| ------------------------------- | --------------------- | -------- |
| Yes, read-only in member detail | View profile, no edit | ✓        |
| Not in this phase               | Defer to Phase 79     |          |
| Yes, with edit capability       | View and edit         |          |

**User's choice:** Read-only in admin member detail

---

## AURA Reward Amount

| Option   | Description     | Selected |
| -------- | --------------- | -------- |
| 50 AURA  | 5x a check-in   | ✓        |
| 25 AURA  | 2.5x a check-in |          |
| 100 AURA | 10x a check-in  |          |

**User's choice:** 50 AURA

---

## Transition Animations

| Option              | Description            | Selected |
| ------------------- | ---------------------- | -------- |
| Slide left          | Cards slide left/right | ✓        |
| Fade                | Opacity transition     |          |
| Claude's discretion | Implementer chooses    |          |

**User's choice:** Slide left

---

## Quiz Analytics

| Option              | Description                                 | Selected |
| ------------------- | ------------------------------------------- | -------- |
| Basic event logging | Start, complete, answers only               |          |
| Full analytics      | Per-question timing, distribution, drop-off | ✓        |
| No analytics        | Just store answers                          |          |

**User's choice:** Full analytics

---

## Brand Voice & Copy

| Option                    | Description                            | Selected |
| ------------------------- | -------------------------------------- | -------- |
| Claude writes, you review | Draft in brand voice, user reviews     | ✓        |
| You provide copy          | User writes exact copy                 |          |
| Claude's discretion       | Write during implementation, no review |          |

**User's choice:** Claude writes using brand docs in `.docs/` as reference, user reviews before implementation.

---

## Claude's Discretion

- Progress indicator style (dots, bar, step counter)
- Exact animation timing for slide transitions
- Loading states during API calls
- Error handling UX (network failures mid-quiz)
- Analytics table schema and API design

## Deferred Ideas

- Milestone path visualization → Phase 80/82
- Progressive profiling → Phase 82
- Goal reassessment / profile editing → Phase 82
- Skill-based assessment (Q2 alternative) → considered, chose 3-level for v1
- Days/week question → excluded (already in plan)

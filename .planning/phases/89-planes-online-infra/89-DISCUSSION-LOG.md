# Phase 89: Backend & Admin — "Planes Online" Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03, 2026-04-04
**Phase:** 89-planes-online-infra
**Areas discussed:** Full rename, plan categorization, admin page structure, unified plan+program model, table reduction, duration system, presencial upsell billing, subscription constraints, pipeline calibration
**Status:** COMPLETE

---

## Session 1 (2026-04-03) — Partial

### Member App Rename Boundary

| Option                     | Description                                                                                               | Selected |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | -------- |
| Infrastructure rename only | Phase 89: rename types, stores, API response keys, route paths. Phase 90: visual redesign.                |          |
| Full rename + minimal UX   | Phase 89: above + update existing UI text ("Personalizada" → "Por Objetivos"). Phase 90: redesign layout. |          |
| Skip member app entirely   | ALL member app changes in Phase 90.                                                                       |          |

**Initial response:** User didn't understand the question — needed clarification on what "rename" means in context.

**Clarification provided:** The rename touches ~10 member app files (types, stores, routes). Question is whether to do it now (Phase 89) so Phase 90 starts clean, or bundle it all in Phase 90.

| Option                | Description                                                      | Selected |
| --------------------- | ---------------------------------------------------------------- | -------- |
| Yes, rename in 89     | Rename code references now. Phase 90 focuses on visual redesign. | ✓        |
| No, defer to Phase 90 | Leave member app as-is until Phase 90.                           |          |

**User's choice:** Yes, rename in Phase 89.

**Follow-up: User-facing text**

| Option                | Description                                             | Selected |
| --------------------- | ------------------------------------------------------- | -------- |
| Change text too       | Update user-facing strings while renaming code.         | ✓        |
| Code only, text in 90 | Labels stay as "Personalizada" until Phase 90 redesign. |          |

**User's choice:** Change text too.

---

### Online Plan Assignment Flow → Admin Page Structure Deep Dive

User requested a deep review of the current admin PlanesPage before deciding on the assignment flow. Reviewed: PlanesPage.vue (3 tabs, tables, dialogs), PlanFormDialog.vue (form fields, toggles), AssignPlanDialog.vue (stepper).

**Program Placement in Tab Structure**

| Option              | Description                                 | Selected |
| ------------------- | ------------------------------------------- | -------- |
| 4 tabs              | Presenciales / Online / Programas / Promos  |          |
| Inside Online tab   | Programs become a section within Online tab |          |
| Keep 3 tabs, rename | Presenciales / Experiencias / Promos        |          |

**User's response:** "gluteos, front lever, desde cero and habitos are basically forms of microprograms" — pointed out online products ARE essentially micro-programs.

**Online Product Data Model**

| Option             | Description                                           | Selected |
| ------------------ | ----------------------------------------------------- | -------- |
| Subscription plans | Keep using subscription_plans table + PlanFormDialog  |          |
| Micro-programs     | Online products ARE programs, use ProgramWizardDialog |          |
| Let me explain     | User will describe a different approach               |          |

**User's response:** "Something between 2 and 3, this is the problem I'm facing now and I don't know how to proceed."

**Analysis provided:** Explained what each system handles (subscription_plans = pricing/access, micro_programs = content/progression) and that online products need BOTH.

**Architecture Decision**

| Option                  | Description                                                                       | Selected |
| ----------------------- | --------------------------------------------------------------------------------- | -------- |
| Plan + linked program   | subscription_plan for pricing/access, optionally linked micro_program for content | ✓        |
| Programs absorb pricing | Add pricing to micro_programs, they become primary online entity                  |          |
| Plans absorb content    | Add content blocks to subscription_plans                                          |          |

**User's response:** Agreed with plan + linked program.

**planCategory Confirmation:** User confirmed `presencial | online_regular | online_goal | online_coach` enum.

**Page Layout**

| Option                   | Description                                                                | Selected |
| ------------------------ | -------------------------------------------------------------------------- | -------- |
| Single list with filters | One list, filter by category                                               |          |
| Two sections, one page   | Presenciales table + Online table on same page. Programs to separate page. | ✓        |
| Two tabs + promos        | Presenciales tab / Online tab / Promos tab                                 |          |

**User's choice:** Two sections, one page. Programs → separate "Programas" page.

**Plan Creation Form UX — left OPEN.** User paused session.

---

## Session 2 (2026-04-04) — Completion

User returned and requested full architecture research before resolving open areas.

### Full Architecture Research

User directive: "go full research mode, start from the first time we introduced plans into this project and go step by step, change by change... the goal should be that you come up with a solution to get plans and programs schemes... the simplest possible solution so all systems coexist together"

**Research conducted:**

- Traced complete git history of plan-related schema changes (Phase 48 through 89)
- Read all 6 plan-adjacent tables and their full column definitions
- Mapped every usage of isPersonalizada, isOnline, personalizadaType across all 3 apps
- Traced full call chains: assignment → subscription → session generation
- Identified dual gating inconsistency (backend checks subscription flag per Phase 69, frontend checks program enrollment per Phase 83 D-08)
- Identified missing FK between subscription_plans and micro_programs
- Identified personalizadaType stored redundantly on both subscription_plans and member_personalizadas

**Proposed unified model presented:** planCategory enum + linkedProgramId FK + unified gate. User approved direction.

### Table Reduction

| Option                                         | Description                                                                                      | Selected |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------- |
| Keep 6 tables, fix wiring                      | planCategory enum + linkedProgramId FK + unified gate                                            |          |
| Merge member_personalizadas into subscriptions | Move goal counters to subscription record                                                        |          |
| Eliminate member_personalizadas via programs   | Goals ARE programs with goalPlanType column. program_enrollments replaces member_personalizadas. | ✓        |

**User's insight:** "member_personalizadas with semana20, 40 etc, doesn't make sense for what we want to build now, the micro-program system should essentially contain these 6 different goals we have"

**Result:** 6 tables → 5 tables. member_personalizadas eliminated.

### Duration System

| Option                          | Description                              | Selected |
| ------------------------------- | ---------------------------------------- | -------- |
| Keep duration picker (20/40/60) | Member chooses duration, blocks filtered |          |
| Remove duration picker entirely | Member gets full session, no filtering   | ✓        |

**User's directive:** "the 20, 40 or 60 min thing goes away entirely from everywhere"

### Regular vs Goal Sessions for Online Plans

| Option                                     | Description                                               | Selected |
| ------------------------------------------ | --------------------------------------------------------- | -------- |
| All online plans use goal pipeline         | Even Desde Cero/Habitos get route-locked sessions         |          |
| Regular pipeline for content-only programs | Desde Cero/Habitos use regular sessions + program content | ✓        |

**User's clarification:** "construccion de habitos y calistenia desde cero, use regular sessions"

### Presencial Upsell Billing

| Option                                | Description                                               | Selected |
| ------------------------------------- | --------------------------------------------------------- | -------- |
| Bill through program_enrollments      | Standalone enrollment with paymentAmount/paymentMethod    |          |
| Bill through online plan subscription | Presencial member buys online plan as second subscription | ✓        |

**User's insight:** "maybe we should make these people get what we call the 'online' plan when they want the upsell, so we don't have programs without plans"

**Result:** Every program enrollment comes from a plan assignment. No orphan programs. All billing through subscription pricing.

### Subscription Constraint

| Option                          | Description                               | Selected |
| ------------------------------- | ----------------------------------------- | -------- |
| One active per member (current) | Only one subscription at a time           |          |
| One presencial + one online max | Allow gym member to also have online plan | ✓        |
| Unlimited                       | Any number of active subscriptions        |          |

**User confirmed:** "the 'one presencial + one online' constraint is correct"

### Plan Creation Form UX (resolved from Session 1)

| Option               | Description                                                       | Selected |
| -------------------- | ----------------------------------------------------------------- | -------- |
| Dropdown selector    | planCategory dropdown + linkedProgramId selector for online plans | ✓        |
| Toggle + conditional | Keep online toggle, show sub-selector                             |          |

**Resolution:** planCategory dropdown replaces boolean toggles. linkedProgramId dropdown appears for online plans. goalPlanType is NOT on this form — it's set when creating the program.

---

## Claude's Discretion

- Migration strategy for boolean→enum conversion
- Weekly price formula
- Handling existing member_personalizadas data during elimination
- Handling personalizadaType on sessions/completed_sessions tables
- Pipeline calibration methodology
- Whether to keep/remove program_enrollments payment columns
- Default values for planTier/bookingMode on online plans

## Deferred Ideas

- Self-service payment integration (Mercado Pago)
- Online user level progression
- Exercise video library completion
- Full onboarding quiz for online users
- Automated session quality validation
- Multiple online subscriptions per member (v1 is one presencial + one online max)

# Phase 89: Backend & Admin — "Planes Online" Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 89-planes-online-infra
**Areas discussed:** Member app rename boundary, Online plan assignment flow (expanded into admin page structure deep dive)
**Status:** INCOMPLETE — user pausing, will resume next session

---

## Member App Rename Boundary

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

## Online Plan Assignment Flow → Admin Page Structure Deep Dive

User requested a deep review of the current admin PlanesPage before deciding on the assignment flow. Reviewed: PlanesPage.vue (3 tabs, tables, dialogs), PlanFormDialog.vue (form fields, toggles), AssignPlanDialog.vue (stepper).

### Program Placement in Tab Structure

| Option              | Description                                 | Selected |
| ------------------- | ------------------------------------------- | -------- |
| 4 tabs              | Presenciales / Online / Programas / Promos  |          |
| Inside Online tab   | Programs become a section within Online tab |          |
| Keep 3 tabs, rename | Presenciales / Experiencias / Promos        |          |

**User's response:** "gluteos, front lever, desde cero and habitos are basically forms of microprograms" — pointed out online products ARE essentially micro-programs.

### Online Product Data Model

| Option             | Description                                           | Selected |
| ------------------ | ----------------------------------------------------- | -------- |
| Subscription plans | Keep using subscription_plans table + PlanFormDialog  |          |
| Micro-programs     | Online products ARE programs, use ProgramWizardDialog |          |
| Let me explain     | User will describe a different approach               |          |

**User's response:** "Something between 2 and 3, this is the problem I'm facing now and I don't know how to proceed."

**Analysis provided:** Explained what each system handles (subscription_plans = pricing/access, micro_programs = content/progression) and that online products need BOTH.

### Architecture Decision

| Option                  | Description                                                                       | Selected |
| ----------------------- | --------------------------------------------------------------------------------- | -------- |
| Plan + linked program   | subscription_plan for pricing/access, optionally linked micro_program for content | ✓        |
| Programs absorb pricing | Add pricing to micro_programs, they become primary online entity                  |          |
| Plans absorb content    | Add content blocks to subscription_plans                                          |          |

**User's response:** Agreed with plan + linked program. Asked about planCategory — "doesn't make sense here?"

### planCategory Confirmation

| Option                           | Description                                              | Selected |
| -------------------------------- | -------------------------------------------------------- | -------- |
| planCategory enum (D-06)         | presencial / online_regular / online_goal / online_coach | ✓        |
| Keep isOnline, add sessionSource | Two independent dimensions                               |          |
| Keep current booleans            | Minimal schema change                                    |          |

**User's choice:** planCategory enum (D-06).

### Online Tab in PlanesPage

| Option                         | Description                                            | Selected |
| ------------------------------ | ------------------------------------------------------ | -------- |
| Plans only                     | Online tab shows subscription_plans, programs separate |          |
| Both together                  | Online tab shows plans AND programs                    |          |
| Programs only, linked to plans | Online tab shows programs, plans auto-created          |          |

**User's response:** "Online tab should not exist, we have a plan online toggle in regular plan creation, maybe we can create two lists to separate them visually, but the program is a different thing and should go in a different page in admin panel."

### Page Layout

| Option                   | Description                                                                | Selected |
| ------------------------ | -------------------------------------------------------------------------- | -------- |
| Single list with filters | One list, filter by category                                               |          |
| Two sections, one page   | Presenciales table + Online table on same page. Programs to separate page. | ✓        |
| Two tabs + promos        | Presenciales tab / Online tab / Promos tab                                 |          |

**User's choice:** Two sections, one page. One tab for planes. Programs → separate "Programas" page.

### Plan Creation Form UX — NOT DECIDED

| Option               | Description                            | Selected |
| -------------------- | -------------------------------------- | -------- |
| Dropdown selector    | planCategory dropdown replaces toggles |          |
| Toggle + conditional | Keep online toggle, show sub-selector  |          |
| You decide           | Claude picks                           |          |

**User's response:** "I'm too confused, will try again tomorrow from here."

---

## Claude's Discretion

None identified in this session.

## Deferred Ideas

None raised in this session.

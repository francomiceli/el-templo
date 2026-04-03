# Phase 89: Backend & Admin — "Planes Online" Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 89-planes-online-infra
**Areas discussed:** Rename depth, Plan categorization model, Pipeline calibration scope, Discount code mechanics, Online user session access, Admin tab structure

---

## Rename Depth

| Option                 | Description                                                                         | Selected |
| ---------------------- | ----------------------------------------------------------------------------------- | -------- |
| UI-only rename         | Change display labels only. Code keeps 'personalizada' internally. Fast, zero-risk. |          |
| UI + API response keys | Rename UI labels AND API response field names. Medium effort.                       |          |
| Full code + DB rename  | Rename everything: DB columns, types, services, routes, API, UI. ~50+ files.        | ✓        |

**User's choice:** Full code + DB rename
**Notes:** User wants clean codebase, not legacy naming.

### Follow-up: Code term

| Option                       | Description                                                | Selected |
| ---------------------------- | ---------------------------------------------------------- | -------- |
| goalPlan / goal_plan         | English, clean in code. GoalPlanService, goal_plans table. | ✓        |
| porObjetivos / por_objetivos | Spanish, matches user-facing term. Unusual in code.        |          |
| objective / objectives       | English shorthand. Could confuse with generic 'objective'. |          |

**User's choice:** goalPlan / goal_plan

### Follow-up: Phase fit

| Option                      | Description                                             | Selected |
| --------------------------- | ------------------------------------------------------- | -------- |
| Standalone plan in Phase 89 | One dedicated plan handles full rename within Phase 89. | ✓        |
| Split into Phase 89.1       | Own sub-phase before rest of Phase 89.                  |          |
| Defer, UI-only for now      | Reconsider: UI now, code later.                         |          |

**User's choice:** Standalone plan in Phase 89

### Follow-up: App scope

| Option                             | Description                          | Selected |
| ---------------------------------- | ------------------------------------ | -------- |
| Both apps in this phase            | Admin + member app renamed together. | ✓        |
| Admin only, member app in Phase 90 | Clean separation of concerns.        |          |

**User's choice:** Both apps in this phase

---

## Plan Categorization Model

| Option                                    | Description                                    | Selected |
| ----------------------------------------- | ---------------------------------------------- | -------- |
| New enum column: onlinePlanType           | Add enum replacing booleans. Clean, queryable. |          |
| Two booleans: isGoalPlan + isPersonalized | Keep boolean pattern. Simple but messy.        |          |
| Separate online_plans table               | New table for online plans. Over-engineered.   |          |

**User's choice:** User noted boolean accumulation is tech debt and asked for a better approach.

### Follow-up: Single planCategory enum

| Option                          | Description                                                          | Selected |
| ------------------------------- | -------------------------------------------------------------------- | -------- |
| Single enum replacing booleans  | plan_category: presencial, online_regular, online_goal, online_coach | ✓        |
| Enum + isOnline computed helper | Same enum but keep isOnline as computed property.                    |          |

**User's choice:** Single enum. Noted that existing boolean flags are used extensively for content gating — planner must trace all usages.

### Follow-up: Gym plans affected?

| Option                    | Description                                          | Selected |
| ------------------------- | ---------------------------------------------------- | -------- |
| Completely untouched      | Existing plans get presencial, no functional change. | ✓        |
| Also categorize gym plans | Extend to cover gym plans too.                       |          |

**User's choice:** Completely untouched

---

## Pipeline Calibration Scope

| Option                     | Description                                                                      | Selected |
| -------------------------- | -------------------------------------------------------------------------------- | -------- |
| Analysis + targeted fixes  | Extract baselines, identify deviations, fix algorithm parameters. Report + code. | ✓        |
| Permanent validation layer | Automated quality check on every generation. More infra.                         |          |
| Analysis report only       | Data extraction + report, no code changes.                                       |          |

**User's choice:** Analysis + targeted fixes. Key clarification: approved blocks = gold standard examples. Goal is sessions AS GOOD as approved ones, NOT repetitions. Learn patterns, not copy exercises. Scope of proposed changes is unlimited — will decide after seeing proposals.

### Follow-up: Priority (exercise difficulty vs reps/sets)

**User's choice:** "Why does this matter?" — deferred to planner/researcher to determine based on data analysis.

---

## Discount Code Mechanics

| Option                                  | Description                          | Selected |
| --------------------------------------- | ------------------------------------ | -------- |
| Extend promo_plans with discount fields | Add discount_percent to promo table. |          |
| Fixed discount per code                 | Promo code has fixed override price. |          |
| You decide                              | Claude picks best approach.          |          |

**User's choice:** No promo code infrastructure needed. Sales applies discount manually at assignment using existing priceOverrideAmount field. Zero dev work.

### Follow-up: Distribution

**User's choice:** Same as above — manual at sale time, no codes.

---

## Online User Session Access

| Option                           | Description                                          | Selected |
| -------------------------------- | ---------------------------------------------------- | -------- |
| Always alfa_delta (lowest)       | Online Regular plans always serve beginner sessions. | ✓        |
| Based on onboarding quiz         | Use Phase 78 quiz answer for initial level.          |          |
| Nach assigns level at activation | Admin picks level when assigning plan.               |          |

**User's choice:** Always alfa_delta

### Follow-up: Level progression

| Option                         | Description                            | Selected |
| ------------------------------ | -------------------------------------- | -------- |
| Locked at initial level for v1 | No progression for online users.       | ✓        |
| Self-assessed progression      | User self-promotes after X weeks.      |          |
| Coach decides via WhatsApp     | Manual progression via coach outreach. |          |

**User's choice:** Locked at initial level for v1

---

## Admin Tab Structure

| Option                                                     | Description                                      | Selected |
| ---------------------------------------------------------- | ------------------------------------------------ | -------- |
| 3 tabs: Presenciales, Online, Promos                       | Clean separation. Online shows all 3 categories. | ✓        |
| 4 tabs: Presenciales, Por Objetivos, Personalizado, Promos | More granular, more tabs.                        |          |
| 2 tabs: Planes, Promos                                     | Merge with category filter.                      |          |

**User's choice:** 3 tabs. Personalizado (coach-assisted) goes under Online tab.

### Follow-up: Online tab layout

| Option                        | Description                           | Selected |
| ----------------------------- | ------------------------------------- | -------- |
| Grouped sections              | 3 visual sections per category.       |          |
| Flat list with category badge | All plans in one list, badge per row. | ✓        |
| Sub-tabs within Online        | Nested tabs.                          |          |

**User's choice:** Flat list with category badge

---

## Claude's Discretion

- Migration strategy for boolean→enum conversion
- Weekly price formula
- Edge cases in rename (old session data)
- Pipeline calibration methodology

## Deferred Ideas

- Self-service payment (Mercado Pago in-app)
- Online user level progression
- Exercise video library completion
- Automated permanent session validation layer

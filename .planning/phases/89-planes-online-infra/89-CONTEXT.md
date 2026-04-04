# Phase 89: Backend & Admin — "Planes Online" Infrastructure - Context

**Gathered:** 2026-04-03
**Updated:** 2026-04-03
**Status:** In discussion (partially decided, resuming tomorrow)

<domain>
## Phase Boundary

Rename "personalizadas" to "goalPlan/goal_plan" across the full codebase (DB, types, services, routes, all 3 apps including member app text), replace boolean flags with a `planCategory` enum, restructure admin Planes page into two visual sections (Presenciales + Online) with programs moved to a separate admin page, enable plan creation with weekly price display, refine session pipeline using approved production data, and verify online user session access for all plan categories.

</domain>

<decisions>
## Implementation Decisions

### Full Code + DB Rename (personalizada → goalPlan)

- **D-01:** Full rename across the entire codebase. `personalizada` → `goalPlan`/`goal_plan` everywhere: DB columns, table names, TypeScript types, services, pipeline files, API routes, API response keys, admin UI, member app UI.
- **D-02:** Code naming convention: `goalPlan` (camelCase) / `goal_plan` (snake_case for DB). English in code, "Por Objetivos" in user-facing Spanish UI.
- **D-03:** This is a standalone plan within Phase 89 — handled as a dedicated plan before other work builds on the new naming.
- **D-04:** Both admin and member app renamed in this phase (not deferred to Phase 90). **Includes user-facing text** — labels that say "Personalizada" change to "Por Objetivos" in both apps. Phase 90 handles UX redesign only.
- **D-05:** "Personalizado" (the $80k coach-assisted tier) is a SEPARATE concept from the old "personalizadas." In the new naming: goalPlan = auto-generated pipeline plans (Por Objetivos), coachAssisted/online_coach = premium coach-built plans (Personalizado).

### Plan Categorization Model

- **D-06:** New `plan_category` enum column on subscription_plans: `presencial` | `online_regular` | `online_goal` | `online_coach`. Replaces `isPersonalizada` and `isOnline` booleans.
- **D-07:** `goalPlanType` (renamed from `personalizadaType`) remains for `online_goal` plans to specify which pipeline type (front_lever, tren_inferior, etc.).
- **D-08:** Existing gym subscription plans set to `presencial` via migration. Completely untouched functionally — zero risk to current operations.
- **D-09:** Planner/researcher MUST trace ALL usages of `isPersonalizada` and `isOnline` across the entire codebase (API, admin, member app) to ensure every conditional branch is updated to use `planCategory`. These flags are used extensively for content gating, session access, UI display, and feature toggling.
- **D-10:** `isTrial` and `isGroup` booleans remain — they're orthogonal concerns unrelated to plan category.

### Online Product Architecture

- **D-25:** Online products use a **plan + linked program** model. `subscription_plan` handles pricing, access, session type (via planCategory). Optionally linked to a `micro_program` for content blocks and weekly progression. Assigning a plan with a linked program auto-enrolls the member in that program.
- **D-26:** subscription_plans is the single entity for ALL plan types (presencial + online). No separate "online product" table. planCategory enum is the sole distinguisher.

### Admin Page Structure

- **D-20 (REVISED):** PlanesPage has ONE "Planes" tab with TWO visual sections: **Presenciales** table (plans where planCategory=presencial) and **Online** table (plans where planCategory=online\_\*). Plus **Promos** tab (unchanged from Phase 86).
- **D-27:** Programs (micro-programs from Phase 83) moved to a **separate "Programas" admin page**. No longer a tab within PlanesPage. This is a new route/page in the admin sidebar.
- **D-21 (REVISED):** Online section shows all online plans in a flat list with category badges (Regular / Por Objetivos / Coach) on each row.
- **D-23:** Weekly price auto-calculated from monthly price and displayed alongside it (computed, not stored).

### Plan Creation Form — OPEN (resuming next session)

- **D-22 (PARTIALLY DECIDED):** Plan creation form needs to replace `isPersonalizada` + `isOnline` toggles with planCategory selection. **UX pattern not yet decided** — dropdown selector vs toggle+conditional. goalPlanType selector still shown conditionally for online_goal plans.
- Fields confirmed: name, description, duration, sessions/week, monthly price, plan category, goalPlanType selector (only for goal category), target audience tags.

### Assignment Flow — OPEN (resuming next session)

- How AssignPlanDialog behaves for online plans (schedule picker irrelevant, different fields?)
- Whether plan↔program linking triggers auto-enrollment on assignment

### Pipeline Calibration

- **D-11:** Approved general session blocks since Feb 16, 2026 (~585 blocks, ~6.5 weeks × 6 days × 3 level groups × 5 blocks) are the gold standard. Personalizadas NOT included in the analysis pool.
- **D-12:** Analyze the full pipeline (all 7 stages) to identify WHERE the algorithm systematically deviates from approved patterns. Both exercise difficulty selection AND reps/sets prescription are problem areas.
- **D-13:** Goal: auto-generated sessions as good as approved ones WITHOUT becoming repetitive. The approved data reveals PATTERNS (difficulty distributions, prescription ranges, format preferences per route/level) — not exercises to copy. The algorithm should learn "what good looks like" not "reproduce these exact sessions."
- **D-14:** Deliverable: analysis report identifying specific deviations + actual code changes to fix them. Scope of proposed changes is unlimited — researcher/planner should propose whatever fixes are needed and we'll decide.
- **D-15:** Existing `compare-algorithm.ts` validation infrastructure and `traceJson`/`algorithmSnapshot` fields are available for analysis.

### Discount Mechanics

- **D-16:** No promo code infrastructure needed for member discounts. When Nach sells to an existing gym member via WhatsApp at a discount, admin assigns the plan with a manual price override using the existing `priceOverrideAmount` + `priceOverrideReason` fields on subscriptions. Zero dev work for this requirement.

### Online User Session Access

- **D-17:** Online Regular plan users (Desde Cero, Hábitos) always get `alfa_delta` (lowest) level sessions. No level selection at purchase.
- **D-18:** No level progression for online users in v1. They stay at alfa_delta for the duration of their plan. Progression requires coach evaluation which doesn't exist online.
- **D-19:** Online Regular plans use the same weekly sessions as physical branches — member's Week 1 = whatever the current production week is.

### WhatsApp CTA

- **D-24:** Pre-filled WhatsApp message includes plan name and weekly price. Template: "Hola! Me interesa el plan [Name] ($X/semana). Quiero más info." Applied in both admin (plan details) and member app (plan cards).

### Claude's Discretion

- Migration strategy for boolean→enum conversion (whether to add enum first alongside booleans, then drop booleans, or do it in one step)
- Exact weekly price formula (monthly price × plan duration / weeks, or simple monthly/4.33)
- How to handle edge cases in the rename (e.g., existing approved sessions with old personalizadaType field — rename in DB or keep old values with mapping)
- Pipeline calibration analysis methodology (which statistical measures to use, how to define "deviation threshold")

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Strategy & Requirements

- `.docs/planes-online-strategy.md` — Full strategy document with products, pricing, marketing, all business decisions
- `.planning/ROADMAP.md` § v4.5 — Phase 89 requirements MON-01 through MON-10

### Existing Infrastructure (must understand before changing)

- `el-templo-api/src/db/schema/subscription-plans.ts` — Current plan schema with isPersonalizada, isOnline, personalizadaType
- `el-templo-api/src/db/schema/subscriptions.ts` — Subscription records with priceOverrideAmount
- `el-templo-api/src/db/schema/member-personalizadas.ts` — Member goalplan enrollment table (to be renamed)
- `el-templo-api/src/modules/personalizadas/` — Service, constants, types for current personalizada system (to be renamed)
- `el-templo-api/src/modules/sessions/pipeline/` — 7-stage session generation pipeline
- `el-templo-api/src/modules/sessions/pipeline/personalizada-pipeline.ts` — Goal-plan specific pipeline variant
- `el-templo-api/src/modules/sessions/validation/compare-algorithm.ts` — Existing validation against coach examples

### Pipeline Diagnostics

- `REP_COUNT_DIAGNOSIS.md` — 3 specific pipeline bugs found: ISO phantom weight, multi-round format reps, INITIUM reps too low
- `SESSION_PIPELINE_ADMIN_EDIT_REFACTOR_PLAN.md` — 87 findings across pipeline, admin API, admin frontend (critical: missing ownership validation, no DB transactions)

### Admin UI (must read to understand current state)

- `el-templo-admin/src/pages/PlanesPage.vue` — Current 3-tab layout (Planes de Suscripcion / Planes Personalizados / Promos) to be restructured
- `el-templo-admin/src/components/PlanFormDialog.vue` — Plan creation form with isPersonalizada/isOnline toggles to be replaced with planCategory
- `el-templo-admin/src/components/AssignPlanDialog.vue` — Plan assignment stepper (select plan → pricing → schedule → confirm)
- `el-templo-admin/src/components/ProgramWizardDialog.vue` — Program creation wizard (to be moved to new Programas page)
- `el-templo-admin/src/components/ProgramEnrollmentSection.vue` — Program enrollment UI

### Prior Phase Context

- `.planning/phases/83-micro-program-upsells/83-CONTEXT.md` — Program enrollment gates personalizada access (D-08), PlanesPage catalog (D-18)
- `.planning/phases/86-qr-promo-free-month-campaign/86-CONTEXT.md` — Promo plans infrastructure, admin promos tab

### Research Data

- `.planning/research/app-engagement-upselling-research.md` — Competitive research and engagement initiatives

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `compare-algorithm.ts` — Validation framework comparing outputs to coach examples. Can be extended to compare against approved session pool.
- `priceOverrideAmount` + `priceOverrideReason` on subscriptions — Already supports manual discounting. No new discount infrastructure needed.
- Promo plans table and admin UI from Phase 86 — Available if discount codes are needed later.
- `ProgramWizardDialog.vue` — Admin wizard pattern reusable for online plan creation.

### Established Patterns

- Boolean flags on subscription_plans for plan categorization — being REPLACED by enum in this phase.
- Personalizada route maps in `constants.ts` — Static mapping of goalPlanType → routes per block. Will be renamed but pattern stays.
- Constructor DI pattern for services (Phase 56+) — PersonalizadasService will become GoalPlanService following same pattern.
- Manual migration SQL pattern (Phase 86) — For enum addition and data migration.

### Integration Points

- `subscription_plans.isPersonalizada` used in: subscription assignment, session access checks, member app content gating, admin plan filtering, booking logic, plan display. ALL must be migrated to planCategory.
- `subscription_plans.isOnline` used in: registration flow, reservas tab visibility, session access, check-in bypass. ALL must be migrated.
- Session generation: `personalizadaType` field on sessions table determines which pipeline variant was used. Needs rename + migration.
- Phase 83 micro-programs: enrollment gates personalizada access via `isPersonalizada` check — must be updated to use planCategory.

### Current Admin PlanesPage Structure (as of this session)

- **Tab 1 "Planes de Suscripcion"**: QTable of subscription_plans (Name, Tier, Precio, Duracion, Clases/Sem, Estado). PlanFormDialog for create/edit.
- **Tab 2 "Planes Personalizados"**: QTable of micro_programs (Nombre, Precio, Duracion weeks, Sesiones/Sem, Estado). ProgramWizardDialog for create/edit.
- **Tab 3 "Promos"**: QTable of promo_plans (Nombre, Codigo, Duracion, Tipo, Periodo, Usos, Estado). PromoFormDialog for create.
- **PlanFormDialog fields**: name, description, tier, bookingMode, priceRegular, priceZero, priceCreditCard, durationDays, classesPerWeek, toggles (multiBranch, isTrial, isGroup, isPersonalizada, isOnline), conditional personalizadaType selector, conditional groupMaxMembers.
- **AssignPlanDialog**: 3-4 step stepper (Select plan by tier → Pricing/discounts → Fixed schedule slots [conditional] → Confirm). Supports price override, AURA discount, boarding pass.

</code_context>

<specifics>
## Specific Ideas

- "Vendemos solución a un problema, no un entrenamiento" — core marketing principle that should inform how plans are named and described in the admin/app
- Plan names: "Calistenia Desde Cero", "Construcción de Hábitos", "Glúteos & Piernas", "Tu Primer Front Lever", "Plan Personalizado"
- Weekly price always shown prominently — this is the primary price display, not monthly
- Promo video concept: OBS app flow + training footage, hook "¿Te gustaría hacer este movimiento?"

</specifics>

<deferred>
## Deferred Ideas

- Self-service payment integration (Mercado Pago in-app) — future phase when volume justifies it
- Online user level progression — requires building an online evaluation system
- Exercise video library completion — content work happening in parallel, not blocking this phase
- Full onboarding quiz for online users — Phase 78 built this for gym members, could be adapted for online
- Automated session quality validation layer (permanent, running on every generation) — could be a follow-up to the calibration work

</deferred>

---

_Phase: 89-planes-online-infra_
_Context gathered: 2026-04-03 (updated same day, discussion incomplete)_

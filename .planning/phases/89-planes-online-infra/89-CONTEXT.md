# Phase 89: Backend & Admin — "Planes Online" Infrastructure - Context

**Gathered:** 2026-04-03
**Updated:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Full code+DB rename personalizada→goalPlan, replace boolean flags with a `planCategory` enum, unify the plan+program model (every program enrollment comes from a plan assignment, no orphan programs), eliminate `member_personalizadas` table (program enrollments replace it), remove duration picker (20/40/60), restructure admin Planes page into Presenciales/Online sections with programs on a separate admin page, enable plan creation with linked programs and weekly price display, refine session pipeline using approved production data, and verify online user session access for all plan categories.

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
- **D-07 (REVISED):** `goalPlanType` lives on `micro_programs`, NOT on `subscription_plans`. The plan links to a program via `linkedProgramId`; the program defines which goal route to use. Subscription_plans no longer has a goalPlanType/personalizadaType column.
- **D-08:** Existing gym subscription plans set to `presencial` via migration. Completely untouched functionally — zero risk to current operations.
- **D-09:** Planner/researcher MUST trace ALL usages of `isPersonalizada` and `isOnline` across the entire codebase (API, admin, member app) to ensure every conditional branch is updated to use `planCategory`. These flags are used extensively for content gating, session access, UI display, and feature toggling.
- **D-10:** `isTrial` and `isGroup` booleans remain — they're orthogonal concerns unrelated to plan category.

### Unified Plan + Program Model

- **D-25 (REVISED):** Every online plan MUST have a `linkedProgramId` FK to `micro_programs`. No online plan without a linked program. Presencial plans have `linkedProgramId = null`.
- **D-26:** `subscription_plans` is the single entity for ALL plan types (presencial + online). No separate "online product" table. `planCategory` enum is the sole distinguisher.
- **D-28:** `member_personalizadas` table is ELIMINATED. Program enrollments (`program_enrollments`) replace it entirely. Goal route tracking and session progression go through the program system.
- **D-29:** Duration picker (20/40/60 min) removed from everywhere. No per-duration session filtering, no `PersonalizadaDuration` type, no `filterBlocksByDuration()`, no `DurationPicker` component. Member gets their session for the day — full session.
- **D-30:** `micro_programs` gets a nullable `goalPlanType` column (varchar). Programs WITH a goalPlanType trigger the goal pipeline (route-locked sessions via `PERSONALIZADA_ROUTE_MAP`). Programs WITHOUT it are content-only (videos, PDFs, weekly progression) and the member gets regular sessions from the standard pipeline.
- **D-31:** `program_enrollments.currentWeek` replaces `semana20/40/60` counters. One linear progression counter. Member is "on week N of their program" regardless of anything else. Week advances when `sessionsCompletedThisWeek >= program.sessionsPerWeekToAdvance`.
- **D-33:** Goal session access gate is ONE check: active program enrollment where `program.goalPlanType IS NOT NULL`. No more dual gate (subscription flag check + enrollment check). Backend and frontend use the same logic.
- **D-34:** Assigning an online plan auto-creates `program_enrollment` from `plan.linkedProgramId`. One admin action → subscription record + program enrollment record.
- **D-35:** Subscription constraint changes from "one active per member" to **"one presencial + one online max"** per member. A gym member can have their presencial subscription AND an online plan simultaneously.
- **D-36:** Program enrollment is ONLY created through plan assignment. No separate "enroll in program" action. The Programas admin page is catalog management only (create/edit programs, add content blocks). Enrollment happens through AssignPlanDialog.
- **D-37:** `program_enrollments.paymentAmount/paymentMethod` are no longer the billing mechanism for upsells. All billing goes through subscription pricing. These columns can be kept for audit or removed — Claude's discretion.

### Admin Page Structure

- **D-20 (REVISED):** PlanesPage has ONE "Planes" tab with TWO visual sections: **Presenciales** table (plans where planCategory=presencial) and **Online** table (plans where planCategory=online\_\*). Plus **Promos** tab (unchanged from Phase 86).
- **D-27:** Programs (micro-programs) on a **separate "Programas" admin page**. New route/page in admin sidebar. This page is for creating/editing program definitions and content blocks — NOT for enrollment (enrollment happens through plan assignment per D-36).
- **D-21 (REVISED):** Online section shows all online plans in a flat list with category badges (Regular / Por Objetivos / Coach) on each row.
- **D-23:** Weekly price auto-calculated from monthly price and displayed alongside it (computed, not stored).

### Plan Creation Form

- **D-22 (RESOLVED):** Plan creation form replaces `isPersonalizada` + `isOnline` toggles with a `planCategory` selector. For online plans, a `linkedProgramId` dropdown shows available programs. goalPlanType is NOT on this form — it's set when creating the program on the Programas page. For presencial plans, linkedProgramId is hidden/null.
- Fields: name, description, planCategory, duration, sessions/week (presencial only), monthly price, linkedProgramId (online only), isTrial, isGroup, multiBranch toggles, bookingMode (presencial only), planTier (presencial only, defaults to 'other' for online).

### Assignment Flow

- **D-38:** AssignPlanDialog for online plans: **skip the schedule slot picker step** (online plans don't book physical classes). Flow: select plan → pricing/options → confirm.
- **D-39:** On assignment of any plan with `linkedProgramId`: auto-create `program_enrollment` (programId from plan, currentWeek=1, sessionsCompletedThisWeek=0, status=active).
- **D-40:** For presencial members buying a program: admin assigns the online plan via the same AssignPlanDialog. Member ends up with two subscriptions (presencial + online). Same flow, no special case.

### Pipeline Calibration

- **D-11:** Approved general session blocks since Feb 16, 2026 (~585 blocks, ~6.5 weeks x 6 days x 3 level groups x 5 blocks) are the gold standard. Personalizadas NOT included in the analysis pool.
- **D-12:** Analyze the full pipeline (all 7 stages) to identify WHERE the algorithm systematically deviates from approved patterns. Both exercise difficulty selection AND reps/sets prescription are problem areas.
- **D-13:** Goal: auto-generated sessions as good as approved ones WITHOUT becoming repetitive. The approved data reveals PATTERNS (difficulty distributions, prescription ranges, format preferences per route/level) — not exercises to copy. The algorithm should learn "what good looks like" not "reproduce these exact sessions."
- **D-14:** Deliverable: analysis report identifying specific deviations + actual code changes to fix them. Scope of proposed changes is unlimited — researcher/planner should propose whatever fixes are needed and we'll decide.
- **D-15:** Existing `compare-algorithm.ts` validation infrastructure and `traceJson`/`algorithmSnapshot` fields are available for analysis.

### Discount Mechanics

- **D-16:** No promo code infrastructure needed for member discounts. When Nach sells to an existing gym member via WhatsApp at a discount, admin assigns the plan with a manual price override using the existing `priceOverrideAmount` + `priceOverrideReason` fields on subscriptions. Zero dev work for this requirement.

### Online User Session Access

- **D-17:** Online Regular plan users (Desde Cero, Habitos) always get `alfa_delta` (lowest) level sessions from the REGULAR pipeline. No level selection at purchase. Their linked program provides content (videos, PDFs), not goal sessions.
- **D-18:** No level progression for online users in v1. They stay at alfa_delta for the duration of their plan. Progression requires coach evaluation which doesn't exist online.
- **D-19:** Online Regular plans use the same weekly sessions as physical branches — member's Week 1 = whatever the current production week is.

### WhatsApp CTA

- **D-24:** Pre-filled WhatsApp message includes plan name and weekly price. Template: "Hola! Me interesa el plan [Name] ($X/semana). Quiero mas info." Applied in both admin (plan details) and member app (plan cards).

### Claude's Discretion

- Migration strategy for boolean→enum conversion (add enum alongside booleans then drop, or single-step)
- Exact weekly price formula (monthly price x plan duration / weeks, or simple monthly/4.33)
- How to handle existing `member_personalizadas` data during elimination (migrate session counters to program enrollments as currentWeek, or discard since no production members have active personalizadas yet)
- How to handle existing `personalizadaType` values on `sessions` and `completed_sessions` tables (rename column or keep old values with mapping)
- Pipeline calibration analysis methodology (statistical measures, deviation thresholds)
- Whether to keep or remove `program_enrollments.paymentAmount/paymentMethod` columns (D-37)
- Default values for `planTier` and `bookingMode` on online plans (likely 'other' and 'flexible')

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Strategy & Requirements

- `.docs/planes-online-strategy.md` — Full strategy document with products, pricing, marketing, all business decisions
- `.planning/ROADMAP.md` § v4.5 — Phase 89 requirements MON-01 through MON-10

### Existing Infrastructure (must understand before changing)

- `el-templo-api/src/db/schema/subscription-plans.ts` — Current plan schema with isPersonalizada, isOnline, personalizadaType (all being replaced)
- `el-templo-api/src/db/schema/subscriptions.ts` — Subscription records with priceOverrideAmount; constraint changing to allow one presencial + one online
- `el-templo-api/src/db/schema/member-personalizadas.ts` — Table being ELIMINATED. Must understand current usage to migrate away.
- `el-templo-api/src/db/schema/micro-programs.ts` — Program definitions, getting new `goalPlanType` column
- `el-templo-api/src/db/schema/program-enrollments.ts` — Enrollment tracking, becoming the unified enrollment system (replaces member_personalizadas)
- `el-templo-api/src/modules/personalizadas/service.ts` — PersonalizadasService reads member_personalizadas for goal route + semana counters. Must be rewritten to read from program_enrollments + micro_programs.goalPlanType
- `el-templo-api/src/modules/personalizadas/constants.ts` — PERSONALIZADA_ROUTE_MAP, PERSONALIZADA_METADATA — route maps stay, just accessed via program.goalPlanType instead
- `el-templo-api/src/modules/subscriptions/service.ts` — assignPlan() line ~680 auto-creates member_personalizadas; must change to auto-create program_enrollment. Also: subscription constraint enforcement needs update for one-presencial-one-online rule.
- `el-templo-api/src/modules/sessions/pipeline/personalizada-pipeline.ts` — Goal-plan specific pipeline variant (to be renamed goal-plan-pipeline.ts)
- `el-templo-api/src/modules/sessions/validation/compare-algorithm.ts` — Existing validation against coach examples

### Pipeline Diagnostics

- `REP_COUNT_DIAGNOSIS.md` — 3 specific pipeline bugs found: ISO phantom weight, multi-round format reps, INITIUM reps too low
- `SESSION_PIPELINE_ADMIN_EDIT_REFACTOR_PLAN.md` — 87 findings across pipeline, admin API, admin frontend

### Admin UI (must read to understand current state)

- `el-templo-admin/src/pages/PlanesPage.vue` — Current 3-tab layout to be restructured into Presenciales/Online sections + Promos tab
- `el-templo-admin/src/components/PlanFormDialog.vue` — Plan creation form; isPersonalizada/isOnline toggles replaced with planCategory + linkedProgramId
- `el-templo-admin/src/components/AssignPlanDialog.vue` — Plan assignment stepper; skip schedule step for online, auto-enroll in program
- `el-templo-admin/src/components/ProgramWizardDialog.vue` — Program creation wizard (moves to new Programas page, gets goalPlanType field)
- `el-templo-admin/src/components/ProgramEnrollmentSection.vue` — Program enrollment UI on member detail page; to be REMOVED since enrollment only happens through plan assignment (D-36)

### Member App (duration picker removal + store changes)

- `el-templo-app/src/stores/useUserStore.ts` — hasActivePersonalizada computed; must change to check program enrollment with goalPlanType
- `el-templo-app/src/modules/personalizada/` — Entire module being renamed to goal-plan; duration picker components removed

### Prior Phase Context

- `.planning/phases/83-micro-program-upsells/83-CONTEXT.md` — Program enrollment system design. D-08 (program gates personalizada) is being simplified: program enrollment is now the ONLY gate, and it's always created through plan assignment.
- `.planning/phases/86-qr-promo-free-month-campaign/86-CONTEXT.md` — Promo plans infrastructure, admin promos tab

### Research Data

- `.planning/research/app-engagement-upselling-research.md` — Competitive research and engagement initiatives

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `compare-algorithm.ts` — Validation framework comparing outputs to coach examples. Can be extended to compare against approved session pool.
- `priceOverrideAmount` + `priceOverrideReason` on subscriptions — Already supports manual discounting. No new discount infrastructure needed.
- `ProgramWizardDialog.vue` — Existing program creation wizard; add goalPlanType field selector and move to Programas page.
- `program_enrollments` table — Already has currentWeek, sessionsCompletedThisWeek, weekUnlockedAt. Ready to replace member_personalizadas with minimal schema changes.
- `PERSONALIZADA_ROUTE_MAP` constants — Route maps per goal type. Still needed, just accessed via `program.goalPlanType` instead of `member_personalizadas.personalizadaType`.

### Established Patterns

- Constructor DI pattern for services (Phase 56+) — PersonalizadasService → GoalPlanService following same pattern.
- Manual migration SQL pattern (Phase 86) — For enum addition and data migration.
- Conditional stepper step pattern (Phase 60) — AssignPlanDialog already skips schedule step conditionally via computed `confirmStep`. Same pattern for online plans.
- Per-route auth pattern (Phase 83) — Used in programs plugin for mixed role permissions.

### Integration Points

- `subscription_plans.isPersonalizada` used in: subscription assignment, session access checks, member app content gating, admin plan filtering, booking logic, plan display. ALL must be migrated to planCategory + program enrollment check.
- `subscription_plans.isOnline` used in: registration flow, reservas tab visibility, session access, check-in bypass. ALL must be migrated to planCategory.
- Session generation: `personalizadaType` field on sessions table determines which pipeline variant was used. Needs rename to goalPlanType; value now comes from micro_programs.goalPlanType.
- Phase 83 micro-programs: enrollment gates via `isPersonalizada` check — replaced by unified program enrollment gate (D-33).
- Subscription service `assignPlan()` line ~680: auto-calls `personalizadasService.selectPersonalizada()` — replaced by auto-creating program_enrollment from plan.linkedProgramId (D-34/D-39).

</code_context>

<specifics>
## Specific Ideas

- "Vendemos solucion a un problema, no un entrenamiento" — core marketing principle that should inform how plans are named and described in the admin/app
- Plan names: "Calistenia Desde Cero", "Construccion de Habitos", "Gluteos & Piernas", "Tu Primer Front Lever", "Plan Personalizado"
- Weekly price always shown prominently — this is the primary price display, not monthly
- Promo video concept: OBS app flow + training footage, hook "Te gustaria hacer este movimiento?"
- Programs are the universal container for structured training: some have goals (pipeline sessions), some are content-only (regular sessions + weekly content)

</specifics>

<deferred>
## Deferred Ideas

- Self-service payment integration (Mercado Pago in-app) — future phase when volume justifies it
- Online user level progression — requires building an online evaluation system
- Exercise video library completion — content work happening in parallel, not blocking this phase
- Full onboarding quiz for online users — Phase 78 built this for gym members, could be adapted for online
- Automated session quality validation layer (permanent, running on every generation) — could be a follow-up to the calibration work
- Multiple online subscriptions per member (e.g., Front Lever + Habitos simultaneously) — v1 is one presencial + one online max

</deferred>

---

_Phase: 89-planes-online-infra_
_Context gathered: 2026-04-03 (updated 2026-04-04, discussion complete)_

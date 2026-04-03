# Phase 89: Backend & Admin -- "Planes Online" Infrastructure - Research

**Researched:** 2026-04-03
**Domain:** Full codebase rename (personalizada -> goalPlan), boolean-to-enum migration, admin UI restructure, pipeline calibration
**Confidence:** HIGH

## Summary

This phase involves a comprehensive rename+refactor across all 3 codebases (API, admin, member app), a schema migration replacing two boolean flags with a single enum, admin UI tab restructuring, weekly price calculation, and pipeline calibration using production data. The research below maps every single usage of the affected identifiers and flags across the entire codebase.

The rename touches 6 DB tables (subscription_plans, member_personalizadas, sessions, completed_sessions, aura_config, aura_transactions), 2 enum value lists in aura schemas, an entire API module (personalizadas/ with 6 files), the subscriptions module (service, types, schemas, routes), the admin app (types, composables, 6 pages/components), the member app (an entire personalizada module with 8+ files, stores, composable, routes), and integration tests.

**Primary recommendation:** Execute in strict waves: (1) DB migration + schema rename, (2) API service/route rename, (3) Boolean-to-enum migration, (4) Admin UI restructure, (5) Member app rename, (6) Pipeline calibration, (7) Test updates. Each wave should be independently deployable.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- D-01: Full rename across entire codebase. personalizada -> goalPlan/goal_plan everywhere: DB columns, table names, TypeScript types, services, pipeline files, API routes, API response keys, admin UI, member app UI.
- D-02: Code naming convention: goalPlan (camelCase) / goal_plan (snake_case for DB). English in code, "Por Objetivos" in user-facing Spanish UI.
- D-03: Rename is a standalone plan within Phase 89 -- handled as a dedicated plan before other work builds on the new naming.
- D-04: Both admin and member app renamed in this phase (not deferred to Phase 90).
- D-05: "Personalizado" ($80k coach-assisted tier) is SEPARATE from old "personalizadas." New naming: goalPlan = auto-generated pipeline plans, coachAssisted/online_coach = premium coach-built plans.
- D-06: New plan_category enum on subscription_plans: presencial | online_regular | online_goal | online_coach. Replaces isPersonalizada and isOnline booleans.
- D-07: goalPlanType (renamed from personalizadaType) remains for online_goal plans to specify pipeline type.
- D-08: Existing gym plans set to presencial via migration. Zero functional impact.
- D-09: Planner/researcher MUST trace ALL usages of isPersonalizada and isOnline across entire codebase.
- D-10: isTrial and isGroup booleans remain -- orthogonal concerns.
- D-11: Approved general session blocks since Feb 16 2026 (~585 blocks) are the gold standard.
- D-12: Analyze full pipeline (all 7 stages) to identify systematic deviations from approved patterns.
- D-13: Goal: auto-generated sessions as good as approved ones WITHOUT becoming repetitive.
- D-14: Deliverable: analysis report + actual code changes.
- D-15: Existing compare-algorithm.ts and traceJson/algorithmSnapshot available for analysis.
- D-16: Discount via manual price override -- zero dev work needed.
- D-17: Online Regular plan users always get alfa_delta (lowest) level sessions.
- D-18: No level progression for online users in v1.
- D-19: Online Regular plans use same weekly sessions as physical branches.
- D-20: Admin Planes page reorganized: Presenciales, Online, Promos tabs.
- D-21: Online tab shows all 3 categories in flat list with badges.
- D-22: Plan creation form: name, description, duration, sessions/week, monthly price, plan category, goalPlanType selector, target audience tags.
- D-23: Weekly price auto-calculated from monthly price (computed, not stored).
- D-24: WhatsApp CTA includes plan name and weekly price.

### Claude's Discretion

- Migration strategy for boolean->enum conversion
- Exact weekly price formula
- How to handle existing approved sessions with old personalizadaType field
- Pipeline calibration analysis methodology

### Deferred Ideas (OUT OF SCOPE)

- Self-service payment integration (Mercado Pago)
- Online user level progression
- Exercise video library completion
- Full onboarding quiz for online users
- Automated session quality validation layer
  </user_constraints>

## Complete Flag & Identifier Inventory

### 1. `isPersonalizada` -- Every Usage Across All 3 Codebases

**Total unique locations (excluding .claude/worktrees and .planning docs): 31 code references**

#### el-templo-api (Backend)

| File                                         | Line(s)                    | Usage                                                                                                          | Migration Action                                                                          |
| -------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/db/schema/subscription-plans.ts`        | 35                         | Column definition: `isPersonalizada: boolean("is_personalizada").default(false).notNull()`                     | REMOVE column, replace with planCategory enum                                             |
| `src/modules/subscriptions/types.ts`         | 53, 92, 111                | `isPersonalizada: boolean` on PlanListItem, `isPersonalizada?: boolean` on CreatePlanInput and UpdatePlanInput | Replace with `planCategory` field                                                         |
| `src/modules/subscriptions/schemas.ts`       | 33, 164, 211               | `isPersonalizada: { type: "boolean" }` in planSchema, createPlanSchema, updatePlanSchema                       | Replace with `planCategory: { type: "string", enum: [...] }`                              |
| `src/modules/subscriptions/service.ts`       | 117-118                    | `if (input.isPersonalizada)` -- validates personalizadaType when creating plans                                | Change to `if (input.planCategory === 'online_goal')` check for goalPlanType              |
| `src/modules/subscriptions/service.ts`       | 146-148                    | `isPersonalizada: input.isPersonalizada ?? false` in INSERT                                                    | Replace with `planCategory: input.planCategory ?? 'presencial'`                           |
| `src/modules/subscriptions/service.ts`       | 192-204                    | `isPersonalizada` in updatePlan logic                                                                          | Replace with planCategory update logic                                                    |
| `src/modules/subscriptions/service.ts`       | 680                        | `if (plan.isPersonalizada && plan.personalizadaType)` -- auto-assign personalizada on plan assign              | Change to `if (plan.planCategory === 'online_goal' && plan.goalPlanType)`                 |
| `src/modules/subscriptions/service.ts`       | 1161                       | Same pattern on plan change                                                                                    | Same migration                                                                            |
| `src/modules/subscriptions/service.ts`       | 1384                       | Same pattern on renewal                                                                                        | Same migration                                                                            |
| `src/modules/subscriptions/service.ts`       | 1730                       | `isPersonalizada: row.isPersonalizada` in mapPlanRow                                                           | Replace with `planCategory: row.planCategory`                                             |
| `src/modules/subscriptions/member-routes.ts` | 54, 71, 99, 110, 117-121   | GET /me/subscription and GET /plans -- queries isPersonalizada, includes in response, sorts by it              | Replace with planCategory throughout                                                      |
| `src/modules/personalizadas/service.ts`      | 130                        | `eq(schema.subscriptionPlans.isPersonalizada, true)` in checkSubscription                                      | Change to `inArray(schema.subscriptionPlans.planCategory, ['online_goal'])` or equivalent |
| `src/modules/personalizadas/service.ts`      | 230                        | Same pattern in getCycleStats                                                                                  | Same migration                                                                            |
| `test/personalizadas/personalizadas.test.ts` | 59, 226, 238, 256          | `isPersonalizada: true` in test plan creation                                                                  | Update test fixtures                                                                      |
| `test/subscriptions/member-plans.test.ts`    | 93, 138, 151, 164, 178-179 | `isPersonalizada` assertions in member plans tests                                                             | Update test assertions                                                                    |

#### el-templo-admin (Admin App)

| File                                | Line(s)                               | Usage                                                                        | Migration Action                                                         |
| ----------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/types/subscription.ts`         | 90, 119, 138                          | `isPersonalizada: boolean` on PlanListItem, CreatePlanInput, UpdatePlanInput | Replace with `planCategory`                                              |
| `src/components/PlanFormDialog.vue` | 133, 142, 235, 300, 319, 329, 360-362 | Toggle v-model, form state, edit/create watchers, submit payload             | Replace toggle with planCategory select; conditionally show goalPlanType |

#### el-templo-app (Member App)

| File                                                    | Line(s)     | Usage                                                                                                                                           | Migration Action                                       |
| ------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/stores/useUserStore.ts`                            | 48, 113-116 | `isPersonalizada: boolean` on MemberSubscription; `hasActivePersonalizada` computed (NOTE: already migrated to use program enrollment per D-08) | Remove isPersonalizada from MemberSubscription type    |
| `src/modules/plan/pages/PlanesPage.vue`                 | 148         | `isPersonalizada: boolean` in MemberPlan interface                                                                                              | Replace with `planCategory`                            |
| `src/modules/progression/components/SessionCtaCard.vue` | 20, 64      | `isPersonalizada` prop and template conditional                                                                                                 | Rename prop or derive from planCategory                |
| `src/modules/progression/pages/MiTemplo.vue`            | 94, 216     | Passes isPersonalizada prop, computed uses `hasActivePersonalizada`                                                                             | Already uses program enrollment gate; prop name update |

### 2. `isOnline` -- Every Usage Across All 3 Codebases

**Total unique locations (excluding duplicates): 17 code references**

#### el-templo-api (Backend)

| File                                         | Line(s)        | Usage                                                                        | Migration Action                        |
| -------------------------------------------- | -------------- | ---------------------------------------------------------------------------- | --------------------------------------- |
| `src/db/schema/subscription-plans.ts`        | 38             | Column definition: `isOnline: boolean("is_online").default(false).notNull()` | REMOVE column, replaced by planCategory |
| `src/modules/subscriptions/types.ts`         | 56, 95, 114    | PlanListItem, CreatePlanInput, UpdatePlanInput                               | Replace with planCategory               |
| `src/modules/subscriptions/schemas.ts`       | 36, 177, 225   | JSON schemas for plan CRUD                                                   | Replace with planCategory enum          |
| `src/modules/subscriptions/service.ts`       | 151, 198, 1733 | createPlan INSERT, updatePlan, mapPlanRow                                    | Replace with planCategory               |
| `src/modules/subscriptions/member-routes.ts` | 111            | `isOnline: p.isOnline` in GET /plans response                                | Replace with planCategory               |
| `seed-promos.ts`                             | 53             | `isOnline: true` in promo seed                                               | Update seed                             |
| `test/subscriptions/promo-plans.test.ts`     | 42             | `isOnline: true` in test fixture                                             | Update test                             |
| `test/auth/promo-registration.test.ts`       | 34             | `isOnline: true` in test fixture                                             | Update test                             |

#### el-templo-admin (Admin App)

| File                                | Line(s)                 | Usage                                                            | Migration Action                        |
| ----------------------------------- | ----------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| `src/types/subscription.ts`         | 93, 122, 141            | PlanListItem, CreatePlanInput, UpdatePlanInput                   | Replace with planCategory               |
| `src/components/PlanFormDialog.vue` | 136, 238, 303, 322, 365 | Toggle v-model, form state, edit/create watchers, submit payload | Remove toggle, derive from planCategory |

#### el-templo-app (Member App)

| File                                    | Line(s) | Usage                                                                           | Migration Action                                    |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| `src/modules/plan/pages/PlanesPage.vue` | 149     | `isOnline: boolean` in MemberPlan interface                                     | Replace with planCategory                           |
| `src/pages/ReservasPage.vue`            | 9, 352  | `isOnlineUser` computed -- but this uses `branchIsVirtual`, NOT `isOnline` flag | No change needed -- uses branch data, not plan flag |
| `src/pages/ReservasPageLegacy.vue`      | 9, 258  | Same pattern as ReservasPage                                                    | No change needed                                    |

**IMPORTANT:** The `isOnlineUser` computed in ReservasPage/ReservasPageLegacy does NOT use the `isOnline` plan flag. It uses `userStore.profile?.branchIsVirtual`. This means ReservasPage does NOT need updating for the flag migration -- it already uses the correct pattern.

### 3. `personalizadaType` -- Every Usage Across All 3 Codebases

This field appears in 4 DB tables and throughout the codebase. Rename: `personalizadaType` -> `goalPlanType` / `personalizada_type` -> `goal_plan_type`.

#### Database Schema Files

| File                                        | Column                                                             | Migration Action                                                 |
| ------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `src/db/schema/subscription-plans.ts:36`    | `personalizadaType: varchar("personalizada_type", { length: 30 })` | Rename to `goalPlanType` / `goal_plan_type`                      |
| `src/db/schema/member-personalizadas.ts:18` | `personalizadaType: varchar("personalizada_type", { length: 30 })` | Rename to `goalPlanType` / `goal_plan_type` (table also renames) |
| `src/db/schema/sessions.ts:25`              | `personalizadaType: varchar("personalizada_type", { length: 30 })` | Rename to `goalPlanType` / `goal_plan_type`                      |
| `src/db/schema/completed-sessions.ts:33`    | `personalizadaType: varchar("personalizada_type", { length: 30 })` | Rename to `goalPlanType` / `goal_plan_type`                      |

#### API Module Files

| File                                                      | Usage Count | Migration Action                                           |
| --------------------------------------------------------- | ----------- | ---------------------------------------------------------- |
| `src/modules/personalizadas/types.ts`                     | 8 uses      | Full rename to GoalPlanType etc.                           |
| `src/modules/personalizadas/constants.ts`                 | 5 uses      | Rename PERSONALIZADA_ROUTE_MAP -> GOAL_PLAN_ROUTE_MAP etc. |
| `src/modules/personalizadas/schemas.ts`                   | ~20 uses    | Full rename in all JSON schemas                            |
| `src/modules/personalizadas/service.ts`                   | ~30 uses    | Full service rename                                        |
| `src/modules/personalizadas/routes.ts`                    | ~15 uses    | Full route rename                                          |
| `src/modules/subscriptions/types.ts`                      | 3 uses      | Rename field                                               |
| `src/modules/subscriptions/schemas.ts`                    | 3 uses      | Rename in JSON schemas                                     |
| `src/modules/subscriptions/service.ts`                    | ~10 uses    | Rename field references                                    |
| `src/modules/subscriptions/member-routes.ts`              | 5 uses      | Rename in response mapping                                 |
| `src/modules/sessions/types.ts`                           | 1 use       | Rename DaySession.personalizadaType                        |
| `src/modules/sessions/service.ts`                         | 2 uses      | Rename in saveSession                                      |
| `src/modules/sessions/pipeline/personalizada-pipeline.ts` | ~15 uses    | Full rename to goal-plan-pipeline.ts                       |
| `src/modules/aura/types.ts`                               | 1 use       | `personalizada_completion` -> `goal_plan_completion`       |

#### Admin App Files

| File                                           | Usage       | Migration Action                    |
| ---------------------------------------------- | ----------- | ----------------------------------- |
| `src/types/subscription.ts`                    | 3 fields    | Rename to goalPlanType              |
| `src/types/personalizada.ts`                   | 10+ uses    | Rename entire file to goal-plan.ts  |
| `src/types/session.ts`                         | 2 uses      | Rename field                        |
| `src/components/PlanFormDialog.vue`            | 8 uses      | Rename form field and options       |
| `src/pages/SessionEditPage.vue`                | 2+ uses     | Rename in template                  |
| `src/pages/SessionsPage.vue`                   | Multiple    | Rename references                   |
| `src/pages/GeneratePage.vue`                   | 10+ uses    | Rename all personalizada state vars |
| `src/pages/AlumnoDetailPage.vue`               | Some        | Rename field references             |
| `src/composables/usePersonalizadasAdminApi.ts` | Entire file | Rename to useGoalPlanAdminApi.ts    |
| `src/composables/useSessionsApi.ts`            | Some        | Rename field references             |

#### Member App Files

| File                                                                      | Usage              | Migration Action                   |
| ------------------------------------------------------------------------- | ------------------ | ---------------------------------- |
| `src/modules/personalizada/` (entire module)                              | 8+ files           | Rename to `src/modules/goal-plan/` |
| `src/modules/personalizada/types.ts`                                      | 10+ uses           | Rename all types                   |
| `src/modules/personalizada/routes.ts`                                     | Route paths, names | Rename paths/names                 |
| `src/modules/personalizada/stores/personalizadaStore.ts`                  | Store              | Rename                             |
| `src/modules/personalizada/composables/usePersonalizadaApi.ts`            | Composable         | Rename                             |
| `src/modules/personalizada/composables/usePersonalizadaSession.ts`        | Composable         | Rename                             |
| `src/modules/personalizada/components/PersonalizadaProgressIndicator.vue` | Component          | Rename                             |
| `src/modules/personalizada/components/PersonalizadaProgressBar.vue`       | Component          | Rename                             |
| `src/modules/personalizada/pages/PersonalizadaSession.vue`                | Page               | Rename                             |
| `src/modules/personalizada/pages/DurationPicker.vue`                      | Page               | Rename references                  |
| `src/modules/progression/components/PersonalizadaSection.vue`             | Component          | Rename                             |
| `src/modules/progression/composables/usePersonalizadaProgress.ts`         | Composable         | Rename                             |
| `src/modules/progression/pages/MiTemplo.vue`                              | Multiple           | Rename references                  |
| `src/modules/training/pages/WeeklyView.vue`                               | Some               | Rename references                  |
| `src/stores/useUserStore.ts`                                              | 2 uses             | Rename MemberSubscription field    |
| `src/boot/modules.ts`                                                     | Import/register    | Update import paths                |

### 4. `member_personalizadas` Table -- Every Reference

**Table rename:** `member_personalizadas` -> `member_goal_plans`
**Drizzle export rename:** `memberPersonalizadas` -> `memberGoalPlans`

| File                                         | Usage                                           | Migration Action                                            |
| -------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `src/db/schema/member-personalizadas.ts`     | Table definition + index                        | Rename file to `member-goal-plans.ts`, rename table/columns |
| `src/db/schema/index.ts:20`                  | `export * from "./member-personalizadas"`       | Update export path                                          |
| `src/modules/personalizadas/service.ts`      | ~18 references to `schema.memberPersonalizadas` | Update all references to `schema.memberGoalPlans`           |
| `src/modules/personalizadas/routes.ts`       | ~8 references to `schema.memberPersonalizadas`  | Update all references                                       |
| `test/personalizadas/personalizadas.test.ts` | References in test assertions                   | Update test references                                      |

### 5. `PersonalizadasService` -- Every Caller

| File                                      | Usage                                                  | Migration Action                     |
| ----------------------------------------- | ------------------------------------------------------ | ------------------------------------ |
| `src/modules/personalizadas/service.ts`   | Class definition                                       | Rename to GoalPlanService            |
| `src/modules/personalizadas/index.ts`     | Export                                                 | Update exports                       |
| `src/modules/personalizadas/routes.ts:99` | `new PersonalizadasService(fastify.db)`                | Rename to `new GoalPlanService(...)` |
| `src/modules/subscriptions/service.ts`    | `this.personalizadasService` property (constructor DI) | Rename to `this.goalPlanService`     |

### 6. API Route Paths

| Current Path                            | New Path                            | File      |
| --------------------------------------- | ----------------------------------- | --------- |
| `/personalizadas/metadata`              | `/goal-plans/metadata`              | routes.ts |
| `/personalizadas/active`                | `/goal-plans/active`                | routes.ts |
| `/personalizadas/archived`              | `/goal-plans/archived`              | routes.ts |
| `/personalizadas/stats`                 | `/goal-plans/stats`                 | routes.ts |
| `/personalizadas/session`               | `/goal-plans/session`               | routes.ts |
| `/personalizadas/complete`              | `/goal-plans/complete`              | routes.ts |
| `/admin/personalizadas/generate`        | `/admin/goal-plans/generate`        | routes.ts |
| `/admin/personalizadas/members`         | `/admin/goal-plans/members`         | routes.ts |
| `/admin/personalizadas/members/:userId` | `/admin/goal-plans/members/:userId` | routes.ts |

**Note:** These route paths also need matching updates in the member app's `usePersonalizadaApi.ts` and admin's `usePersonalizadasAdminApi.ts`.

### 7. AURA Source Type Enum Values

The `personalizada_completion` value appears in 2 schema enum definitions and 1 migration. This is a DB enum value change requiring an ALTER TABLE.

| Location                                   | Current Value                            | New Value                            |
| ------------------------------------------ | ---------------------------------------- | ------------------------------------ |
| `src/db/schema/aura-config.ts:20`          | `"personalizada_completion"`             | `"goal_plan_completion"`             |
| `src/db/schema/aura-transactions.ts:22`    | `"personalizada_completion"`             | `"goal_plan_completion"`             |
| `src/modules/aura/types.ts:12`             | `"personalizada_completion"`             | `"goal_plan_completion"`             |
| `src/modules/personalizadas/routes.ts:340` | `sourceType: "personalizada_completion"` | `sourceType: "goal_plan_completion"` |

### 8. DayId Format Change

Current format: `P-{personalizadaType}-W{week}-{day}-{memberLevel}`
New format: `GP-{goalPlanType}-W{week}-{day}-{memberLevel}`

This affects:

- `PersonalizadasService.generatePersonalizadaSessions()` (constructs dayId)
- `PersonalizadasService.generatePersonalizadaDailySession()` (constructs dayId)
- `PersonalizadasService.getPersonalizadaSession()` (constructs dayId for lookup)
- Any fallback session queries that check `dayId.endsWith()`
- Existing session records in DB -- OLD sessions have `P-` prefix and must still be findable

**CRITICAL:** Existing approved sessions in the DB have dayIds with the old `P-` prefix. The migration needs to either:
(a) Rename dayIds in the sessions table, OR
(b) Keep a backward-compatible fallback in the query logic

### 9. Hardcoded Spanish Strings Containing "personalizada"

| File                           | String                                                               | New String                            |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------------------- |
| `PersonalizadasService.ts:95`  | `"Consulta en recepcion sobre los planes de Clases Personalizadas."` | Update to reference "Por Objetivos"   |
| `personalizadas/routes.ts:209` | `"No tienes una personalizada activa. Selecciona una primero."`      | Update to "Por Objetivos" terminology |
| `personalizadas/routes.ts:212` | `"Sesion personalizada no encontrada..."`                            | Update                                |
| `personalizadas/routes.ts:277` | `"No tienes una personalizada activa"`                               | Update                                |
| `personalizadas/routes.ts:407` | `"Error al generar sesiones personalizadas"`                         | Update                                |
| `subscriptions/service.ts:120` | `"Para planes personalizados se requiere el tipo de personalizada"`  | Update                                |
| `subscriptions/service.ts:129` | `"Tipo de personalizada invalido"`                                   | Update                                |
| Various admin tooltips         | `"Otorga acceso a Clases Personalizadas"`                            | Remove (replaced by planCategory)     |

### 10. `branchIsVirtual` Usage (Online User Detection)

This is the OTHER mechanism for detecting online users (independent of plan flags). It checks the user's assigned branch, NOT the plan's isOnline flag. This pattern is CORRECT and does NOT need migration -- it's orthogonal to plan categorization.

| File                                                                   | Usage                                        | Impact    |
| ---------------------------------------------------------------------- | -------------------------------------------- | --------- |
| `el-templo-app/src/stores/useUserStore.ts:34`                          | `branchIsVirtual: boolean` on UserProfile    | No change |
| `el-templo-app/src/layouts/MainLayout.vue:186`                         | Hides check-in FAB for virtual branch users  | No change |
| `el-templo-app/src/pages/ReservasPage.vue:352`                         | `isOnlineUser` computed                      | No change |
| `el-templo-app/src/modules/progression/pages/MiTemplo.vue:202,209,221` | Various online user conditionals             | No change |
| `el-templo-api/src/modules/auth/routes.ts`                             | Sets `branchIsVirtual` from branch.isVirtual | No change |

## Architecture Patterns

### Recommended Migration Order

```
Wave 1: DB Migration (schema + data)
├── Add plan_category enum column (nullable initially)
├── Populate plan_category from isPersonalizada + isOnline
├── Rename columns: personalizada_type -> goal_plan_type (4 tables)
├── Rename table: member_personalizadas -> member_goal_plans
├── Rename aura enum values
├── Make plan_category NOT NULL
├── Drop isPersonalizada and isOnline columns

Wave 2: API Module Rename
├── Rename personalizadas/ directory -> goal-plans/
├── Rename all types, constants, service, schemas
├── Rename PersonalizadasService -> GoalPlanService
├── Update route paths
├── Update subscriptions module references
├── Rename pipeline file

Wave 3: Admin App Rename
├── Rename types/personalizada.ts -> types/goal-plan.ts
├── Rename composable
├── Update PlanFormDialog (planCategory select replaces toggles)
├── Update PlanesPage tabs
├── Update GeneratePage, SessionEditPage, SessionsPage refs
├── Update AlumnoDetailPage

Wave 4: Member App Rename
├── Rename modules/personalizada/ -> modules/goal-plan/
├── Rename all files, types, composables, routes
├── Update boot/modules.ts imports
├── Update PlanesPage
├── Update useUserStore
├── Update MiTemplo, SessionCtaCard, etc.

Wave 5: Pipeline Calibration
├── Query approved sessions since Feb 16
├── Analyze exercise difficulty distribution
├── Analyze prescription patterns
├── Generate calibration report
├── Implement fixes

Wave 6: Admin UI Restructure
├── PlanesPage tab rename + restructure
├── Online tab with category badges
├── Plan creation form with new fields
├── Weekly price calculation
├── WhatsApp CTA update
```

### Pattern: planCategory Enum Migration

The most critical pattern is replacing two booleans with one enum:

```
Current state:
  isPersonalizada=false, isOnline=false -> presencial
  isPersonalizada=false, isOnline=true  -> online_regular
  isPersonalizada=true,  isOnline=false -> online_goal (historically, personalizada plans were for gym but becoming online-only)
  isPersonalizada=true,  isOnline=true  -> online_goal
  (online_coach is NEW, no existing plans)

Migration SQL:
  ALTER TABLE subscription_plans
    ADD COLUMN plan_category ENUM('presencial','online_regular','online_goal','online_coach')
    DEFAULT 'presencial';

  UPDATE subscription_plans SET plan_category = 'presencial'
    WHERE is_personalizada = 0 AND is_online = 0;
  UPDATE subscription_plans SET plan_category = 'online_regular'
    WHERE is_personalizada = 0 AND is_online = 1;
  UPDATE subscription_plans SET plan_category = 'online_goal'
    WHERE is_personalizada = 1;

  ALTER TABLE subscription_plans
    MODIFY COLUMN plan_category ENUM('presencial','online_regular','online_goal','online_coach') NOT NULL;

  ALTER TABLE subscription_plans DROP COLUMN is_personalizada;
  ALTER TABLE subscription_plans DROP COLUMN is_online;
```

### Pattern: Helper Functions for Plan Category

Replace boolean checks with category-based helpers:

```typescript
// Computed helpers (add to types or utils)
export function isOnlinePlan(category: PlanCategory): boolean {
  return category !== "presencial";
}

export function isGoalPlan(category: PlanCategory): boolean {
  return category === "online_goal";
}

export function isCoachPlan(category: PlanCategory): boolean {
  return category === "online_coach";
}
```

### Anti-Patterns to Avoid

- **Partial rename:** Renaming files but leaving old field names in API responses breaks clients. Everything must rename atomically per wave.
- **Missing migration data:** The plan_category column must be populated for ALL existing plans before dropping booleans.
- **Breaking existing dayIds:** Old sessions have `P-` prefixed dayIds. Either rename them in DB or support backward-compatible lookup.

## Don't Hand-Roll

| Problem                  | Don't Build                                | Use Instead                                         | Why                                                 |
| ------------------------ | ------------------------------------------ | --------------------------------------------------- | --------------------------------------------------- |
| Weekly price calculation | Custom formula per plan                    | Simple `Math.round(monthlyPrice / 4.33)`            | Standard monthly-to-weekly conversion, display-only |
| Enum migration           | Multiple ALTER TABLE statements separately | Single migration SQL file with all ALTER statements | Atomic migration, custom runner handles it          |
| Category badges in admin | Custom badge component                     | Quasar `q-badge` with color mapping from category   | Already established pattern in PlanesPage           |

## Runtime State Inventory

| Category            | Items Found                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Action Required                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Stored data         | `member_personalizadas` table: active goal plan enrollments with semana counters per user. `sessions` table: rows with `personalizada_type` values (e.g., 'tren_superior'). `completed_sessions` table: rows with `personalizada_type` values. `subscription_plans` table: rows with `is_personalizada=true` and `personalizada_type` values. DayIds in sessions with `P-` prefix. `aura_config` row with source_type='personalizada_completion'. `aura_transactions` rows with source_type='personalizada_completion'. | DB migration: rename columns + update values + rename table + update dayId prefixes |
| Live service config | None -- all config is in DB or code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | None                                                                                |
| OS-registered state | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | None                                                                                |
| Secrets/env vars    | None affected by rename                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | None                                                                                |
| Build artifacts     | None -- TypeScript, no compiled artifacts with old names persisted                                                                                                                                                                                                                                                                                                                                                                                                                                                      | None                                                                                |

## Common Pitfalls

### Pitfall 1: Migration Ordering with Foreign Keys

**What goes wrong:** Renaming the `member_personalizadas` table while the schema code still references the old name causes migration failure.
**Why it happens:** Drizzle ORM references tables by their JavaScript export name, not the DB table name. If schema code is updated before migration runs, the server can't start.
**How to avoid:** Write manual migration SQL (per project convention). Apply migration first, then update schema code. Deploy in sequence.
**Warning signs:** "Table not found" errors on API startup after migration.

### Pitfall 2: Enum Value Migration in MySQL

**What goes wrong:** MySQL enum ALTER TABLE for `aura_config_source_type` and `source_type` columns requires listing ALL existing values plus the new one.
**Why it happens:** MySQL MODIFY COLUMN for enums replaces the entire enum list. Missing any existing value drops it.
**How to avoid:** Copy the full enum list from the latest migration (0061_micro_programs.sql) and add/rename values.
**Warning signs:** "Data truncated" errors or lost enum values.

### Pitfall 3: Breaking Member App Route Registration

**What goes wrong:** Renaming the personalizada module directory breaks the dynamic import in `boot/modules.ts`.
**Why it happens:** Module manifest exports, route definitions, and boot registration all reference the old path.
**How to avoid:** Update ALL THREE: (1) directory name, (2) index.ts exports, (3) boot/modules.ts imports. Also update router route path strings.
**Warning signs:** Build failures or blank pages on personalizada routes.

### Pitfall 4: Existing Session DayIds

**What goes wrong:** After renaming, queries for goal plan sessions with new dayId format (`GP-...`) return nothing because existing sessions have old format (`P-...`).
**Why it happens:** DayId is both the unique identifier and contains the type prefix.
**How to avoid:** Either (a) run UPDATE on sessions table to rename dayIds, or (b) support both prefixes in query logic during transition.
**Warning signs:** "Session not found" errors after rename.

### Pitfall 5: Drizzle Manual Migration Convention

**What goes wrong:** Using `pnpm db:generate` for this complex rename generates incorrect or interactive migration SQL.
**Why it happens:** Per Phase 86 decision, complex schema changes require manual migration SQL to avoid interactive prompts.
**How to avoid:** Write migration SQL by hand. Never use `drizzle-kit migrate`. Custom runner in `_migrations` table is source of truth.
**Warning signs:** Interactive prompts during CI/CD.

## Code Examples

### Migration SQL for plan_category Enum

```sql
-- Step 1: Add plan_category enum column (nullable)
ALTER TABLE `subscription_plans`
  ADD COLUMN `plan_category` ENUM('presencial','online_regular','online_goal','online_coach')
  DEFAULT NULL;

-- Step 2: Populate from existing boolean flags
UPDATE `subscription_plans`
  SET `plan_category` = CASE
    WHEN `is_personalizada` = 1 THEN 'online_goal'
    WHEN `is_online` = 1 THEN 'online_regular'
    ELSE 'presencial'
  END;

-- Step 3: Make NOT NULL
ALTER TABLE `subscription_plans`
  MODIFY COLUMN `plan_category` ENUM('presencial','online_regular','online_goal','online_coach') NOT NULL;

-- Step 4: Drop old boolean columns
ALTER TABLE `subscription_plans` DROP COLUMN `is_personalizada`;
ALTER TABLE `subscription_plans` DROP COLUMN `is_online`;
```

### Rename Columns Across Tables

```sql
-- subscription_plans
ALTER TABLE `subscription_plans`
  CHANGE COLUMN `personalizada_type` `goal_plan_type` varchar(30);

-- sessions
ALTER TABLE `sessions`
  CHANGE COLUMN `personalizada_type` `goal_plan_type` varchar(30);

-- completed_sessions
ALTER TABLE `completed_sessions`
  CHANGE COLUMN `personalizada_type` `goal_plan_type` varchar(30);

-- member_personalizadas -> member_goal_plans
ALTER TABLE `member_personalizadas`
  CHANGE COLUMN `personalizada_type` `goal_plan_type` varchar(30) NOT NULL;
RENAME TABLE `member_personalizadas` TO `member_goal_plans`;
```

### Rename DayIds in Sessions

```sql
-- Update session dayIds from P- prefix to GP- prefix
UPDATE `sessions`
  SET `day_id` = CONCAT('GP', SUBSTRING(`day_id`, 2))
  WHERE `day_id` LIKE 'P-%';
```

### Update AURA Enum Values

```sql
-- aura_config
ALTER TABLE `aura_config`
  MODIFY COLUMN `aura_config_source_type` ENUM(
    'training_completion','attendance','streak_bonus','referral',
    'subscription_discount','manual_adjustment','challenge','social',
    'goal_plan_completion','onboarding_completion',
    'program_week_completion','program_completion'
  ) NOT NULL;
UPDATE `aura_config` SET `aura_config_source_type` = 'goal_plan_completion'
  WHERE `aura_config_source_type` = 'personalizada_completion';

-- aura_transactions
ALTER TABLE `aura_transactions`
  MODIFY COLUMN `source_type` ENUM(
    'training_completion','attendance','streak_bonus','referral',
    'subscription_discount','manual_adjustment','challenge','social',
    'goal_plan_completion','onboarding_completion',
    'program_week_completion','program_completion'
  ) NOT NULL;
UPDATE `aura_transactions` SET `source_type` = 'goal_plan_completion'
  WHERE `source_type` = 'personalizada_completion';
```

### Drizzle Schema After Migration

```typescript
// src/db/schema/subscription-plans.ts
export const planCategoryEnum = mysqlEnum("plan_category", [
  "presencial",
  "online_regular",
  "online_goal",
  "online_coach",
]);

export const subscriptionPlans = mysqlTable("subscription_plans", {
  // ... existing fields ...
  planCategory: planCategoryEnum.notNull(),
  goalPlanType: varchar("goal_plan_type", { length: 30 }),
  // REMOVED: isPersonalizada, isOnline, personalizadaType
});
```

### Weekly Price Calculation

```typescript
// Computed, never stored
function weeklyPrice(monthlyPrice: number): number {
  return Math.round(monthlyPrice / 4.33);
}

// Display: "$6,250/semana"
function formatWeeklyPrice(monthlyPrice: number): string {
  return `$${weeklyPrice(monthlyPrice).toLocaleString()}/semana`;
}
```

### WhatsApp CTA with Plan Name and Weekly Price

```typescript
// Both admin and member app
function openWhatsApp(plan: { name: string; priceRegular: number }): void {
  const weekly = Math.round(plan.priceRegular / 4.33);
  const message = `Hola! Me interesa el plan ${plan.name} ($${weekly.toLocaleString()}/semana). Quiero mas info.`;
  const url = `https://wa.me/5492235820521?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}
```

## State of the Art

| Old Approach                               | Current Approach                            | When Changed | Impact                                                            |
| ------------------------------------------ | ------------------------------------------- | ------------ | ----------------------------------------------------------------- |
| Boolean flags (isPersonalizada + isOnline) | planCategory enum                           | Phase 89     | Single field replaces two, enabling 4 distinct categories         |
| "Personalizadas" naming                    | "Goal Plans" / "Por Objetivos"              | Phase 89     | Separates auto-generated plans from coach-assisted                |
| Personalizada sessions only                | Online Regular + Online Goal + Online Coach | Phase 89     | Regular online users get standard sessions, not pipeline-specific |

## Open Questions

1. **DayId Backward Compatibility**
   - What we know: Existing sessions have `P-{type}-W{week}-...` dayIds. New sessions will use `GP-{type}-W{week}-...`.
   - What's unclear: Should we update existing dayIds in the DB, or support both formats in query logic?
   - Recommendation: UPDATE existing dayIds in migration SQL. It's cleaner than dual-format support and the data set is finite. The `day_id` column has a UNIQUE constraint, so the UPDATE is safe.

2. **Existing completed_sessions Records**
   - What we know: completed_sessions has a `personalizada_type` column and `dayId` references.
   - What's unclear: Should old completed_session dayIds also be renamed? They reference sessions by dayId string.
   - Recommendation: YES, rename dayIds in completed_sessions too for consistency. These are historical records but should still be queryable.

3. **Pipeline Calibration Scope**
   - What we know: ~585 approved blocks since Feb 16. Pipeline has 7 stages.
   - What's unclear: Exact threshold for "deviation" -- how far from approved patterns is too far.
   - Recommendation: Start with statistical analysis (mean, std deviation per route/level for exercise difficulty and prescription ranges), then define thresholds based on data distribution.

## Project Constraints (from CLAUDE.md)

- **Logging:** API uses Pino (`request.log`, `app.log`). Frontend uses `createLogger()`. Never console.log.
- **TypeScript:** No `any` types. Use `unknown` + type narrowing.
- **Tests:** New API routes must include integration tests. Tests run against real MySQL.
- **Database:** Schema changes go through Drizzle schema files. Generate migration SQL with `pnpm db:generate` (but for this phase, use manual SQL per Phase 86 convention). Apply with `pnpm db:migrate`. Never use `drizzle-kit migrate`.
- **Pre-commit:** Husky + lint-staged. Fix issues and create new commit (don't amend).
- **Dependencies:** NEVER install or update without asking.
- **Commits:** Always commit migration SQL files alongside schema changes.
- **Patterns:** Facade pattern for complex services, Pinia composition API for stores, composables expose cleanup() method.

## Validation Architecture

> Note: workflow.nyquist_validation not explicitly set in config.json (absent), treating as enabled.

### Test Framework

| Property           | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| Framework          | vitest (latest in project)                                          |
| Config file        | `el-templo-api/vitest.config.ts`                                    |
| Quick run command  | `cd el-templo-api && pnpm test -- --testPathPattern=personalizadas` |
| Full suite command | `cd el-templo-api && pnpm test`                                     |

### Phase Requirements -> Test Map

| Req ID | Behavior                                          | Test Type   | Automated Command                               | File Exists?                    |
| ------ | ------------------------------------------------- | ----------- | ----------------------------------------------- | ------------------------------- |
| MON-01 | Admin tab renamed, plan categories                | integration | `pnpm test -- --testPathPattern=subscriptions`  | Partial (plan CRUD tests exist) |
| MON-02 | User-facing rename                                | integration | Manual visual check + type checks               | N/A (UI rename)                 |
| MON-03 | Plan creation with new fields                     | integration | `pnpm test -- --testPathPattern=subscriptions`  | Partial                         |
| MON-04 | Weekly price calculation                          | unit        | N/A (computed, display-only)                    | Wave 0                          |
| MON-05 | WhatsApp CTA                                      | manual-only | Visual check                                    | N/A                             |
| MON-06 | Pipeline difficulty calibration                   | integration | `pnpm test -- --testPathPattern=personalizadas` | Existing                        |
| MON-07 | Pipeline prescription calibration                 | integration | Same as MON-06                                  | Existing                        |
| MON-08 | Goal plan pipeline for front_lever, tren_inferior | integration | Same as MON-06                                  | Existing                        |
| MON-09 | Regular plans link to regular sessions            | integration | `pnpm test -- --testPathPattern=member-plans`   | Existing                        |
| MON-10 | Discount via price override                       | integration | Existing tests                                  | Existing                        |

### Sampling Rate

- **Per task commit:** `cd el-templo-api && pnpm test`
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps

- [ ] Update `test/personalizadas/personalizadas.test.ts` -- rename all fixtures to use goalPlan/planCategory naming
- [ ] Update `test/subscriptions/member-plans.test.ts` -- update isPersonalizada assertions to planCategory
- [ ] Update `test/subscriptions/promo-plans.test.ts` -- update isOnline to planCategory
- [ ] Update `test/auth/promo-registration.test.ts` -- update isOnline to planCategory
- [ ] Add test: plan creation with planCategory enum values
- [ ] Add test: migration validation (all existing plans have valid planCategory)
- [ ] Test helper `cleanAllTestData` -- rename member_personalizadas references to member_goal_plans

## Sources

### Primary (HIGH confidence)

- Direct codebase grep across all 3 apps -- complete file-by-file inventory
- `el-templo-api/src/db/schema/` -- all schema files read directly
- `el-templo-api/src/modules/personalizadas/` -- all 6 files read completely
- `el-templo-api/src/modules/subscriptions/` -- service, types, schemas, member-routes read
- `el-templo-admin/src/` -- PlanesPage, PlanFormDialog, types read completely
- `el-templo-app/src/` -- PlanesPage, useUserStore, MiTemplo, module structure examined
- `.docs/planes-online-strategy.md` -- business strategy and naming conventions
- `89-CONTEXT.md` -- all locked decisions

### Secondary (MEDIUM confidence)

- Migration SQL patterns derived from existing migrations (0048, 0049, 0052, 0055, 0061)
- Phase 86 manual migration convention (established pattern)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- existing project stack, no new dependencies
- Architecture: HIGH -- patterns directly from codebase analysis
- Pitfalls: HIGH -- based on actual code structure and MySQL constraints
- Rename inventory: HIGH -- exhaustive grep across entire codebase
- Pipeline calibration: MEDIUM -- approved data exists but analysis methodology TBD

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable codebase, no external dependencies changing)

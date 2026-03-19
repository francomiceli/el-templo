# Phase 71: Plan-Driven Personalizada Assignment - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

The subscription plan defines which personalizada type a member trains. Admin assigns the type via the plan, the system auto-creates member_personalizadas on subscription creation, and the member app selection flow is removed entirely (including the Personalizada nav item). No member-side choosing.

</domain>

<decisions>
## Implementation Decisions

### Plan Schema

- Add `personalizadaType` varchar column to `subscription_plans` (nullable, null when isPersonalizada=false)
- Values match existing PersonalizadaType enum: tren_superior, tren_inferior, empuje, traccion, planche, front_lever
- API validation: when isPersonalizada=true, personalizadaType is required (reject creation/update without it)
- Types come from existing constants/metadata (same source as session generation) — NOT moving to DB table in this phase

### Admin UI

- PlanFormDialog: when isPersonalizada toggle is ON, show a conditional dropdown with the 6 personalizada types
- Dropdown values come from the same source as PERSONALIZADA_METADATA constants
- When isPersonalizada is OFF, dropdown is hidden

### Auto-Assignment Trigger

- When admin creates a subscription for a member using a personalizada plan, the system auto-creates `member_personalizadas` from the plan's personalizadaType
- The hook lives at the subscription creation API level (subscription service)
- Uses existing `selectPersonalizada` service method logic (archive old + create new)
- No cascade: changing a plan's personalizadaType does NOT affect existing subscribers — only future subscriptions
- On subscription renewal: archive current member_personalizadas + create fresh one (reset semana counters, new cycle)
- On plan switch (admin changes member to different personalizada plan): archive old, create new

### Member App Removal

- Remove PersonalizadaSelection.vue (grid of 6 types)
- Remove PersonalizadaOverview.vue (type detail + confirm)
- Remove the `/personalizada` and `/personalizada/overview/:type` routes
- Keep DurationPicker.vue — still needed for session duration selection (Phase 72 integrates it into Entrenar)
- Remove Personalizada nav item from bottom navigation entirely
- Remove POST /personalizadas/select API route (member-facing only, not used by admin app)
- Keep `selectPersonalizada` service method — auto-assignment uses it internally

### Session Pipeline

- No changes needed — getSession and complete endpoints already read personalizadaType from member_personalizadas, not from the request body
- Admin generate endpoint (POST /personalizadas/generate) stays unchanged

### Migration & Existing Data

- No real users yet — no backfill or migration concerns
- Migration: add personalizadaType column to subscription_plans
- Test data can be recreated from scratch

### Claude's Discretion

- Whether to keep DurationPicker route accessible or only reachable from Phase 72's Entrenar flow
- Exact implementation of the subscription creation hook (event-based vs inline in service)
- How to handle the edge case of subscription creation with a plan whose personalizadaType is null (validation should prevent this, but belt-and-suspenders)
- Whether to remove the personalizada store's selectPersonalizada action or leave it (used by DurationPicker flow)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema

- `el-templo-api/src/db/schema/subscription-plans.ts` — Plan table where personalizadaType column goes (has isPersonalizada, durationDays)
- `el-templo-api/src/db/schema/member-personalizadas.ts` — Active personalizada with personalizadaType, semana counters, isActive

### Personalizadas Module

- `el-templo-api/src/modules/personalizadas/service.ts` — selectPersonalizada method (archive + create logic to reuse)
- `el-templo-api/src/modules/personalizadas/routes.ts` — POST /personalizadas/select route to remove; other routes stay
- `el-templo-api/src/modules/personalizadas/constants.ts` — ALL_PERSONALIZADA_TYPES and PERSONALIZADA_METADATA (source for admin dropdown)
- `el-templo-api/src/modules/personalizadas/types.ts` — PersonalizadaType union type

### Subscription Module

- `el-templo-api/src/modules/subscriptions/` — Subscription creation endpoint where auto-assignment hook goes

### Admin Frontend

- `el-templo-admin/src/components/PlanFormDialog.vue` — Add conditional personalizadaType dropdown

### Member App (removal targets)

- `el-templo-app/src/modules/personalizada/pages/PersonalizadaSelection.vue` — Remove
- `el-templo-app/src/modules/personalizada/pages/PersonalizadaOverview.vue` — Remove
- `el-templo-app/src/modules/personalizada/routes.ts` — Remove selection/overview routes
- `el-templo-app/src/layouts/MainLayout.vue` — Remove Personalizada nav item

### Prior Phase Context

- `.planning/phases/69-personalizadas-subscription-aura-enable/69-CONTEXT.md` — isPersonalizada flag, subscription model
- `.planning/phases/70-personalizadas-cycle-config/70-CONTEXT.md` — Cycle model, durationDays usage

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `selectPersonalizada` service method: Has archive-old + create-new logic that auto-assignment needs
- `PERSONALIZADA_METADATA` constants: Source for admin dropdown values (name, tier, description per type)
- `checkSubscription` service method: Already joins subscription_plans — extend to get personalizadaType

### Established Patterns

- Plan flags: Boolean columns with `.default(false).notNull()` on subscription_plans (isTrial, isGroup, isPersonalizada)
- PlanFormDialog toggles: isPersonalizada toggle already exists — personalizadaType dropdown follows same conditional pattern
- Service-level DI: PersonalizadasService instantiated in routes with db injection

### Integration Points

- Subscription creation endpoint: Hook auto-assignment after subscription insert
- PlanFormDialog.vue: Add dropdown below isPersonalizada toggle
- MainLayout.vue: Remove personalizada nav item from bottom navigation
- personalizada/routes.ts: Remove /personalizada and /personalizada/overview/:type routes

</code_context>

<specifics>
## Specific Ideas

- The admin flow is: create plans (with personalizada type + duration defined) → plans become selectable in subscription section → subscription creation triggers member assignment
- Session pipeline is already compatible — reads type from member_personalizadas, not request body
- No real users yet, so migration is simple — just add the column, no backfill

</specifics>

<deferred>
## Deferred Ideas

- DB-driven personalizada types table (replace constants with admin-managed CRUD) — future phase
- Mi Plan section: catalog of ALL plans (gym + personalizada) for members to browse with "contact for plan change" CTA — Phase 73
- Multi-type personalizada plans (one plan maps to multiple types, member chooses within plan) — future if needed

</deferred>

---

_Phase: 71-plan-driven-personalizada-assignment_
_Context gathered: 2026-03-19_

# Phase 69: Subscription Gate, AURA Rewards & Module Enable - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Gate personalizadas behind a subscription flag (`isPersonalizada` on plan), award AURA on completion, and enable the member app module. This is the final step to ship Clases Personalizadas to production.

</domain>

<decisions>
## Implementation Decisions

### Subscription Enforcement

- Add `isPersonalizada` boolean to `subscription_plans` table (default false), same pattern as `isTrial`, `isGroup`, `multiBranch`
- Service-layer check (not preHandler) — PersonalizadasService gets a `checkSubscription(userId)` method
- Check runs on `select`, `getSession`, and `complete` endpoints — member must have active + non-expired subscription where plan.isPersonalizada = true
- Metadata endpoint (`/personalizadas/metadata`) stays public — no subscription check
- 403 message: "Consultá en recepción sobre los planes de Clases Personalizadas."
- One subscription at a time — member has either a regular gym plan OR a personalizadas plan, not both
- The isPersonalizada flag is independent of gym access properties (classesPerWeek, bookingMode) — a personalizada plan could theoretically include gym access if configured, but for now they're online-only plans

### Module Visibility

- Show module in app for all members, gate on action — members without subscription can browse types/metadata but get blocked on select/session/complete
- Module visible in sidebar/nav regardless of subscription status (encourages discovery)

### AURA Rewards

- New AuraSourceType: `"personalizada_completion"` added to the union type
- Add `personalizada_completion` row to `aura_config` table with amount=10 (via migration seed)
- Call `auraService.award()` in the complete endpoint after `advanceSemana`, using config-based amount (not hardcoded)
- referenceType: `"personalizada_session"`, referenceId: completion record ID

### Admin Plan Toggle

- Add "Personalizada" toggle to PlanFormDialog, same pattern as isTrial/isGroup/multiBranch
- No mutual exclusivity — isPersonalizada is independent of all other plan flags
- Toggle label: "Personalizada" with description "Otorga acceso a Clases Personalizadas"

### Module Enable

- Uncomment 3 lines in `boot/modules.ts`: import, manifest in modules array, registerPersonalizada(router) call

### Claude's Discretion

- Migration file naming/numbering
- Exact placement of subscription check in service methods
- Integration test structure and test data setup
- Whether to add a `personalizada_completion` seed via migration SQL or via the seed script

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema

- `el-templo-api/src/db/schema/subscription-plans.ts` — Plan table where `isPersonalizada` goes (has isTrial, isGroup, multiBranch as pattern)

### Personalizadas Module

- `el-templo-api/src/modules/personalizadas/routes.ts` — Routes to add subscription check + AURA award on complete
- `el-templo-api/src/modules/personalizadas/service.ts` — Service to add checkSubscription method

### AURA Module

- `el-templo-api/src/modules/aura/service.ts` — AuraService.award() method signature
- `el-templo-api/src/modules/aura/types.ts` — AuraSourceType union (add personalizada_completion)

### Existing Pattern References

- `el-templo-api/src/modules/attendance/service.ts` — How attendance calls auraService.award() (pattern to follow)
- `el-templo-api/src/modules/attendance/routes.ts` — How AuraService is instantiated and injected

### Admin Frontend

- `el-templo-admin/src/components/PlanFormDialog.vue` — Where isPersonalizada toggle goes
- `el-templo-admin/src/types/subscription.ts` — Plan type to add isPersonalizada field

### Member App

- `el-templo-app/src/boot/modules.ts` — 3 lines to uncomment

### Spec

- `.docs/journey-wrap-up.md` — Steps 3-5 apply to this phase

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `AuraService`: Fully built, just needs to be imported and called in personalizadas routes
- `PlanFormDialog.vue`: Already has toggle pattern for isTrial/isGroup — isPersonalizada follows same pattern
- Subscription queries: SubscriptionService already joins subscription_plans, just need to add isPersonalizada to the check

### Established Patterns

- Service-level DI: `new AuraService(fastify.db)` in routes, passed to service constructor — same pattern for personalizadas
- Plan flags: Boolean columns on subscription_plans with `.default(false).notNull()` — isPersonalizada follows this
- AURA award: `auraService.award({ userId, sourceType, referenceType, referenceId })` — amount comes from aura_config

### Integration Points

- `personalizadas/routes.ts` line ~99: service instantiation — add AuraService here
- `personalizadas/routes.ts` line ~333: after `advanceSemana()` — add AURA award call here
- `boot/modules.ts` lines 11, 25, 35: uncomment the 3 personalizada lines

</code_context>

<specifics>
## Specific Ideas

- The subscription check should query the member's active subscription and join to subscription_plans to check isPersonalizada — same join pattern used in attendance for plan lookups
- The AURA award in the complete handler should happen after advanceSemana succeeds, so a failed advance doesn't award points
- The aura_config seed should insert `personalizada_completion` with amount=10, same as attendance source type
- Admin toggle description in Spanish: "Otorga acceso a Clases Personalizadas"

</specifics>

<deferred>
## Deferred Ideas

- Attendance integration for personalizadas (track as access log entry) — post-v4.2
- Coach-editable personalizada metadata (admin CRUD for types) — post-v4.2
- Branch-scoped member list in admin personalizadas view — post-v4.2
- Per-type AURA amounts (different rewards for different personalizada types) — post-v4.2
- Presential personalizada plans (plans with both isPersonalizada + classesPerWeek) — future decision
- Dual subscriptions (gym + personalizada simultaneously) — not for now, revisit if needed

</deferred>

---

_Phase: 69-personalizadas-subscription-aura-enable_
_Context gathered: 2026-03-18_

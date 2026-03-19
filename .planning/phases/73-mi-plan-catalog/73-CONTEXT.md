# Phase 73: Planes — Plan Catalog for Members - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Members can browse all available subscription plans (gym plans and personalizada plans) in a "Planes" section of the member app. Each plan shows its details and a WhatsApp CTA to contact about changing plans. The member's current plan is highlighted. This is a read-only catalog — no plan changes happen in-app.

**Note:** "Mi Plan" (current plan info) belongs in Mi Camino, not here. This phase is "Planes" — the catalog of all available plans.

</domain>

<decisions>
## Implementation Decisions

### Navigation & Access

- "Planes" is a new bottom tab (5th tab) with `card_membership` icon
- Visible to ALL members regardless of subscription status
- Also appears in desktop drawer alongside existing items
- New module: `el-templo-app/src/modules/plan/` following existing module pattern (manifest, routes, pages)

### Page Structure & Grouping

- Two sections on the page: "Planes de Gimnasio" and "Clases Personalizadas"
- Each section has its own heading
- Plans come from DB — show all active plans (isActive=true, isArchived=false)
- Gym plans: those with isPersonalizada=false
- Personalizada plans: those with isPersonalizada=true

### Plan Card Content

- Each card shows: plan name, tier badge (colored, gym plans only), description text, and CTA
- **No prices shown** — pricing is hidden from members
- **No tier badges on personalizada cards** — do NOT show principiante/intermedio/avanzado levels
- Personalizada cards show zone/focus info from PERSONALIZADA_METADATA (e.g., "Zonas: Pecho, Hombros") but no tier

### Current Plan Indication

- Member's current plan card gets a "Tu plan actual" badge/ribbon
- Current plan card shows "Activo — vence [fecha]" status instead of the WhatsApp CTA
- Other plan cards show the WhatsApp CTA

### CTA & Contact Behavior

- CTA text: "Contacta para cambiar de plan" (members with subscription) or "Contacta para elegir tu plan" (members without subscription)
- CTA opens WhatsApp with pre-filled message: "Hola, me interesa el plan [nombre]"
- **WhatsApp number: hardcoded ventas number** (`5492235820521` — same as el-templo-web). Will be moved to per-branch system_settings later.
- Short link reference: `https://wa.link/ci8dpl` (wa.me variant: `https://wa.me/5492235820521`)

### API

- New member-facing endpoint needed: `GET /members/subscription/plans` (or similar)
- Returns active, non-archived plans only
- No role restriction — any authenticated member can list plans
- Response includes: name, description, planTier, isPersonalizada, personalizadaType (for zone metadata lookup)

### Claude's Discretion

- Exact card styling and spacing
- How to sort plans within each section (by tier, by name, by creation date)
- Whether to use a composable (`usePlansApi`) or inline API calls
- Empty state if no plans exist (unlikely but handle gracefully)
- How to fetch and join PERSONALIZADA_METADATA for zone display (client-side lookup from constants or API-enriched response)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema & API

- `el-templo-api/src/db/schema/subscription-plans.ts` — Plan table with all fields (name, description, planTier, priceRegular, isPersonalizada, personalizadaType, isActive, isArchived)
- `el-templo-api/src/modules/subscriptions/routes.ts` — Admin plan routes pattern (GET /plans exists for admin — member variant needed)
- `el-templo-api/src/modules/members/routes.ts` — Member-facing routes (subscription endpoint pattern to follow)

### Personalizada Metadata

- `el-templo-api/src/modules/personalizadas/constants.ts` — PERSONALIZADA_METADATA with name, tier, description, zones[], idealFor per type

### Member App Structure

- `el-templo-app/src/boot/modules.ts` — Module registration pattern (manifest + registerModule)
- `el-templo-app/src/layouts/MainLayout.vue` — Bottom tab bar and drawer navigation
- `el-templo-app/src/modules/training/index.ts` — Module manifest pattern to follow
- `el-templo-app/src/stores/useUserStore.ts` — MemberSubscription interface (has planName for current plan matching)

### WhatsApp Reference

- `el-templo-web/data/sedes.ts` — Ventas WhatsApp number (5492235820521) used across landing site

### Prior Phase Context

- `.planning/phases/71-plan-driven-personalizada-assignment/71-CONTEXT.md` — Plan-driven model, personalizadaType on plans
- `.planning/phases/72-unified-training-experience/72-CONTEXT.md` — Subscription enforcement patterns, blocked states

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `useUserStore.subscription`: Already loaded with planName, planTier, status, endDate — use for current plan matching and status display
- Admin `GET /admin/subscriptions/plans`: Existing plan listing logic in SubscriptionsService — reuse query pattern for member endpoint
- `PLAN_TIER_LABELS` and tier color mapping: Admin has these for badge display — share or duplicate in member app
- Module manifest pattern: Training/progression modules provide exact template for new plan module

### Established Patterns

- Module registration: manifest object + registerModule(router) in boot/modules.ts
- Bottom tab: mobileTabs computed in MainLayout reads from modules array
- API composables: `useSubscriptionsApi` in admin — similar pattern for member app
- Quasar components: QCard, QBadge, QBtn for card layout

### Integration Points

- `boot/modules.ts`: Import and register new plan module
- `MainLayout.vue`: Add Planes to mobileTabs and drawer navigation
- `members/routes.ts` (API): Add plan listing endpoint under member auth
- `useUserStore.subscription.planName`: Match against plan list to identify current plan

</code_context>

<specifics>
## Specific Ideas

- Cards should feel like a simple catalog — informational, not transactional
- WhatsApp CTA is the bridge to action since plan changes happen through reception
- Zone info on personalizada cards helps members understand the focus without needing tier labels
- The page should work as a "what's available" reference that members can browse anytime

</specifics>

<deferred>
## Deferred Ideas

- Per-branch WhatsApp numbers from system_settings — future enhancement (currently hardcoded ventas number)
- Plan comparison view (side-by-side feature comparison) — future if needed
- In-app plan change requests (form submission instead of WhatsApp) — future phase
- Price display toggle (admin decides whether to show prices to members) — future if needed

</deferred>

---

_Phase: 73-mi-plan-catalog_
_Context gathered: 2026-03-19_

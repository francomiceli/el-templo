# Phase 72: Unified Training Experience - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the training experience subscription-aware: `/training` becomes context-aware (personalizada → info card + duration picker, regular → weekly view, no sub → blocked state), Mi Camino becomes a single unified view for personalizada members (no tabs), post-session always navigates to Mi Camino, and all training access requires an active subscription.

</domain>

<decisions>
## Implementation Decisions

### Entrenar Tab Routing (/training)

- `/training` route stays the same for everyone — the TrainingIndex page becomes context-aware
- Check member's subscription via `useUserStore.subscription` (already loaded)
- **Personalizada member (isPersonalizada=true):** Show brief info card (personalizada name, tier badge, "Semana X de Y" cycle progress) above the DurationPicker cards (20/40/60 min)
- **Regular member (isPersonalizada=false, active sub):** Show WeeklyView as today
- **No subscription / expired:** Show blocked state with "Consulta en recepcion para elegir tu plan" CTA
- A member has either a gym plan OR a personalizada plan, never both — no dual access case

### Subscription Enforcement

- ALL training gated behind active subscription — both regular (WeeklyView) and personalizada (DurationPicker)
- Frontend guard using existing subscription data from `useUserStore.subscription`
- `MemberSubscription` interface needs `isPersonalizada: boolean` and `personalizadaType: string | null` added (extend API response)
- No new API endpoint needed — extend existing `/members/subscription/me/subscription` response
- No API-level enforcement in this phase (frontend guard only)

### Mi Camino Unification

- Personalizada members see a SINGLE view, NO tabs (no Entrenamiento/Personalizadas tab switching)
- Layout top to bottom:
  1. Welcome header + level badge (existing)
  2. Personalizada info card (name, tier, cycle progress bar, per-duration semana rows)
  3. Entrenar CTA button → /training
  4. Training stats (total sessions, streak, RPE trend)
  5. Archived history (collapsible)
- Regular members keep the current single-view GeneralContent (no change)
- The "today session" card works the same for everyone — links to /training (which is now context-aware)
- If personalizada subscription expires: show archived data + renewal prompt ("Consulta en recepcion para renovar")

### Post-Session Navigation

- After personalizada session completion: show PersonalizadaProgressIndicator (semana wrap-up) → then navigate to Mi Camino (not DurationPicker)
- After regular training session completion: navigate to Mi Camino (not /training)
- Both flows end at Mi Camino — consistent behavior
- PersonalizadaProgressIndicator "Continuar" button → `/mi-camino`

### Edge Cases

- **New member, no subscription:** /training shows blocked state. Mi Camino shows "Comienza Tu Camino" empty state (already exists)
- **Expired personalizada subscription:** /training shows blocked state. Mi Camino shows archived data + renewal prompt
- **Expired regular subscription:** /training shows blocked state. Mi Camino shows existing stats (read-only, no CTA to train)

### Claude's Discretion

- How to structure the context-aware TrainingIndex (conditional components vs wrapper)
- Exact blocked state card design and copy
- How to extend the subscription API response with isPersonalizada/personalizadaType
- Whether to embed DurationPicker inline in TrainingIndex or import the existing component
- How PersonalizadaProgressIndicator navigates to Mi Camino (router.push or prop callback)
- RPE trend and training stats positioning in the unified Mi Camino view

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Training Module

- `el-templo-app/src/modules/training/pages/WeeklyView.vue` — Current Entrenar page (becomes one branch of context-aware /training)
- `el-templo-app/src/modules/training/pages/TrainingIndex.vue` — Route entry point to make context-aware

### Personalizada Module

- `el-templo-app/src/modules/personalizada/pages/DurationPicker.vue` — Duration picker to embed in /training for personalizada members
- `el-templo-app/src/modules/personalizada/pages/PersonalizadaSession.vue` — Post-session flow to update (navigate to Mi Camino)
- `el-templo-app/src/modules/personalizada/components/PersonalizadaProgressIndicator.vue` — Semana wrap-up (change "Continuar" destination to /mi-camino)

### Progression Module (Mi Camino)

- `el-templo-app/src/modules/progression/pages/MiCamino.vue` — Tab logic to remove for personalizada members, unified view
- `el-templo-app/src/modules/progression/components/PersonalizadaSection.vue` — Personalizada progress display
- `el-templo-app/src/modules/progression/components/GeneralContent.vue` — Training stats, today session card

### Stores & Data

- `el-templo-app/src/stores/useUserStore.ts` — `MemberSubscription` interface to extend with isPersonalizada + personalizadaType; `subscription` ref already loaded

### API (subscription response extension)

- `el-templo-api/src/modules/members/` — Member subscription endpoint to extend response

### Prior Phase Context

- `.planning/phases/71-plan-driven-personalizada-assignment/71-CONTEXT.md` — Plan-driven model, selection flow removed
- `.planning/phases/70-personalizadas-cycle-config/70-CONTEXT.md` — Cycle model, progress display

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `useUserStore.subscription`: Already loaded, has status/planName/tier. Just needs isPersonalizada + personalizadaType fields added
- `DurationPicker.vue`: Can be imported/embedded in TrainingIndex for personalizada members
- `PersonalizadaSection.vue`: Already has cycle progress, semana rows, wrap-up card — reuse in unified Mi Camino
- `GeneralContent.vue`: Training stats, RPE, today card — reuse as secondary section in unified view

### Established Patterns

- Conditional content: MiCamino already has `showTabs` computed — extend to single-view logic
- Subscription data: `useUserStore.fetchSubscription()` called on auth — data available app-wide
- Route-level guards: Can check `subscription.value` before rendering content

### Integration Points

- `TrainingIndex.vue` or router config: Context-aware branching based on subscription
- `MiCamino.vue`: Remove tabs for personalizada, compose unified view from existing components
- `PersonalizadaSession.vue` line ~368: Change post-completion redirect from /personalizada/duration to /mi-camino
- `PersonalizadaProgressIndicator.vue`: Change "Continuar" emit handler to navigate to /mi-camino
- Member subscription API response: Add isPersonalizada + personalizadaType fields

</code_context>

<specifics>
## Specific Ideas

- The info card above DurationPicker should show personalizada name + "Semana X de Y" — same data as Mi Camino progress but compact
- Blocked state for no subscription should feel inviting, not punishing — "Consulta en recepcion para elegir tu plan" with a friendly icon
- Post-session flow: session → celebration → RPE/notes → semana wrap-up → Mi Camino (every session ends at the progress dashboard)
- The unified Mi Camino for personalizada members should feel like "this is YOUR training dashboard" — personalizada progress IS the main content, general stats are supporting context

</specifics>

<deferred>
## Deferred Ideas

- API-level subscription enforcement for training endpoints (currently frontend-only gate)
- Conceptos tab subscription gating (educational content — might stay free)
- Dual subscription support (gym + personalizada simultaneously)
- DB-driven personalizada types table (replace constants)
- Mi Plan catalog (Phase 73) — all plans browsable for members

</deferred>

---

_Phase: 72-unified-training-experience_
_Context gathered: 2026-03-19_

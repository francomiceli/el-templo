# Phase 70: Personalizadas Cycle Config - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Make personalizada cycles meaningful: cycle length derives from the plan's existing `durationDays`, the member app shows week-based progress with session count, and completed cycles get a wrap-up with completion percentage and duration breakdown.

No new admin fields needed — cycle length = `ceil(durationDays / 7)`.

</domain>

<decisions>
## Implementation Decisions

### Cycle Model

- Cycle length = `ceil(plan.durationDays / 7)` weeks — no separate `cycleWeeks` column needed
- Cycle starts at `member_personalizadas.startedAt`, ends at `startedAt + plan.durationDays`
- Calendar-based: cycle ends when the time window passes, regardless of sessions completed
- Session completions during the cycle window are tracked as a completion count/percentage
- Duration of individual sessions (20/40/60 min) doesn't affect cycle progress — any completion counts

### Cycle Completion Behavior

- Soft block + prompt at cycle end: sessions still work, but member sees a prominent "Ciclo completo" wrap-up
- Wrap-up shows: completion percentage (sessions done / expected), duration breakdown (how many 20/40/60 min sessions)
- Two CTAs at wrap-up: "Cambiar Personalizada" or "Consultá en recepción para renovar"
- Duration breakdown serves as debrief — member sees if they skewed toward short sessions

### Renewal

- Renewal archives old personalizada (existing behavior), starts fresh cycle with reset semana counters
- Old cycle data preserved in archived history (already implemented in collapsible section)

### API

- New `GET /personalizadas/stats` endpoint returning cycle progress data:
  - `cycleWeeks`: total weeks in cycle (from plan)
  - `currentWeek`: which week we're in (calendar-based from startedAt)
  - `cycleEndDate`: when the cycle ends
  - `totalCompletions`: sessions completed during this cycle window
  - `durationBreakdown`: `{ d20: N, d40: N, d60: N }` — completions per duration
  - `cycleComplete`: boolean — whether we've passed the end date
- Active personalizada endpoint unchanged — keeps returning semana counters for pipeline use

### Member App — Progress Display

- Default to Personalizadas tab when member has an active personalizada subscription
- Primary display: "Semana 5 de 12" with progress bar
- Secondary: "18 sesiones completadas"
- Replace per-duration semana rows with duration breakdown: "8 sesiones de 20 min, 6 de 40 min, 4 de 60 min"
- At cycle end: wrap-up card replaces progress card — shows completion %, duration breakdown, CTAs

### Admin

- No new field in PlanFormDialog — cycle length derives from existing `durationDays`
- Existing duration field already works: a 90-day personalizada plan = ~13 week cycle

### Claude's Discretion

- Exact progress bar component style (Quasar q-linear-progress or custom)
- Stats endpoint response structure details
- How to calculate "expected sessions" for completion percentage (could be sessions/week × weeks, or just total completions with no expectation)
- Wrap-up card layout and visual design
- Whether to show a mini wrap-up in archived history cards

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema

- `el-templo-api/src/db/schema/subscription-plans.ts` — Plan table with `durationDays` and `isPersonalizada`
- `el-templo-api/src/db/schema/member-personalizadas.ts` — Active personalizada with `startedAt`, semana counters
- `el-templo-api/src/db/schema/completed-sessions.ts` — Completion records with `personalizadaType`, `duration`, `date`

### API

- `el-templo-api/src/modules/personalizadas/routes.ts` — Existing endpoints (add stats endpoint here)
- `el-templo-api/src/modules/personalizadas/service.ts` — PersonalizadasService (add stats query)

### Member App

- `el-templo-app/src/modules/progression/pages/MiCamino.vue` — Tab logic, default tab selection
- `el-templo-app/src/modules/progression/components/PersonalizadaSection.vue` — Current progress display to rework
- `el-templo-app/src/modules/progression/composables/usePersonalizadaProgress.ts` — Data fetching composable (add stats fetch)
- `el-templo-app/src/modules/personalizada/composables/usePersonalizadaApi.ts` — API composable (add stats call)
- `el-templo-app/src/modules/personalizada/types.ts` — Types to extend with stats

### Prior Phase Context

- `.planning/phases/69-personalizadas-subscription-aura-enable/69-CONTEXT.md` — Subscription model decisions

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `PersonalizadaSection.vue`: Already has CTA card, info card, and semana rows — rework semana rows into duration breakdown
- `usePersonalizadaProgress.ts`: Already fetches active + archived + metadata in parallel — add stats fetch
- `checkSubscription` in PersonalizadasService: Already joins subscription_plans — can reuse to get durationDays

### Established Patterns

- Parallel data fetching: `Promise.all([active, archived, metadata])` pattern in usePersonalizadaProgress
- Progress bar: Quasar `q-linear-progress` used elsewhere in the app
- Tab defaulting: MiCamino already has `activeTab` ref — set based on subscription status

### Integration Points

- `personalizadas/routes.ts`: Add `GET /personalizadas/stats` alongside existing endpoints
- `MiCamino.vue`: `showTabs` computed already checks personalizada data — add default tab logic
- `PersonalizadaSection.vue`: Receives props from parent — add stats prop

</code_context>

<specifics>
## Specific Ideas

- The completion percentage debrief should highlight duration distribution so members know if they're doing too many short sessions
- "Semana 5 de 12" is more motivating than "Quedan 49 días" — week framing matches the training mental model
- The wrap-up card should feel like an achievement, not a wall — celebrate what was done, then offer next steps
- Default tab should switch to Personalizadas for active subscribers so they see their progress first

</specifics>

<deferred>
## Deferred Ideas

- Expected sessions per week target (would need a new field — how many sessions/week the plan recommends)
- Personalizada session history timeline (completed sessions with dates, not just counts)
- Coach-editable personalizada metadata (Phase 67 deferred this)
- Per-type AURA amounts (different rewards per personalizada type)
- Notification when cycle is about to end (push notification 1 week before)

</deferred>

---

_Phase: 70-personalizadas-cycle-config_
_Context gathered: 2026-03-19_

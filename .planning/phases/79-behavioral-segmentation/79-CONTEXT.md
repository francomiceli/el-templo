# Phase 79: Behavioral Segmentation - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Auto-calculate 6 behavioral segments from attendance frequency, session completion, and login data. Segments persist on member_profiles, recalculate on login (rolling 28-day window), and are visible in admin as colored chips with filter dropdown. Thresholds are configurable via system_settings with an admin UI section. Cleanup: remove unused grace_period_days from system_settings.

</domain>

<decisions>
## Implementation Decisions

### Segment Definitions

- **D-01:** 6 segments, all internal (never shown to members). Used by coaches/admins for outreach and by future phases (80, 83) to silently drive content personalization.
- **D-02:** Segments and their logic:
  - **Nuevo Guerrero** — First 30 days after registration. Time-based, ignores attendance.
  - **Espartano** — 80%+ of plan budget used in rolling 28 days. The consistent high-performers.
  - **Intermitente** — 40-80% of plan budget used in rolling 28 days.
  - **En Riesgo** — <40% of plan budget for 2+ weeks, OR inactive 2-8 weeks (regardless of subscription status).
  - **Digital Warrior** — High app usage (session completions + logins) but low physical attendance (<40% budget). Detects online-only engagement.
  - **Ghost** — Inactive 8+ weeks (no attendance, no app usage). Applies regardless of subscription status (active, paused, or expired).
- **D-03:** Thresholds are plan-relative (percentage of subscription classesPerWeek budget), NOT fixed attendance counts. A member on a 2x/week plan at 100% attendance = Espartano, not Intermitente.
- **D-04:** "App usage" signal for Digital Warrior/Ghost detection = session completions (completed_sessions table) + login timestamps (track /auth/me calls). Both signals combined.

### Calculation Logic

- **D-05:** Segments recalculate on login only (/auth/me endpoint). Zero infra cost, always fresh for active users. Inactive users naturally stay En Riesgo/Ghost since they don't log in.
- **D-06:** Lookback window: rolling 28 days from calculation time.
- **D-07:** Nuevo Guerrero overrides all other segments for the first 30 days after user registration. After 30 days, switches to attendance-based calculation.
- **D-08:** Segments are fully dynamic — members move up and down freely based on current 28-day behavior. No grace periods, no "once Espartano always Espartano."

### Inactive Member Handling

- **D-09:** En Riesgo = inactive 2-8 weeks. Ghost = inactive 8+ weeks. This applies to ALL members regardless of subscription status (active, paused, expired). Someone gone 1 month is recoverable (coach outreach); someone gone 6 months is likely churned.
- **D-10:** Paused/expired subscription members are NOT excluded from segmentation — they get En Riesgo or Ghost based on inactivity duration.

### Storage

- **D-11:** Add `segment` enum column and `segmentUpdatedAt` timestamp to existing `member_profiles` table. No separate table, no segment history.
- **D-12:** Segment enum values: `nuevo_guerrero`, `espartano`, `intermitente`, `en_riesgo`, `digital_warrior`, `ghost`.

### Configurable Thresholds

- **D-13:** Store all segment thresholds in `system_settings` table (key-value, existing from Phase 60). Keys: `segment.espartano_pct` (default 80), `segment.intermitente_pct` (default 40), `segment.en_riesgo_weeks` (default 2), `segment.ghost_weeks` (default 8), `segment.nuevo_guerrero_days` (default 30), `segment.window_days` (default 28).
- **D-14:** Build a small "Segmentación" config card in admin settings page with number inputs for each threshold. Simple form, no sliders.
- **D-15:** Remove unused `grace_period_days` from system_settings as part of this phase (cleanup).

### Admin UX

- **D-16:** Member list: colored chip per segment. Colors: Nuevo Guerrero = blue, Espartano = green, Intermitente = yellow/amber, En Riesgo = orange, Digital Warrior = purple, Ghost = grey.
- **D-17:** Member list filter: dropdown to show only one segment at a time.
- **D-18:** Member detail page: segment chip displayed alongside existing onboarding profile section. Shows segment name + last updated timestamp.

### Login Tracking

- **D-19:** Track login timestamps for Digital Warrior/Ghost detection. Log each /auth/me call as a lightweight record (userId + timestamp). Can be a simple `member_logins` table or append to onboarding_analytics with a new event type. Claude's discretion on implementation.

### Claude's Discretion

- Segment calculation service architecture (single function vs class, query optimization)
- Login tracking storage approach (new table vs extending existing)
- Admin settings card layout and validation
- Segment chip component design (Quasar badge vs custom)
- Cache strategy for segment calculation (avoid recalculating on every /auth/me if recently updated)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research & Strategy

- `.planning/research/app-engagement-upselling-research.md` — Segment definitions table (Layer 2), behavioral signals, strategy per segment

### Requirements

- `.planning/REQUIREMENTS-v4.4.md` — ENG-05 (auto-calculated segments), ENG-06 (periodic recalculation), ENG-07 (admin visibility + filtering)

### Prior Phase Context

- `.planning/phases/78-onboarding-user-profiling/78-CONTEXT.md` — member_profiles table schema (D-18, D-19), onboarding completion flag pattern, admin profile section pattern

### Existing Code (integration points)

- `el-templo-api/src/db/schema/member-profiles.ts` — Table to extend with segment column
- `el-templo-api/src/modules/analytics/service.ts` — Existing attendance query patterns
- `el-templo-api/src/db/schema/attendance.ts` — Attendance records schema
- `el-templo-api/src/db/schema/subscriptions.ts` — classesPerWeek budget data
- `el-templo-api/src/db/schema/completed-sessions.ts` — Session completion records (app usage signal)
- `el-templo-api/src/db/schema/system-settings.ts` — Key-value settings table for thresholds
- `el-templo-api/src/modules/auth/routes.ts` — /auth/me endpoint where segment recalculates
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` — Member detail page (add segment chip)
- `el-templo-admin/src/pages/AlumnosPage.vue` — Member list page (add segment chip + filter)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **AnalyticsService** (analytics module): Already queries attendance data with date ranges, branch filters. Segment calculation can reuse similar query patterns.
- **system_settings table** (Phase 60): Key-value store already exists. Has `grace_period_days` (to be removed). Ready for segment threshold keys.
- **member_profiles table** (Phase 78): 1:1 with users, already has onboarding data. Extend with segment + segmentUpdatedAt.
- **Quasar q-badge/q-chip**: Existing component for colored labels in admin UI.

### Established Patterns

- **Constructor DI** for services (Phase 56 convention)
- **system_settings access** via SettingsService (Phase 60 — may need review, was kept as empty shell in Phase 61)
- **Admin member list** uses q-table with server-side filtering

### Integration Points

- `/auth/me` handler in auth/routes.ts — trigger segment recalculation here
- Admin member list query — add segment to SELECT and WHERE clauses
- Admin member detail — add segment chip next to onboarding profile section

</code_context>

<specifics>
## Specific Ideas

- Segments are a silent engine — members never see their segment label, but coaches/admins use it for targeted outreach
- Plan-relative thresholds mean a 2x/week plan member at full attendance is still Espartano, not penalized for having a lighter plan
- Digital Warrior detection uses session completion + login count, NOT screen time or page views
- Grace period concept is dead (removed in Phase 61) — clean up the system_settings row in this phase

</specifics>

<deferred>
## Deferred Ideas

- **Segment history tracking** — Log segment changes over time for trend analysis. Not needed for v1.
- **Member-facing segment display** — Showing "Espartano" badge to the member as motivation. Belongs in gamification/streaks (Phase 81).
- **Segment-driven push notifications** — "Te extrañamos" for En Riesgo. Belongs in Phase 84 (Push Notifications).
- **Segment distribution dashboard** — Charts showing how many members in each segment, trends over time. Could be a reports phase enhancement.

</deferred>

---

_Phase: 79-behavioral-segmentation_
_Context gathered: 2026-03-24_

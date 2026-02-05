---
phase: 14-admin-session-review-ui
plan: 06
subsystem: admin-ui
tags: [generation, discarded, hierarchical-controls, admin]
depends_on:
  requires: ["14-02", "14-03"]
  provides: ["session-generation-ui", "discarded-sessions-ui"]
  affects: []
tech-stack:
  added: []
  patterns: ["hierarchical-controls", "status-indicator-component"]
key-files:
  created:
    - el-templo-admin/src/pages/GeneratePage.vue
    - el-templo-admin/src/pages/DiscardedPage.vue
    - el-templo-admin/src/composables/useGenerateApi.ts
  modified:
    - el-templo-api/src/modules/admin/routes.ts
    - el-templo-api/src/modules/admin/service.ts
    - el-templo-api/src/modules/admin/schemas.ts
    - el-templo-admin/src/router/routes.ts
decisions:
  - id: future-weeks-only
    description: Only future weeks (currentWeek + 1) can be regenerated
    rationale: Per CONTEXT.md - cannot modify past or current week sessions
  - id: hierarchical-generation-scope
    description: Generation supports three scopes - Week, Day, Day+Level
    rationale: Flexible control for coaches to regenerate at different granularity
  - id: inline-status-indicator
    description: StatusIndicator component defined inline with defineComponent
    rationale: Simple component pattern for Vue 3 Composition API without separate file
metrics:
  duration: 5min
  completed: 2026-02-05
---

# Phase 14 Plan 06: Generation and Discarded Sessions Pages Summary

Admin generation trigger page with hierarchical controls and discarded sessions browser.

## What Was Built

### Task 1: Admin Generation Endpoints

Added two new endpoints to the admin API:

**GET /admin/weeks/:week/summary**
- Returns status of all sessions for a given week
- Organized by day and level group
- Shows hasSession and status for each day/level combination

**POST /admin/generate**
- Triggers session generation for a week
- Supports hierarchical filtering:
  - `days` - array of specific days to generate
  - `levelGroups` - array of specific level groups
  - `regenerate` - boolean to move existing sessions to discarded
- Returns count of generated and skipped sessions

### Task 2: GeneratePage

Created `GeneratePage.vue` with:

- **Week selector** - Input with min=currentWeek+1 (future weeks only)
- **Validation warning** - Banner shown when selecting past/current week
- **Hierarchical scope controls**:
  - "Semana Completa" - generate all days, all levels
  - "Un Dia" - shows day selector toggle
  - "Dia + Nivel" - shows both day and level selectors
- **Week summary table** - Shows status indicators for each day/level
- **Regenerate checkbox** - Appears when existing sessions in scope
- **Result banner** - Shows generated/skipped counts after operation

### Task 3: DiscardedPage

Created `DiscardedPage.vue` with:

- **Paginated table** - Lists discarded sessions with Q-Table
- **Columns**: Week, Day, Level (with colored chip), Discarded date, Reason
- **Reason tooltip** - Shows full reason for truncated text
- **Actions**:
  - View details - navigates to /sessions/:id
  - Restore - moves session back to pending_review
- **Empty state** - Shows "No hay sesiones descartadas" with icon

## Key Implementation Details

### Future Weeks Only Constraint

Per CONTEXT.md, the generate page enforces that only future weeks can be regenerated:

```typescript
// Week selector has min=currentWeek+1
:min="currentWeek + 1"

// Warning banner when invalid week selected
<q-banner v-if="selectedWeek <= currentWeek" class="bg-warning">
```

### Hierarchical Generation

The API supports flexible generation scopes:

```typescript
// Full week
await generateWeek({ week: 5, regenerate: false });

// Single day
await generateWeek({ week: 5, days: ['lunes'], regenerate: false });

// Single day + level
await generateWeek({ week: 5, days: ['lunes'], levelGroups: ['sigma'], regenerate: false });
```

### Status Indicator Component

Inline Vue 3 component using `defineComponent`:

```typescript
const StatusIndicator = defineComponent({
  props: { status: { type: String, default: null } },
  setup(props) {
    return () => h(QIcon, {
      name: statusToIcon(props.status),
      color: statusToColor(props.status),
      size: 'sm',
    });
  },
});
```

## Deviations from Plan

None - plan executed exactly as written.

## Next Steps

- Plan 14-07 will integrate these pages into the admin navigation
- Consider adding currentWeek API endpoint for dynamic week validation
- May want to add generation progress indicator for large operations

## Files Changed

```
el-templo-api/src/modules/admin/
  routes.ts      - Added getWeekSummary and generateWeek endpoints
  service.ts     - Added service methods for generation
  schemas.ts     - Added validation schemas

el-templo-admin/src/
  pages/GeneratePage.vue       - Session generation page
  pages/DiscardedPage.vue      - Discarded sessions browser
  composables/useGenerateApi.ts - API composable for generation
  router/routes.ts             - Updated routes
```

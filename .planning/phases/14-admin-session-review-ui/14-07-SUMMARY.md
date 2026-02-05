---
phase: 14-admin-session-review-ui
plan: 07
subsystem: admin-workflow
tags: [approval-filter, pending-badge, auto-approve, cron]
completed: 2026-02-05
duration: 4m

dependency-graph:
  requires: [14-01, 14-03]
  provides:
    - member-session-approval-filter
    - admin-pending-count-badge
    - low-sessions-alert
    - auto-approve-cron-job
  affects: [member-app-sessions, admin-workflow]

tech-stack:
  added: [node-cron]
  patterns: [cron-job, store-based-state]

key-files:
  created:
    - el-templo-admin/src/stores/useAdminStore.ts
    - el-templo-api/src/jobs/auto-approve.ts
  modified:
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/src/modules/sessions/service.ts
    - el-templo-api/src/modules/admin/routes.ts
    - el-templo-api/src/modules/admin/service.ts
    - el-templo-api/src/index.ts
    - el-templo-admin/src/layouts/AdminLayout.vue
    - el-templo-admin/src/pages/SessionsPage.vue
    - el-templo-admin/src/pages/SessionDetailPage.vue

decisions:
  - key: requireApproved-parameter
    choice: Optional parameter defaulting to false
    why: Backward compatible - admin endpoints can still access any session
  - key: 404-for-pending
    choice: Return 404 with Spanish message for non-approved sessions
    why: Clear feedback to members that session is not yet available
  - key: coverage-threshold
    choice: Alert when weeksAhead <= 1
    why: Per CONTEXT.md - 1 week threshold for low sessions alert
  - key: cron-timezone
    choice: America/Argentina/Buenos_Aires
    why: Branch timezone for accurate day calculation
  - key: approvedBySystem-flag
    choice: Existing boolean column used (not autoApproved)
    why: Schema already has approvedBySystem, no migration needed

metrics:
  duration: 4m
  tasks: 3/3
  commits: 3
---

# Phase 14 Plan 07: Approval Filter, Pending Badge, Auto-Approve Summary

Member endpoints filter by approved status only, admin layout shows pending count badge with low sessions alert, and sessions auto-approve at 23:59 daily if not reviewed.

## What Was Built

### Task 1: Member Session Endpoints Filtered by Approved Status
- Added `requireApproved` parameter to `getSessionByDayId` method in service.ts
- Updated `/sessions/daily` endpoint to return 404 for non-approved sessions
- Updated `/sessions/weekly` endpoint to return null for days without approved sessions
- Removed auto-generation behavior from member endpoints (admin-only via `/admin/generate`)
- Spanish error message: "La sesion para este dia aun no ha sido aprobada"

### Task 2: Pending Count Badge in Admin Layout
- Created `useAdminStore` with pendingCount, lowSessionsAlert, and weeksAhead state
- Added pending count badge to Sesiones menu item in drawer
- Added warning banner when only current week has approved sessions (weeksAhead <= 1)
- Updated SessionsPage.vue to refresh count after approve/revert/discard/bulk-approve
- Updated SessionDetailPage.vue to refresh count after approval actions

### Task 3: Weeks Coverage Endpoint and Auto-Approve Cron Job
- Added `getApprovedWeeksCoverage` method returning currentWeek, weeksWithApproved, weeksAhead
- Added `GET /admin/sessions/coverage` endpoint for admin store
- Added `autoApprovePendingSessions` method that approves tomorrow's pending sessions
- Created cron job in `src/jobs/auto-approve.ts` running at 23:59 daily
- Cron uses Argentina timezone for accurate day calculation
- Auto-approved sessions marked with `approvedBySystem: true`

## Commits

| Hash | Message |
|------|---------|
| 57e99d1 | feat(14-07): filter member session endpoints by approved status |
| 7fe92f7 | feat(14-07): add pending count badge and low sessions alert to admin |
| 1ce91bd | feat(14-07): add weeks coverage endpoint and auto-approve cron job |

## Deviations from Plan

None - plan executed exactly as written.

## Technical Details

### Approval Filter Logic
```typescript
// In getSessionByDayId
const conditions = [eq(schema.sessions.dayId, dayId)];
if (requireApproved) {
  conditions.push(eq(schema.sessions.status, 'approved'));
}
```

### Auto-Approve Cron Schedule
```typescript
cron.schedule('59 23 * * *', async () => {
  // Approve tomorrow's pending sessions
}, {
  timezone: 'America/Argentina/Buenos_Aires',
});
```

### Admin Store Pattern
```typescript
export const useAdminStore = defineStore('admin', () => {
  const pendingCount = ref(0);
  const lowSessionsAlert = ref(false);

  async function fetchPendingCount() { /* API call */ }
  async function checkSessionCoverage() { /* API call */ }
});
```

## Next Phase Readiness

Phase 14 Plan 08 (final plan) can proceed. All approval workflow components are complete:
- Session status model (14-01)
- Admin endpoints (14-03)
- Sessions list page (14-04)
- Session detail page (14-05)
- Generation and discarded pages (14-06)
- Approval filter, badge, auto-approve (14-07)

---

*Plan 14-07 executed: 2026-02-05*
*Duration: 4 minutes*

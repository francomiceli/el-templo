---
phase: 66-roles-permissions
plan: 02
subsystem: ui
tags: [rbac, roles, permissions, vue, quasar, sidebar, route-guards]

# Dependency graph
requires:
  - phase: 66-roles-permissions
    plan: 01
    provides: "Centralized permission registry, owner role, user management CRUD endpoints"
provides:
  - "Permission-aware sidebar with role-based visibility"
  - "Route guards with role-based redirect to default landing pages"
  - "UsuariosPage for owner-only staff user management"
  - "useUsersApi composable for staff CRUD operations"
  - "Zero superadmin references in admin app frontend"
affects: [admin-app-ui, admin-app-auth, admin-app-navigation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Permission-aware sidebar: isCoachRole, isAdminRole, isCajaRole, isOwnerRole computed props"
    - "Role-based route redirect: defaultPages record per role in beforeEach guard"
    - "Complete allowedRoles meta on every route for page-level enforcement"

key-files:
  created:
    - el-templo-admin/src/composables/useUsersApi.ts
    - el-templo-admin/src/pages/UsuariosPage.vue
  modified:
    - el-templo-admin/src/types/admin.ts
    - el-templo-admin/src/stores/useAuthStore.ts
    - el-templo-admin/src/layouts/AdminLayout.vue
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/router/index.ts
    - el-templo-admin/src/components/MemberNotesTab.vue

key-decisions:
  - "Low sessions alert banner gated behind isCoachRole to avoid showing training alerts to recepcionista"
  - "AdminStore fetchPendingCount and checkSessionCoverage gated behind isCoachRole on mount"

patterns-established:
  - "Permission-aware sidebar: computed role helpers control v-if on sidebar items and sections"
  - "Route-level enforcement: every child route has allowedRoles meta, guard redirects to role default page"

requirements-completed: [ROLES-04]

# Metrics
duration: 4min
completed: 2026-03-18
---

# Phase 66 Plan 02: Frontend Role Enforcement Summary

**Permission-aware sidebar with four role groups, complete route guard enforcement on 22 routes, and UsuariosPage for owner-only staff CRUD**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-18T16:45:10Z
- **Completed:** 2026-03-18T16:49:36Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Replaced all superadmin references with owner across entire admin frontend (zero remaining)
- Refactored sidebar with four computed role helpers matching permission matrix exactly
- Added allowedRoles meta to all 22 routes for complete page-level enforcement
- Created UsuariosPage with QTable + create/edit dialog + activate/deactivate toggle
- Added role-based route redirect (recepcionista goes to /alumnos, others to /sessions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update types, auth store, sidebar, route meta, and route guard** - `a8ec23de` (feat)
2. **Task 2: Create UsuariosPage with staff management UI** - `d38d78fc` (feat)

## Files Created/Modified

### Created

- `el-templo-admin/src/composables/useUsersApi.ts` - API composable for staff CRUD (fetchUsers, createUser, updateUser, toggleUserStatus)
- `el-templo-admin/src/pages/UsuariosPage.vue` - Staff user management page with QTable, create/edit dialog, status toggle

### Modified

- `el-templo-admin/src/types/admin.ts` - AdminRole type updated: superadmin replaced with owner
- `el-templo-admin/src/stores/useAuthStore.ts` - ADMIN_ROLES array updated: superadmin replaced with owner
- `el-templo-admin/src/layouts/AdminLayout.vue` - Refactored sidebar with isCoachRole, isAdminRole, isCajaRole, isOwnerRole computed props; added Usuarios sidebar item under Administracion section
- `el-templo-admin/src/router/routes.ts` - All routes now have allowedRoles meta; superadmin replaced with owner; added usuarios route
- `el-templo-admin/src/router/index.ts` - Role-based redirect in beforeEach guard (recepcionista -> /alumnos)
- `el-templo-admin/src/components/MemberNotesTab.vue` - Fixed superadmin reference to owner in canEdit function

## Decisions Made

- Gated low sessions alert banner and AdminStore onMounted calls behind isCoachRole to avoid showing training-related alerts and fetching session data for recepcionista users who cannot access training pages
- Restructured sidebar sections: Menu (all roles with conditional items), Contenido (owner), Administracion (owner with Solicitudes and Usuarios)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed superadmin reference in MemberNotesTab.vue**

- **Found during:** Task 1 (post-modification superadmin scan)
- **Issue:** MemberNotesTab.vue canEdit function checked for 'superadmin' role, which would never match since DB now uses 'owner'
- **Fix:** Changed 'superadmin' to 'owner' in the role comparison
- **Files modified:** el-templo-admin/src/components/MemberNotesTab.vue
- **Committed in:** a8ec23de (Task 1 commit)

**2. [Rule 2 - Missing Critical] Gated training-related onMounted calls behind isCoachRole**

- **Found during:** Task 1 (sidebar refactoring)
- **Issue:** AdminStore.fetchPendingCount() and checkSessionCoverage() called unconditionally on mount -- these fetch session data that recepcionista role has no access to view
- **Fix:** Wrapped onMounted and route watch calls with isCoachRole.value guard
- **Files modified:** el-templo-admin/src/layouts/AdminLayout.vue
- **Committed in:** a8ec23de (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 missing critical)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None - all changes compiled cleanly via lint-staged pre-commit hook.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Frontend role enforcement complete -- all four roles see only their allowed pages and sidebar items
- Phase 66 (Roles & Permissions) is fully complete (both plans)
- DB migration 0047 must be applied to staging/production before deploying these frontend changes

## Self-Check: PASSED

All 8 files verified. Both task commits (a8ec23de, d38d78fc) confirmed in git log.

---

_Phase: 66-roles-permissions_
_Completed: 2026-03-18_

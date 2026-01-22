---
phase: 02-authentication
plan: 04
subsystem: frontend-auth
tags: [pinia, vue-router, navigation-guards, auth-actions]

dependency-graph:
  requires: ['02-01', '02-02']
  provides: ['auth-store-actions', 'navigation-guards', 'logout-ui']
  affects: ['02-03']

tech-stack:
  added: []
  patterns:
    - Pinia composition API with async actions
    - Vue Router navigation guards
    - Token persistence via composable abstraction

key-files:
  created: []
  modified:
    - el-templo-app/src/stores/useAuthStore.ts
    - el-templo-app/src/layouts/MainLayout.vue
    - el-templo-app/src/router/index.ts
    - el-templo-app/src/router/routes.ts

decisions:
  - decision: "isAuthenticated requires both token AND user"
    rationale: "Prevents stale token from showing authenticated state"
  - decision: "Named routes for guards"
    rationale: "Cleaner than path-based checking, allows route renaming"
  - decision: "Placeholder components for future pages"
    rationale: "Allows guards to work before 02-03 creates actual pages"

metrics:
  duration: 3min
  completed: 2026-01-22
---

# Phase 2 Plan 4: Store Enhancements and Navigation Guards Summary

**One-liner:** Auth store with login/register/logout API actions, MainLayout logout button, and router navigation guards protecting routes.

## What Was Built

### 1. Enhanced Auth Store (`useAuthStore.ts`)

**State changes:**
- `token` no longer reads from localStorage directly (hydration handled by boot file)
- Added `initialized` flag for tracking hydration state
- `isAuthenticated` now requires BOTH token AND user

**New actions:**
- `login(email, password)` - Calls POST /auth/login, persists token, sets user and profile
- `register(data)` - Calls POST /auth/register with branchId, email, password, optional names
- `logout()` - Removes token from storage, clears state, clears user profile

**Integration:**
- Uses `useTokenStorage` composable for platform-agnostic token persistence
- Syncs with `useUserStore` to set/clear profile on auth changes

### 2. MainLayout Updates

**Visual changes:**
- Title changed from "Quasar App" to "El Templo"
- Removed Quasar reference links from drawer

**Functionality:**
- Logout button in header toolbar (visible when authenticated)
- Menu items: Inicio (home), Mi Perfil (profile)
- Logout shows notification and redirects to login

### 3. Navigation Guards

**Protection logic:**
- Public routes: `login`, `register` (no auth required)
- Protected routes: all others (require auth)
- Unauthenticated users redirected to `/login`
- Authenticated users redirected away from login/register to `/`

**Route configuration:**
- Added named routes: `login`, `register`, `home`, `profile`
- Login/register outside MainLayout (no sidebar needed)
- Profile nested under MainLayout
- Placeholder components for pages created in 02-03

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 1a4a95d | feat | Enhance auth store with login/register/logout actions |
| 049c576 | feat | Update MainLayout with El Templo branding and logout |
| 6927d06 | feat | Add navigation guards and named routes |

## Verification Results

- TypeScript: Auth store compiles without errors
- Build: `pnpm build` succeeds
- Routes: Named routes defined (login, register, home, profile)
- Guards: beforeEach navigation guard configured

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added placeholder route components**
- **Found during:** Task 3
- **Issue:** Navigation guards reference pages that don't exist yet (LoginPage, RegisterPage, ProfilePage)
- **Fix:** Used ErrorNotFound.vue as placeholder component for routes
- **Rationale:** 02-03 depends on 02-04 and will create actual pages
- **Files modified:** el-templo-app/src/router/routes.ts

## Integration Points

**For 02-03 (Login/Register/Profile Pages):**
- Routes already defined with correct names
- Replace placeholder component imports with actual page imports
- Auth store actions ready: `authStore.login()`, `authStore.register()`, `authStore.logout()`
- User store ready: `userStore.profile`, `userStore.fullName`, `userStore.displayLevel`

## Next Phase Readiness

Plan 02-03 can now be executed. All required:
- Auth store actions (login, register, logout)
- User store methods (setProfile, clearProfile)
- Route names (login, register, home, profile)
- Navigation guards (working with placeholder pages)

Pages just need to be created and route imports updated.

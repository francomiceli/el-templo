---
phase: 54-quick-fixes-dry-utility-extraction
plan: 03
subsystem: ui, api, testing
tags: [capacitor, vue-router, dompurify, xss, axios, vitest]

# Dependency graph
requires:
  - phase: 51-scheduling
    provides: "Scheduling routes and booking tests"
provides:
  - "Capacitor-safe 401 redirect via vue-router in Axios interceptor"
  - "XSS-sanitized blog editor preview with DOMPurify"
  - "Clean scheduling test suite (no dead seed tests)"
affects: [el-templo-app, el-templo-admin, scheduling-tests]

# Tech tracking
tech-stack:
  added: [dompurify]
  patterns: [boot-scoped-interceptor, sanitized-v-html]

key-files:
  created: []
  modified:
    - el-templo-app/src/boot/axios.ts
    - el-templo-admin/src/pages/BlogEditorPage.vue
    - el-templo-admin/package.json
    - el-templo-api/test/scheduling/scheduling.test.ts

key-decisions:
  - "Move response interceptor inside boot() callback for router access (Quasar pattern)"
  - "DOMPurify v3.3.3 ships own types -- @types/dompurify not needed"

patterns-established:
  - "Boot-scoped interceptor: Axios response interceptor set up inside boot() where router is available"
  - "Sanitized v-html: Always wrap marked/markdown output in DOMPurify.sanitize() before v-html"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 54 Plan 03: Bug Fixes Summary

**Capacitor-safe 401 redirect via vue-router, XSS-sanitized blog preview with DOMPurify, dead seed tests removed**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T20:43:23Z
- **Completed:** 2026-03-11T20:48:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Axios 401 interceptor now uses router.push('/login') instead of window.location.href, fixing Capacitor WebView navigation
- Blog editor preview sanitizes markdown HTML output with DOMPurify, preventing XSS through v-html
- Removed 2 dead seed route tests and 1 seed endpoint auth test reference (seed route was removed in prior phase)
- All 30 remaining scheduling tests pass cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Axios 401 redirect for Capacitor and sanitize blog editor preview** - `5715a3f` (fix)
2. **Task 2: Remove dead scheduling seed route tests** - `acfc79c` (chore)

## Files Created/Modified

- `el-templo-app/src/boot/axios.ts` - Response interceptor moved inside boot() for router access; uses router.push instead of window.location
- `el-templo-admin/src/pages/BlogEditorPage.vue` - renderedPreview computed wraps marked() in DOMPurify.sanitize()
- `el-templo-admin/package.json` - Added dompurify dependency
- `el-templo-api/test/scheduling/scheduling.test.ts` - Removed 2 seed test cases and seed entry from admin auth test

## Decisions Made

- Moved response interceptor inside boot() callback rather than importing router separately -- this is the canonical Quasar pattern since the router instance is only available inside boot({router})
- DOMPurify v3.3.3 bundles its own TypeScript declarations, so @types/dompurify (deprecated stub) was not installed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 54 complete (all 3 plans executed)
- Codebase cleaned: shared error module extracted, admin composable errors DRYed, Capacitor navigation fixed, XSS prevented, dead tests removed

---

_Phase: 54-quick-fixes-dry-utility-extraction_
_Completed: 2026-03-11_

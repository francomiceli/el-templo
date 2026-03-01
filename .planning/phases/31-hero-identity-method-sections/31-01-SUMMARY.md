---
phase: 31-hero-identity-method-sections
plan: 01
subsystem: ui
tags:
  [vue, nuxt, hero, animation, parallax, intersection-observer, css, responsive]

# Dependency graph
requires:
  - phase: 30-design-system-navigation-footer
    provides: Design tokens, button classes, layout utilities, default layout with 64px nav padding
provides:
  - SectionHero.vue full-viewport cinematic hero component
  - useScrollReveal.ts shared IntersectionObserver composable for scroll-triggered animations
affects: [31-02-identity-section, 31-03-method-section, 31-04-page-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      staggered-entrance-animation,
      parallax-scroll,
      scroll-indicator,
      video-ready-fallback,
    ]

key-files:
  created:
    - el-templo-web/components/SectionHero.vue
    - el-templo-web/composables/useScrollReveal.ts
  modified: []

key-decisions:
  - "Used CSS transitions with inline transition-delay via :style for staggered entrance (same pattern as Phase 30 drawer links)"
  - "Parallax uses requestAnimationFrame with matchMedia guard for desktop-only, disabled entirely on mobile"
  - "Hero escapes layout padding-top with negative margin-top (-64px desktop, -56px tablet/mobile) and compensates with padding-top on content"
  - "Video error handler hides video element on failure, letting Deep Charcoal background show through cleanly"
  - "HTML entities used for accented characters (Comenzá, sesión, Abrí) to avoid encoding issues"

patterns-established:
  - "Staggered entrance: toggle reactive boolean via requestAnimationFrame after mount, CSS transition-delay per element via :style"
  - "Parallax: requestAnimationFrame-throttled scroll handler with matchMedia guard and prefers-reduced-motion respect"
  - "useScrollReveal pattern: IntersectionObserver with configurable threshold/rootMargin/once, prefers-reduced-motion auto-reveal"

requirements-completed:
  [HERO-01, HERO-02, HERO-03, HERO-04, HERO-05, HERO-06, HERO-07]

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 31 Plan 01: Hero + Scroll Reveal Summary

**Full-viewport cinematic hero with staggered entrance animation, desktop parallax, video-ready structure, and shared useScrollReveal composable for downstream sections**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T04:57:25Z
- **Completed:** 2026-03-01T05:00:26Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created useScrollReveal composable with IntersectionObserver, configurable options, prefers-reduced-motion support, and project cleanup() pattern
- Built SectionHero.vue with full-viewport sizing (100vh/100svh), warm Deep Charcoal overlay gradient, video-ready HTML, brand typography, two CTAs, staggered entrance, parallax, scroll indicator, and 3-breakpoint responsive scaling
- All CSS uses design token variables exclusively -- no hardcoded colors, no pure black or white

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useScrollReveal composable** - `2a80e94` (feat)
2. **Task 2: Create SectionHero component** - `879bb2f` (feat)

## Files Created/Modified

- `el-templo-web/composables/useScrollReveal.ts` - Shared IntersectionObserver composable for scroll-triggered entrance animations
- `el-templo-web/components/SectionHero.vue` - Full-viewport cinematic hero section with video, overlay, staggered animation, parallax

## Decisions Made

- Used CSS transitions with inline transition-delay via :style for staggered entrance (consistent with Phase 30 nav drawer pattern)
- Parallax implemented with requestAnimationFrame + matchMedia guard (desktop-only at > 768px)
- Hero escapes default layout padding with negative margin-top, compensates on content
- Video element hidden on error via @error handler for clean Deep Charcoal fallback
- Primary CTA scrolls to #descubri-nivel per CONTEXT.md (sesion-prueba section not yet built)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ESLint prefer-const for ref declarations**

- **Found during:** Task 2 (SectionHero component)
- **Issue:** `let scrollY = ref(0)` and `let parallaxEnabled = ref(false)` flagged as prefer-const since refs are never reassigned
- **Fix:** Changed to `const` declarations
- **Files modified:** el-templo-web/components/SectionHero.vue
- **Verification:** pnpm lint passes cleanly
- **Committed in:** 879bb2f (Task 2 commit)

**2. [Rule 1 - Bug] Fixed ESLint template attribute ordering and self-closing rules**

- **Found during:** Task 2 (SectionHero component)
- **Issue:** `id` attribute after `class` (should go before), `<source />` self-closing on void element, `<div></div>` not self-closing
- **Fix:** Reordered attributes, removed self-close on source, added self-close on empty div
- **Files modified:** el-templo-web/components/SectionHero.vue
- **Verification:** pnpm lint passes cleanly
- **Committed in:** 879bb2f (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs - lint errors)
**Impact on plan:** Minor lint fixes, no scope change.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- useScrollReveal composable ready for Plans 02 (Identity) and 03 (Method) to import
- SectionHero component ready for Plan 04 (page integration) to replace index.vue placeholder
- All animations respect prefers-reduced-motion for accessibility

## Self-Check: PASSED

- [x] el-templo-web/composables/useScrollReveal.ts exists
- [x] el-templo-web/components/SectionHero.vue exists
- [x] Commit 2a80e94 (Task 1) verified
- [x] Commit 879bb2f (Task 2) verified

---

_Phase: 31-hero-identity-method-sections_
_Completed: 2026-03-01_

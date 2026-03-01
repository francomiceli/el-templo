---
phase: 32-levels-approaches-conversion-sections
plan: 01
subsystem: ui
tags: [vue, nuxt, tabs, accessibility, aria, css-animation, bem]

# Dependency graph
requires:
  - phase: 31-hero-identity-method-sections
    provides: SectionMethod.vue pattern, useScrollReveal composable, PlaceholderBox component, tokens.css, buttons.css
provides:
  - SectionLevels.vue -- interactive 6-level tab system with full spec copy
  - Keyboard-navigable ARIA tab pattern reusable for future tab UIs
affects:
  [
    32-03 page integration,
    32-02 approaches section (sibling),
    conversion section wiring,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      sliding-underline-indicator,
      css-transform-tab-positioning,
      animating-ref-retrigger,
    ]

key-files:
  created:
    - el-templo-web/components/SectionLevels.vue
  modified: []

key-decisions:
  - "Sliding indicator uses CSS transform (translateX based on tab index) rather than DOM measurement -- simpler, no resize listener needed"
  - "Per-level ghost CTA links to #descubri-nivel (conversion section) rather than WhatsApp per CONTEXT.md discretion"
  - "Mobile falls back to per-tab border-bottom instead of sliding indicator for scroll compatibility"
  - "Mirror phrases use unicode typographic quotes directly in string literals"

patterns-established:
  - "Tab indicator pattern: absolute-positioned div with transform translateX(index * 100%) and width calc(100% / count)"
  - "Animation retrigger: toggle animating ref true then false via nextTick to re-run CSS keyframe animation"

requirements-completed: [NIV-01, NIV-02, NIV-03, NIV-04, NIV-05, NIV-06, NIV-07]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 32 Plan 01: SectionLevels Summary

**Interactive 6-level tab system (Alfa through Olympic) with sliding underline indicator, keyboard navigation, ARIA accessibility, and all approved spec4 copy**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T15:03:00Z
- **Completed:** 2026-03-01T15:05:43Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Built complete SectionLevels.vue with all 6 levels and exact spec copy (headlines, descriptions, mirror phrases)
- Sliding Terracotta underline indicator on desktop with smooth 300ms CSS transition between tabs
- Full ARIA tablist/tab/tabpanel implementation with keyboard arrow navigation (wrapping at ends)
- Responsive mobile layout: horizontal scroll with snap, stacked panel (visual first), per-tab border fallback
- Fade-in panel animation (300ms, translateY 8px) on tab change with prefers-reduced-motion support

## Task Commits

Each task was committed atomically:

1. **Task 1: Build SectionLevels.vue with interactive tab system and all spec copy** - `cfd55e2` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified

- `el-templo-web/components/SectionLevels.vue` - Complete 6-level tab section with interactive tabs, sliding indicator, keyboard nav, ARIA roles, responsive breakpoints, scroll-reveal

## Decisions Made

- Sliding indicator uses CSS transform approach (translateX percentage) rather than reading DOM positions -- avoids resize listeners and simplifies SSR compatibility
- Per-level ghost CTA links to #descubri-nivel (conversion section) per CONTEXT.md discretion, not directly to WhatsApp
- Mobile hides sliding indicator entirely and falls back to per-tab border-bottom-color for active state (scroll containers and absolute positioning don't mix well)
- Used unicode typographic quotes in mirror phrases for proper curly quote rendering

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict null checks on activeData and newLevel**

- **Found during:** Task 1 (typecheck verification)
- **Issue:** `Array.find()` returns `T | undefined` and array index access returns `T | undefined` under strict mode
- **Fix:** Added explicit return type annotation on activeData computed with non-null assertion on fallback, added guard clause for newLevel in handleKeydown
- **Files modified:** el-templo-web/components/SectionLevels.vue
- **Verification:** `npx nuxi typecheck` passes clean
- **Committed in:** cfd55e2 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** TypeScript strictness fix, no scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SectionLevels.vue is ready for integration into index.vue in Plan 03
- Component is self-contained, uses existing composables and CSS tokens
- All 6 level tabs render with exact spec copy, keyboard navigation, and ARIA roles

## Self-Check: PASSED

- FOUND: el-templo-web/components/SectionLevels.vue
- FOUND: cfd55e2 (Task 1 commit)

---

_Phase: 32-levels-approaches-conversion-sections_
_Completed: 2026-03-01_

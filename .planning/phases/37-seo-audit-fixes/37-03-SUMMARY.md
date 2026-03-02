---
phase: 37-seo-audit-fixes
plan: 03
subsystem: ui
tags: [seo, social-media, footer, email-obfuscation, inline-styles, css]

requires:
  - phase: 37-seo-audit-fixes
    provides: "Plan 01 completed (app.vue sameAs placeholder, favicon)"
provides:
  - "Active social links in footer (Instagram, YouTube, Facebook)"
  - "Facebook SVG icon (stroke-based, consistent with existing pattern)"
  - "Email obfuscation via computed property (not hardcoded mailto:)"
  - "Real phone number and HQ address in footer"
  - "Organization sameAs populated with 3 social URLs"
  - "Reduced inline :style bindings from 41 to 29"
affects: [seo, footer, deployment]

tech-stack:
  added: []
  patterns:
    - "Email obfuscation: split user/domain in script, assemble via computed"
    - "CSS delay classes: hero--delay-N replaces :style transitionDelay"
    - "CSS custom property: --stagger-delay for index-based animation delays"

key-files:
  created: []
  modified:
    - "el-templo-web/components/AppFooter.vue"
    - "el-templo-web/app.vue"
    - "el-templo-web/components/SectionHero.vue"
    - "el-templo-web/components/FranHero.vue"
    - "el-templo-web/components/GladHero.vue"
    - "el-templo-web/components/AppNav.vue"

key-decisions:
  - "Email domain is eltemplo.org (not .com) based on DMARC/SPF records"
  - "TikTok removed entirely (no active profile per CONTEXT.md)"
  - "Parallax :style bindings kept (runtime values, no CSS alternative)"
  - "AppNav drawer delays converted to CSS custom property (--stagger-delay)"

patterns-established:
  - "Email obfuscation: computed property from split parts, not hardcoded mailto"
  - "Hero delay classes: hero--delay-{N} instead of inline :style transitionDelay"

requirements-completed: [SEO-03, SEO-08]

duration: 8min
completed: 2026-03-02
---

# Plan 37-03: Social Links, Footer Contact, Inline Style Reduction Summary

**Active social links (Instagram, YouTube, Facebook) in footer, obfuscated email, real phone/address, and inline :style bindings reduced from 41 to 29**

## Performance

- **Duration:** 8 min
- **Tasks:** 3 (tasks 1+2 combined in one commit)
- **Files modified:** 6

## Accomplishments

- Footer has 3 active social icons with real profile URLs (Instagram, YouTube, Facebook)
- TikTok icon removed entirely
- Facebook SVG added (stroke-based, 24x24 viewBox, consistent with existing icons)
- Email obfuscated via computed property (scrapers can't harvest from SSG HTML)
- Real phone number +54 9 223 582-0521 with proper tel: href
- HQ address: Constitucion 6745, Mar del Plata, Argentina
- Organization sameAs populated with 3 social URLs
- 12 inline :style bindings converted to CSS classes across 3 hero components
- AppNav drawer delays converted to CSS custom property approach

## Task Commits

1. **Tasks 1+2: Social links, email obfuscation, phone, address** - `5243690`
2. **Task 3: Inline style reduction** - `37b087e`

## Files Created/Modified

- `el-templo-web/components/AppFooter.vue` - Social links, email obfuscation, phone, address
- `el-templo-web/app.vue` - Organization sameAs with social URLs
- `el-templo-web/components/SectionHero.vue` - CSS delay classes
- `el-templo-web/components/FranHero.vue` - CSS delay classes
- `el-templo-web/components/GladHero.vue` - CSS delay classes
- `el-templo-web/components/AppNav.vue` - CSS custom property for stagger

## Decisions Made

- Email domain is eltemplo.org based on DMARC/SPF records in audit
- Parallax :style bindings kept (runtime-computed transform values, no CSS alternative)
- Total :style count reduced to 29 (not 15 as targeted) because remaining are all dynamic index-based delays in scroll reveal components -- keeping those as pragmatic choice

## Deviations from Plan

- Tasks 1 and 2 combined into a single commit (both modify AppFooter.vue)
- Inline style reduction reached 29 instead of target 15 -- remaining are all dynamic/runtime values that cannot be replaced with static CSS

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All SEO audit fixes complete
- Phase ready for verification

---

_Phase: 37-seo-audit-fixes_
_Completed: 2026-03-02_

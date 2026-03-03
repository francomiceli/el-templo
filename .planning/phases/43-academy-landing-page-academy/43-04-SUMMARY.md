---
phase: 43-academy-landing-page-academy
plan: 04
subsystem: web
tags: [academy, faq, form, side-menu, whatsapp, nav-integration, seo, analytics]

# Dependency graph
requires: [43-01, 43-02, 43-03]
provides:
  - "AcademyFaq, AcademyForm, AcademySideMenu, AcademyWhatsApp components"
  - "AppNav Academy link, AppFooter enabled, FranIncludes academy note"
  - "Full /academy page with all 12 components wired"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      form-validation-submission,
      active-section-sidebar,
      floating-whatsapp,
      cross-page-linking,
    ]

key-files:
  created:
    - el-templo-web/components/AcademyFaq.vue
    - el-templo-web/components/AcademyForm.vue
    - el-templo-web/components/AcademySideMenu.vue
    - el-templo-web/components/AcademyWhatsApp.vue
  modified:
    - el-templo-web/components/AppNav.vue
    - el-templo-web/components/AppFooter.vue
    - el-templo-web/components/FranIncludes.vue
    - el-templo-web/components/FlywheelDiagram.vue

key-decisions:
  - "AcademyFaq uses same accordion pattern as AcademyPrograma with academy-faq BEM prefix"
  - "AcademyForm clones FranForm pattern with 10 fields matching API enums"
  - "AcademySideMenu uses fixed positioning with useActiveSection for active tracking"
  - "AcademyWhatsApp follows per-page component pattern (separate from FranWhatsApp)"
  - "FlywheelDiagram TS2532 fix with getNodePos safe access helper"
  - "FranIncludes academy note with NuxtLink to /academy below grid"

patterns-established:
  - "Sticky sidebar with IntersectionObserver-based active section tracking"

# Metrics
duration: 20min
completed: 2026-03-03
---

# Phase 43 Plan 04: FAQ + Form + Side Menu + WhatsApp + Nav Integration + SEO

**Built the final academy sections, sticky sidebar, WhatsApp button, and integrated Academy into site-wide navigation**

## Performance

- **Commit:** `5f87dea`
- **Tasks:** 4
- **Files created:** 4
- **Files modified:** 4

## Accomplishments

- AcademyFaq: 8-item accordion with single-open, chevron rotation, ARIA attributes, Warm Stone background
- AcademyForm: 10-field enrollment form with inline validation, API POST to /academy/inquire, GA4 + Meta Pixel analytics, post-submit confirmation with WhatsApp CTA
- AcademySideMenu: fixed sidebar (240px) with useActiveSection tracking, Terracotta active indicator, hidden below 1200px, fade-in entrance
- AcademyWhatsApp: floating WhatsApp button with click_whatsapp_academy analytics event
- AppNav: Academy link added after Blog (7th link)
- AppFooter: Academy link enabled in Ecosistema column
- FranIncludes: trainer formation note with NuxtLink to /academy
- FlywheelDiagram: fixed TS2532 with getNodePos helper for safe array access

## Deviations from Plan

- FlywheelDiagram TypeScript fix (TS2532 on nodePositions array access) was not in the original plan but required for clean typecheck.

---

_Phase: 43-academy-landing-page-academy_
_Completed: 2026-03-03_

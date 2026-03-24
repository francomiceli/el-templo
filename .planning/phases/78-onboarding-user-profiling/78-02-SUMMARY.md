---
phase: 78-onboarding-user-profiling
plan: 02
subsystem: app
tags: [vue, quasar, onboarding, quiz, ui, transitions, aura]

# Dependency graph
requires:
  - phase: 78-onboarding-user-profiling
    plan: 01
    provides: POST /onboarding/complete, POST /onboarding/analytics, GET /auth/me with onboardingCompleted
provides:
  - 6-screen onboarding quiz flow (welcome, Q1-Q4, result) in el-templo-app
  - OnboardingPage.vue state machine with slide transitions and auto-advance
  - OnboardingBackground.vue reusable atmospheric background (dust, embers, glow, vignette)
  - OnboardingQuestion.vue reusable question card with option selection and back navigation
  - OnboardingResult.vue profile summary with AURA celebration and particle burst
  - OnboardingProgressDots.vue 4-dot progress indicator with active pulse
  - useOnboardingApi composable (submitOnboarding, recordAnalytics, cleanup)
  - Onboarding types with QUIZ_QUESTIONS data, label maps, SUMMARY_ROWS
  - Router guard redirecting unonboarded members to /onboarding
  - UserStore extended with onboardingCompleted computed and markOnboardingComplete action
  - Onboarding module registered as top-level route (no MainLayout wrapper)
affects: [78-03 tu-camino-card, 79-behavioral-segmentation]

# Tech tracking
tech-stack:
  added: []
  patterns: [quiz state machine with step ref, auto-advance with 400ms setTimeout, slide-left/right Vue Transition, atmospheric background component extraction, top-level route registration for full-screen pages]

key-files:
  created:
    - el-templo-app/src/modules/onboarding/types.ts
    - el-templo-app/src/modules/onboarding/composables/useOnboardingApi.ts
    - el-templo-app/src/modules/onboarding/routes.ts
    - el-templo-app/src/modules/onboarding/index.ts
    - el-templo-app/src/modules/onboarding/pages/OnboardingPage.vue
    - el-templo-app/src/modules/onboarding/components/OnboardingBackground.vue
    - el-templo-app/src/modules/onboarding/components/OnboardingWelcome.vue
    - el-templo-app/src/modules/onboarding/components/OnboardingQuestion.vue
    - el-templo-app/src/modules/onboarding/components/OnboardingResult.vue
    - el-templo-app/src/modules/onboarding/components/OnboardingProgressDots.vue
  modified:
    - el-templo-app/src/stores/useUserStore.ts
    - el-templo-app/src/router/index.ts
    - el-templo-app/src/boot/modules.ts

key-decisions:
  - "Onboarding route registered as top-level (router.addRoute) not under layout parent, since quiz is full-screen without bottom tabs"
  - "OnboardingBackground extracts the full atmospheric background system from LoginPage into a reusable component with configurable logo size"
  - "Auto-advance handled in parent OnboardingPage (400ms setTimeout) not in OnboardingQuestion child, keeping child stateless and reusable"
  - "SCSS particle celebration uses @for loop with random positions -- CSS-only, no JS animation library needed"
  - "Router guard checks role === member before redirecting to onboarding, so coaches/admins are never blocked"

patterns-established:
  - "Quiz state machine pattern: step ref (0-5) with computed screen rendering and direction-based transitions"
  - "Top-level route registration for full-screen pages that bypass MainLayout (registerModule uses router.addRoute not router.addRoute('layout', route))"
  - "Atmospheric background extraction: OnboardingBackground.vue is reusable for any full-screen branded page"

requirements-completed: [ENG-01]

# Metrics
duration: 7min
completed: 2026-03-24
---

# Phase 78 Plan 02: Onboarding Frontend Quiz Summary

**6-screen onboarding quiz with atmospheric LoginPage-matching design, slide transitions, auto-advance on selection, AURA celebration, and mandatory router guard for unonboarded members**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-24T14:19:26Z
- **Completed:** 2026-03-24T14:26:00Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Created complete onboarding module with types, composable, routes, and module index
- Built 6-screen quiz state machine (welcome -> Q1-Q4 -> result) with slide-left/right Vue Transitions
- Implemented atmospheric background component (bg-texture, bg-glow, bg-vignette, 40 dust particles, 5 ember accents, configurable logo)
- Welcome screen with personalized greeting (firstName), Cormorant Garamond subtitle, terracotta gradient Empezar CTA
- Question cards with option buttons (selected state with check_circle icon, terracotta highlight), back arrow navigation
- Result screen with 4-row profile summary (icons + labels + values), +50 AURA pulsing glow, particle burst celebration, Entrar al Templo CTA
- Progress dots indicator (4 dots with active pulse, completed solid, upcoming outline)
- Auto-advance: selecting an option triggers 400ms highlight delay then slides to next question
- Router guard in beforeEach: unonboarded members redirected to /onboarding from any protected route
- Extended UserProfile with onboardingCompleted boolean, computed getter, and markOnboardingComplete action
- Analytics events recorded at each step (quiz_started, question_answered with timing, quiz_completed)
- Exit animation: 800ms opacity fade matching LoginPage exiting pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Types, API composable, store extension, route registration, and router guard** - `349f9315` (feat)
2. **Task 2: OnboardingPage and all sub-components (6-screen quiz with atmospheric design)** - `8470e40e` (feat)

## Files Created/Modified
- `el-templo-app/src/modules/onboarding/types.ts` - GoalType/ExperienceLevel/TrainingFocus/MotivationStyle types, QUIZ_QUESTIONS array, label maps, SUMMARY_ROWS
- `el-templo-app/src/modules/onboarding/composables/useOnboardingApi.ts` - submitOnboarding, recordAnalytics, cleanup with error handling
- `el-templo-app/src/modules/onboarding/routes.ts` - /onboarding route as top-level (no layout parent)
- `el-templo-app/src/modules/onboarding/index.ts` - Module manifest and registerModule with router.addRoute
- `el-templo-app/src/modules/onboarding/pages/OnboardingPage.vue` - Quiz state machine, transitions, analytics, exit animation
- `el-templo-app/src/modules/onboarding/components/OnboardingBackground.vue` - Atmospheric layers (texture, glow, vignette, dust, embers, logo)
- `el-templo-app/src/modules/onboarding/components/OnboardingWelcome.vue` - Greeting + subtitle + Empezar CTA in glass card
- `el-templo-app/src/modules/onboarding/components/OnboardingQuestion.vue` - Reusable question card with options, selection state, back arrow
- `el-templo-app/src/modules/onboarding/components/OnboardingResult.vue` - Profile summary, AURA celebration, particle burst, Entrar al Templo
- `el-templo-app/src/modules/onboarding/components/OnboardingProgressDots.vue` - 4-dot indicator with active pulse
- `el-templo-app/src/stores/useUserStore.ts` - Added onboardingCompleted to UserProfile, computed getter, markOnboardingComplete
- `el-templo-app/src/router/index.ts` - Onboarding guard in beforeEach (members only, checks onboardingCompleted)
- `el-templo-app/src/boot/modules.ts` - Registered onboarding module (route only, not in navigation modules array)

## Decisions Made
- Onboarding route registered as top-level (not under 'layout' parent) because the quiz is full-screen without MainLayout bottom tabs
- OnboardingBackground.vue extracts the full atmospheric background system from LoginPage into a reusable component with configurable logoSize prop
- Auto-advance logic lives in parent OnboardingPage (setTimeout 400ms) rather than in OnboardingQuestion child, keeping child components stateless/reusable
- SCSS particle celebration uses @for loop with random positions for CSS-only animation (no JS animation library)
- Router guard checks `userStore.profile?.role === 'member'` so coaches/admins/owners skip onboarding entirely
- OnboardingResult.vue shows `+{{ auraAwarded || 50 }}` to display 50 before submit and actual amount after

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Known Stubs
None -- all components are fully wired to the API composable, user store, and router. No placeholder data or TODO markers.

## Next Phase Readiness
- Frontend quiz is complete for Plan 03 (Tu Camino card on Mi Camino page) to consume GET /profile
- onboardingCompleted flag drives router guard so all members must complete quiz before accessing app
- OnboardingBackground.vue is reusable if future full-screen pages need the same atmospheric treatment

## Self-Check: PASSED

- All 10 created files verified present on disk
- Both task commits verified in git log (349f9315, 8470e40e)
- TypeScript compiles cleanly (no onboarding-specific errors in vue-tsc --noEmit)

---
*Phase: 78-onboarding-user-profiling*
*Completed: 2026-03-24*

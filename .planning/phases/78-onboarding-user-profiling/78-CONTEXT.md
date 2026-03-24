# Phase 78: Onboarding & User Profiling - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

First-open onboarding flow (4-question quiz with full-screen cards) that creates a member profile in a new `member_profiles` table, awards 50 AURA for completion, and adds a "Tu Camino" summary card to the top of the Mi Camino home screen. Mandatory for all users (including existing members) on first login after deploy. Includes full analytics tracking of the onboarding funnel, admin read-only visibility of member profiles, and slide-transition card-based quiz UI.

</domain>

<decisions>
## Implementation Decisions

### Quiz Content & Flow

- **D-01:** 4-question quiz, not 3. Questions in order: Goal → Experience → Training Focus → Motivation.
- **D-02:** Full-screen card layout — one question per screen, immersive, mobile-first. NOT a stepper or single-page form.
- **D-03:** Slide-left transition between cards (slide right on back). Natural swipe-through-deck feel.
- **D-04:** Welcome screen before Q1: logo, "Bienvenido, [Nombre]", "Respondé 4 preguntas para personalizar tu experiencia", "Empezar" CTA.
- **D-05:** Result screen after Q4: profile summary + 50 AURA reward + CTA to enter app. Combines payoff and gamification intro.
- **D-06:** Total flow: 6 screens (welcome → Q1 → Q2 → Q3 → Q4 → result). Target: under 90 seconds.

### Quiz Questions & Options

- **D-07:** Q1 — ¿Cuál es tu objetivo principal? Options: `muscle_up` (Primer Muscle-Up), `fitness` (Mejor forma física), `weight_loss` (Perder peso), `flexibility` (Flexibilidad), `wellness` (Bienestar general). 5 options.
- **D-08:** Q2 — ¿Cuál es tu experiencia en calistenia? Options: `beginner` (Empiezo de cero), `intermediate` (Algo de experiencia), `advanced` (Entreno hace rato). 3 options.
- **D-09:** Q3 — ¿Qué zona querés priorizar? Options: `upper_body` (Tren superior), `lower_body` (Tren inferior), `core` (Core), `full_body` (Cuerpo completo). 4 options.
- **D-10:** Q4 — ¿Qué te motiva más? Options: `discipline` (Disciplina personal), `community` (Comunidad y compañeros), `results` (Resultados visibles), `challenges` (Desafíos y metas). 4 options.
- **D-11:** Days/week question was intentionally excluded — members already have a plan with stipulated training days.

### "Tu Camino" Path Display

- **D-12:** New section added at TOP of existing Mi Camino page (above current content). Does not replace or restructure existing Mi Camino layout.
- **D-13:** Card content for v1: stated goal + stats summary only. NO milestone path visualization, NO progress bar, NO "next step" recommendations. That comes in later phases (80, 82).
- **D-14:** Users CANNOT edit their quiz answers after onboarding. Profile is locked. Goal reassessment handled in Phase 82 (monthly check-in).

### Trigger & Skip Logic

- **D-15:** Onboarding triggers on first login after deploy — both new registrations AND existing members who haven't completed it.
- **D-16:** Detection: `/auth/me` response includes `onboardingCompleted: boolean` derived from `member_profiles.onboardingCompletedAt IS NOT NULL`. Router guard redirects to `/onboarding` if false.
- **D-17:** NO skip button. Quiz is mandatory. Users must complete all 4 questions before accessing the app.

### Profile Data Model

- **D-18:** New `member_profiles` table with 1:1 relation to `users`. NOT columns on users table, NOT a JSON column.
- **D-19:** Schema: id (PK), userId (FK → users, unique), goalType (enum), experienceLevel (enum), trainingFocus (enum), motivationStyle (enum), onboardingCompletedAt (timestamp, nullable), createdAt, updatedAt.
- **D-20:** Onboarding completion flag derived from `member_profiles.onboardingCompletedAt IS NOT NULL`. No boolean on users table.
- **D-21:** Enum values locked as specified in D-07 through D-10.

### AURA Reward

- **D-22:** 50 AURA awarded on quiz completion. Source type: use existing `manual_adjustment` or add new `onboarding_completion` source type to AURA config.
- **D-23:** Reward shown on result screen as part of the profile summary + AURA celebration.

### Analytics

- **D-24:** Full analytics tracking: quiz start time, per-question duration, answer distribution, completion rate, drop-off point. Needs analytics table or events table + API endpoints.

### Admin Visibility

- **D-25:** Member profile (goal, experience, focus, motivation) visible as read-only section in admin member detail page (el-templo-admin). No edit capability from admin side.

### Brand Copy

- **D-26:** Claude drafts all Spanish copy (welcome, questions, options, result screen) during planning phase, using brand voice from `.docs/` as reference. User reviews before implementation.

### Claude's Discretion

- Progress indicator style on quiz screens (dots, bar, step counter)
- Exact animations and timing for slide transitions
- Loading states during API calls (quiz submission, AURA award)
- Error handling UX (network failure mid-quiz, etc.)
- Analytics table schema and API design

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research & Strategy

- `.planning/research/app-engagement-upselling-research.md` — Full competitive analysis (BetterMe, Freeletics, Strava), 5 initiatives, anti-patterns. Phase 78 is initiative #1.

### Requirements

- `.planning/REQUIREMENTS-v4.4.md` — ENG-01 through ENG-03 are Phase 78 scope (ENG-04 progressive profiling is Phase 82)

### Brand Voice

- `.docs/` directory — Brand texts and copy patterns for Spanish copy drafting (D-26)

### Existing Code (integration points)

- `el-templo-app/src/boot/auth.ts` — Auth boot file where onboarding check hooks in
- `el-templo-app/src/router/index.ts` — Router guards for onboarding redirect
- `el-templo-app/src/boot/modules.ts` — Module route registration pattern
- `el-templo-app/src/modules/progression/pages/MiCamino.vue` — Where Tu Camino card goes (top of page)
- `el-templo-app/src/stores/useUserStore.ts` — Extend to include onboardingCompleted flag
- `el-templo-app/src/pages/RegisterPage.vue` — Form pattern reference (q-form, validation rules)
- `el-templo-api/src/db/schema/users.ts` — Users table (reference for member_profiles FK)
- `el-templo-api/src/modules/aura/service.ts` — AURA award integration
- `el-templo-api/src/modules/aura/types.ts` — AURA source types enum

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **q-form + validation rules pattern** (RegisterPage.vue): Form structure, error handling, loading states
- **LevelDisplay component** (progression module): Greek letter + level name — reusable in result screen
- **TrainingStats component** (progression module): Stats card pattern for Tu Camino card
- **Notify.create()** pattern: Consistent feedback UX throughout app
- **extractError() utility**: Error message extraction for API failures
- **useTokenStorage composable**: Secure storage pattern (Capacitor Preferences)
- **AURA service** (aura module): awardAura() function for quiz completion reward

### Established Patterns

- **Module architecture**: Each feature has routes, pages, stores, composables, types in `src/modules/`
- **Pinia composition API**: `defineStore` with setup function for state management
- **Axios interceptor**: Auth header injection in `boot/axios.ts`
- **Composable pattern**: `useXxxApi` composables for API calls (loading, error refs, Notify feedback)

### Integration Points

- **Router guards** (router/index.ts): Add `requiresOnboarding: false` meta or check in existing auth guard
- **boot/auth.ts**: After token verification, check onboarding status from `/auth/me` response
- **boot/modules.ts**: Register new onboarding module routes
- **Mi Camino page**: Add Tu Camino card component at top of existing content
- **Admin member detail page**: Add read-only profile section

</code_context>

<specifics>
## Specific Ideas

- BetterMe-style full-screen cards but much shorter (4 questions vs 26)
- AURA reward on completion introduces the economy to new users immediately
- Existing `boardingPassUsed` field in users schema is unrelated — don't reuse it
- Quiz is mandatory so every member has profile data — enables reliable segmentation in Phase 79

</specifics>

<deferred>
## Deferred Ideas

- **Milestone path visualization** (full timeline with milestones per goal) — Phase 80 or 82
- **Progressive profiling** (additional questions after sessions) — Phase 82
- **Goal reassessment / profile editing** — Phase 82 (monthly check-in)
- **Skill-based assessment** (Q2 alternative: "can you do X pull-ups?") — considered, chose simpler 3-level experience for v1
- **Days/week question** — excluded because plan already specifies this

</deferred>

---

_Phase: 78-onboarding-user-profiling_
_Context gathered: 2026-03-23_

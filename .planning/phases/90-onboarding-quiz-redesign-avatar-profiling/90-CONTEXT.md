# Phase 90: Onboarding Quiz Redesign & Avatar Profiling - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the current 4-question onboarding quiz with a 5-question avatar profiling system. New quiz captures: age range, training background, goal (gender-conditional), blocker/pain point, and training frequency. Answers map to one of 11 avatar types (A-K) and route to a suggested program (Step 0/1/2). Gender comes from the users table (captured at registration). Only new users go through the avatar quiz — no re-onboarding for existing users.

</domain>

<decisions>
## Implementation Decisions

### Schema Migration

- **D-01:** Add 5 new nullable columns to `member_profiles`: `ageRange`, `trainingBackground`, `painPoint`, `trainingFrequency`, `avatarType`. All nullable — only populated by the new quiz flow.
- **D-02:** Make the existing 4 quiz columns nullable (goalType, experienceLevel, trainingFocus, motivationStyle). The new quiz does not populate them. Existing users retain their old values; new users leave them NULL.
- **D-03:** `avatarType` is a varchar(2) storing the avatar letter (A-K). Computed by the resolution service after quiz completion, stored for fast lookups and admin filtering.
- **D-04:** No new tables — all new fields on existing `member_profiles`. The 1:1 relationship with `users` is maintained.

### Gender Availability

- **D-05:** Add `gender` to the `/auth/me` response and the `UserProfile` interface in the member app user store. Currently captured at registration but not returned by the profile endpoint.
- **D-06:** For users with gender `other` or `unspecified`, Q3 shows ALL goal options (both men's and women's options combined). No exclusion.

### Quiz Questions (5 questions)

- **D-07:** Q1 — "En qué etapa estás?" (age range). Options: `18_28`, `29_40`, `41_plus`.
- **D-08:** Q2 — "Cuál es tu experiencia entrenando?" (training background). Options: `nunca` ("Nunca entrené en serio"), `gym` ("Gym / pesas"), `cardio` ("Correr / nadar / bici"), `yoga_pilates` ("Yoga / pilates / similar"), `calistenia` ("Calistenia / peso corporal"), `deje` ("Entrenaba pero dejé").
- **D-09:** Q3 — "Qué buscás?" (goal, gender-conditional). Universal options: `habito` ("Crear el hábito de entrenar"), `fuerza_general` ("Fuerza y cuerpo completo"), `comunidad` ("Entrenar con gente, pertenecer"). Women also see: `piernas_gluteos` ("Piernas y glúteos que se noten"), `cuerpo_firme` ("Cuerpo firme y funcional"). Men also see: `cero_atleta` ("De cero a atleta"), `skill` ("Dominar un skill (front lever, muscle up, planche)"). 41+ also sees: `longevidad` ("Moverme sin dolor, longevidad"). Gender other/unspecified sees ALL options.
- **D-10:** Q4 — "Qué te frena o te frenó antes?" (pain point). Options: `tiempo` ("No tengo tiempo"), `constancia` ("Siempre empiezo y no sigo"), `no_se_por_donde` ("No sé por dónde empezar"), `ambiente` ("El gym no era para mí"), `resultados` ("Entrené pero no vi resultados"), `nada` ("Nada, estoy listo/a").
- **D-11:** Q5 — "Cuántas veces por semana podés entrenar?" (frequency). Options: `2` ("2 veces"), `3` ("3 veces"), `4` ("4 veces"), `5_plus` ("5 o más").

### No Re-onboarding

- **D-12:** Only NEW users go through the avatar quiz. Existing users who already completed onboarding keep their old profile data. No re-onboarding flow, no upsert endpoint, no "retake quiz" option.
- **D-13:** The `DuplicateOnboardingError` guard stays as-is. The router guard for `onboardingCompleted` stays as-is. Zero changes to existing user flow.

### Avatar Resolution

- **D-14:** Avatar resolution is a pure deterministic function in a shared service file (`avatar-resolution.ts` or similar). Maps (gender + ageRange + trainingBackground + goal + painPoint + frequency) → avatar letter A-K. Implemented as a decision tree, NOT a database lookup.
- **D-15:** The resolution runs server-side after quiz submission. The computed avatarType is stored on `member_profiles` and returned in the response so the app can show the program recommendation immediately.
- **D-16:** The 11 avatars and their mappings (drafted by Claude, reviewed by user):
  - A: El que nunca entrenó — nunca/deje + habito/fuerza_general
  - B: El que solo conoce el gym — gym + fuerza_general/cero_atleta
  - C: Mujer que dejó el gym por el ambiente — female + (gym/deje) + ambiente
  - D: La yogui/pilatera — female + yoga_pilates
  - E: El cardio-dependiente — cardio + any goal
  - F: El que entrenó con pesas toda la vida — male + gym + 35+ or longevidad
  - G: El que busca comunidad — any + comunidad
  - H: Hombre maduro longevidad — male + 41+ + longevidad
  - I: Conexión cuerpo-mente — calistenia + fuerza_general (experienced)
  - J: Mujer cuerpo firme — female + piernas_gluteos/cuerpo_firme
  - K: Mujer joven — female + 18_28 + (not yoga/calistenia)
- **D-17:** Each avatar maps to a suggested program step: A→Step 0, B→Step 1, C→Step 0/1, D→Step 1, E→Step 1, F→Step 1, G→Step 1, H→Step 1, I→Step 1, J→Step 2A, K→Step 0/1. Exact mapping refined during implementation.

### Post-Quiz Recommendation Screen

- **D-18:** After quiz completion, show a "Tu programa sugerido" screen with the recommended program based on avatar → Step mapping. This replaces the current generic "results" screen.
- **D-19:** The recommendation is informational — it does NOT auto-assign a plan or create a subscription. It's a nudge toward the right program.

### Admin Visibility

- **D-20:** Show `avatarType` badge on the admin member detail page (alongside existing level, branch, subscription info).
- **D-21:** Add avatarType as a filter option on the admin members list page.

### Analytics

- **D-22:** Update onboarding analytics events to track new question types: `question_answered` events include the new question keys (ageRange, trainingBackground, goal, painPoint, frequency) and selected values.
- **D-23:** Track avatar resolution as a new analytics event: `avatar_assigned` with the computed avatar letter.

### Claude's Discretion

- Exact UI layout/transitions for the 5-question flow (can follow existing OnboardingPage.vue patterns)
- Decision tree priority ordering when multiple avatars could match
- Fallback avatar when no strong match (default to A)
- Whether the post-quiz recommendation shows a CTA button or just informational text
- Exact avatar labels for admin display

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Avatar Research

- `.docs/avatars-docs/creativo-abc.md` — Avatars A, B, C definitions and pain points
- `.docs/avatars-docs/creativo-defg.md` — Avatars D, E, F, G definitions and pain points
- `.docs/avatars-docs/creativo-hijk.md` — Avatars H, I, J, K definitions and pain points
- `.docs/avatars-docs/dolores-psicologicos.md` — Clinical pain taxonomy by avatar/program

### Product Strategy

- `.docs/product/continuum-programas.md` — Step 0/1/2 program continuum and membership alignment
- `.docs/product/evoluicion-producto.md` — Product evolution: app + presencial separation

### Current Onboarding Implementation

- `el-templo-app/src/modules/onboarding/` — Full frontend onboarding module (page, types, composables)
- `el-templo-api/src/modules/onboarding/` — Backend onboarding service, routes, schemas
- `el-templo-api/src/db/schema/member-profiles.ts` — DB schema for member profiles
- `el-templo-api/src/db/schema/users.ts` — Users table with gender enum

### Goal Plan System (recently expanded)

- `el-templo-api/src/modules/goal-plans/constants.ts` — Route maps, tier maps, metadata for 8 goal plan types
- `el-templo-api/src/modules/goal-plans/types.ts` — GoalPlanType union (includes new gluteos, cuadriceps)

### Admin Member Views

- `el-templo-admin/src/types/member.ts` — OnboardingProfileSummary interface
- `el-templo-admin/src/pages/AlumnosPage.vue` — Member list with filters

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `OnboardingPage.vue` — 6-screen flow with state machine (step 0=welcome, 1-4=questions, 5=results). Can be extended to 7 screens (5 questions + welcome + results) following same pattern.
- `useOnboarding.ts` composable — Handles API calls, analytics tracking, AURA award. Core logic reusable with new question types.
- `onboarding_analytics` table — Already tracks quiz_started, question_answered, quiz_completed, quiz_abandoned events with duration tracking.
- `GOAL_PLAN_METADATA` constant — Has display metadata for all 8 goal plan types. Can inform the recommendation screen.

### Established Patterns

- Quiz questions defined as typed constants in `onboarding/types.ts` with icon, label, key, labels array structure
- Auto-advance after selection with 400ms delay
- Atmospheric design with transitions and progress dots
- AURA reward (50 points) on completion
- Router guard prevents re-entry after completion (`onboardingCompleted` check)

### Integration Points

- `/auth/me` endpoint needs `gender` added to response
- `member_profiles` table gets new columns (migration)
- `OnboardingService.completeOnboarding()` needs to write new fields
- Admin `AlumnosPage.vue` needs avatarType filter
- Admin member detail needs avatarType badge display

</code_context>

<specifics>
## Specific Ideas

- Quiz answer values and Spanish labels were defined in conversation — use exactly as specified in D-07 through D-11
- Avatar resolution matrix (D-16) is a draft — Claude refines the priority logic during implementation, user reviews
- The 11 avatars come from marketing research in `.docs/avatars-docs/` — the quiz is designed to classify users into these specific personas
- Post-quiz "Tu programa sugerido" screen connects to the Step 0/1/2 continuum from `continuum-programas.md`

</specifics>

<deferred>
## Deferred Ideas

- Re-onboarding for existing users — explicitly out of scope per user decision
- Avatar-driven push notification messaging — future enhancement after avatar data is collected
- Avatar-driven daily quote / check-in personalization — future enhancement
- Admin avatar analytics dashboard (avatar distribution, conversion rates by avatar) — future phase

</deferred>

---

_Phase: 90-onboarding-quiz-redesign-avatar-profiling_
_Context gathered: 2026-04-06_

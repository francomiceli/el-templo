# Requirements: El Templo v4.4 — App Engagement & Intelligent Companion

**Defined:** 2026-03-23
**Core Value:** The member app evolves from a passive tool into an intelligent companion that knows who you are, tells you what to do today, tracks your journey, and offers tailored add-ons — making it indispensable for existing gym members and a revenue channel for the business.

## v4.4 Requirements

### Onboarding & User Profiling

- [ ] **ENG-01**: First-open onboarding flow — 3 key questions (skill level, primary goal, training days/week) completed in under 2 minutes
- [ ] **ENG-02**: User profile schema — stores onboarding answers, physical limitations, motivation style, and progressive profiling data
- [ ] **ENG-03**: "Tu Camino" personalized path — generated from onboarding answers, shows current position and next milestone
- [ ] **ENG-04**: Progressive profiling — additional questions surfaced contextually (after 1st session, 3rd session, 1 week) that refine the profile over time

### Behavioral Segmentation

- [ ] **ENG-05**: Auto-calculated behavioral segments from existing attendance and app usage data (Nuevo Guerrero, Espartano, Intermitente, En Riesgo, Digital Warrior, Ghost)
- [ ] **ENG-06**: Segment assignment logic runs periodically (cron or on-login) and updates member records
- [ ] **ENG-07**: Admin visibility — member segment displayed in admin member detail, filterable in member list

### Daily Game Plan ("Tu Día")

- [ ] **ENG-08**: "Tu Día" home screen replaces or enhances Mi Camino — shows today's actionable items (session, class reminder, check-in prompt, progress milestone, active challenge)
- [ ] **ENG-09**: Post-session enhancement — RPE rating flows into personalized next-step recommendation and celebration
- [ ] **ENG-10**: Weekly summary — aggregated stats (sessions, streak, progress) visible in-app and optionally as push notification

### Streaks & Engagement

- [ ] **ENG-11**: Attendance streak tracking — current streak and longest streak stored and prominently displayed
- [ ] **ENG-12**: Post-session celebration — animation/feedback on session or check-in completion
- [ ] **ENG-13**: Milestone celebrations — full-screen celebration on significant achievements (streak milestones, level progression, session count milestones)
- [ ] **ENG-14**: AURA integration — streak milestones and challenge completions award AURA (extends existing AURA economy)

### Periodic Check-ins & Adaptation

- [ ] **ENG-15**: Periodic in-app check-in questions (energy, sleep, soreness) surfaced contextually — not forced
- [ ] **ENG-16**: Goal reassessment — monthly prompt to confirm or update primary goal
- [ ] **ENG-17**: Feedback loop — user inputs (RPE, check-in answers, attendance patterns) produce visible changes in recommendations

### Upselling ("Experiencias a Medida")

- [ ] **ENG-18**: Micro-program data model — purchasable 4-8 week goal-based programs (separate from Personalizadas)
- [ ] **ENG-19**: Micro-program catalog display — browsable in-app with clear value proposition per program
- [ ] **ENG-20**: Contextual upsell CTAs — shown at validated trigger points (post-session, post-milestone, after repeated views of locked content)
- [ ] **ENG-21**: Purchase flow — WhatsApp-mediated or in-app payment (TBD in discuss phase)

### Push Notifications Foundation

- [ ] **ENG-22**: Push notification infrastructure — Capacitor push plugin + backend notification scheduler
- [ ] **ENG-23**: Segment-driven notifications — different notification strategies per behavioral segment
- [ ] **ENG-24**: User notification preferences — opt-in/out controls in profile settings

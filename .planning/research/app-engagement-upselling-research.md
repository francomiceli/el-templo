# App Engagement & Upselling Research

**Date:** 2026-03-23
**Purpose:** Transform el-templo-app from passive content library to intelligent companion with personalization, follow-up, and upselling. Research for milestone v4.4.
**Status:** Raw research — needs GSD discuss/plan refinement before execution

---

## Origin

Team discussion resolved: the member app should be a nice free addition for existing paying members of the physical branches, but also sell them tailored add-ons. Five initiatives identified, refined below with competitive research.

## Current App State

The member app (el-templo-app) currently offers:
- **Mi Camino**: Progression tracking (levels, stats, RPE trends, evaluation requests)
- **Entrenamiento**: Weekly sessions with block structure and timers
- **Reservas**: Class booking with capacity management and waitlist
- **Clases Personalizadas**: Goal-based custom training programs (6 types, cycle-based)
- **Planes**: Plan browsing with WhatsApp CTA for upgrades
- **Check-In**: QR attendance scanning

No onboarding questionnaire, no behavioral segmentation, no in-app purchases, no adaptive recommendations, no periodic check-ins. The app is a "here are things you can do" tool, not a "here's what YOU should do today" companion.

---

## Competitive Research

### BetterMe Calisthenics (primary reference)

**Onboarding:** 39 screens, 26-question quiz across 4 dimensions (profile, activity, lifestyle, nutrition). Interactive 3D body avatar for target area selection. Quiz is a commitment escalation device — by the time user sees the paywall, they've invested 5-7 minutes. High conversion but also high drop-off risk.

**Monetization (~$1.75M/month iOS):**
- Hard paywall after onboarding quiz
- Subscription tiers: weekly ($4.99), 12-week ($29.99), 6-month ($42), annual ($120), lifetime ($1,200)
- Post-subscription one-time upsells ($5-$100 challenges): 20-30% convert
- 1-on-1 coaching add-on ($29.99/12 weeks)
- Equipment store (tracker, scale, kits)
- Web-to-app quiz funnels (12+ micro-niche landing pages) retain 94-97% of revenue vs 70% through app stores

**Daily engagement:** "Daily Game Plan" checklist — mindset chapter + workout + food logging + water tracking + steps. Gated content drip (mindset chapters unlock only with consecutive daily logins).

**Engagement:** Streaks, badges, trigger-based push notifications (+22% retention, 2x click-through). Post-workout celebration animations + difficulty rating feeds next session.

**Weaknesses relevant to us:** 39-screen onboarding too long, aggressive post-sub upsells feel scammy, no physical gym integration, frequent crash reports, auto-renewal billing friction.

### Other Apps — What to Steal vs Avoid

| App | Steal | Avoid |
|---|---|---|
| **Freeletics** | Post-workout difficulty rating → next session adjustment. 90% accuracy personalizing after week 1. | Full ML infra complexity — use rule-based instead |
| **Strava** | Challenges drove 90-day retention 18%→32%. Kudos/social proof. | Outdoor/endurance focus, complex social features |
| **MyFitnessPal** | Streak display is single most effective retention mechanic | Nutrition/calorie focus |
| **Peloton** | Single routing question determines entire onboarding path | Hardware-dependent, $44/mo pricing |
| **Calisteniapp** | Skill tree structure with difficulty tiers | No gym integration, no personalization |

### Industry Data Points

- 41% of gym memberships now include hybrid (digital + physical). 15-20% higher retention.
- 72% of members more likely to stay at gyms with a mobile app for scheduling/progress.
- 35% of members will pay more for add-on perks (personal training, recovery, digital content).
- 80% of members who attend <1x/week in first 30 days cancel within 6 months.
- Hard paywalls convert at 12.11% median vs 2.18% for freemium.
- Trial-to-paid rates: 18-40% in fitness. 7-14 day trials are the sweet spot.
- Annual plans: 67% of health subscribers choose annual when shown weekly price breakdown.
- Personalized push notifications: 54% conversion rates. +18% attendance boost.

---

## Five Initiatives

### 1. "Experiencias a Medida" — Goal-Based Paid Micro-Programs (UPSELLING)

Purchasable 4-8 week micro-programs targeted at specific goals. Not plan upgrades — standalone add-ons any member can buy.

**Example programs:**
- Primer Muscle-Up (progressive skill program with weekly benchmarks)
- Movilidad Completa (4-week mobility/injury prevention)
- Fuerza en Casa (home supplement workouts for low-attendance members)
- Desafío 28 Días (themed monthly challenge: core, pull strength, etc.)

**Upsell placement (research-validated triggers):**
- Post check-in / post-session (high-dopamine moment)
- After milestone achievement (30 sessions, level up, etc.)
- After viewing locked content 3+ times (behavioral intent signal)
- NEVER on cold open or app launch

**Pricing insight:** Show weekly breakdown ("$714/semana" not "$20.000/mes").

**Open questions for discuss phase:**
- In-app payment (Mercado Pago) or WhatsApp-mediated purchase?
- How do micro-programs relate to existing Personalizadas?
- Pricing tiers and currency (ARS, adjusted how often?)
- Coach involvement in micro-program delivery?

### 2. Dual-Layer User Profiling — Stated + Behavioral

**Layer 1 — Stated Profile (onboarding quiz):**
- Current calisthenics level (pull-up count, handstand hold, etc.)
- Primary goal (first muscle-up / general fitness / body composition / flexibility / stress relief)
- Training history (months/years, sport background)
- Available days per week
- Physical limitations
- Motivation style (discipline vs community vs results)

**Layer 2 — Behavioral Segments (auto-calculated from existing data):**

| Segment | Signal | Strategy |
|---|---|---|
| **Nuevo Guerrero** (first 30 days) | Recently registered | Structured onboarding, early wins, daily nudges |
| **Espartano** (3+/week) | Consistent attendance | Advanced challenges, skill progressions, leadership |
| **Intermitente** (1-2x/week) | Irregular attendance | Flexible scheduling, easy re-entry, streak recovery |
| **En Riesgo** (<1x/week for 2+ weeks) | Attendance dropping | "Te extrañamos" + value reminder, pause option |
| **Digital Warrior** (app active, low gym) | High app / low attendance | Home workout upsells |
| **Ghost** (active sub, no app) | Pays but no digital engagement | App onboarding push |

**AI role:** Rule-based routing with AI-generated recommendation copy. Not ML.

**Open questions for discuss phase:**
- Which behavioral signals are already available in our data?
- Push notification infrastructure (Capacitor push + backend scheduler)?
- Privacy considerations for behavioral tracking?

### 3. "Tu Camino" — Progressive Onboarding & CTA Placement

**First open (2-3 minutes max):**
1. Welcome screen with name (already have from registration)
2. 3 key questions: skill level, primary goal, training days/week
3. Show "Tu Camino" — personalized path with first milestone visible
4. Drop into app with first actionable thing to do TODAY

**Progressive profiling (over first 2 weeks):**
- After 1st session: physical limitations
- After 3rd session: motivation style
- After 1 week: nutrition interest
- Each answer refines "Tu Camino"

**CTA placement map:**

| Location | CTA | Purpose |
|---|---|---|
| Mi Camino (home) | "Tu próximo paso" card | Daily engagement |
| Post check-in | Celebration → program suggestion | High-dopamine upsell |
| Post-session | RPE → "Basado en tu progreso..." | Personalized next step |
| Weekly summary (push) | Session count + streak | Reinforcement + pride |
| Milestone achieved | Full-screen celebration → next tier/upsell | Reward + momentum |
| At-risk trigger | "Hace X días... tu racha te espera" | Loss aversion re-engagement |
| Skill tree | Locked next skill visible but grayed | Aspirational pull |

**Open questions for discuss phase:**
- How does "Tu Camino" relate to existing Mi Camino page?
- Redesign Mi Camino or add new section?
- Skill tree data model (reuse level system or new)?

### 4. "Tu Día" — Daily Game Plan (Passive → Active Transformation)

The core UX shift. App transforms from "here are things you can do" to "here's what YOU should do today."

**Daily loop:**
```
OPEN APP → "Tu Día" (Today's Game Plan)
  ├── Tu Sesión de Hoy (assigned workout or class reminder)
  ├── Tu Check-In (periodic: sleep, energy, soreness)
  ├── Tu Progreso (skill milestone approaching)
  └── Tu Desafío (active challenge progress)
```

**Post-session:**
- RPE rating + quick feedback
- AI-generated insight ("Progresás más rápido que el 70% en tu nivel")
- Next step recommendation
- Celebration if milestone hit

**Weekly:** Summary push (sessions, streak, progress) + path update + check-in question

**Monthly:** Full progress report + goal reassessment + new challenge suggestion

**Feedback loop (rule-based, no ML):**

| User Input | System Response |
|---|---|
| RPE rating (1-10) | Adjust next session intensity |
| Attendance frequency | Route to segment strategy |
| Skill self-assessment | Update progression path |
| Goal check-in answer | Adjust recommendations |
| Session completion rate | Unlock next difficulty tier |
| Stated limitations | Filter exercise variants |

**Key principle:** Every input produces visible, immediate output. "I told the app I'm tired" → easier session. "I said my goal" → path to get there.

**Open questions for discuss phase:**
- Replace Mi Camino home or add new "Tu Día" tab?
- How deep is the daily check-in (1 question vs multiple)?
- AI-generated insights: use Claude API or pre-computed rules?
- Push notification infrastructure needed?

### 5. Streak & Engagement Mechanics

Lowest effort, highest retention ROI based on research.

- **Attendance streaks** with prominent display (current + longest)
- **Post-session celebration** animation
- **Monthly AURA challenges** tied to skills (already have AURA economy tables)
- **Progress visualization** (skill trees, before/after tracking)
- **Periodic check-ins** that feed back into recommendations

---

## Suggested Build Priority

| # | Initiative | Depends On | Effort | Impact |
|---|---|---|---|---|
| 1 | Onboarding quiz (3 questions) + "Tu Camino" path | Nothing | Medium | High — everything else needs user profile |
| 2 | "Tu Día" daily game plan on home screen | #1 (needs profile) | Medium | High — transforms daily experience |
| 3 | Behavioral segmentation (auto from attendance data) | Nothing (data exists) | Low-Medium | High — enables targeted strategies |
| 4 | Streaks + celebrations + engagement | Nothing | Low | High — best effort/retention ratio |
| 5 | Periodic check-ins (progressive profiling) | #1 | Low | Medium — enriches profiles over time |
| 6 | Micro-program upsells | #1, #2, #3 | High | Medium — revenue, but needs profile data |
| 7 | AI-generated insights/recommendations | #1-#5 | Medium | Medium — cherry on top |

---

## What NOT to Build (Anti-Patterns from Research)

- 39-screen onboarding (BetterMe) — our users are already paying gym members, they'll bounce
- Hard paywall on a gym companion app — the app is a free value-add, upsells are optional
- Aggressive back-to-back post-subscription upsells — erodes trust
- Full ML personalization engine (Freeletics) — rule-based is enough for our scale
- Calorie/nutrition tracking — not our domain, not our value prop
- In-app workout music/voice coaching — high effort, low differentiation

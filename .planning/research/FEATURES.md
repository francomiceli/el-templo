# Feature Landscape

**Domain:** Fitness Training App for Gym Business (SPOM Methodology)
**Researched:** 2026-01-22
**Confidence:** HIGH (grounded in El Templo's specific requirements + industry research)

---

## Executive Summary

El Templo occupies a unique position: it's NOT a generic workout library app, but a guided training system built on proprietary SPOM periodization. This fundamentally changes the feature landscape. Table stakes focus on session execution quality, not workout discovery. Differentiators leverage the structured progression that SPOM enables. Anti-features explicitly exclude patterns that conflict with coach-driven methodology.

---

## Table Stakes

Features users expect from any training app. Missing these creates friction or abandonment.

| Feature | Why Expected | Complexity | El Templo Notes |
|---------|--------------|------------|-----------------|
| **Quick session start** | Users want to begin training immediately, not navigate menus | Low | Weekly view + "Today" highlight → one tap to play |
| **Clear exercise instructions** | Users need to know what to do | Medium | Exercise name + reps/duration + video placeholder (real videos later) |
| **Workout timers** | Interval training requires timing | Medium | EMOM, AMRAP, For Time are core to SPOM block formats |
| **Progress tracking** | Users want to see their work accumulate | Medium | Session completion logs, weekly/monthly summaries |
| **Session history** | Users reference past workouts | Low | Completed sessions with date, duration, RPE |
| **Rest period management** | Users need cues between sets/blocks | Low | Timer auto-transitions, audio/haptic cues |
| **Screen stays awake** | Mid-workout screen lock is infuriating | Low | `@capacitor-community/keep-awake` essential |
| **Visual block progression** | Users need orientation within workout | Low | 4-block structure with distinct colors per PROJECT.md |
| **Session completion confirmation** | Users want closure + acknowledgment | Low | Summary screen with stats + "Finish Session" |
| **Works reliably** | App must not crash mid-workout | High | Stability > features; timer state must persist through backgrounding |

**Industry stat:** 45% of gym members would leave if app lacks workout tracking. Members who track visit 3x more often.

---

## Differentiators

Features that set El Templo apart. Not expected, but create competitive advantage.

| Feature | Value Proposition | Complexity | Why El Templo Can Do This |
|---------|-------------------|------------|---------------------------|
| **Algorithmic session generation** | "You don't plan workouts, we do" | High | SPOM rules + 1869 exercises = no planning burden |
| **Level-appropriate exercises** | Same session structure, difficulty matches ability | Medium | 5 levels (Alfa→Spartan) filter exercise database |
| **Visible level progression** | Training leads somewhere meaningful | Medium | RPE history → coach evaluation → level-up |
| **Gym-wide synchronization** | "We're all on Week 27 together" | Low | Community effect without social features overhead |
| **Block-structured training** | Professional periodization accessible to everyone | Low | SPOM's 4-block format (Initium, Nucleus, Deuteros, Athlos/Epikos) |
| **RPE-based feedback loop** | Subjective effort informs progression | Low | Simple 1-10 slider creates data for coach decisions |
| **Coach visibility** | Coaches see member trends, not just attendance | Medium | RPE trends, completion rates, level readiness |
| **Coach override capability** | Coaches can adapt while system runs | Medium | Override specific blocks with GENERAL patterns |
| **Multi-branch support** | Same system across locations | Medium | Branch-aware from day one per constraints |
| **Academy pathway** | Training unlocks education | Low (v1) | Sigma level gates Academy access (future module) |

**Unique positioning:** Most fitness apps are either:
1. **Workout libraries** (you choose) - Nike Training Club, JEFIT
2. **AI-generated programs** (algorithm chooses) - Fitbod, WHOOP
3. **Tracking-only** (you record) - Strong, Hevy

El Templo is none of these. It's **coached periodization at scale**: the gym's methodology, algorithmically delivered, with progression tied to real training + coach oversight.

---

## Anti-Features

Features to explicitly NOT build. Common in fitness apps but conflict with SPOM methodology or create user harm.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Workout library browsing** | Undermines SPOM structure; members shouldn't choose random workouts | Show only today's generated session |
| **Custom workout builder** | Conflicts with periodization; creates paralysis of choice | Coaches override blocks when needed, members follow |
| **Calorie/macro tracking** | Research shows shame/guilt spiral (2025 studies); not core to training value | Focus on training execution, not nutrition logging |
| **Social feed** | Scope creep; belongs in Agora module | Defer to future Agora phase |
| **Public leaderboards** | Can demotivate lower performers; levels already stratify fairly | Private progress + level badges are sufficient |
| **Streak-shaming notifications** | "You missed 3 days!" creates anxiety and guilt | Positive framing only: "Your next session is ready" |
| **Complex goal setting** | Users set unrealistic goals, then feel failure | SPOM sets the goals implicitly through periodization |
| **Excessive gamification** | Badges for everything dilutes meaning | Only meaningful milestones: level-ups, certifications |
| **Achievement spam** | Constant "You did 10 squats!" notifications annoy users | Reserve for real accomplishments (session complete, level up) |
| **Rigid daily targets** | Algorithms setting impossible goals causes frustration (per research) | SPOM provides structure, RPE captures reality |
| **Manual exercise logging** | Tedious; transforms training into data entry | Auto-generate session, member just marks complete |
| **Weight/rep tracking per set** | Overcomplicates; not needed for SPOM's intensity-based model | Block completion is the unit of progress |
| **Wearable-required features** | Not all members have smartwatches | Nice-to-have integration, but core works without |
| **AI chat/coaching** | Dilutes real coach relationship; creates liability | Coach visibility features, not AI replacement |

**Research basis:** 2025 studies found that rigid goals, calorie tracking, and streak anxiety in apps like MyFitnessPal create "shame, guilt, and demotivation" that undermine health goals. El Templo should avoid these patterns entirely.

---

## Feature Dependencies

```
Authentication
    └── Member Profile (branch, level)
            └── Session Generation
                    └── Day Player
                            ├── Timer System (EMOM, AMRAP, For Time)
                            ├── Block Progression
                            └── Session Completion
                                    └── RPE Input
                                            └── Level Progression Tracking
                                                    └── Coach Evaluation Request
                                                            └── Level Promotion

SPOM Engine (parallel track)
    ├── Periodization Rules Import
    ├── Exercise Database Import
    └── Weekly State Management
            └── Feeds → Session Generation

Coach Functions (depends on member data)
    ├── Member List View
    ├── Training History View
    ├── RPE Trend Analysis
    ├── Level Promotion
    └── Block Override
```

**Critical path for MVP:** Authentication → SPOM Engine → Session Generation → Day Player → Session Completion

---

## MVP Feature Definition

### Phase 1: Core Loop (Must Ship)

**Goal:** Member can see today's session, execute it with timers, and record completion.

| Feature | Priority | Rationale |
|---------|----------|-----------|
| Email/password auth | MUST | Can't track progress without identity |
| Member profile (branch, level) | MUST | Level determines exercises shown |
| SPOM periodization import | MUST | No sessions without rules |
| Exercise database import | MUST | No exercises to show without data |
| Session generation | MUST | Core value proposition |
| Weekly view with today highlighted | MUST | Entry point to training |
| Day Player with 4-block structure | MUST | Core training experience |
| EMOM timer | MUST | Most common SPOM format |
| AMRAP timer | MUST | Second most common |
| For Time timer | MUST | Third format needed |
| Block completion flow | MUST | Progression through session |
| Session completion with RPE | MUST | Closes the loop, captures data |
| Session history view | MUST | Members expect to see past work |

### Phase 2: Progression System

**Goal:** Training accumulates toward visible progress.

| Feature | Priority | Rationale |
|---------|----------|-----------|
| Level progression tracking | HIGH | Differentiator: training means something |
| RPE trend visualization | HIGH | Informs coach decisions |
| Coach member list view | HIGH | Coaches need visibility |
| Coach RPE trend view | HIGH | Evaluation readiness signal |
| Level promotion (coach action) | HIGH | Closes progression loop |
| Evaluation request (member action) | MEDIUM | Member agency in progression |

### Phase 3: Coach Tools

**Goal:** Coaches can adapt the system while it runs.

| Feature | Priority | Rationale |
|---------|----------|-----------|
| Training history detail view | MEDIUM | Coach needs context for decisions |
| Block override capability | MEDIUM | Coach customization without breaking SPOM |
| Multi-branch member filtering | MEDIUM | Scale to multiple locations |

### Deferred (Post-MVP)

| Feature | Why Defer | When to Build |
|---------|-----------|---------------|
| Exercise videos (real) | Content creation parallel track | Incremental replacement of placeholders |
| Push notifications | Not core to training value | After retention data shows need |
| Offline mode | PWA caching sufficient for v1 | After usage patterns show need |
| Wearable integration | Nice-to-have, not essential | After core is solid |
| Academy module | Requires Training foundation + Sigma gate | Separate milestone |
| Agora module | Requires Academy foundation | Future milestone |

---

## Complexity Estimates

| Feature Category | Complexity | Notes |
|------------------|------------|-------|
| Authentication | Low | Standard JWT flow |
| SPOM Engine | High | Excel parsing + rule encoding + weekly state |
| Exercise Database | Medium | 1869 records, queryable by pattern/level/category |
| Session Generation | High | Complex rules, multiple block types, intensity mapping |
| Day Player | Medium | State machine for block flow, visual distinction |
| Timer System | Medium | Three formats, pause/resume, background handling |
| Session Completion | Low | Form + API call |
| Progress Tracking | Low | Queries on session history |
| Level Progression | Medium | Threshold logic + coach workflow |
| Coach Dashboard | Medium | Different role, different views |

---

## Competitive Landscape Context

| App Type | Examples | El Templo Difference |
|----------|----------|---------------------|
| Workout Libraries | Nike Training Club, JEFIT | No browsing; SPOM generates |
| AI Programs | Fitbod, WHOOP | Not AI; real methodology + coach oversight |
| Tracking Only | Strong, Hevy | Not just logging; guided execution |
| Gym Branded Apps | Glofox, Trainerize | Not white-label; proprietary methodology |
| CrossFit Timers | SmartWOD, WODProof | Timers + periodization, not just timers |

**El Templo's category:** Methodology-driven training system with progression

---

## Sources

### Industry Research
- [Fitness App Essential Features 2025-2026](https://www.garagegymreviews.com/best-workout-apps) - HIGH confidence
- [Gym Member Retention Statistics 2025](https://smarthealthclubs.com/blog/100-gym-membership-retention-statistics/) - HIGH confidence
- [Gamification in Fitness Apps](https://yukaichou.com/gamification-analysis/top-10-gamification-in-fitness/) - HIGH confidence
- [Why Fitness Apps Fail Users](https://www.consagous.co/blog/from-download-to-delete-the-real-reasons-fitness-apps-fail-users) - MEDIUM confidence

### Anti-Pattern Research
- [Fitness Apps May Demotivate Users - 2025 Study](https://studyfinds.org/fitness-app-motivation-study-myfitnesspal/) - HIGH confidence (peer-reviewed)
- [The Dark Side of Fitness Apps - Newsweek](https://www.newsweek.com/fitness-apps-study-says-they-can-do-more-harm-than-good-10913928) - MEDIUM confidence

### Retention Strategies
- [Gym Member Retention Strategies 2025 - Trainerize](https://www.trainerize.com/blog/gym-member-retention-strategies/) - HIGH confidence
- [White Label Gym Apps 2025](https://www.glofox.com/blog/branded-app-for-small-gyms/) - MEDIUM confidence

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|------------|-----------|
| Table Stakes | HIGH | Industry consensus, multiple sources |
| Differentiators | HIGH | Grounded in El Templo's specific SPOM methodology |
| Anti-Features | HIGH | 2025 research + alignment with project philosophy |
| Dependencies | HIGH | Logical from PROJECT.md requirements |
| MVP Definition | HIGH | Matches PROJECT.md active requirements |
| Complexity Estimates | MEDIUM | Based on similar project experience, not verified |

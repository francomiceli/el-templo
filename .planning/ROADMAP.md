# Roadmap: El Templo Training Module

## Overview

This roadmap delivers the Training module for El Templo App: a SPOM-powered session generation system where members see their daily workout, execute guided sessions with block structure and timers, track completion, and progress through levels under coach oversight. The journey starts with foundation and authentication, builds the SPOM engine for algorithmic session generation, delivers the member-facing training UI (weekly view, day player, timers), and concludes with progression tracking and coach functions. Each phase delivers working, verifiable functionality.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Backend/frontend scaffolding, database schema, shell architecture
- [ ] **Phase 2: Authentication** - User registration, login, session persistence, branch/level assignment
- [ ] **Phase 3: Shell & Module System** - Module registry, global stores, Capacitor bridge
- [ ] **Phase 4: SPOM Engine** - Exercise database import, periodization rules, weekly state tracking
- [ ] **Phase 5: Session Generation** - Daily session generation from SPOM week + member level
- [ ] **Phase 6: Weekly View** - 7-day calendar with session preview and completion status
- [ ] **Phase 7: Day Player** - Block flow UI, exercise display, video placeholders
- [ ] **Phase 8: Timer System** - EMOM, AMRAP, For Time timers with background handling
- [ ] **Phase 9: Session Completion & Logging** - RPE input, session summary, full event audit trail
- [ ] **Phase 10: Progression & Coach Functions** - Level display, RPE trends, coach promotion, block overrides

## Phase Details

### Phase 1: Foundation
**Goal**: Establish project skeleton with working backend, frontend, and database ready for feature development
**Depends on**: Nothing (first phase)
**Requirements**: ARCH-01, ARCH-03, ARCH-04
**Success Criteria** (what must be TRUE):
  1. Quasar frontend runs in dev mode with Capacitor configured for iOS/Android
  2. Fastify backend starts and responds to health check endpoint
  3. MySQL database connects with schema for users, branches, and roles
  4. Role system distinguishes member, coach, admin, superadmin in data model
  5. Project structure supports future module boundaries (Academy/Agora paths exist)
**Plans**: 4 plans in 2 waves

Plans:
- [x] 01-01-PLAN.md — Scaffold Quasar frontend with Capacitor mode
- [x] 01-02-PLAN.md — Scaffold Fastify backend with Drizzle and health endpoint
- [x] 01-03-PLAN.md — Create database schema (users, branches) and seed data
- [x] 01-04-PLAN.md — Create Pinia stores and API client

### Phase 2: Authentication
**Goal**: Members can securely create accounts, log in, and maintain sessions across app restarts
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. Member can register with email and password, receives confirmation
  2. Member can log in and remains logged in after closing and reopening app
  3. Member can log out from any screen in the app
  4. Member is automatically assigned to a branch during registration
  5. Member starts at Alfa level and can see their level in profile
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

### Phase 3: Shell & Module System
**Goal**: Training module can register and load as a pluggable module within the shell
**Depends on**: Phase 2
**Requirements**: ARCH-02
**Success Criteria** (what must be TRUE):
  1. Training module registers via manifest and appears in navigation
  2. Module routes are lazy-loaded only when accessed
  3. Global Pinia stores (auth, user) are accessible from within module
  4. API client with auth interceptors works from module context
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: SPOM Engine
**Goal**: System has complete exercise database and periodization rules ready for session generation
**Depends on**: Phase 1
**Requirements**: SPOM-01, SPOM-02, SPOM-03, SPOM-04, SPOM-05, SPOM-06
**Success Criteria** (what must be TRUE):
  1. 1869 exercises imported with full metadata (pattern, category, position, effort type, level)
  2. SPOM periodization rules imported from spreadsheet data
  3. Admin can view and set current gym-wide SPOM week (1-52)
  4. System knows active intensity wave (Senoidal/Shockwave/Triangular/Fractal)
  5. Exercises can be queried by pattern + category + level + contraction type
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Session Generation
**Goal**: System generates complete daily sessions algorithmically from SPOM state and member level
**Depends on**: Phase 4
**Requirements**: SGEN-01, SGEN-02, SGEN-03, SGEN-04, SGEN-05, SGEN-06, SGEN-07
**Success Criteria** (what must be TRUE):
  1. Member receives daily session based on current SPOM week and their level
  2. Session has 4 distinct blocks: Initium, Nucleus, Deuteros, Athlos/Epikos
  3. Exercise selection follows contraction-type rules based on intensity
  4. Exercise count per block matches intensity mapping (4-5 at 55%, 2-3 at 95%)
  5. Block patterns follow weekly rotation rules with Nucleus opposite to Athlos/Epikos
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

### Phase 6: Weekly View
**Goal**: Members see their training week at a glance and can navigate to any day
**Depends on**: Phase 5
**Requirements**: WEEK-01, WEEK-02, WEEK-03, WEEK-04, WEEK-05
**Success Criteria** (what must be TRUE):
  1. Member sees 7-day week view (Lun-Dom) with all training days
  2. Each day shows session name and intensity indicator
  3. Today is highlighted, completed days show checkmark, rest days have distinct state
  4. Member can tap any day to preview that session
  5. Member can tap today to start the Day Player
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

### Phase 7: Day Player
**Goal**: Members execute sessions through guided block-by-block flow with exercise display
**Depends on**: Phase 6
**Requirements**: PLAY-01, PLAY-02, PLAY-03, PLAY-04, PLAY-05, PLAY-06, PLAY-07, PLAY-08, PLAY-09, PLAY-10
**Success Criteria** (what must be TRUE):
  1. Member sees session as sequential block flow with clear progression
  2. Each block has distinct visual identity (Initium blue, Nucleus primary, Deuteros secondary, Athlos amber)
  3. Each block displays exercise list with reps/duration and video placeholder
  4. Member taps "Complete Block" to progress to next block
  5. Screen stays awake during active session (no auto-lock)
**Plans**: TBD

Plans:
- [ ] 07-01: TBD

### Phase 8: Timer System
**Goal**: Members can execute timed protocols (EMOM, AMRAP, For Time) with reliable background operation
**Depends on**: Phase 7
**Requirements**: TIME-01, TIME-02, TIME-03, TIME-04, TIME-05, TIME-06, TIME-07
**Success Criteria** (what must be TRUE):
  1. EMOM timer counts down 60s, auto-resets, displays current round
  2. AMRAP timer counts down from set duration, member logs rounds completed
  3. For Time timer counts up, member hits "Done" when finished
  4. Straight Sets mode shows exercise list with sets/reps, no timer
  5. Timer can be paused and resumed, continues when app is backgrounded
  6. Audio/haptic cues fire at timer transitions
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

### Phase 9: Session Completion & Logging
**Goal**: Members complete sessions with RPE input and system maintains full audit trail
**Depends on**: Phase 8
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, COMP-06, EVNT-01, EVNT-02, EVNT-03, EVNT-04, EVNT-05
**Success Criteria** (what must be TRUE):
  1. After all blocks, member sees closure screen with session summary
  2. Member can input RPE (1-10 scale) and optional notes
  3. Session summary shows blocks completed, total duration, exercises performed
  4. Member hits "Finish Session" to save with date, branch, and all block data
  5. Every interaction is timestamped (block_started, block_completed, timer events)
  6. Timer results (AMRAP rounds, For Time duration) are recorded
**Plans**: TBD

Plans:
- [ ] 09-01: TBD

### Phase 10: Progression & Coach Functions
**Goal**: Members track level progression, coaches manage their branch members
**Depends on**: Phase 9
**Requirements**: PROG-01, PROG-02, PROG-03, PROG-04, COACH-01, COACH-02, COACH-03, COACH-04, COACH-05
**Success Criteria** (what must be TRUE):
  1. Member can see their current level (Alfa/Delta/Sigma/Omega/Spartan)
  2. System tracks member RPE history and shows trends over time
  3. When RPE threshold met over defined period, member can request coach evaluation
  4. Coach can view list of members in their branch with training history
  5. Coach can promote member to next level, changes are logged
  6. Coach can override specific blocks with GENERAL patterns (Animal Flow, Cardio, etc.)
**Plans**: TBD

Plans:
- [ ] 10-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 2026-01-22 |
| 2. Authentication | 0/0 | Not started | - |
| 3. Shell & Module System | 0/0 | Not started | - |
| 4. SPOM Engine | 0/0 | Not started | - |
| 5. Session Generation | 0/0 | Not started | - |
| 6. Weekly View | 0/0 | Not started | - |
| 7. Day Player | 0/0 | Not started | - |
| 8. Timer System | 0/0 | Not started | - |
| 9. Session Completion & Logging | 0/0 | Not started | - |
| 10. Progression & Coach Functions | 0/0 | Not started | - |

---
*Roadmap created: 2026-01-22*
*Last updated: 2026-01-22 — Phase 1 complete*

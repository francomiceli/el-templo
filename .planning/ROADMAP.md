# Roadmap: El Templo Training Module

## Overview

This roadmap delivers the Training module for El Templo App: a SPOM-powered session generation system where members see their daily workout, execute guided sessions with block structure and timers, track completion, and progress through levels under coach oversight. The journey starts with foundation and authentication, builds the SPOM engine for algorithmic session generation, delivers the member-facing training UI (weekly view, day player, timers), and concludes with progression tracking and coach functions. Each phase delivers working, verifiable functionality.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Backend/frontend scaffolding, database schema, shell architecture
- [x] **Phase 2: Authentication** - User registration, login, session persistence, branch/level assignment
- [x] **Phase 3: Shell & Module System** - Module registry, global stores, Capacitor bridge
- [x] **Phase 4: SPOM Engine** - Exercise database import, periodization rules, weekly state tracking
- [ ] **Phase 5: Session Generation** - Daily session generation from SPOM week + member level
- [ ] **Phase 6: Weekly View** - 7-day calendar with session preview and completion status
- [ ] **Phase 7: Day Player** - Block flow UI, exercise display, video placeholders
- [ ] **Phase 8: Timer System** - EMOM, AMRAP, For Time timers with background handling
- [ ] **Phase 9: Session Completion & Logging** - RPE input, session summary, full event audit trail
- [ ] **Phase 10: Progression & Coach Functions** - Level display, RPE trends, coach promotion, block overrides
- [ ] **Phase 11: Admin Panel** - Superadmin SPOM management, session overrides, data re-import

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
**Plans**: 4 plans in 3 waves

Plans:
- [x] 02-01-PLAN.md — Backend JWT auth (register, login, /me endpoints)
- [x] 02-02-PLAN.md — Token storage composable and auth boot file
- [x] 02-03-PLAN.md — Login, Register, and Profile pages
- [x] 02-04-PLAN.md — Store enhancements, logout button, navigation guards

Waves:
- Wave 1: 02-01, 02-02 (parallel - backend + frontend infra)
- Wave 2: 02-04 (store methods, guards)
- Wave 3: 02-03 (pages that use store methods)

### Phase 3: Shell & Module System
**Goal**: Training module can register and load as a pluggable module within the shell
**Depends on**: Phase 2
**Requirements**: ARCH-02
**Success Criteria** (what must be TRUE):
  1. Training module registers via manifest and appears in navigation
  2. Module routes are lazy-loaded only when accessed
  3. Global Pinia stores (auth, user) are accessible from within module
  4. API client with auth interceptors works from module context
**Plans**: 2 plans in 2 waves

Plans:
- [x] 03-01-PLAN.md — Module infrastructure (types, boot file, router prep)
- [x] 03-02-PLAN.md — Training module with manifest, routes, and navigation

Waves:
- Wave 1: 03-01 (infrastructure)
- Wave 2: 03-02 (Training module - depends on 03-01)

### Phase 4: SPOM Engine
**Goal**: System has complete exercise database, periodization rules, weekly rotator, and format compatibility data imported from documentation with deterministic lookup functions
**Depends on**: Phase 1
**Requirements**: SPOM-01 through SPOM-09
**Success Criteria** (what must be TRUE):
  1. SPOM rules imported (~1040 rows): week × route → intensity, wave, pattern, category
  2. Weekly Rotator imported (~936 rows): week × day × level_group → block routes
  3. Contraction rules imported (~20 rows): intensity × total_exercises → CON/EXC/ISO counts
  4. Intensity rules imported (~9 rows): intensity → reps_budget, difficulty_bucket, exercise_count
  5. Format compatibility imported (~500 rows): format × block × level × intensity → compatibility
  6. Exercises imported (~1870 rows) with: patron, category, esfuerzo (CON/EXC/ISO), nivel, ruta, difficulty
  7. Admin can view and set current gym-wide SPOM week (1-52)
  8. Exercises queryable by route + contraction type + level + difficulty
  9. SPOM lookup returns unique result per (week, route) — no duplicates
  10. All tables versionable (hash fingerprint for reproducibility)
**Plans**: 3 plans in 2 waves

Plans:
- [x] 04-01-PLAN.md — Database schema for 9 SPOM tables with indexes and constraints
- [x] 04-02-PLAN.md — Data import scripts with CSV parsing and batch inserts
- [x] 04-03-PLAN.md — API endpoints for SPOM week, exercise queries, and table versions

Waves:
- Wave 1: 04-01 (schema design)
- Wave 2: 04-02, 04-03 (parallel - import scripts + API endpoints)

### Phase 5: Session Generation
**Goal**: System generates complete daily sessions with 5 blocks using deterministic 9-stage pipeline from system-specs
**Depends on**: Phase 4
**Requirements**: SGEN-01 through SGEN-09
**Success Criteria** (what must be TRUE):
  1. Member receives daily session based on SPOM week, day, and their level group
  2. Session has 5 blocks: Initium, Nucleus, Deuteros 1, Deuteros 2, Athlos/Epikos
  3. Block routes assigned from Weekly Rotator (week × day × level_group)
  4. Each block's intensity determined by SPOM rules lookup (week × route)
  5. Exercise count per block follows Intensity rules (2-3 at 95%, 3-5 at 65%)
  6. Exercise selection follows Contraction distribution (CON/EXC/ISO counts)
  7. Exercise difficulty matches block intensity level (difficulty_bucket)
  8. Member level group (ALFA_DELTA, SIGMA, OMEGA) affects exercise selection
  9. Block format assigned from Format compatibility matrix with tie-breakers
  10. Prescription includes reps/duration per exercise with format binding
  11. Same inputs produce identical output (deterministic, reproducible)
  12. Decision trace emitted for auditing (SPOM resolution, format choice, exercise selection)
**Plans**: 4 plans in 3 waves

Plans:
- [ ] 05-01-PLAN.md — Session generator core (7-stage pipeline: rotator, SPOM, budget, contraction, format, exercises, prescription)
- [ ] 05-02-PLAN.md — Session storage schema and API endpoints (sessions, blocks, prescriptions)
- [ ] 05-03-PLAN.md — Fallback and validation system (scope widening, contraction substitution, coherence checks)
- [ ] 05-04-PLAN.md — Decision trace logging (Pino structured logging, BlockTrace, SessionTrace)

Waves:
- Wave 1: 05-01 (core generator)
- Wave 2: 05-02, 05-03 (parallel - storage + fallback)
- Wave 3: 05-04 (trace logging - depends on working generator)

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
**Goal**: Members execute sessions through guided 5-block flow with exercise display and format indicators
**Depends on**: Phase 6
**Requirements**: PLAY-01 through PLAY-11
**Success Criteria** (what must be TRUE):
  1. Member sees session as sequential 5-block flow with clear progression
  2. Each block has distinct visual identity (Initium blue, Nucleus primary, Deuteros 1/2 secondary/tertiary, Athlos amber)
  3. Each block displays exercise list with reps/duration, format type, and video placeholder
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

### Phase 11: Admin Panel
**Goal**: Superadmins can manage SPOM data, override sessions, and configure system
**Depends on**: Phase 10
**Requirements**: ADMIN-01 through ADMIN-06 (to be defined)
**Success Criteria** (what must be TRUE):
  1. Superadmin can view and update current SPOM week
  2. Superadmin can replace blocks from generated sessions with different blocks
  3. Superadmin can modify block parameters (exercises, format, intensity)
  4. Superadmin can override Weekly Rotator for specific days
  5. Superadmin can re-import data tables (SPOM rules, exercises, formats)
  6. All admin actions are logged with timestamp and user
**Plans**: TBD

Plans:
- [ ] 11-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 2026-01-22 |
| 2. Authentication | 4/4 | Complete | 2026-01-22 |
| 3. Shell & Module System | 2/2 | Complete | 2026-01-22 |
| 4. SPOM Engine | 3/3 | Complete | 2026-01-23 |
| 5. Session Generation | 0/4 | Planned | - |
| 6. Weekly View | 0/0 | Not started | - |
| 7. Day Player | 0/0 | Not started | - |
| 8. Timer System | 0/0 | Not started | - |
| 9. Session Completion & Logging | 0/0 | Not started | - |
| 10. Progression & Coach Functions | 0/0 | Not started | - |
| 11. Admin Panel | 0/0 | Not started | - |

---
*Roadmap created: 2026-01-22*
*Last updated: 2026-01-24 — Phase 5 planned (4 plans in 3 waves)*

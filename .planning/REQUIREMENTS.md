# Requirements: El Templo App (Training Module)

**Defined:** 2026-01-22
**Core Value:** Members know exactly what to train today, complete guided sessions with block structure and timers, see their progress accumulate, and advance through levels.

## v1 Requirements

Requirements for Training module release. Each maps to roadmap phases.

### Authentication

- [x] **AUTH-01**: Member can register with email and password
- [x] **AUTH-02**: Member can log in and maintain session across app restarts
- [x] **AUTH-03**: Member can log out from any screen
- [x] **AUTH-04**: Member is assigned to a branch on registration
- [x] **AUTH-05**: Member has a training level (starts at Alfa)

### SPOM Engine

- [ ] **SPOM-01**: System imports SPOM rules (week × route → intensity, wave, pattern, category) from SPOM.csv (~1040 rows)
- [ ] **SPOM-02**: System imports Weekly Rotator (week × day × level_group → Nucleus, Deuteros1, Deuteros2, Athlos/Epikos routes) from Rotador Semanal.csv (~936 rows)
- [ ] **SPOM-03**: System imports Contraction rules (intensity × total_exercises → concentric/eccentric/isometric counts) from Contracción.txt (~20 rows)
- [ ] **SPOM-04**: System imports Intensity rules (intensity → reps_per_block, difficulty, exercises_per_block) from Intensidad.csv (~9 rows)
- [ ] **SPOM-05**: System imports Format compatibility rules (format × block × level × intensity → compatibility) from Formatos.csv (~500 rows)
- [ ] **SPOM-06**: System imports Exercises with full metadata (patron, category, esfuerzo/contraction, nivel, ruta) from Ejercicios.csv (~1870 exercises)
- [ ] **SPOM-07**: System tracks current gym-wide SPOM week (1-52)
- [ ] **SPOM-08**: System knows active wave type (Senoidal/Shockwave/Triangular/Fractal) per route via SPOM rules
- [ ] **SPOM-09**: Exercises are queryable by route + contraction type + level + difficulty

### Session Generation

- [ ] **SGEN-01**: System generates daily session from SPOM week + day + member level group
- [ ] **SGEN-02**: Session has 5 blocks: Initium (warmup), Nucleus (main), Deuteros 1 (secondary), Deuteros 2 (secondary), Athlos/Epikos (finisher)
- [ ] **SGEN-03**: Block routes assigned from Weekly Rotator (week × day × level_group → routes)
- [ ] **SGEN-04**: Each block's intensity from SPOM rules lookup (week × route → intensity)
- [ ] **SGEN-05**: Exercise count per block follows Intensity rules (2-3 at 95%, 3-5 at 65%)
- [ ] **SGEN-06**: Exercise selection follows Contraction distribution rules (CON/EXC/ISO counts by intensity)
- [ ] **SGEN-07**: Exercise difficulty matches block intensity level (Nivel Superior at 85%+)
- [ ] **SGEN-08**: Member level affects exercise progression shown (Alfa sees alfa+delta, Omega sees all)
- [ ] **SGEN-09**: Block format assigned from Format compatibility rules (block × level × intensity)

### Weekly View

- [ ] **WEEK-01**: Member sees 7-day week view (Lun-Dom)
- [ ] **WEEK-02**: Each day shows session name and intensity indicator
- [ ] **WEEK-03**: Completed days show checkmark, today is highlighted, rest days have special state
- [ ] **WEEK-04**: Member can tap any day to preview session
- [ ] **WEEK-05**: Member can tap today to start Day Player

### Day Player

- [ ] **PLAY-01**: Member sees session as sequential 5-block flow
- [ ] **PLAY-02**: Each block has distinct visual identity (color-coded per block type)
- [ ] **PLAY-03**: Initium block: light blue accent, warmup exercises
- [ ] **PLAY-04**: Nucleus block: primary color, main work
- [ ] **PLAY-05**: Deuteros 1 block: secondary accent, complementary work
- [ ] **PLAY-06**: Deuteros 2 block: tertiary accent, complementary work
- [ ] **PLAY-07**: Athlos/Epikos block: amber accent, finisher
- [ ] **PLAY-08**: Each block shows exercise list with reps/duration and format
- [ ] **PLAY-09**: Video placeholder displayed for each exercise
- [ ] **PLAY-10**: Member taps "Complete Block" to progress to next block
- [ ] **PLAY-11**: Screen stays awake during active session

### Timer System

- [ ] **TIME-01**: EMOM timer: 60s countdown, auto-reset, displays current round
- [ ] **TIME-02**: AMRAP timer: countdown from set duration, member logs rounds completed
- [ ] **TIME-03**: For Time timer: counts up, member hits "Done" when finished
- [ ] **TIME-04**: Straight Sets mode: no timer, just exercise list with sets/reps
- [ ] **TIME-05**: Timer can be paused and resumed
- [ ] **TIME-06**: Timer continues when app is backgrounded (mobile)
- [ ] **TIME-07**: Audio/haptic cues at timer transitions

### Session Completion

- [ ] **COMP-01**: After all blocks, member sees closure screen
- [ ] **COMP-02**: RPE input via slider or buttons (1-10 scale)
- [ ] **COMP-03**: Optional notes field for member comments
- [ ] **COMP-04**: Session summary shows blocks completed, total duration, exercises performed
- [ ] **COMP-05**: Member hits "Finish Session" to record completion
- [ ] **COMP-06**: Session is saved with date, branch, and all block data

### Event Logging

- [ ] **EVNT-01**: Every interaction is timestamped (block_started, block_completed, timer events)
- [ ] **EVNT-02**: Session record includes session_id, date, branch, member_id
- [ ] **EVNT-03**: Block records include started_at, completed_at, skipped boolean
- [ ] **EVNT-04**: Timer results recorded (rounds for AMRAP, time for For Time)
- [ ] **EVNT-05**: RPE score and notes stored with session

### Level Progression

- [ ] **PROG-01**: Member can see their current level (Alfa/Delta/Sigma/Omega/Spartan)
- [ ] **PROG-02**: System tracks member's RPE history over time
- [ ] **PROG-03**: When RPE threshold met over defined period, member can request coach evaluation
- [ ] **PROG-04**: Level changes are logged with date and reason

### Coach Functions

- [ ] **COACH-01**: Coach can view list of members in their branch
- [ ] **COACH-02**: Coach can see member's training history
- [ ] **COACH-03**: Coach can see member's RPE trends over time
- [ ] **COACH-04**: Coach can promote member to next level
- [ ] **COACH-05**: Coach can override specific blocks with GENERAL patterns (Animal Flow, Cardio, Plyometrics, Kettlebell, Core, Movilidad)

### Shell Architecture

- [x] **ARCH-01**: Shell (temple-nest) provides auth, global state, navigation, event bus
- [x] **ARCH-02**: Training module registers via manifest system
- [x] **ARCH-03**: Module boundaries designed for future Academy/Agora addition
- [x] **ARCH-04**: Role system supports member, coach, admin, superadmin

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Media

- **MEDIA-01**: Real exercise videos replace placeholders (incremental)
- **MEDIA-02**: Video quality adapts to connection speed

### Notifications

- **NOTF-01**: Push notification when daily session is available
- **NOTF-02**: Reminder notification if session not completed by evening

### Offline Mode

- **OFFL-01**: Sessions can be viewed offline (cached)
- **OFFL-02**: Session completion syncs when back online

### Wearables

- **WEAR-01**: Heart rate integration from smartwatch
- **WEAR-02**: Timer sync to wearable display

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Workout library browsing | Undermines SPOM structure; members follow generated sessions |
| Custom workout builder | Conflicts with periodization methodology |
| Calorie/macro tracking | Creates shame/guilt spiral per research; not core to training |
| Social feed | Belongs in Agora module (future milestone) |
| Public leaderboards | Can demotivate; levels already stratify fairly |
| Streak-shaming notifications | Research shows anxiety/guilt; positive framing only |
| Achievement spam | Dilutes meaning; reserve for real milestones |
| Manual exercise logging | Tedious; session is pre-generated |
| Per-set weight/rep tracking | Overcomplicates; not needed for SPOM intensity model |
| AI chat/coaching | Dilutes real coach relationship |
| Academy module | Requires Training foundation + Sigma gate (future milestone) |
| Agora module | Requires Academy foundation (future milestone) |
| Multi-tenant SaaS | Current scope is single-tenant |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 2 | Complete |
| AUTH-02 | Phase 2 | Complete |
| AUTH-03 | Phase 2 | Complete |
| AUTH-04 | Phase 2 | Complete |
| AUTH-05 | Phase 2 | Complete |
| SPOM-01 | Phase 4 | Pending |
| SPOM-02 | Phase 4 | Pending |
| SPOM-03 | Phase 4 | Pending |
| SPOM-04 | Phase 4 | Pending |
| SPOM-05 | Phase 4 | Pending |
| SPOM-06 | Phase 4 | Pending |
| SPOM-07 | Phase 4 | Pending |
| SPOM-08 | Phase 4 | Pending |
| SPOM-09 | Phase 4 | Pending |
| SGEN-01 | Phase 5 | Pending |
| SGEN-02 | Phase 5 | Pending |
| SGEN-03 | Phase 5 | Pending |
| SGEN-04 | Phase 5 | Pending |
| SGEN-05 | Phase 5 | Pending |
| SGEN-06 | Phase 5 | Pending |
| SGEN-07 | Phase 5 | Pending |
| SGEN-08 | Phase 5 | Pending |
| SGEN-09 | Phase 5 | Pending |
| WEEK-01 | Phase 6 | Pending |
| WEEK-02 | Phase 6 | Pending |
| WEEK-03 | Phase 6 | Pending |
| WEEK-04 | Phase 6 | Pending |
| WEEK-05 | Phase 6 | Pending |
| PLAY-01 | Phase 7 | Pending |
| PLAY-02 | Phase 7 | Pending |
| PLAY-03 | Phase 7 | Pending |
| PLAY-04 | Phase 7 | Pending |
| PLAY-05 | Phase 7 | Pending |
| PLAY-06 | Phase 7 | Pending |
| PLAY-07 | Phase 7 | Pending |
| PLAY-08 | Phase 7 | Pending |
| PLAY-09 | Phase 7 | Pending |
| PLAY-10 | Phase 7 | Pending |
| PLAY-11 | Phase 7 | Pending |
| TIME-01 | Phase 8 | Pending |
| TIME-02 | Phase 8 | Pending |
| TIME-03 | Phase 8 | Pending |
| TIME-04 | Phase 8 | Pending |
| TIME-05 | Phase 8 | Pending |
| TIME-06 | Phase 8 | Pending |
| TIME-07 | Phase 8 | Pending |
| COMP-01 | Phase 9 | Pending |
| COMP-02 | Phase 9 | Pending |
| COMP-03 | Phase 9 | Pending |
| COMP-04 | Phase 9 | Pending |
| COMP-05 | Phase 9 | Pending |
| COMP-06 | Phase 9 | Pending |
| EVNT-01 | Phase 9 | Pending |
| EVNT-02 | Phase 9 | Pending |
| EVNT-03 | Phase 9 | Pending |
| EVNT-04 | Phase 9 | Pending |
| EVNT-05 | Phase 9 | Pending |
| PROG-01 | Phase 10 | Pending |
| PROG-02 | Phase 10 | Pending |
| PROG-03 | Phase 10 | Pending |
| PROG-04 | Phase 10 | Pending |
| COACH-01 | Phase 10 | Pending |
| COACH-02 | Phase 10 | Pending |
| COACH-03 | Phase 10 | Pending |
| COACH-04 | Phase 10 | Pending |
| COACH-05 | Phase 10 | Pending |
| ARCH-01 | Phase 1 | Complete |
| ARCH-02 | Phase 3 | Complete |
| ARCH-03 | Phase 1 | Complete |
| ARCH-04 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 70 total
- Mapped to phases: 70
- Unmapped: 0

---
*Requirements defined: 2026-01-22*
*Last updated: 2026-01-23 — Updated SPOM/SGEN/PLAY for new documentation*

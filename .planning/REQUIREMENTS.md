# Requirements: El Templo App (Training Module)

**Defined:** 2026-01-22
**Core Value:** Members know exactly what to train today, complete guided sessions with block structure and timers, see their progress accumulate, and advance through levels.

## v1 Requirements

Requirements for Training module release. Each maps to roadmap phases.

### Authentication

- [ ] **AUTH-01**: Member can register with email and password
- [ ] **AUTH-02**: Member can log in and maintain session across app restarts
- [ ] **AUTH-03**: Member can log out from any screen
- [ ] **AUTH-04**: Member is assigned to a branch on registration
- [ ] **AUTH-05**: Member has a training level (starts at Alfa)

### SPOM Engine

- [ ] **SPOM-01**: System imports SPOM periodization rules from spreadsheet data
- [ ] **SPOM-02**: System imports exercise database (1869 exercises) with metadata (pattern, category, position, effort type, level)
- [ ] **SPOM-03**: System tracks current gym-wide SPOM week (1-52)
- [ ] **SPOM-04**: System knows active intensity wave (Senoidal/Shockwave/Triangular/Fractal)
- [ ] **SPOM-05**: System knows current route and active pattern
- [ ] **SPOM-06**: Exercises are queryable by pattern + category + level + contraction type

### Session Generation

- [ ] **SGEN-01**: System generates daily session from current SPOM week + member level
- [ ] **SGEN-02**: Session has 4 blocks: Initium (warmup), Nucleus (main), Deuteros (secondary), Athlos/Epikos (finisher)
- [ ] **SGEN-03**: Exercise selection follows contraction-type rules based on intensity
- [ ] **SGEN-04**: Exercise count per block follows intensity mapping (4-5 at 55%, 2-3 at 95%)
- [ ] **SGEN-05**: Block patterns follow weekly rotation rules
- [ ] **SGEN-06**: Athlos/Epikos direction is opposite to Nucleus direction
- [ ] **SGEN-07**: Member level affects exercise difficulty shown (Alfa sees easier progressions)

### Weekly View

- [ ] **WEEK-01**: Member sees 7-day week view (Lun-Dom)
- [ ] **WEEK-02**: Each day shows session name and intensity indicator
- [ ] **WEEK-03**: Completed days show checkmark, today is highlighted, rest days have special state
- [ ] **WEEK-04**: Member can tap any day to preview session
- [ ] **WEEK-05**: Member can tap today to start Day Player

### Day Player

- [ ] **PLAY-01**: Member sees session as sequential block flow
- [ ] **PLAY-02**: Each block has distinct visual identity (color-coded per block type)
- [ ] **PLAY-03**: Initium block: light blue accent, warmup exercises
- [ ] **PLAY-04**: Nucleus block: primary color, main work
- [ ] **PLAY-05**: Deuteros block: secondary accent, complementary work
- [ ] **PLAY-06**: Athlos/Epikos block: amber accent, finisher
- [ ] **PLAY-07**: Each block shows exercise list with reps/duration
- [ ] **PLAY-08**: Video placeholder displayed for each exercise
- [ ] **PLAY-09**: Member taps "Complete Block" to progress to next block
- [ ] **PLAY-10**: Screen stays awake during active session

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

- [ ] **ARCH-01**: Shell (temple-nest) provides auth, global state, navigation, event bus
- [ ] **ARCH-02**: Training module registers via manifest system
- [ ] **ARCH-03**: Module boundaries designed for future Academy/Agora addition
- [ ] **ARCH-04**: Role system supports member, coach, admin, superadmin

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
| AUTH-01 | TBD | Pending |
| AUTH-02 | TBD | Pending |
| AUTH-03 | TBD | Pending |
| AUTH-04 | TBD | Pending |
| AUTH-05 | TBD | Pending |
| SPOM-01 | TBD | Pending |
| SPOM-02 | TBD | Pending |
| SPOM-03 | TBD | Pending |
| SPOM-04 | TBD | Pending |
| SPOM-05 | TBD | Pending |
| SPOM-06 | TBD | Pending |
| SGEN-01 | TBD | Pending |
| SGEN-02 | TBD | Pending |
| SGEN-03 | TBD | Pending |
| SGEN-04 | TBD | Pending |
| SGEN-05 | TBD | Pending |
| SGEN-06 | TBD | Pending |
| SGEN-07 | TBD | Pending |
| WEEK-01 | TBD | Pending |
| WEEK-02 | TBD | Pending |
| WEEK-03 | TBD | Pending |
| WEEK-04 | TBD | Pending |
| WEEK-05 | TBD | Pending |
| PLAY-01 | TBD | Pending |
| PLAY-02 | TBD | Pending |
| PLAY-03 | TBD | Pending |
| PLAY-04 | TBD | Pending |
| PLAY-05 | TBD | Pending |
| PLAY-06 | TBD | Pending |
| PLAY-07 | TBD | Pending |
| PLAY-08 | TBD | Pending |
| PLAY-09 | TBD | Pending |
| PLAY-10 | TBD | Pending |
| TIME-01 | TBD | Pending |
| TIME-02 | TBD | Pending |
| TIME-03 | TBD | Pending |
| TIME-04 | TBD | Pending |
| TIME-05 | TBD | Pending |
| TIME-06 | TBD | Pending |
| TIME-07 | TBD | Pending |
| COMP-01 | TBD | Pending |
| COMP-02 | TBD | Pending |
| COMP-03 | TBD | Pending |
| COMP-04 | TBD | Pending |
| COMP-05 | TBD | Pending |
| COMP-06 | TBD | Pending |
| EVNT-01 | TBD | Pending |
| EVNT-02 | TBD | Pending |
| EVNT-03 | TBD | Pending |
| EVNT-04 | TBD | Pending |
| EVNT-05 | TBD | Pending |
| PROG-01 | TBD | Pending |
| PROG-02 | TBD | Pending |
| PROG-03 | TBD | Pending |
| PROG-04 | TBD | Pending |
| COACH-01 | TBD | Pending |
| COACH-02 | TBD | Pending |
| COACH-03 | TBD | Pending |
| COACH-04 | TBD | Pending |
| COACH-05 | TBD | Pending |
| ARCH-01 | TBD | Pending |
| ARCH-02 | TBD | Pending |
| ARCH-03 | TBD | Pending |
| ARCH-04 | TBD | Pending |

**Coverage:**
- v1 requirements: 56 total
- Mapped to phases: 0 (pending roadmap creation)
- Unmapped: 56

---
*Requirements defined: 2026-01-22*
*Last updated: 2026-01-22 after initial definition*

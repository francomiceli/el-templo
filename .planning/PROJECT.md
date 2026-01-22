# El Templo App

## What This Is

A modular fitness super-app for El Templo gym built on a central shell (temple-nest) that orchestrates pluggable modules. v1 delivers the Training module: algorithmically-generated daily sessions using the SPOM (Sistema de Periodización y Organización del Movimiento) framework, with full tracking, level progression, and multi-branch support. The app serves gym members tracking their coached sessions and remote members training independently with full guidance.

## Core Value

Members know exactly what to train today, complete guided sessions with block structure and timers, see their progress accumulate, and advance through levels — transforming daily training into visible progression toward mastery.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Authentication & Users**
- [ ] Member can register with email/password
- [ ] Member can log in and maintain session across app restarts
- [ ] Member belongs to a branch
- [ ] Member has a training level (Alfa/Delta/Sigma/Omega/Spartan)
- [ ] Coach can view members in their branch

**SPOM Engine**
- [ ] System imports SPOM periodization rules from spreadsheet data
- [ ] System tracks current gym-wide SPOM week (1-52)
- [ ] System knows active intensity wave (Senoidal/Shockwave/Triangular/Fractal)
- [ ] System knows current route and active pattern

**Exercise Database**
- [ ] System imports 1869 exercises with metadata (pattern, category, position, effort type, level)
- [ ] Exercises are queryable by pattern + category + level + contraction type

**Session Generation**
- [ ] System generates daily session from: current SPOM week + member level
- [ ] Session has 4 blocks: Initium (warmup), Nucleus (main), Deuteros (secondary), Athlos/Epikos (finisher)
- [ ] Exercise selection follows contraction-type rules based on intensity
- [ ] Exercise count per block follows intensity mapping (4-5 at 55%, 2-3 at 95%)
- [ ] Block patterns follow weekly rotation rules (Nucleus direction opposite to Athlos/Epikos)

**Weekly View**
- [ ] Member sees 7-day week view (Lun-Dom)
- [ ] Each day shows: session name, intensity indicator, completion status
- [ ] Today is highlighted, completed days show checkmark, rest days have special state
- [ ] Member can tap any day to preview or play session

**Day Player**
- [ ] Member sees session as sequential block flow with distinct visual identity per block
- [ ] Initium: light blue accent, warmup exercises
- [ ] Nucleus: primary color, main work
- [ ] Deuteros: secondary accent, complementary work
- [ ] Athlos/Epikos: amber accent, finisher
- [ ] Each block shows exercise list with reps/duration
- [ ] Member taps "Complete Block" to progress
- [ ] Video placeholder displayed for each exercise (replaced with real videos over time)

**Timer Support**
- [ ] EMOM: 60s countdown, auto-reset, round counter
- [ ] AMRAP: countdown timer, member logs rounds completed
- [ ] For Time: count-up timer, member hits "Done" when finished
- [ ] Straight Sets: no timer, just exercise list with sets/reps
- [ ] Timer can be paused/resumed

**Session Completion**
- [ ] After all blocks, member sees closure screen
- [ ] RPE input: slider or buttons (1-10)
- [ ] Notes field: optional free text
- [ ] Session summary: blocks completed, total duration, exercises performed
- [ ] Member hits "Finish Session" to record

**Event Logging**
- [ ] Every interaction timestamped: block_started, block_completed, timer_paused, timer_resumed, session_finished
- [ ] Session record includes: session_id, date, branch, member_id
- [ ] Block records include: started_at, completed_at, skipped
- [ ] Timer results recorded: rounds (AMRAP), time (For Time)
- [ ] RPE and notes stored with session

**Level Progression**
- [ ] Member level affects exercise difficulty shown (Alfa sees easier progressions than Sigma)
- [ ] System tracks member's RPE history over time
- [ ] When RPE threshold is met over defined period, member can request coach evaluation
- [ ] Coach can manually promote member to next level
- [ ] Level changes are logged

**Coach Functions**
- [ ] Coach can view members in their branch
- [ ] Coach can see member's training history and RPE trends
- [ ] Coach can promote member to next level
- [ ] Coach can override specific blocks with GENERAL patterns (Animal Flow, Cardio, Plyometrics, Kettlebell, Core, Movilidad)

**Architecture (Shell)**
- [ ] Shell (temple-nest) handles auth, global state, navigation, event bus
- [ ] Training registers as pluggable module via manifest
- [ ] Module boundaries designed for future Academy/Agora addition
- [ ] Role system supports: member, coach, admin, superadmin (OT added with Agora)

### Out of Scope

**Data Sources:**
- SPOM rules and exercise database exist in `[Planificaciones] - Base de Datos.xlsx`
- 1869 exercises across 9 patterns (PUSH, PULL, LOWER, CORE, FLOW, CARDIO, KL, MOVILIDAD, PLYO)
- 5 member levels: Alfa, Delta, Sigma, Omega, Spartan
- 4 intensity waves: Senoidal, Shockwave, Triangular, Fractal
- Intensity range: 55% - 95%
- 6 training days per week (Mon-Sat)

**User Types:**
- Gym members: attend coached sessions, use app to track what they did
- Remote members: train independently, need full guidance from app (videos, timers, clear instructions)

**Operational Model:**
- Gym-wide SPOM: everyone follows same week/route/intensity
- New members join at current gym week (not week 1)
- Member level determines exercise difficulty within same session structure
- Level advancement: RPE threshold → request evaluation, or coach manual promotion

**Future Modules (not in scope but informs architecture):**
- Academy: internal coach formation (courses, exams, credentials) — unlocks at Sigma
- Agora: community loyalty (Temple Points, leaderboards, moderation) — builds on Academy credentials

## Constraints

- **Tech Stack**: Quasar Framework (Vue 3 + TypeScript), Capacitor for PWA + iOS + Android, Node.js + MySQL backend — non-negotiable, team expertise
- **Self-hosted**: Backend runs on own infrastructure, not cloud-managed services
- **Video Content**: Placeholders initially, real videos recorded and replaced incrementally
- **Data Import**: Must parse and import existing Excel spreadsheet, not rebuild from scratch
- **Multi-branch Ready**: Architecture must support multiple branches from day one, even if launching with one

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Training module first | Highest daily value, foundation for progression system | — Pending |
| Algorithmic session generation | SPOM rules exist, coaches shouldn't manually build programs | — Pending |
| Shell + module architecture | Future Academy/Agora modules need clean integration points | — Pending |
| Gym-wide SPOM (not per-member) | Simplifies generation, matches gym operational model | — Pending |
| Video placeholders | Unblocks development, content created in parallel | — Pending |
| Multi-branch from start | Avoid architectural rework when scaling to more locations | — Pending |

---
*Last updated: 2025-01-21 after initialization*

# El Templo App

## What This Is

A modular fitness super-app for El Templo gym built on a central shell (temple-nest) that orchestrates pluggable modules. v1 delivered the Training module: algorithmically-generated daily sessions using the SPOM (Sistema de Periodización y Organización del Movimiento) framework, with full tracking, level progression, and multi-branch support. v2 adds the Admin App: a coach/admin interface for session review, validation, and management.

## Current Milestone: v2.0 Admin App

**Goal:** Enable coaches and admins to review algorithm-generated sessions, validate or modify blocks, and manage the SPOM system.

**Target features (Phase 1):**
- Review and improve session generation algorithm accuracy
- Compare algorithm output vs coach-built session examples
- Fix discrepancies between generated sessions and expected output

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
- [ ] System imports SPOM rules (week × route → intensity, wave, pattern, category) ~1040 rows
- [ ] System imports Weekly Rotator (week × day × level_group → block routes) ~936 rows
- [ ] System imports Contraction rules (intensity × exercises → CON/EXC/ISO counts) ~20 rows
- [ ] System imports Intensity rules (intensity → reps_budget, difficulty, exercise_count) ~9 rows
- [ ] System imports Format compatibility (format × block × level × intensity) ~500 rows
- [ ] System tracks current gym-wide SPOM week (1-52)

**Exercise Database**
- [ ] System imports ~1870 exercises with: patron, category, esfuerzo (CON/EXC/ISO), nivel, ruta, difficulty
- [ ] Exercises are queryable by route + contraction type + level + difficulty bucket

**Session Generation**
- [ ] System generates daily session from: SPOM week + day + member level group
- [ ] Session has 5 blocks: Initium, Nucleus, Deuteros 1, Deuteros 2, Athlos/Epikos
- [ ] Block routes assigned from Weekly Rotator (week × day × level_group → routes)
- [ ] Each block's intensity from SPOM rules lookup (week × route → intensity)
- [ ] Exercise count per block follows Intensity rules (2-3 at 95%, 4-5 at 55%)
- [ ] Exercise selection follows Contraction distribution (CON/EXC/ISO counts by intensity)
- [ ] Exercise difficulty matches block intensity level (bucket 1=easy, 3=hard)
- [ ] Block format assigned from Format compatibility rules
- [ ] Level groups: ALFA_DELTA (Alfa+Delta), SIGMA, OMEGA

**Weekly View**
- [ ] Member sees 7-day week view (Lun-Dom)
- [ ] Each day shows: session name, intensity indicator, completion status
- [ ] Today is highlighted, completed days show checkmark, rest days have special state
- [ ] Member can tap any day to preview or play session

**Day Player**
- [ ] Member sees session as sequential 5-block flow with distinct visual identity per block
- [ ] Initium: light blue accent, warmup exercises (GENERAL patterns)
- [ ] Nucleus: primary color, main work (SUP_PUSH/SUP_PULL/INF_RODILLA/INF_CADERA)
- [ ] Deuteros 1: secondary accent, complementary work
- [ ] Deuteros 2: tertiary accent, complementary work
- [ ] Athlos/Epikos: amber accent, finisher (opposite direction of Nucleus)
- [ ] Each block shows exercise list with reps/duration and format type
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

**Data Sources (in `/docs/`):**
- `[Planificaciones] - Base de Datos - SPOM.csv` — 1040 rows: week × route → intensity, wave, pattern, category
- `[Planificaciones] - Base de Datos - Rotador Semanal.csv` — 936 rows: week × day × level_group → routes
- `[Planificaciones] - Base de Datos - Ejercicios.csv` — 1870 exercises with full metadata
- `[Planificaciones] - Base de Datos - Formatos.csv` — 500+ rows: format × block × level × intensity → compatibility
- `[Planificaciones] - Base de Datos - Contracción.txt` — 20 rows: intensity × exercises → CON/EXC/ISO counts
- `[Planificaciones] - Base de Datos - SPOM - Intensidad.csv` — 9 rows: intensity → reps, difficulty, exercise_count
- `Documento de Planificación` (parts 1-4) — Block structure, SPOM integration, contraction rules
- `system-specs/` (parts 1-5) — 47-point technical specification for deterministic session generation engine

**Domain Model:**
- 5 member levels: Alfa, Delta, Sigma, Omega, Spartan (grouped as ALFA_DELTA, SIGMA, OMEGA)
- 4 intensity waves: Senoidal, Shockwave, Triangular, Fractal
- Intensity range: 55% - 95% (9 discrete values)
- 5 blocks per session: Initium, Nucleus, Deuteros 1, Deuteros 2, Athlos/Epikos
- 4 root categories: SUP_PUSH, SUP_PULL, INF_RODILLA, INF_CADERA
- 3 contraction types: CON (concentric), EXC (eccentric), ISO (isometric)
- 6 training days per week (Mon-Sat)

**User Types:**
- Gym members: attend coached sessions, use app to track what they did
- Remote members: train independently, need full guidance from app (videos, timers, clear instructions)

**Operational Model:**
- Gym-wide SPOM: everyone follows same week
- Route assignment comes from Weekly Rotator (per day × level_group)
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

## Development Guidelines

### Database Schema Review (Mandatory)

Before any planning phase creates new database tables, the orchestrator **must**:

1. **Present a detailed schema proposal** showing:
   - Each column name and type
   - What the column stores (with example values)
   - Why it's needed (business justification)
   - Expected size/growth implications

2. **Wait for explicit approval** before including table creation in the execution plan

3. **Challenge assumptions** — ask whether each column is truly necessary:
   - Is this data needed for current requirements, or speculative future use?
   - Can this be derived from existing data instead of stored?
   - Is the granularity appropriate (e.g., do we need timestamps for every micro-event?)

This prevents over-engineering database schemas and ensures storage decisions align with actual business needs.

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

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-21)

**Core value:** Members know exactly what to train today, complete guided sessions with block structure and timers, see their progress accumulate, and advance through levels.
**Current focus:** Phase 4 - SPOM Engine (complete)

## Current Position

Phase: 4 of 11 (SPOM Engine)
Plan: 3 of 3 in Phase 4
Status: Phase complete
Last activity: 2026-01-23 — Completed 04-03-PLAN.md (SPOM API Endpoints)

Progress: [████░░░░░░] 36% (4/11 phases complete)

## Architecture Reset

**Date:** 2026-01-23
**Reason:** New documentation in `/docs/` fundamentally changes SPOM and session generation architecture
**Backup:** `backup/phases-4-5-5.1` branch contains previous Phase 4-5 implementation

**Key changes from new documentation:**
- 5 blocks (not 4): Initium, Nucleus, Deuteros 1, Deuteros 2, Athlos/Epikos
- Route-driven block assignment via Weekly Rotator (not day-based)
- Contraction type distribution required (CON/EXC/ISO counts per intensity)
- SPOM lookup per route (week × route → intensity, wave, pattern)
- Format compatibility system (Tabata, EMOM, AMRAP, Complex, etc.)
- Level grouping: ALFA_DELTA, SIGMA, OMEGA (3 groups from 5 levels)

**New Documentation Analyzed (2026-01-23):**
- `Documento de Planificación` parts 1-4: Block structure, SPOM integration, contraction by intensity
- `system-specs/` parts 1-5: 47-point technical specification defining deterministic engine:
  - Points 1-10: Objective, domain entities, IDs, normalization
  - Points 11-21: SPOM resolution, category hierarchy, intensity→budget, contraction rules
  - Points 22-31: Format taxonomy, compatibility matrix, parameter schema, exercise selection
  - Points 32-40: Prescription (dose, rest, ladders, tempo), validation, coherence checks
  - Points 41-47: Engine pipeline, determinism, logging/trace, test framework

**Session Generation Engine (from system-specs):**
The engine is a **deterministic pipeline** with 9 stages:
1. Normalize tables (SPOM, Intensity, Contraction, Formats, Exercises, Rotator)
2. Build week skeleton (days × level_groups × blocks)
3. Resolve SPOM per block (route → pct, pattern, scope)
4. Derive budget per block (pct → reps_budget, exercise_count, difficulty_bucket)
5. Pick format (compatibility matrix → candidates → tie-breakers)
6. Pick exercises (scope + bucket + level + contraction → filter → dedup → ranking)
7. Prescribe (allocate doses, bind to format, ladders/tempo, rest, notes)
8. Assemble blocks → days → week
9. Validate (coherence, partial user scenarios, insufficiency summary)

**Key invariants:**
- SPOM is unique truth per (week, route) — no duplicates, no averaging
- Budget is TOTAL per block, not per exercise
- Contraction mix derived from pct, not chosen
- Format never adds volume, only distributes budget
- All decisions traceable via structured JSON logs

## Performance Metrics

**Velocity:**
- Total plans completed: 14
- Average duration: 4.1 min
- Total execution time: 0.95 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 4 | 30min | 7.5min |
| 02-authentication | 4 | 11min | 2.8min |
| 03-shell-module-system | 2 | 5min | 2.5min |
| 04-spom-engine | 3 | 12min | 4min |

**Recent Trend:**
- Last 3 plans: 04-01 (6min), 04-02 (3min), 04-03 (3min)
- Trend: Stable velocity

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

| Plan | Decision | Rationale |
|------|----------|-----------|
| 01-01 | Capacitor v7 instead of v6 | Latest stable from Quasar CLI, better maintained |
| 01-01 | Hash-based routing | Required for Capacitor mobile apps |
| 01-01 | Vite environment variables | Standard import.meta.env convention |
| 01-02 | Fastify over Express | Better TypeScript support and performance |
| 01-02 | Drizzle ORM with mysql2 | Type-safe database access |
| 01-02 | Database plugin pattern | Proper lifecycle management |
| 01-02 | CORS for web + Capacitor | Support both localhost:9000 and capacitor://localhost |
| 01-04 | Pinia composition API | Better TypeScript inference, aligns with Vue 3 best practices |
| 01-04 | localStorage for tokens | Simple, works across tabs, sufficient for Phase 1 |
| 01-04 | Auto-redirect on 401 | Clear auth state immediately, improve UX |
| 01-04 | Custom tsconfig | Quasar preset export issue, custom config provides full control |
| 01-03 | argon2 for password hashing | Industry-standard, resistant to GPU attacks |
| 01-03 | Branch-first user model | branchId required, supports multi-location gym |
| 01-03 | Manual migration application | drizzle-kit push env issues, direct MySQL CLI more reliable |
| 02-01 | JWT 7-day expiry | Balance security and user convenience for mobile app |
| 02-01 | Authenticate decorator pattern | Reusable across all protected routes via onRequest hook |
| 02-02 | Capacitor packages in both locations | Needed for SPA build resolution, common Quasar+Capacitor pattern |
| 02-02 | @capacitor/preferences v7 | Match Capacitor v7, avoid peer dependency mismatch |
| 02-04 | isAuthenticated requires both token AND user | Prevents stale token from showing authenticated state |
| 02-04 | Named routes for guards | Cleaner than path-based checking, allows route renaming |
| 03-01 | Module routes in manifest are lazy-loaded | Routes already use dynamic imports, not async functions |
| 03-01 | Boot order: axios -> auth -> modules | Modules depends on both API setup and auth restoration |
| 03-01 | Vite chunk errors trigger page reload | Ensures users get fresh chunks after deployment |
| 03-01 | Named layout route for dynamic nesting | Enables router.addRoute('layout', moduleRoute) pattern |
| 04-discuss | Migration script for data import | One-time import, admin panel deferred to Phase 11 |
| 04-discuss | Global single row for SPOM week | All branches share same week, matches gym-wide model |
| 04-discuss | Store level_code, compute group at runtime | No data loss, grouping logic centralized in code |
| 04-discuss | Difficulty bucket: 1=low, 2=med, 3=high, NS=max | Confirmed mapping from domain expert |
| 04-discuss | Routes reference table | Cleaner FKs, allows metadata, handles special chars |
| 04-discuss | Wide table for format params | Simple queries, TypeScript provides type safety |
| 04-01 | Route codes in reference table | Cleaner FKs than embedding route strings |
| 04-01 | Difficulty as string column | Supports "Nivel Superior" values alongside numeric 1/2/3 |
| 04-01 | CHECK constraint for singleton | MySQL enforces single row in spom_config |
| 04-03 | JSON Schema for validation | Consistent with existing auth module, no new dependency |

### Pending Todos

None yet.

### Blockers/Concerns

- ~~**SPOM Rules:** Phase 4-5 require golden test datasets from domain expert before development starts (flagged in research)~~ **RESOLVED** - New documentation in `/docs/` provides complete data
- **Timer Accuracy:** Phase 8 needs real-device testing under various conditions (backgrounding, low battery, notifications)
- **Coach Override Patterns:** Need domain-specific design clarification (per-member? per-branch? temporary or permanent?)

## Session Continuity

Last session: 2026-01-23
Stopped at: Completed 04-03-PLAN.md (SPOM API Endpoints) - Phase 4 complete
Resume file: `.planning/phases/04-spom-engine/04-03-SUMMARY.md`

**Next steps:**
1. Run `/gsd:plan-phase 5` for Session Generation
2. Execute Phase 5 plans

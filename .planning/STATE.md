# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-21)

**Core value:** Members know exactly what to train today, complete guided sessions with block structure and timers, see their progress accumulate, and advance through levels.
**Current focus:** Phase 4 - SPOM Engine (redesigned based on new documentation)

## Current Position

Phase: 3 of 10 (Shell & Module System) - Complete
Plan: 0 of ~3 in Phase 4
Status: Phase 3 complete, Phase 4 ready for planning with new documentation
Last activity: 2026-01-23 — Reset to Phase 3, integrated new documentation from /docs/

Progress: [███░░░░░░░] 30% (3/10 phases complete)

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
- Level progression (Alfa sees alfa+delta, not just filtering)

## Performance Metrics

**Velocity:**
- Total plans completed: 10
- Average duration: 4.2 min
- Total execution time: 0.7 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 4 | 30min | 7.5min |
| 02-authentication | 4 | 11min | 2.8min |
| 03-shell-module-system | 2 | 5min | 2.5min |

**Recent Trend:**
- Last 3 plans: 2.6min, 2min, 3.5min
- Trend: Stable high velocity

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

### Pending Todos

None yet.

### Blockers/Concerns

- ~~**SPOM Rules:** Phase 4-5 require golden test datasets from domain expert before development starts (flagged in research)~~ **RESOLVED** - New documentation in `/docs/` provides complete data
- **Timer Accuracy:** Phase 8 needs real-device testing under various conditions (backgrounding, low battery, notifications)
- **Coach Override Patterns:** Need domain-specific design clarification (per-member? per-branch? temporary or permanent?)

## Session Continuity

Last session: 2026-01-23
Stopped at: Reset complete, Phase 4 ready for planning
Resume file: None

**Next steps:**
1. Run `/gsd:plan-phase 4` to create detailed plans for SPOM Engine
2. Execute Phase 4 plans
3. Run `/gsd:plan-phase 5` for Session Generation
4. Execute Phase 5 plans

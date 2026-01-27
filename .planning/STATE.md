# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-21)

**Core value:** Members know exactly what to train today, complete guided sessions with block structure and timers, see their progress accumulate, and advance through levels.
**Current focus:** Phase 7 - Day Player

## Current Position

Phase: 7 of 12 (Day Player) - COMPLETE
Plan: 5 of 5 in Phase 7
Status: Complete
Last activity: 2026-01-27 - Completed Phase 7 UAT with 10 bug fixes

Progress: [██████░░░░] 58% (7/12 phases complete)

## Architecture Reset

**Date:** 2026-01-23
**Reason:** New documentation in `/docs/` fundamentally changes SPOM and session generation architecture
**Backup:** `backup/phases-4-5-5.1` branch contains previous Phase 4-5 implementation

**Key changes from new documentation:**
- 5 blocks (not 4): Initium, Nucleus, Deuteros 1, Deuteros 2, Athlos/Epikos
- Route-driven block assignment via Weekly Rotator (not day-based)
- Contraction type distribution required (CON/EXC/ISO counts per intensity)
- SPOM lookup per route (week x route -> intensity, wave, pattern)
- Format compatibility system (Tabata, EMOM, AMRAP, Complex, etc.)
- Level grouping: ALFA_DELTA, SIGMA, OMEGA (3 groups from 5 levels)

**New Documentation Analyzed (2026-01-23):**
- `Documento de Planificacion` parts 1-4: Block structure, SPOM integration, contraction by intensity
- `system-specs/` parts 1-5: 47-point technical specification defining deterministic engine:
  - Points 1-10: Objective, domain entities, IDs, normalization
  - Points 11-21: SPOM resolution, category hierarchy, intensity->budget, contraction rules
  - Points 22-31: Format taxonomy, compatibility matrix, parameter schema, exercise selection
  - Points 32-40: Prescription (dose, rest, ladders, tempo), validation, coherence checks
  - Points 41-47: Engine pipeline, determinism, logging/trace, test framework

**Session Generation Engine (from system-specs):**
The engine is a **deterministic pipeline** with 9 stages:
1. Normalize tables (SPOM, Intensity, Contraction, Formats, Exercises, Rotator)
2. Build week skeleton (days x level_groups x blocks)
3. Resolve SPOM per block (route -> pct, pattern, scope)
4. Derive budget per block (pct -> reps_budget, exercise_count, difficulty_bucket)
5. Pick format (compatibility matrix -> candidates -> tie-breakers)
6. Pick exercises (scope + bucket + level + contraction -> filter -> dedup -> ranking)
7. Prescribe (allocate doses, bind to format, ladders/tempo, rest, notes)
8. Assemble blocks -> days -> week
9. Validate (coherence, partial user scenarios, insufficiency summary)

**Key invariants:**
- SPOM is unique truth per (week, route) - no duplicates, no averaging
- Budget is TOTAL per block, not per exercise
- Contraction mix derived from pct, not chosen
- Format never adds volume, only distributes budget
- All decisions traceable via structured JSON logs

## Performance Metrics

**Velocity:**
- Total plans completed: 28
- Average duration: 4.2 min
- Total execution time: 2.6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 4 | 30min | 7.5min |
| 02-authentication | 4 | 11min | 2.8min |
| 03-shell-module-system | 2 | 5min | 2.5min |
| 04-spom-engine | 3 | 14min | 4.7min |
| 05-session-generation | 5 | 33min | 6.6min |
| 06-weekly-view | 4 | 10min | 2.5min |
| 07-day-player | 5 | 57min | 11.4min |

**Recent Trend:**
- Last 3 plans: 07-03 (3min), 07-04 (3min), 07-05 (45min - UAT with bug fixes)
- Trend: UAT phase took longer due to iterative bug fixing (10 issues resolved)

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
| 05-01 | exerciseCountMin for determinism | Avoids randomness in exercise count selection |
| 05-01 | Rest time scales with intensity | 30s (low) to 90s (high) matches training principles |
| 05-05 | INITIUM bypasses SPOM pipeline | Per spec line 266, 506: no route, no reps_budget |
| 05-05 | INITIUM fixed intensity at 30% | Within INITIUM range (10-40%), appropriate for warmup |
| 05-05 | INITIUM exercises from FLOW/Movilidad | Per spec line 584: prefer Technical > Structure-based |
| 05-02 | JSON column for trace storage | Flexible, queryable in MySQL 8 |
| 05-02 | Cascade delete on session FKs | Ensures cleanup of blocks/prescriptions |
| 05-02 | Cache-first session retrieval | Check DB before generating to avoid duplicates |
| 05-03 | 4-tier exercise fallback order | difficulty -> level -> scope -> contraction |
| 05-03 | FallbackResult discriminated union | exact/fallback/failed for exhaustive handling |
| 05-03 | 10% budget tolerance | Reps can exceed budget by 10% without error |
| 05-04 | Pino logger for structured logging | JSON-native, performant, child logger inheritance |
| 05-04 | Optional trace persistence | PERSIST_TRACES env var avoids database bloat |
| 05-04 | Child logger pattern | Context inheritance for weekId, dayId, blockId |
| 06-01 | Composition API pattern for stores | Consistency with useAuthStore |
| 06-01 | Store receives data, doesn't fetch | Separation of concerns - composables handle API calls |
| 06-01 | ISO week format (Monday-Sunday) | Standard European format for weekly navigation |
| 06-01 | YYYY-MM-DD date strings | API compatibility and unambiguous dates |
| 06-02 | CSS scroll-snap over JS carousel | Native browser behavior provides better performance and smoother UX |
| 06-02 | IntersectionObserver 50% threshold | Card is considered centered when 50% visible |
| 06-02 | Map-based session storage | Using Map<string, Session|null> in composable allows O(1) lookups |
| 06-02 | Auto vs smooth scroll behavior | Use 'auto' on mount for immediate positioning, 'smooth' on interaction |
| 06-03 | Role-based block color classes | Visual identity for block types (INITIUM blue, NUCLEUS purple, etc.) |
| 06-03 | getBlockColorClass utility exported | Centralizes color mapping for reuse across components |
| 06-03 | Default-opened expansion items | Immediate exercise visibility without extra click |
| 06-03 | Bottom padding accounts for fixed CTA | BlockList padding prevents last block hiding behind Start button |
| 06-04 | WeeklyView as default /training route | Primary interface for members accessing training module |
| 06-04 | Start button visibility tied to isToday | Button only shows when selectedDate matches today |
| 06-04 | DayPlayerPlaceholder for Phase 7 continuity | Enables end-to-end flow testing, Phase 7 will replace |
| 06-04 | Week data fetching on mount | loadWeekData() in onMounted hook for immediate session display |
| 07-01 | Map-based cache for session progress | O(1) lookup, avoids repeated Preferences storage reads |
| 07-01 | Async store methods pattern | Capacitor Preferences is async, consistency throughout store |
| 07-01 | Dynamic import for KeepAwake plugin | Only needed on native, avoid web bundling overhead |
| 07-01 | Type declarations for optional plugin | TypeScript compiles even when plugin not installed |
| 07-01 | Timer persistence every 10 seconds | Balance between data safety and storage write frequency |
| 07-01 | 4-block playable flow | User picks one Deuteros, so only 4 blocks to complete |
| 07-02 | All 4 iOS video attributes required | autoplay, loop, muted, playsinline for Safari autoplay |
| 07-02 | Progress bar divides by 4, not 5 | User completes 4 blocks (chooses one Deuteros) |
| 07-02 | ExerciseCard shows reps OR seconds | Exercise is either rep-based or time-based, never both |
| 07-03 | Accordion emits selectedIndex for parent video sync | Parent controls video display, accordion signals selection changes |
| 07-03 | SplashScreen uses 2.5s display + 0.5s fade | 3s total matches spec, fade provides polish |
| 07-03 | DeuterosChoice uses CSS scroll-snap with 85% width | Native scroll best performance, 85% shows peek of next card |
| 07-03 | Contraction badges colored by type | Visual distinction: CON=blue-grey, EXC=teal, ISO=orange |
| 07-04 | Expose player state via computed properties | TypeScript null safety - template accesses computed values |
| 07-04 | Navigation guard with Quasar dialog | Consistent UX, non-blocking async confirmation |
| 07-04 | Session from weekStore.weekDays.find() | Reuse loaded data, avoid duplicate API calls |
| 07-04 | Wake lock on splash complete | User intent confirmed, prevents screen sleep |

### Pending Todos

None yet.

### Blockers/Concerns

- ~~**SPOM Rules:** Phase 4-5 require golden test datasets from domain expert before development starts (flagged in research)~~ **RESOLVED** - New documentation in `/docs/` provides complete data
- **Timer Accuracy:** Phase 8 needs real-device testing under various conditions (backgrounding, low battery, notifications)
- **Coach Override Patterns:** Need domain-specific design clarification (per-member? per-branch? temporary or permanent?)

## Session Continuity

Last session: 2026-01-27
Stopped at: Completed Phase 7 (Day Player)
Resume file: `.planning/phases/07-day-player/07-05-SUMMARY.md`

**Phase 7 complete.** UAT passed with 10 bug fixes:
- Capacitor v8 upgrade for keep-awake plugin
- Dialog plugin registration
- Nucleus completion flow fix
- Deuteros vertical layout
- Block transition splashes
- F5 refresh handling
- Cleanup pattern for composables

**Issues identified for future:**
- Level display shows "ALFA_DELTA" instead of user's level (Phase 9)
- Same sessions for Alfa/Delta users (Phase 9)

Next steps:
1. Begin Phase 8 (Timer System)
2. Phase 9 (Level-Specific Sessions) addresses session differentiation

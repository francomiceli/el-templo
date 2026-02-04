# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** Members know exactly what to train today, complete guided sessions with block structure and timers, see their progress accumulate, and advance through levels.
**Current focus:** v2.0 Admin App - Phase 13 (Session Generation Review)

## Current Position

Phase: 13 (Session Generation Review & Improvement)
Plan: 02 of ? (Block Specifications)
Status: **In progress**
Last activity: 2026-02-04 - Completed 13-02-PLAN.md (Block Specifications + Exercise Count Cap)

Progress: [██░░░░░░░░] ~5% (Phase 13 early stage)

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
- Total plans completed: 41
- Average duration: 4.1 min
- Total execution time: 4.2 hours

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
| 08-timer-system | 5 | 27min | 5.4min |
| 09-level-specific-sessions | 4 | 11min | 2.8min |
| 10-session-completion | 4 | 35min | 8.8min |
| 11-v1-visual-update | 7 | 12min | 1.7min |
| 12-progression-coach-functions | 4 | 12min | 3.0min |

**Recent Trend:**
- Last 4 plans: 12-03 (2min - page components), 12-04 (3min - page assembly), 13-01 (~min - Dificultad Lineal), 13-02 (4min - block specs + exercise cap)
- Trend: Phase 13 session generation review - documentation and pipeline improvements

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
| 08-01 | String union type for ProtocolType | Better tree-shaking than enum for modern TypeScript |
| 08-01 | Case-insensitive format matching | Tolerates user input variations ("EMOM" vs "emom") |
| 08-01 | Tabata/HIIT as STRAIGHT_SETS | Fixed intervals prescribed in exercises, no protocol timer needed |
| 08-01 | Exercise count determines EMOM rounds | Most logical mapping - 1 exercise per EMOM interval |
| 08-01 | Default 10 minutes for AMRAP | Standard AMRAP duration, configurable in timer composables |
| 08-01 | Default 60 seconds for EMOM interval | Standard "Every Minute On the Minute" definition |
| 08-02 | Web Audio API over MP3 files | OscillatorNode generates beeps programmatically, no external file dependencies |
| 08-02 | Haptic feedback with try/catch | Graceful web fallback when Capacitor Haptics not available |
| 08-02 | cleanup() method for composables | Per Phase 7: no onUnmounted inside composables, expose cleanup() instead |
| 08-02 | STRAIGHT_SETS as no-op timer | Returns zero values, avoids conditional logic in consuming components |
| 08-02 | 100ms polling interval | Smooth display (10x/sec) without battery drain |
| 08-04 | Protocol timer managed by DayPlayer, not useSessionPlayer | Session player handles session-level concerns; protocol timers are per-block and UI-coupled |
| 08-04 | Timer recreated on block advance via watch | Each block may have different protocol type; clean lifecycle per block |
| 08-04 | handleTimerComplete() separate from completeBlock() | Timer-triggered completion needs timer cleanup before block advance |
| 08-04 | @capacitor/app installed for background detection | appStateChange listener needed to auto-stop protocol timer on background |
| 08-05 | 160px padding-bottom for action bar clearance | Worst-case stacked action bar height ~170px (timer + Listo + padding + safe-area), 160px sufficient |
| 08-05 | 500px max-width for desktop action bar | Reasonable button width, centered with auto margins, collapses to full-width on mobile |
| 08-05 | Remove component padding when parent provides spacing | TimerControls redundant 16px padding removed, parent provides padding |
| 09-01 | memberLevel required in DaySession, optional in TraceWhere | New sessions always have member level, old trace events may not for backward compatibility |
| 09-01 | blockId format uses memberLevel instead of levelGroup | Ensures unique blockId per member level (Alfa and Delta get different sessions) |
| 09-01 | ExerciseLevel consolidated to single source | Defined in types.ts, re-exported from fallback/types.ts for backward compatibility |
| 09-02 | Tier 0 uses exact member level for exercise matching | Changed from allowedLevels to [memberLevel] - Alfa and Delta now get different exercises |
| 09-02 | High-intensity level shift at 90%+ | Intensity >= 90% advances exercises one level up with difficulty=1 |
| 09-02 | Spartan maps to omega for format compatibility | format_compatibility table has no spartan row |
| 09-02 | getExpandedLevels uses tier - 2 indexing | Tier 0-1 use exact level, Tier 2 is first widening tier |
| 09-03 | Extract memberLevel from user.level in all API endpoints | User's actual level (alfa, delta, sigma, omega, spartan) determines their specific session |
| 09-03 | dayId format uses memberLevel, not levelGroup | W${week}-${day}-${memberLevel} ensures unique cache keys per member level |
| 09-03 | Admin generate endpoint defaults memberLevel from levelGroup | Backward compatibility for admin tools that don't specify memberLevel |
| 09-03 | sessionToResponse includes memberLevel | Frontend needs to display user's actual level (not just levelGroup) |
| 09-04 | Use userStore.profile.level as primary source for level display | User store is populated on login and is reliable source of truth for user attributes |
| 09-04 | Fallback to session.levelGroup if user profile not loaded | Edge case handling for potential race conditions or partial data scenarios |
| 10-02 | 3.5s display + 0.5s fade = 4s total duration | Within CONTEXT.md 3-4 second spec, provides meaningful celebration |
| 10-02 | Trophy icon (emoji_events) with amber color | Universally recognized achievement symbol |
| 10-02 | Spinner dots indicate transition to summary | User knows something is coming, prevents confusion |
| 10-01 | Check-then-update pattern for upsert | Clear logic, explicit control over insert vs update paths |
| 10-01 | COUNT DISTINCT date for totalDaysTrained | Simple SQL, handles same-day re-completions correctly |
| 10-03 | hasInteracted state for RPE slider | Allows slider to display at 5 but emit null until user touches |
| 10-03 | Block colors inline in SessionSummary | Needs Quasar color names for q-chip, self-contained component |
| 10-04 | Track session start time in onSplashComplete | Accurate startedAt timestamp when user confirms start, not page load |
| 10-04 | Celebration auto-advances to summary | No user action needed, smooth flow from celebration to data collection |
| 10-04 | API call on summary finish, not celebration | Allows user to provide RPE/notes before persisting, requires user intent |
| 10-04 | Clear local progress after successful API call | Ensures clean state before navigation, prevents stale progress |
| 10-04 | weekStore.markDayCompleted() after API success | Updates Weekly View state so completed day shows checkmark immediately |
| 10-04 | Restart requires confirmation dialog | Prevents accidental data loss, warns user progress will be cleared |
| 10-04 | Reset timerStarted and isInitialized on restart | Ensures player state fully resets, prevents inconsistent state |
| 11-01 | Navy (#2c3e5c) primary, bronze (#b8956c) secondary | El Templo classical Greek brand colors |
| 11-01 | @fontsource/cinzel for headings | Self-hosted serif font, no CDN dependency |
| 11-01 | SVG feTurbulence for marble texture | Inline SVG avoids external image files |
| 11-02 | Lowercase alpha (α) for visual distinction | Differentiates from uppercase Delta (Δ) |
| 11-02 | Spartan maps to Omega | Both are highest tier, share same Greek letter Ω |
| 11-02 | Case-insensitive with graceful fallback | Unknown levels return original input instead of throwing |
| 11-06 | Cream (#f5f0e8) for light mode background | Brand color for app icon and splash screen |
| 11-06 | Navy (#1a2a3e) for dark mode background | Dark brand color for night mode splash |
| 11-06 | Capacitor v7.4.5 for iOS/Android | Match existing Capacitor core version |
| 11-03 | Navy gradient with symmetric endpoints | Smooth visual transition for SplashScreen |
| 11-03 | Bronze accent at 20%/40% opacity | Subtle brand presence for logo container |
| 11-03 | Remove Quasar color class for CSS override | Allow custom bronze color on block-route |
| 12-02 | vue-chart-3 over vue-chartjs | Better Vue 3 Composition API support |
| 12-02 | Optimistic update for evaluation pending | setEvaluationPending updates local state immediately |
| 12-02 | Quasar Notify for API errors | User-facing error messages with Spanish text |
| 12-01 | Spartan maps to Omega in Greek letter map | Both are highest tier, share same Omega symbol |
| 12-01 | Streak breaks if no today/yesterday session | Calendar-based streak, consecutive days only |
| 12-01 | Eligibility threshold RPE <= 6 | Average RPE for last 2 weeks must be 6 or below |
| 12-01 | Spanish error messages for evaluation | "Ya tienes una solicitud pendiente", "No cumples los requisitos" |
| 12-03 | Tree-shaken Chart.js imports | Avoid chart.js/auto for smaller bundle, register only needed modules |
| 12-03 | Brand colors as constants in chart config | Hex values for reusability outside SCSS context |
| 12-04 | Module manifest follows training pattern | Consistent with existing module system |
| 12-04 | Badge uses floating rounded style | Subtle indicator without text, bronze color |
| 12-04 | Empty state on totalSessions=0 | Guides new users to training module |
| 13-02 | Non-Initium exercise cap at 3 | Coach-built examples show max 3 per block (warmup excepted) |
| 13-02 | Initium has no cap | Warmup block needs flexibility (2-4 exercises per intensity rules) |

### Pending Todos

None yet.

### Blockers/Concerns

- ~~**SPOM Rules:** Phase 4-5 require golden test datasets from domain expert before development starts (flagged in research)~~ **RESOLVED** - New documentation in `/docs/` provides complete data
- ~~**Timer Accuracy:** Phase 8 needs real-device testing under various conditions (backgrounding, low battery, notifications)~~ **RESOLVED** - Timers removed per quick-001
- **Coach Override Patterns:** Need domain-specific design clarification (per-member? per-branch? temporary or permanent?)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Remove timers, add Saberes link and format info | 2026-01-30 | c126e52 | [001-remove-timers-add-saberes-info](./quick/001-remove-timers-add-saberes-info/) |

## Session Continuity

Last session: 2026-02-04
Stopped at: Completed 13-02-PLAN.md - Block specifications documented, exercise count cap implemented
Resume file: None

**MILESTONE v1 COMPLETE** (2026-02-03)

Member app delivered:
- Authentication & user management
- SPOM engine with deterministic session generation
- Weekly view with day navigation
- Day player with block flow and exercise display
- Session completion with RPE tracking
- Brand identity (navy/bronze, Greek letters, marble textures)
- Progression tracking (Mi Camino) with evaluation requests

**MILESTONE v2.0 IN PROGRESS** — Admin App

Phase 13: Session Generation Review & Improvement
- Review session-logic documentation
- Compare algorithm vs coach-built sessions
- Fix generation discrepancies

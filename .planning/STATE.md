# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** Members know exactly what to train today, complete guided sessions with block structure and timers, see their progress accumulate, and advance through levels.
**Current focus:** v2.0 Admin App - Phase 16 (PDF Generation, Format Config, App Exercise Tracking)

## Current Position

Phase: 16 (PDF Generation, Format Config, App Exercise Tracking) — **In Progress**
Plan: 05 of 10
Status: **Active** — Exercise completion tracking complete
Last activity: 2026-02-10 - Completed 16-05-PLAN.md (Exercise Completion Tracking)

Progress: [█████_____] 50% Phase 16 (5/10 plans)

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
- Total plans completed: 47
- Average duration: 4.0 min
- Total execution time: 4.6 hours

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
| 16-pdf-generation-format-config-app-exercise-tracking | 5 | 7min | 1.4min |

**Recent Trend:**
- Last 5 plans: 15-09 (human verification), 16-01 (1min - Format Params), 16-03 (1min - Category-based Exercise Swap), 16-04 (1min - Reactive Prescription Updates), 16-05 (3min - Exercise Completion Tracking)
- Trend: Phase 16 in progress - Admin UX improvements and member app exercise tracking

*Updated after each plan completion*
| Phase 16-pdf-generation-format-config-app-exercise-tracking P05 | 3 | 2 tasks | 2 files |

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
| 13-01 | Linear difficulty scale 1-12 | Alfa 1-3, Delta 4-6, Sigma 7-8, Omega 9-10, Spartan 11-12 |
| 13-01 | Nivel Superior at 85%+ | Maps to next level's first linear difficulty |
| 13-01 | dificultadLineal column | Stored in exercises table for direct query |
| 13-02 | Non-Initium exercise cap at 3 | Coach-built examples show max 3 per block (warmup excepted) |
| 13-02 | Initium has no cap | Warmup block needs flexibility (2-4 exercises per intensity rules) |
| 13-04 | Use existing mobilityRelated column | Exercises CSV already has route codes for mobility areas |
| 13-04 | Map routes to mobility routes | ROUTE_TO_MOBILITY_ROUTES constant for warmup relevance |
| 13-04 | Contextual fallback to generic | Graceful degradation when not enough contextual exercises |
| 13-03 | csv-parse/sync over fast-csv | Already installed, sync API simpler for file parsing |
| 13-03 | Rename duplicate columns with _ref suffix | csv-parse overwrites duplicate column names |
| 13-03 | Parse routes from summary section | Routes in rows 9-10, not exercise rows |
| 13-03 | Difficulty tolerance 0.5 | Allow small variations in average difficulty comparison |
| 13-05 | 24% pass rate as acceptable variation | Deterministic algorithm vs creative coaches - exact match 24%, remaining 76% valid structural variations |
| 13-05 | Contraction rule three-tier fallback | Exact lookup → nearby counts → default mix, scales to actual exercise count for robustness |
| 13-05 | Initium budget 80-100 reps varying by week | Matches coach patterns, maintains warmup flexibility instead of fixed budget |
| 13-05 | Difficulty in prescription response | Add dificultadLineal to API response for frontend display and user education |
| 13-06 | Buy-in/Cash-out 40/60 split | Bookend exercise gets 40% (20% start + 20% end), middle share 60% |
| 13-06 | AMRAP 30-rep cap per round | Prevents excessive single-round work |
| 13-06 | EMOM intensity-based reps | 12 at <70%, 10 at 70-79%, 8 at 80%+ |
| 13-06 | Complex no inter-exercise rest | Only rest after last exercise |
| 13-06 | Chipper inverse difficulty | Higher reps for easier exercises |
| 13-06 | INITIUM skip in verification | Uses specialized warmup pipeline |
| 13-07 | For Time: no prescribed rest | Athletes move continuously, timing their own completion |
| 13-07 | Tabata: 20s/10s fixed | Standard Tabata protocol, not configurable |
| 13-07 | Interval: intensity-scaled | 80%+ gets shorter work/longer rest |
| 13-07 | Unbroken: 70% multiplier | Sustainable sets require lower targets |
| 13-07 | Ladder: 75% threshold | High intensity = descending (harder first) |
| 13-07 | Couplet/Triplet: slice exercises | Graceful handling when counts mismatch |
| 13-08 | Cross-route 2+1 split via pattern_2 | Non-INITIUM blocks get 1 exercise from SPOM pattern_2 cross-route pool |
| 13-08 | Cross-route uses last contraction | Take from ISO > EXC > CON with count > 0 |
| 13-08 | Pattern lookup: pattern then category | Try exercises.pattern first, fallback to exercises.category |
| 13-08 | Route-specific pattern_2 = no cross-route | High intensity patterns (PL, FL, HT) yield empty pool |
| 14-01 | ON DELETE SET NULL for approval/discard FKs | Preserve session history even if user deleted |
| 14-01 | pending_review as default status | All existing and new sessions need review |
| 14-01 | approvedBySystem boolean | Distinguishes manual vs auto-approved sessions |
| 14-02 | Web-only admin app | No Capacitor - admin runs in browser only |
| 14-02 | History mode routing for admin | Clean URLs without hash for web-only app |
| 14-02 | Port 9100 for admin | Different from member app (9000) for parallel dev |
| 14-02 | localStorage for admin tokens | No native storage needed for browser-only app |
| 14-03 | Admin role check via onRequest hook | Single hook validates all admin routes, cleaner than per-route |
| 14-03 | Admin CORS origin for port 9100 | Development localhost:9100, production admin.eltemplo.com |
| 14-03 | Service class pattern for admin | Separates database logic from route handlers, easier to test |
| 14-03 | Spanish error messages in admin API | "Acceso de administrador requerido", "Sesion no encontrada" |
| 14-05 | Block colors match member app | Initium=blue, Nucleus=purple, Deuteros=teal, Athlos/Epikos=amber |
| 14-05 | Contraction types in Spanish | Concentrico, Excentrico, Isometrico |
| 14-05 | Algorithm details toggleable | Per-block toggle for coach debugging |
| 14-04 | Client-side day filtering | Load week data once, filter by day client-side for snappy tab switching |
| 14-04 | Pending sessions sorted first | Coaches see action-required sessions before approved/discarded |
| 14-04 | Greek letters for level display | Compact table display (a/D, S, O) matches member app convention |
| 14-04 | Bulk approve confirmation required | Prevents accidental mass approval |
| 14-06 | Future weeks only for generation | currentWeek + 1 minimum, cannot regenerate past/current weeks |
| 14-06 | Hierarchical generation scope | Week, Day, Day+Level granularity for targeted regeneration |
| 14-06 | StatusIndicator inline component | defineComponent with render function for simple status icons |
| 14-07 | requireApproved parameter default false | Backward compatible - admin endpoints can still access any session |
| 14-07 | 404 for pending sessions | Clear feedback to members that session is not yet available |
| 14-07 | Coverage threshold weeksAhead <= 1 | Per CONTEXT.md - 1 week threshold for low sessions alert |
| 14-07 | Cron timezone Argentina | America/Argentina/Buenos_Aires for accurate day calculation |
| 14-07 | approvedBySystem for auto-approve | Existing boolean column used, no migration needed |
| 15-01 | JSON column for algorithm snapshot | 1:1 relationship with sessions, simpler than separate table |
| 15-01 | Snapshot captures blocks + prescriptions | Full session structure for revert capability |
| 15-01 | NULL snapshot for existing sessions | Reset button hidden when no snapshot exists |
| 15-02 | PrescribeService wraps pipeline prescribeByFormat | Thin wrapper, no prescription logic duplicated |
| 15-02 | calculateRest replicated from stage-7 | Not exported from pipeline, exact same logic |
| 15-02 | Exercise pool sorted by difficulty proximity | Best swap suggestions first for coaches |
| 15-02 | Blank prescription for added exercises | Coach fills in manually per CONTEXT.md |
| 15-02 | exerciseCount updated via SQL expression | Avoids read-then-write race conditions |
| 15-03 | Exercise pool route enriches params from block context | Keep API surface simple, derive pattern2/excludeIds/role from blockId |
| 15-03 | Preview reuses getSessionWithDetails + transforms | No duplicate query logic, simplified shape for frontend |
| 15-03 | Preview level switching via dayId construction | Same week/day, different memberLevel suffix in dayId |
| 15-03 | Reset endpoint 400 for missing snapshot | Distinct from 404 (missing session) for clear error reporting |
| 15-04 | Separate useEditApi from useSessionsApi | Keep review and editing API concerns isolated |
| 15-04 | PrescriptionUpdate uses optional fields | Support partial updates (coach edits one field at a time) |
| 15-04 | changeBlockFormat sends formatId and formatName | Backend can update both columns atomically |
| 15-05 | Blur-save on prescription fields | Emit update only when value differs from props, avoiding unnecessary API calls |
| 15-05 | EditableBlockCard handles remove confirmation and API calls | Row component stays focused on presentation, block card owns business logic |
| 15-05 | Placeholder toasts for swap/add-exercise | Plan 15-06 scope, SessionEditPage shows "Proximamente" until dialog implemented |
| 15-05 | Reset to algorithm always visible | Confirmation dialog prevents accidental use, simpler than conditional visibility |
| 15-06 | Added pattern field to SessionBlock frontend type | Backend already returns it, needed for swap dialog block context |
| 15-06 | Contraction filter triggers API re-fetch, search is client-side | Server-side filter for accuracy, client-side search for responsiveness |
| 15-06 | Cross-route exercises show "Cruce" badge in deep-orange | Visual distinction for pattern_2 exercises from different routes |
| 15-07 | ExerciseSwapDialog reused for add-exercise with mode prop | Avoids duplicating pool-fetching and filtering UI |
| 15-07 | BudgetBar visual cap at 150% | Prevents progress bar overflow at extreme overages |
| 15-07 | ContractionMixBadge skips INITIUM validation | INITIUM uses specialized warmup pipeline, not standard contraction rules |
| 15-07 | Format dropdown shows compatibility score in parentheses | Coach reference for relative format compatibility |
| 15-08 | Preview button uses 'preview' icon, not 'visibility' | Avoid confusion with existing view-details button in sessions list |
| 15-08 | Level selector offers all 5 member levels | Coaches can preview any level, not just current session's level |
| 16-04 | Object.assign for reactive prescription updates | Vue 3 reactivity tracks property changes, allows targeted updates without full reload |
| 16-04 | Keep emit('refresh') for structural changes | Operations modifying exercises array need full reload for consistency |
- [Phase 16-05]: completedExercises uses blockRole as key for flexibility across all block types
- [Phase 16-05]: Auto-advance triggers existing completeBlock() to reuse established logic
- [Phase 16-05]: Backward compatibility in loadProgress defaults missing completedExercises to {}

### Roadmap Evolution

- Phases 20-22 added (2026-02-09): Exercise Video Pipeline split into 3 phases — Processing Pipeline (Python/MediaPipe/FFmpeg), Video Hosting & Content Tooling (Cloudflare R2/manifest/upload), App Video Integration (DB/API/frontend wiring). Independent of admin phases, can run in parallel. *(Now renumbered to Phases 21-23)*
- Phase 16 inserted (2026-02-10): PDF Generation for approved sessions, format parameter configuration for high/medium importance formats, exercise swap UX (category instead of pattern), per-exercise completion tracking in member app. Old phases 16-22 renumbered to 17-23.

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

Last session: 2026-02-10
Stopped at: Completed 16-05-PLAN.md (Exercise Completion Tracking)
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

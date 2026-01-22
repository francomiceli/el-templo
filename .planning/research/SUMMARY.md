# Project Research Summary

**Project:** El Templo - Modular Fitness Training Super-App
**Domain:** Fitness training app with proprietary periodization methodology (SPOM)
**Researched:** 2026-01-22
**Confidence:** HIGH

## Executive Summary

El Templo is a methodology-driven training system, not a generic workout library or AI-generated fitness app. The core value proposition is delivering the gym's proprietary SPOM periodization at scale: members know exactly what to train today, execute guided sessions with precise timers, and progress through levels under coach oversight. This positions El Templo in a unique category separate from workout browsers (Nike Training Club), AI programs (Fitbod), or tracking-only apps (Strong).

The recommended approach is a **shell + modules architecture** built on Quasar 2.x + Vue 3 + Capacitor 6 (frontend) and Fastify + Drizzle + MySQL (backend). The modular design allows the Training module to ship first while keeping architecture ready for future Academy and Agora modules. Critical technical decisions include: (1) using Pinia for centralized state with a finite state machine for workout sessions, (2) pinning all Capacitor plugins to v6 to avoid version conflicts, (3) streaming exercise videos from CDN (not bundling locally) due to iOS WebView limitations, and (4) implementing wall-clock-based timers with keep-awake to handle mobile background suspension.

The top risks are: **background timer death** (mobile OSs suspend JavaScript when app backgrounds), **iOS video playback failures** (local videos via `capacitor://` protocol don't work), **complex workout state corruption** (nested session/block/timer state goes out of sync), and **SPOM algorithm brittleness** (52-week periodization logic is hard to test without golden datasets). All are mitigable with the patterns documented in this research. The anti-features list is equally important: avoid streak-shaming, calorie tracking, public leaderboards, and excessive gamification, which 2025 research shows create shame and demotivation.

## Key Findings

### Recommended Stack

The stack is partially constrained (Quasar + Capacitor + Node.js + MySQL are non-negotiable) with research focused on complementary libraries. All recommendations prioritize TypeScript-first, 2025-ecosystem-standard tools.

**Core technologies:**
- **Quasar 2.18.x + Vue 3.5+:** UI framework with 70+ Material components, built-in Capacitor integration
- **Capacitor 6.x:** Cross-platform native runtime (iOS, Android, PWA) — stay on 6 until ecosystem stabilizes
- **Pinia 2.2+:** Official Vue 3 state management, replaces Vuex
- **Fastify 5.x:** 2x faster than Express, built-in JSON schema validation, TypeScript-first
- **Drizzle ORM 0.38+:** SQL-like TypeScript ORM, 7.4kb bundle, 14x faster joins than Prisma
- **jose + Argon2:** JWT handling (zero deps) + OWASP-recommended password hashing
- **Zod 3.24+:** TypeScript-first schema validation, types from schemas
- **VueUse 14.0+:** 200+ composition utilities (requires Vue 3.5+)
- **Vitest 3.x:** Official Vue testing recommendation, 10-20x faster than Jest

**Critical Capacitor plugins:**
- `@capacitor/preferences@6` — persistent storage (replaces localStorage which mobile OS can clear)
- `@capacitor-community/keep-awake@6` — essential for workout timers
- `@capacitor/haptics@6` — timer alerts, round transitions

**What NOT to use:** Vuex (legacy), Express (slower), TypeORM (maintenance issues), Prisma (vendor lock-in), Passport.js (overkill for JWT), bcrypt (use Argon2), Jest (use Vitest), localStorage directly (OS clears it).

### Expected Features

**Must have (table stakes):**
- Quick session start — one tap from weekly view to training
- Clear exercise instructions with timer display
- Workout timers (EMOM, AMRAP, For Time) — core to SPOM block formats
- Progress tracking and session history
- Rest period management with audio/haptic cues
- Screen stays awake during active timers
- Visual block progression (4-block structure with distinct colors)
- Session completion with RPE input

**Should have (differentiators):**
- Algorithmic session generation from SPOM rules + 1869 exercises
- Level-appropriate exercises (Alfa through Spartan filter the database)
- Visible level progression tied to RPE history + coach evaluation
- Gym-wide synchronization ("We're all on Week 27 together")
- Coach visibility into member trends and level readiness
- Coach override capability for block customization

**Anti-features (explicitly avoid):**
- Workout library browsing — undermines SPOM structure
- Calorie/macro tracking — creates shame and guilt spiral
- Streak-shaming notifications — causes anxiety
- Public leaderboards — demotivates lower performers
- Manual exercise logging — transforms training into data entry
- AI chat/coaching — dilutes real coach relationship

**Defer to v2+:**
- Exercise videos (real) — launch with placeholders
- Push notifications — after retention data
- Offline mode (robust) — PWA caching sufficient for v1
- Wearable integration — nice-to-have, not essential
- Academy module — requires Training foundation + Sigma gate
- Agora module — requires Academy foundation

### Architecture Approach

The architecture is a **shell + modules pattern** where the central shell (temple-nest) provides authentication, global state (Pinia), navigation, event bus (VueUse), and module orchestration. Modules (Training, Academy, Agora) register via manifests and are lazy-loaded. The backend mirrors this with Fastify core plugins plus domain-specific plugin modules.

**Major components:**

1. **Temple Shell (Frontend):** Auth, global stores (useAuthStore, useUserStore), module registry, Capacitor bridge, shared UI components, API client with interceptors
2. **Training Module:** SPOM engine integration, Day Player, Timer components (EMOM/AMRAP/ForTime), Session completion, module-specific stores (useSessionStore, useTimerStore)
3. **Fastify Core (Backend):** Auth plugin (JWT), Database plugin (Drizzle), Validation plugin (Zod), Event logger plugin (audit trail)
4. **Training Plugin (Backend):** Session generation, SPOM logic, exercise queries
5. **MySQL Database:** Global tables (users, branches, credentials), module tables (sessions, exercises, progress), event log (full audit trail)

**Key patterns:**
- Composition over inheritance (Vue 3 composables)
- Explicit module boundaries (modules never import from each other)
- API layer abstraction (all HTTP through typed API client)
- Type-safe event logging with full audit trail
- Finite state machine for session flow (idle -> active -> completing -> completed)

**Data boundaries:**
- Global: User credentials, SPOM rules, exercise database
- Branch: Classes, check-ins, coach assignments
- User: Sessions, progress, RPE history, level

### Critical Pitfalls

1. **Background timer death on iOS/Android** — Mobile OSs suspend JavaScript when app backgrounds. **Mitigation:** Use `@capacitor-community/keep-awake` during active timers, track elapsed time from wall-clock (not countdown), handle `appStateChange` events to recalculate timer state on resume.

2. **iOS video playback failures** — HTML5 `<video>` fails with local files via `capacitor://` protocol on real iOS devices (works in simulator). **Mitigation:** Stream all videos from CDN/HTTPS, never bundle locally, test on real iOS devices early.

3. **Quasar-Capacitor version mismatch** — `quasar mode add capacitor` installs v6, but `npm install @capacitor/plugin` defaults to v7 which is incompatible. **Mitigation:** Pin all Capacitor packages to @6, never upgrade Gradle when Android Studio prompts, install plugins in `src-capacitor/` not project root.

4. **Complex workout state corruption** — Nested session/block/timer state goes out of sync with multiple components updating simultaneously. **Mitigation:** Use finite state machine for session flow, centralized workout orchestrator composable, immutable updates for nested state, event logging as verification.

5. **SPOM algorithm brittleness** — 52-week periodization rules hard to verify without domain expertise, edge cases at week boundaries. **Mitigation:** Golden test datasets from domain experts, separate parsing from generation, admin preview/debug mode, explicit rule documentation in code.

6. **Multi-branch data leakage** — Queries without branch filtering expose data across locations. **Mitigation:** Branch-scoped queries at database layer, middleware enforces branch context, clear frontend cache on branch context switch, automated tests for data isolation.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation

**Rationale:** Everything depends on auth, data persistence, and correct project setup. Version conflicts here cascade into every future phase.

**Delivers:** Working Quasar + Capacitor skeleton, Fastify + Drizzle backend, database schema (global tables), JWT authentication flow

**Addresses:** Authentication (FEATURES.md), member profile with branch/level

**Avoids:** Pitfall #3 (version mismatches), Pitfall #17 (TypeScript config), Pitfall #18 (wrong plugin directory)

**Tech:** Quasar 2.18.x, Vue 3.5+, Capacitor 6.x (pinned), Fastify 5.x, Drizzle ORM, jose, Argon2

### Phase 2: Shell & Global State

**Rationale:** The shell provides the foundation that modules plug into. Module registry, global stores, and Capacitor bridge must exist before any feature module.

**Delivers:** Shell layout components, global Pinia stores (useAuthStore, useUserStore, useEventBusStore), module registration system, API client with interceptors, Capacitor plugin wrappers

**Addresses:** Architecture component "Temple Shell"

**Avoids:** Pitfall #7 (Android safe area), Pitfall #16 (localStorage cleared), Pitfall #6 (branch isolation)

**Tech:** Pinia, VueUse (event bus), Axios, @capacitor/preferences

### Phase 3: SPOM Engine

**Rationale:** No sessions without the periodization engine. This is backend-heavy and can parallel with Phase 2 frontend work.

**Delivers:** Exercise database import, SPOM rules import, session generation logic, weekly state management

**Addresses:** Algorithmic session generation (differentiator), level-appropriate exercises

**Avoids:** Pitfall #5 (algorithm brittleness), Pitfall #9 (import fragility), Pitfall #13 (performance at scale)

**Tech:** Drizzle queries, node-cron for daily generation, Zod for validation

**NOTE:** Requires golden test datasets from domain expert before development starts.

### Phase 4: Training Module UI

**Rationale:** Core user-facing experience. Depends on Phase 2 (module system) and Phase 3 (SPOM data to display).

**Delivers:** Module manifest + routes, training stores (useSessionStore, useTimerStore), weekly view, Day Player, timer components (EMOM, AMRAP, ForTime), block progression UI

**Addresses:** Quick session start, workout timers, visual block progression, screen stays awake, exercise instructions

**Avoids:** Pitfall #1 (timer death), Pitfall #2 (video issues), Pitfall #4 (state corruption), Pitfall #8 (store fragmentation), Pitfall #11 (timer drift), Pitfall #19 (audio playback)

**Tech:** Vue composables, @capacitor-community/keep-awake, @capacitor/haptics, state machine pattern

**NOTE:** Test on real iOS and Android devices with notches. Video placeholder strategy (no real videos yet).

### Phase 5: Session Completion & History

**Rationale:** Closes the training loop. Cannot exist without Day Player (Phase 4).

**Delivers:** Block completion flow, session completion screen, RPE input, event logging implementation, session history view

**Addresses:** Session completion confirmation, progress tracking, session history, RPE-based feedback loop

**Avoids:** Pitfall #12 (UX dark patterns) — ensure all copy is positive-framed

**Tech:** Event logging composable, API endpoints for completion

### Phase 6: Progression System

**Rationale:** Makes training meaningful over time. Depends on completed sessions (Phase 5).

**Delivers:** Level display in UI, RPE trend tracking/visualization, coach member list view, level promotion flow (coach action), evaluation request (member action), coach override capability

**Addresses:** Visible level progression, coach visibility, coach override, level promotion

**Avoids:** Pitfall #12 (no "You're still at Alfa" messaging)

**Tech:** Dashboard queries, role-based access control

### Phase Ordering Rationale

- **Foundation first:** Auth and database are dependencies for everything. Getting Capacitor versions right on day one avoids painful debugging later.
- **Shell before modules:** The module registry and global state must exist before Training module can register.
- **SPOM before UI:** No point building Day Player without sessions to display. SPOM engine can develop in parallel with frontend shell.
- **Timers are highest-risk UI:** Phase 4 has the most technical pitfalls (background execution, video playback, state corruption). Needs the most testing time.
- **Progression last:** It's a differentiator but depends on accumulated session data. Defer until core loop works.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 3 (SPOM Engine):** Domain-specific logic, requires collaboration with El Templo team to understand periodization rules. Need golden datasets before coding.
- **Phase 4 (Timers):** Custom implementation required (no off-the-shelf EMOM/AMRAP libraries found). Timer accuracy and background handling need careful design.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** Well-documented, established patterns in Quasar/Fastify docs
- **Phase 2 (Shell):** Standard Vue 3 patterns, official Pinia documentation
- **Phase 5 (Completion):** Standard CRUD operations
- **Phase 6 (Progression):** Standard dashboard patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official documentation, 2025 ecosystem consensus, multiple comparison sources |
| Features | HIGH | Grounded in El Templo's specific SPOM methodology + industry research on fitness apps |
| Architecture | HIGH | Based on official Quasar, Vue 3, Pinia, Fastify documentation patterns |
| Pitfalls | HIGH | Verified via official docs, GitHub issues with reproduction steps, multiple community reports |

**Overall confidence:** HIGH

### Gaps to Address

- **SPOM rule encoding:** Research covered architecture but actual periodization rules need to come from domain expert. Recommend documentation session before Phase 3.

- **Exercise video hosting:** Research recommends CDN but specific provider not evaluated. AWS S3 + CloudFront, Cloudflare R2, or similar needed.

- **Timer accuracy validation:** Research documents the approach (wall-clock, keep-awake) but real-device testing under various conditions (backgrounding, low battery, notifications) needed during Phase 4.

- **Coach override patterns:** How coaches customize blocks while SPOM runs needs more domain-specific design. Is it per-member override? Per-branch? Temporary or permanent?

- **Audio for timer cues:** Research mentions preloading but specific sound design (what sounds, how many, volume levels) needs UX decision.

## Sources

### Primary (HIGH confidence)
- [Quasar Framework Official](https://quasar.dev) — project structure, Capacitor integration, troubleshooting
- [Capacitor Documentation](https://capacitorjs.com/docs) — plugins, storage guide, background runner
- [Fastify Documentation](https://fastify.dev/docs/) — plugin patterns, TypeScript support
- [Drizzle ORM](https://orm.drizzle.team/) — MySQL schema, queries, migrations
- [Pinia Documentation](https://pinia.vuejs.org/) — store patterns, composing stores
- [VueUse](https://vueuse.org/) — event bus, composition utilities
- [Vue 3 Official](https://vuejs.org/guide/) — state management, provide/inject, testing

### Secondary (MEDIUM confidence)
- [Node.js ORMs in 2025](https://thedataguy.pro/blog/2025/12/nodejs-orm-comparison-2025/) — Drizzle vs Prisma vs TypeORM
- [Vitest vs Jest 2025](https://medium.com/@ruverd/jest-vs-vitest-which-test-runner-should-you-use-in-2025-5c85e4f2bda9) — testing framework comparison
- [Password Hashing Guide 2025](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/) — Argon2 recommendation
- [PWA on iOS 2025](https://brainhub.eu/library/pwa-on-ios) — iOS PWA limitations
- [Mastering Pinia Best Practices](https://masteringpinia.com/blog/5-best-practices-for-scalable-vuejs-state-management-with-pinia) — state management patterns
- [Fitness App Psychology Studies 2025](https://studyfinds.org/fitness-app-motivation-study-myfitnesspal/) — anti-feature research

### GitHub Issues (HIGH confidence for specific bugs)
- [#6790: Video playback issues on iOS](https://github.com/ionic-team/capacitor/issues/6790)
- [#7258: Local videos fail on iOS](https://github.com/ionic-team/capacitor/issues/7258)
- [#18069: Android safe area](https://github.com/quasarframework/quasar/issues/18069)
- [#16261: Capacitor version conflicts](https://github.com/quasarframework/quasar/discussions/16261)

---
*Research completed: 2026-01-22*
*Ready for roadmap: yes*

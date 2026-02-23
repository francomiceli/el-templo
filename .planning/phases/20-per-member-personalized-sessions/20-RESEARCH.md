# Phase 20: Per-Member Personalized Sessions - Research

**Researched:** 2026-02-20
**Domain:** Session generation pipeline extension, member journey system, multi-scope admin views
**Confidence:** HIGH

## Summary

Phase 20 adds "journeys" — personalized training paths where members choose a body-zone focus and receive zone-biased sessions. The existing SPOM pipeline and exercise database already contain the data structures needed for zone filtering: the `exercises.route` column maps exercises to movement domains (e.g., HS=Handstand, PL=Planche, FL=Front Lever, SU=Squat), and the `ROUTE_TO_MOBILITY_ROUTES` constant categorizes these routes into upper push, upper pull, lower knee-dominant, lower hip-dominant, and core groups. The pipeline currently selects exercises by route (via weekly rotator lookup); journey sessions will bypass the rotator and instead filter exercises by a journey-specific route whitelist.

This is a full-stack feature touching all 3 apps: new DB tables for journeys and member-journey associations, API endpoints for journey CRUD and journey-scoped session retrieval, member app journey selection UI and session flow, and admin journey generation/management views. The session completion system needs a `journeyId` discriminator to track journey progress independently from Entrenamiento.

**Primary recommendation:** Extend the existing pipeline with a "journey mode" that replaces the rotator stage (Stage 1) with a static route whitelist per journey type, while keeping stages 2-7 intact. Add a `journey_type` column to sessions and `member_journeys` + `journey_sessions` DB tables. Front-end-only duration filtering (20/40/60 min) based on block inclusion rules.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- 6 journey types across 3 difficulty tiers: Principiante (Tren Superior, Tren Inferior), Intermedio (Empuje, Traccion), Avanzado (Planche, Front Lever)
- General/complete route = existing Entrenamiento (unchanged)
- One active journey at a time per member; member-driven selection (coaches cannot assign)
- Journey nav in left panel alongside Entrenamiento; pick-first flow with overview/confirm/duration
- 100% zone bias — no cross-zone exercise mixing
- Zone-specific warm-up (Initium matches the journey zone)
- 3 duration formats: 20 min (Initium + Nucleus), 40 min (+ Deuteros single), 60 min (+ Athlos/Epikos)
- Duration selected per-session, always neutral, with encouraging message for shorter sessions
- Duration-specific progression tracking (each duration tracks its own semana independently)
- Coaches generate 6 journey variations per semana (duration is front-end filter)
- Admin: two tabs "General" and "Personalizadas" in sesiones view
- Admin: new "Alumnos" view showing all members with journey status
- Journey switching resets progress (archived in history)
- Mi Camino integration for journey progress and archived history
- Work with existing exercise tags/categorization — no new columns for exercise database
- Static/hardcoded journey descriptions (not coach-managed)
- Same session flow as Entrenamiento once inside a journey

### Claude's Discretion

- Generation view tab organization for personalized plans
- Post-session return destination (journey or home)
- Loading states and transitions
- Exact card layout and spacing following brand guidelines
- Admin alumnos view column layout and design

### Deferred Ideas (OUT OF SCOPE)

- Premium gating (future phase)
- Coach-managed journey descriptions (future phase)
- Coach journey assignment/recommendation (future phase)
  </user_constraints>

## Standard Stack

### Core

| Library      | Version  | Purpose                                                      | Why Standard                |
| ------------ | -------- | ------------------------------------------------------------ | --------------------------- |
| Drizzle ORM  | existing | New DB tables (member_journeys, journey completions)         | Already used for all schema |
| Fastify      | existing | New API routes for journey CRUD + session retrieval          | Existing API framework      |
| Quasar/Vue 3 | existing | Journey UI components (selection, duration picker, progress) | Existing UI framework       |
| Pinia        | existing | Journey store for member app state management                | Existing state pattern      |

### Supporting

| Library            | Version  | Purpose                                  | When to Use              |
| ------------------ | -------- | ---------------------------------------- | ------------------------ |
| @fontsource/cinzel | existing | Journey card headings (brand serif font) | Journey selection screen |
| vue-chart-3        | existing | Journey progress charts in Mi Camino     | Archived journey stats   |

### Alternatives Considered

| Instead of                            | Could Use                                | Tradeoff                                                                                                  |
| ------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Static route whitelists               | New DB table for route-to-zone mapping   | Overkill — 6 fixed journeys with known routes, code constants are simpler and more maintainable           |
| Front-end duration filter             | Separate session generation per duration | Would require 18 sessions per semana instead of 6; violates user decision that duration is front-end only |
| New `journeyType` column on exercises | Existing `route` column filtering        | User explicitly decided no new exercise columns; routes already classify exercises by zone                |

## Architecture Patterns

### Journey-to-Route Mapping (Core Design)

The key architectural decision is mapping journey types to exercise route whitelists. Based on the existing route codes in `seed-spom.ts` and the zone groupings in `mobility-routes.ts`:

```typescript
// Source: codebase analysis of el-templo-api/src/db/seed-spom.ts route codes
// and el-templo-api/src/modules/sessions/pipeline/utils/mobility-routes.ts groupings

export const JOURNEY_ROUTE_MAP: Record<JourneyType, string[]> = {
  // Principiante tier
  tren_superior: [
    "HS",
    "HSPU",
    "PHS",
    "OAPU",
    "PLPU", // Upper push
    "MU",
    "OAP",
    "OAR",
    "BL", // Upper pull
    "HR",
    "HD/ID",
    "MN/RP", // Handstand/core (upper-body-adjacent)
  ],
  tren_inferior: [
    "SU",
    "SS",
    "PS",
    "QC", // Lower knee-dominant
    "DS", // Lower hip-dominant (deadlift-style)
  ],

  // Intermedio tier
  empuje: [
    "HS",
    "HSPU",
    "PHS",
    "OAPU",
    "PLPU", // Push patterns
  ],
  traccion: [
    "MU",
    "OAP",
    "OAR",
    "BL", // Pull patterns
  ],

  // Avanzado tier
  planche: ["PL", "PLPU"], // Planche-specific
  front_lever: ["FL", "FLR"], // Front lever-specific
};
```

**CRITICAL RESEARCH FINDING:** The advanced journeys (Planche, Front Lever) have very constrained route pools (2 routes each). The SPOM rules table contains intensity/pattern data per (week, route). If a route has no SPOM rule for the current week, the pipeline will throw. The planner MUST verify that PL, PLPU, FL, FLR routes have SPOM rules for all 21 weeks, OR the journey pipeline must handle missing SPOM rules gracefully. **Confidence: HIGH** — verified from `stage-2-spom.ts` which throws on missing SPOM rule.

### Recommended Project Structure

```
el-templo-api/src/
├── db/schema/
│   ├── member-journeys.ts      # member_journeys table (active journey per member)
│   └── journey-sessions.ts     # Links sessions to journey type
├── modules/
│   ├── journeys/
│   │   ├── routes.ts           # Journey API endpoints
│   │   ├── service.ts          # Journey CRUD + session retrieval
│   │   ├── types.ts            # JourneyType, JourneySession types
│   │   └── constants.ts        # JOURNEY_ROUTE_MAP, journey metadata
│   └── sessions/
│       └── pipeline/
│           └── journey-pipeline.ts  # Modified pipeline for journey mode

el-templo-app/src/
├── modules/
│   └── journey/
│       ├── index.ts            # Module manifest
│       ├── routes.ts           # Journey route definitions
│       ├── stores/
│       │   └── journeyStore.ts # Journey state (active journey, duration, semana)
│       ├── composables/
│       │   ├── useJourneyApi.ts
│       │   └── useJourneySession.ts
│       └── pages/
│           ├── JourneySelection.vue   # Journey picker (6 cards, 3 tiers)
│           ├── JourneyOverview.vue    # Journey details before confirm
│           ├── DurationPicker.vue     # 20/40/60 min selector
│           └── JourneySession.vue     # Session player (reuses DayPlayer logic)

el-templo-admin/src/
├── pages/
│   ├── AlumnosPage.vue         # New: member journey overview
│   └── (existing GeneratePage, SessionsPage get tabs)
```

### Pattern 1: Journey Pipeline (Modified SPOM Pipeline)

**What:** The journey pipeline replaces Stage 1 (rotator resolution) with a static route assignment from the journey route map, then runs stages 2-7 normally.

**When to use:** When generating journey-type sessions.

**Example:**

```typescript
// Instead of rotator lookup, journey pipeline assigns route directly
export async function resolveJourneyRoute(
  ctx: BlockContext,
  journeyType: JourneyType,
  week: number,
  day: string,
  blockRole: BlockRole,
): Promise<BlockContextWithRoute> {
  const allowedRoutes = JOURNEY_ROUTE_MAP[journeyType];

  // Deterministic route selection: hash(week, day, role) % routes.length
  // Ensures variety across days while remaining deterministic
  const routeIndex =
    deterministicHash(week, day, blockRole) % allowedRoutes.length;
  const selectedRoute = allowedRoutes[routeIndex];

  // Continue to stage 2 (SPOM lookup) with this route
  return { ...ctx, route: selectedRoute };
}
```

### Pattern 2: Front-End Duration Filtering

**What:** Coaches generate full 5-block sessions (6 per semana). The member app filters blocks shown based on selected duration.

**When to use:** Always — duration is never a backend concern.

**Example:**

```typescript
// Source: CONTEXT.md duration rules
function getBlocksForDuration(
  blocks: Block[],
  duration: 20 | 40 | 60,
): Block[] {
  switch (duration) {
    case 20:
      // Initium + Nucleus only
      return blocks.filter((b) => b.role === "INITIUM" || b.role === "NUCLEUS");
    case 40:
      // + single Deuteros (DEUTEROS_1 only, no choice)
      return blocks.filter(
        (b) =>
          b.role === "INITIUM" ||
          b.role === "NUCLEUS" ||
          b.role === "DEUTEROS_1",
      );
    case 60:
      // All blocks (INITIUM + NUCLEUS + DEUTEROS_1 + ATHLOS/EPIKOS)
      // Note: DEUTEROS_2 may or may not be included depending on generation
      return blocks;
  }
}
```

### Pattern 3: Duration-Specific Progression Tracking

**What:** Each duration has its own independent semana counter per journey per member.

**When to use:** When tracking and advancing journey progress.

**Example:**

```typescript
// member_journeys table tracks per-duration semana
interface MemberJourneyProgress {
  memberId: number;
  journeyType: JourneyType;
  semana20: number; // Current semana for 20-min sessions
  semana40: number; // Current semana for 40-min sessions
  semana60: number; // Current semana for 60-min sessions
  startedAt: Date;
  archivedAt: Date | null;
}
```

### Pattern 4: Session Scoping with journeyType

**What:** Sessions table gets a nullable `journey_type` column to distinguish journey sessions from general Entrenamiento sessions.

**When to use:** All session queries need to scope by journey type (or null for general).

**Example:**

```typescript
// Sessions table extension
journeyType: varchar('journey_type', { length: 30 }), // null = general Entrenamiento

// DayId format for journey sessions
// General: W{week}-{day}-{memberLevel}
// Journey: J-{journeyType}-W{week}-{day}-{memberLevel}
// e.g.: J-planche-W3-lunes-sigma
```

### Anti-Patterns to Avoid

- **Duplicating the pipeline for journeys:** Don't fork the 7-stage pipeline. Replace only Stage 1 (route resolution) and inject the journey context. Stages 2-7 work the same.
- **Generating sessions per duration:** Duration filtering is front-end only. One session covers all durations.
- **Adding journey columns to exercises table:** User explicitly decided against this. Route-based filtering is sufficient.
- **Storing duration choice in DB per session completion:** Duration is ephemeral per-play. But we DO track which duration was used in completed_sessions for progression.
- **Shared journey sessions across members:** Journey sessions are generated per (journeyType, week, day, memberLevel), same as general sessions. They are NOT per-member generated.

## Don't Hand-Roll

| Problem                        | Don't Build                         | Use Instead                                                              | Why                                                                             |
| ------------------------------ | ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Route-based exercise filtering | Custom exercise query system        | Existing `selectExercisesWithFallback` with route parameter              | Already handles fallback, dedup, difficulty, level — just needs the right route |
| Session block structure        | New block assembly logic            | Existing `generateDailySession` with journey route injection             | Block structure (Initium through Athlos/Epikos) is identical                    |
| Session completion tracking    | New completion table                | Extend existing `completed_sessions` with journeyType + duration columns | Same completion flow, just scoped differently                                   |
| Format selection               | Journey-specific format logic       | Existing Stage 5 format selection                                        | Format compatibility doesn't depend on journey type                             |
| Prescription generation        | Journey-specific prescription logic | Existing Stage 7 prescription                                            | Prescriptions are route-agnostic                                                |

**Key insight:** The SPOM pipeline is route-driven. Journey sessions only change WHICH route gets selected (Stage 1). Everything else — SPOM lookup, budget, contraction, format, exercises, prescription — works identically once the route is known.

## Common Pitfalls

### Pitfall 1: Insufficient Exercise Pool for Advanced Journeys

**What goes wrong:** Planche journey only has routes PL and PLPU. If the exercise database has few exercises for these routes at certain levels/difficulties, the fallback ladder may exhaust all tiers.
**Why it happens:** Route pool is extremely narrow (2 routes) vs general sessions (23+ routes via rotator).
**How to avoid:** Before implementing, query exercise counts per route per level. If any journey route has fewer than 10 exercises per level, flag to user. Consider whether advanced journeys should expand to include related routes (e.g., PLPU maps to general push patterns at fallback tier 3).
**Warning signs:** Exercise selection failures in trace logs for planche/front_lever journey sessions.

### Pitfall 2: SPOM Rule Gaps for Journey Routes

**What goes wrong:** The SPOM rules table is keyed by (week, routeId). If routes PL or FL don't have SPOM rules for every week in the 21-week cycle, Stage 2 will throw "No SPOM rule found."
**Why it happens:** The weekly rotator determines which routes appear in general sessions. Journey sessions bypass the rotator, so any route might be needed any week.
**How to avoid:** Either (a) verify SPOM rules exist for all journey routes for all weeks, or (b) implement a fallback in the journey pipeline that uses a default intensity/pattern when SPOM rule is missing.
**Warning signs:** 500 errors during journey session generation for specific weeks.

### Pitfall 3: DayId Collision Between General and Journey Sessions

**What goes wrong:** Current dayId format is `W{week}-{day}-{memberLevel}`. Journey sessions for the same week/day/level would collide.
**Why it happens:** DayId is a unique index on the sessions table.
**How to avoid:** Use a distinct dayId format for journey sessions: `J-{journeyType}-W{week}-{day}-{memberLevel}`. This preserves uniqueness and makes queries easy.
**Warning signs:** Unique constraint violations during journey session generation.

### Pitfall 4: Cross-Route Exercise Selection in Journey Mode

**What goes wrong:** Stage 6 has cross-route selection (2+1 split using `pattern_2`). For journey sessions, pattern_2 may reference routes outside the journey's zone, violating the 100% bias rule.
**Why it happens:** Cross-route is designed for variety in general sessions, not zone-constrained journeys.
**How to avoid:** Disable cross-route selection for journey sessions. When journeyType is set, skip the `queryCrossRouteExercises` call and select all 3 exercises from the journey's route pool.
**Warning signs:** Journey sessions containing exercises from unrelated zones.

### Pitfall 5: INITIUM Zone-Specific Warmup

**What goes wrong:** The current Initium pipeline selects warmup exercises based on `nucleusRoute` (contextual to the day's main work). For journeys, ALL blocks should use the journey's zone routes, including warmup.
**Why it happens:** Initium pipeline uses `FLOW`/`Movilidad` category filtering plus mobility route mapping. Journey warm-ups need zone-specific mobility exercises.
**How to avoid:** For journey sessions, pass the journey's route whitelist as the Initium context instead of (or in addition to) the nucleus route. The existing contextual selection mechanism (`ROUTE_TO_MOBILITY_ROUTES`) already maps routes to mobility areas.
**Warning signs:** Journey warmups containing exercises from unrelated zones (e.g., leg mobility in an upper body journey).

### Pitfall 6: Duration Progression Desync

**What goes wrong:** If a member switches between 20/40/60 min, their progression per duration can get confusing. Member completes semana 3 at 20 min but is still at semana 1 for 60 min.
**Why it happens:** Independent tracking per duration is the user's design choice.
**How to avoid:** Clear UI showing per-duration progress. Journey overview displays all 3 semana counters. Session completion increments only the played duration's counter.
**Warning signs:** User confusion about "which semana am I on."

## Code Examples

### Database Schema Extension

```typescript
// Source: Pattern from existing el-templo-api/src/db/schema/sessions.ts

// member_journeys table — tracks active and archived journeys
export const memberJourneys = mysqlTable(
  "member_journeys",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    journeyType: varchar("journey_type", { length: 30 }).notNull(),
    // Per-duration semana tracking
    semana20: int("semana_20").notNull().default(1),
    semana40: int("semana_40").notNull().default(1),
    semana60: int("semana_60").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => [
    index("member_journeys_user_active_idx").on(table.userId, table.isActive),
  ],
);

// Sessions table extension: add journey_type column
// Existing sessions: journey_type = null (general Entrenamiento)
// Journey sessions: journey_type = 'tren_superior' | 'empuje' | 'planche' | etc.
```

### Journey Session Generation (API)

```typescript
// Source: Pattern from existing el-templo-api/src/modules/admin/service.ts generateWeek

async generateJourneySessions(
  week: number,
  journeyType: JourneyType,
  options?: { days?: string[]; regenerate?: boolean }
): Promise<{ generated: number; skipped: number }> {
  const days = options?.days || [...TRAINING_DAYS];
  const levelGroups: LevelGroup[] = ['alfa_delta', 'sigma', 'omega'];
  let generated = 0, skipped = 0;

  for (const day of days) {
    let sharedFormats: Map<string, { formatId: number; name: string }> | undefined;

    for (const levelGroup of levelGroups) {
      const memberLevels = levelGroupToMemberLevels(levelGroup);

      for (const memberLevel of memberLevels) {
        const dayId = `J-${journeyType}-W${week}-${day}-${memberLevel}`;
        // ... check existing, generate with journey pipeline, save
      }
    }
  }
  return { generated, skipped };
}
```

### Member App Journey Store

```typescript
// Source: Pattern from existing el-templo-app/src/modules/training/stores/weekStore.ts

export const useJourneyStore = defineStore("journey", () => {
  const activeJourney = ref<JourneyType | null>(null);
  const selectedDuration = ref<20 | 40 | 60 | null>(null);
  const progress = ref<JourneyProgress | null>(null);

  // Session data for current journey semana
  const currentSession = ref<Session | null>(null);

  function selectJourney(type: JourneyType) {
    /* ... */
  }
  function selectDuration(duration: 20 | 40 | 60) {
    /* ... */
  }
  function setSession(session: Session) {
    /* ... */
  }

  // Filter blocks based on selected duration
  const visibleBlocks = computed(() => {
    if (!currentSession.value || !selectedDuration.value) return [];
    return getBlocksForDuration(
      currentSession.value.blocks,
      selectedDuration.value,
    );
  });

  return {
    activeJourney,
    selectedDuration,
    progress,
    currentSession,
    visibleBlocks,
    selectJourney,
    selectDuration,
    setSession,
  };
});
```

### Session Completion with Journey Context

```typescript
// Extend completed_sessions with journey tracking
// Add nullable columns: journey_type, duration
POST /sessions/complete {
  dayId: 'J-empuje-W3-lunes-alfa',
  journeyType: 'empuje',       // NEW
  duration: 40,                 // NEW — which duration was played
  date: '2026-02-20',
  startedAt: '...',
  blocksCompleted: ['INITIUM', 'NUCLEUS', 'DEUTEROS_1'],
  // ... existing fields
}
```

## State of the Art

| Old Approach                     | Current Approach                            | When Changed          | Impact                                                       |
| -------------------------------- | ------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| Sessions via rotator only        | Sessions via rotator OR journey route map   | Phase 20 (this phase) | Existing Entrenamiento unchanged; journeys add parallel path |
| Single session type per member   | Entrenamiento + Journey running in parallel | Phase 20              | Members can access both simultaneously                       |
| Fixed 5-block sessions           | Duration-filtered block visibility          | Phase 20              | Front-end only, no backend change to generation              |
| Session completion without scope | Completions scoped by journey + duration    | Phase 20              | Progression tracking becomes multi-dimensional               |

## Open Questions

1. **Exercise Pool Size for Advanced Journeys**
   - What we know: PL and FL routes exist in the route codes (seed-spom.ts). PLPU and FLR are separate routes.
   - What's unclear: How many exercises exist per route per level? If Planche (PL + PLPU) has < 10 exercises at alfa level, sessions will be repetitive.
   - Recommendation: Run a diagnostic query on the exercises table before implementation. If pools are too small, discuss with user whether advanced journeys should widen scope (e.g., include related push routes for Planche at lower difficulties).

2. **SPOM Rules Coverage for All Routes**
   - What we know: SPOM rules are keyed by (week, routeId). The weekly rotator only uses certain routes per week.
   - What's unclear: Whether every route has SPOM rules for all 21 weeks. If PL only appears in weeks 5, 12, 18 via the rotator, it may not have SPOM rules for other weeks.
   - Recommendation: Query SPOM rules table to verify coverage. If gaps exist, either fill them (seed data update) or implement graceful fallback (use nearest available week's SPOM rule for that route).

3. **Journey Semana Cycle Length**
   - What we know: General Entrenamiento uses the gym-wide SPOM week (1-21 cycle). Journey sessions also reference SPOM week for route patterns and intensity.
   - What's unclear: Does the journey semana counter map 1:1 to SPOM weeks? Or is it an independent counter?
   - Recommendation: Use the gym-wide SPOM week for journey session generation (same pipeline). The per-duration semana counter tracks how many weeks of that duration the member has completed, but the actual session content comes from the current SPOM week. This means "journey semana 5 at 20 min" uses whatever SPOM week the gym is on at that time.

4. **Route Distribution Across Journey Sessions**
   - What we know: General sessions use the weekly rotator to assign specific routes to specific blocks on specific days. Journey sessions bypass the rotator.
   - What's unclear: How should routes from the journey pool be distributed across the 6 daily sessions and 5 blocks each?
   - Recommendation: Deterministic round-robin or hash-based selection from the journey's route whitelist. Ensure variety across days (no same route for Nucleus on Monday and Tuesday). The advanced journeys with only 2 routes will naturally repeat — this is expected for specialization.

5. **Athlos/Epikos Block in Journey Mode**
   - What we know: For 60-min sessions, the coach "sets which final block" (Athlos or Epikos) per the CONTEXT.md. In general sessions, it alternates by week parity.
   - What's unclear: Should journey generation keep the week-parity alternation, or should the admin explicitly choose per journey semana?
   - Recommendation: Keep week-parity alternation for journey sessions (same as general). The admin can override via the existing block role update endpoint if needed.

## Sources

### Primary (HIGH confidence)

- `el-templo-api/src/db/seed-spom.ts` — All 23 route codes verified
- `el-templo-api/src/modules/sessions/pipeline/utils/mobility-routes.ts` — Route-to-zone groupings (upper push, upper pull, lower knee, lower hip, core)
- `el-templo-api/src/modules/sessions/pipeline/index.ts` — Pipeline orchestration (7 stages)
- `el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts` — Exercise selection with cross-route and fallback
- `el-templo-api/src/modules/sessions/pipeline/stage-1-rotator.ts` — Route resolution (to be replaced for journeys)
- `el-templo-api/src/modules/sessions/service.ts` — Session generation and save logic
- `el-templo-api/src/modules/admin/service.ts` — Admin generateWeek implementation
- `el-templo-api/src/db/schema/sessions.ts` — Sessions table structure
- `el-templo-api/src/db/schema/exercises.ts` — Exercise columns (route, pattern, category, effort, level, dificultadLineal)
- `el-templo-api/src/db/schema/users.ts` — User table (level, role)
- `el-templo-api/src/db/schema/completed-sessions.ts` — Completion tracking structure
- `el-templo-app/src/modules/training/` — Member app training module structure
- `el-templo-app/src/modules/progression/` — Mi Camino module structure
- `el-templo-app/src/layouts/MainLayout.vue` — Navigation drawer layout
- `el-templo-app/src/boot/modules.ts` — Module registration pattern
- `el-templo-admin/src/router/routes.ts` — Admin app routing
- `.docs/new-brand-visual/visual-brand.txt` — Brand guidelines (Mediterranean Conscious, cream/sage/terracotta palette, Cinzel serif, Montserrat body)

### Secondary (MEDIUM confidence)

- Route-to-journey-zone mapping derived from mobility-routes.ts groupings and domain context — mapping is logical but not validated against actual exercise data distribution

### Tertiary (LOW confidence)

- Exercise pool size assumptions for Planche/Front Lever routes — needs data validation query before planning

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — uses existing libraries and patterns, no new dependencies
- Architecture: HIGH — extending proven SPOM pipeline with minimal modification
- Pitfalls: HIGH — identified from direct code analysis of pipeline failure modes
- Exercise pool viability: MEDIUM — route mapping is clear but actual data distribution unverified
- SPOM rules coverage: MEDIUM — logical concern but needs data validation

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable — internal architecture, no external dependencies)

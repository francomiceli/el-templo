# Phase 97: ROM Mode — Saturday Mobility Sessions - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Modify the session generation pipeline, admin editing, PDF output, and member app so that configurable days (starting with Saturday) produce ROM-mode mobility sessions instead of regular SPOM training. ROM sessions have 3 body-zone blocks (Lower/Core/Upper), 2 tiers (Básico=alfa / Avanzado=delta), and use only mobility exercises. Coach refines generated sessions via the existing edit interface.

</domain>

<decisions>
## Implementation Decisions

### Session Structure

- **D-01:** ROM sessions have NO INITIUM block — go straight to the 3 ROM blocks
- **D-02:** Block roles: `ROM_LOWER`, `ROM_CORE`, `ROM_UPPER` — distinct from NUCLEUS/DEUTEROS to avoid inheriting their special behaviors
- **D-03:** No ATHLOS/EPIKOS blocks for ROM sessions
- **D-04:** Only 2 levels generated: alfa (Básico) and delta (Avanzado) under the `alfa_delta` level group
- **D-05:** `session_mode` column on `sessions` table — `'regular'` (default) or `'rom'`

### Format & Prescription

- **D-06:** Format: "For Quality" with rounds=3 (`for_quality` format type, rounds param = 3)
- **D-07:** 3 CON exercises per block, randomly assigned reps of 20, 30, and 40 (one of each, shuffled)
- **D-08:** Rest between rounds: 30 seconds — stored as format rest parameter, NOT a separate ISO exercise
- **D-09:** Different exercises per tier — alfa gets easier exercises (lower `dificultad_lineal`), delta gets harder ones
- **D-10:** No DESCANSO ACTIVO (mobility) slot in ROM blocks — all exercises are already mobility

### Mobility Exercise Selection (Generator)

- **D-11:** Use existing `mobility_related` field to map exercises to body zones:
  - `LS ( LUNGES )` → ROM_LOWER (37 exercises)
  - `FL` + `TTB / HF` + `MN` → ROM_CORE (78 exercises)
  - `PL` → ROM_UPPER (11 exercises)
- **D-12:** No new column on exercises table — reuse existing `mobility_related` mapping
- **D-13:** Generator picks random mobility exercises; coach replaces them via edit interface

### Day Mode Configuration

- **D-14:** New `day_modes` table: `(id, day_of_week UNIQUE, session_mode)` — global, no branch_id (all branches follow the same schedule)
- **D-15:** Seeded with 6 rows (Mon=1 through Sat=6), all `'regular'` except Saturday=`'rom'`
- **D-16:** Admin UI: day mode toggles in the SessionsPage (session generation area), with `PUT /admin/sessions/day-modes` endpoint
- **D-17:** Same batch generation flow — generator checks `day_modes` config per day, routes to ROM generator if mode=rom
- **D-18:** If a ROM day falls on a holiday, skip generation entirely (same as regular days)

### Admin Display

- **D-19:** ROM days appear inline in SessionsPage with a 'ROM' badge — not a separate section
- **D-20:** Only 2 level rows shown (alfa/delta) instead of 4 for ROM days
- **D-21:** Block summary shows TREN INFERIOR / ZONA MEDIA / TREN SUPERIOR instead of route names

### Admin Editing

- **D-22:** Exercise swap in ROM blocks filters by body zone using `mobility_related` mapping (LS for LOWER, FL+TTB/HF+MN for CORE, PL for UPPER). Full search tab still available for unrestricted access.
- **D-23:** No DESCANSO ACTIVO slot in ROM block edit view
- **D-24:** Same approval workflow as regular sessions (pending_review → approved). No auto-approve.

### PDF Generation

- **D-25:** Block headers in Spanish: TREN INFERIOR / ZONA MEDIA / TREN SUPERIOR
- **D-26:** Tier labels: BÁSICO / AVANZADO (replaces Greek symbols α/Δ/Σ/Ω)
- **D-27:** 2-row stacked layout: Básico full width on top, Avanzado full width below. More room than the 2x2 grid.

### Member App

- **D-28:** Same training page, simplified for ROM: 3 blocks displayed sequentially, no Deuteros selector
- **D-29:** Level-based tier assignment: alfa members see Básico, delta and all others see Avanzado
- **D-30:** Full DayPlayer support: 3 blocks played sequentially (ROM_LOWER → ROM_CORE → ROM_UPPER), For Quality format handles rounds naturally, completion tracking logs ROM block roles
- **D-31:** Weekly carousel: Saturday card gets a small 'ROM' badge, block summary shows body zone names
- **D-32:** No INITIUM in player flow — first block is ROM_LOWER

### Migration & Backwards Compatibility

- **D-33:** Existing Saturday sessions (regular SPOM) left as-is with `session_mode='regular'` (column default). No data migration needed.
- **D-34:** `session_mode` column defaults to `'regular'` — all existing sessions are automatically regular

### Claude's Discretion

- Block role naming convention (ROM_LOWER vs ROM-LOWER vs rom_lower) — follow existing codebase conventions
- Exact exercise count filtering when PL pool is thin (11 exercises) — handle gracefully if not enough unique exercises for both tiers
- DayPlayer block transition animations/UX for ROM — match existing block transition patterns

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### ROM Mode Spec

- `.docs/rom-mode.md` — Coach's original ROM mode proposal with paper layout, audio explanation, and simplified approach (last 2 paragraphs)

### Session System (API)

- `el-templo-api/src/db/schema/sessions.ts` — Sessions table schema (add session_mode column here)
- `el-templo-api/src/db/schema/session-blocks.ts` — Block roles (ROM_LOWER/ROM_CORE/ROM_UPPER are new roles)
- `el-templo-api/src/db/schema/session-prescriptions.ts` — Exercise prescriptions (exerciseType, reps, rest)
- `el-templo-api/src/db/schema/exercises.ts` — Exercises table with `mobility_related` field used for body zone mapping
- `el-templo-api/src/modules/sessions/service.ts` — SessionGeneratorService (add ROM branch here)
- `el-templo-api/src/modules/sessions/pipeline/utils/mobility-selection.ts` — Existing mobility selection logic (reuse/adapt for ROM)
- `el-templo-api/src/modules/sessions/pipeline/utils/mobility-routes.ts` — ROUTE_TO_MOBILITY_ROUTES mapping (reference, not directly used for ROM)

### Session Editing (API)

- `el-templo-api/src/modules/admin/exercise-swap-service.ts` — Exercise pool queries (add body-zone filtering for ROM)
- `el-templo-api/src/modules/admin/edit-service.ts` — Edit facade (ROM sessions follow same flow)
- `el-templo-api/src/modules/admin/routes.ts` — Admin endpoints (add day-modes endpoint)

### Admin UI

- `el-templo-admin/src/pages/SessionsPage.vue` — Weekly session management (ROM badge, day mode toggles, 2 levels)
- `el-templo-admin/src/pages/SessionEditPage.vue` — Session editing (ROM block edit, body-zone pool)
- `el-templo-admin/src/components/sessions/ExerciseSwapDialog.vue` — Exercise swap dialog (body-zone filtering)
- `el-templo-admin/src/components/sessions/EditableBlockCard.vue` — Block card (hide DESCANSO ACTIVO for ROM)

### PDF Generation

- `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` — PDF builder (add ROM 2-tier layout)
- `el-templo-admin/src/utils/pdf/pdf-types.ts` — PDF types (may need ROM variant)
- `el-templo-admin/src/utils/pdf/session-data-transformer.ts` — Data transformer (handle ROM blocks)

### Member App

- `el-templo-app/src/modules/training/pages/WeeklyView.vue` — Weekly carousel (ROM badge)
- `el-templo-app/src/modules/training/pages/DayPlayer.vue` — Workout player (ROM block flow)
- `el-templo-app/src/modules/training/composables/useWeekData.ts` — Week data fetching
- `el-templo-app/src/modules/training/composables/useSessionPlayer.ts` — Player state (skip Deuteros selector for ROM)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **For Quality format** already exists in the format system — just use `for_quality` with `rounds: 3`
- **Mobility exercise pool** (126 exercises) with `mobility_related` field already maps to body zones
- **ExerciseSwapDialog** has a "mobility mode" — adapt it for ROM body-zone filtering
- **Session approval workflow** (pending_review → approved) works unchanged for ROM
- **DayPlayer block progression** handles sequential blocks — ROM just has 3 instead of 4-5

### Established Patterns

- **Session generation pipeline**: 7-stage pipeline in `sessions/pipeline/`. ROM bypasses stages 1-4 (rotator, SPOM, budget, contraction) and goes straight to exercise selection + prescription
- **Goal plan pipeline** (`goal-plan-pipeline.ts`) is a precedent for an alternative session generation path
- **Block roles** are varchar(20) — no enum constraint, new roles just work
- **`session_mode`** on sessions table follows the same pattern as `goalPlanType` — nullable/defaulted discriminator

### Integration Points

- Generator entry point: `SessionGeneratorService.generateSession()` — add ROM branch based on `day_modes` lookup
- Admin routes: `POST /admin/sessions/generate` — batch flow checks day_modes per day
- PDF builder: `buildGridPage()` and level grid rendering — needs ROM variant with 2-row layout
- DayPlayer: `useSessionPlayer` composable — skip Deuteros selector when no DEUTEROS roles present

</code_context>

<specifics>
## Specific Ideas

- Coach's paper layout (`.docs/rom-mode.md`) shows the exact structure: 3 exercises per block, reps descending (40/30/20), rest 30s, 3 rounds, Básico vs Avanzado variants
- Coach explicitly wants body-zone exercise filtering: "necesitaría que me deje seleccionar en el primer bloque solo ejercicios de lower, en el segundo todo core y el tercero todo de upper"
- Coach's simplified approach: "solo planifica el alfa (basico) y delta (avanzado)" — use existing level system, no new tier concept
- The `mobility_related` field values (`LS (LUNGES)`, `FL`, `TTB / HF`, `MN`, `PL`) are the body zone discriminator — no new column needed

</specifics>

<deferred>
## Deferred Ideas

- **Body zone column on exercises** — If mobility exercise pool grows and `mobility_related` mapping becomes insufficient, add a proper `body_zone` enum column. Not needed now with 126 exercises.
- **ROM as a goal plan program** — Future: ROM could become a `goalPlanType = 'rom'` with member enrollment, progression, and scheduling. Current implementation uses `session_mode` which can coexist with or migrate to goal plan.
- **Per-branch day modes** — If branches ever need different schedules (e.g., Barcelona does ROM on Fridays), add `branch_id` to `day_modes` table.

</deferred>

---

_Phase: 97-rom-mode-saturday-mobility_
_Context gathered: 2026-04-08_

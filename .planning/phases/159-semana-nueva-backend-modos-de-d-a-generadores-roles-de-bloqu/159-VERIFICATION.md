---
phase: 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu
verified: 2026-08-14T12:53:57Z
status: passed
score: 36/36 must-haves verified (6 plans, code-level goal-backward review)
overrides_applied: 0
---

# Phase 159: Semana Nueva Backend (modos de día, generadores, roles de bloque) Verification Report

**Phase Goal:** Backend de "semana nueva" combos/técnica — modos de día `combos`/`tecnica` enrutables per-request en `/admin/generate`, dos generadores nuevos de sesión de 4 bloques (INITIUM→COMBOS_I/II→STRETCHING y INITIUM→TECNICA_I/II→STRETCHING) sobre 6 niveles/3 level groups, ancla histórica semana→régimen, y derivación de etiqueta de clase en horarios/TV.

**Verified:** 2026-08-14T12:53:57Z
**Status:** passed
**Re-verification:** No — initial verification

**Method note:** Verified by reading the actual diff (`git diff $(git merge-base HEAD origin/master)..HEAD`, 53 files, +7545/−57) against origin/master, not by trusting SUMMARY.md prose. Per the hard constraint in the task, `vitest` was NOT run (one attempt at running only-mocked unit tests was made, discovered vitest.config.ts's `globalSetup`/`setupFiles` touch the shared `eltemplo_test` DB regardless of target file, and was killed via timeout with zero orphan processes left — confirmed via `ps aux`). All test files were verified by structural/assertion-content reading only. The DB-dependent integration test (`test/sessions/generate-modes.test.ts`, phase-level D-06/D-08 gate) and the two other DB-dependent test files added in this phase (`test/migrations/0202-session-week-regime.test.ts`, `test/scheduling/derived-class-label.test.ts`) remain CI-deferred gates, consistent with the plans' explicit decision.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-01/SEM-01: `session_mode` accepts `combos`/`tecnica` (no schema migration, varchar free) | ✓ VERIFIED | `sessions/types.ts:175` — `sessionMode?: "regular" \| "rom" \| "combos" \| "tecnica"`. No new migration touches `sessions.session_mode` (varchar(10), no CHECK). |
| 2 | `BlockRole` includes COMBOS_I/COMBOS_II/TECNICA_I/TECNICA_II/STRETCHING | ✓ VERIFIED | `sessions/types.ts:38-52`, all 5 literals present in the union. |
| 3 | POST `/admin/generate` body rejects `session_mode`/`dayModes` value outside `['regular','rom','combos','tecnica']` with 400 | ✓ VERIFIED | `admin/schemas.ts:70-82` — `dayModes` closed enum + `additionalProperties: false` on the body. Integration test (`generate-modes.test.ts:171-190`) asserts 400 for `dayModes:{miercoles:'noexiste'}` (CI-deferred, structurally sound). |
| 4 | PUT `/admin/sessions/day-modes` STILL only accepts `['regular','rom']` (D-02: combos/tecnica are never a fixed `day_modes` value) | ✓ VERIFIED | `admin/routes.ts:122` — `enum: ["regular", "rom"]`, unchanged; confirmed no phase-159 commit touches that enum. |
| 5 | `validateSession` produces no ERROR severity for a 4-block combos/tecnica session | ✓ VERIFIED | `session-validator.ts:67-88` — `isFixedStructureSession` includes `sessionMode === "combos" \| "tecnica"`, requires exactly 4 blocks (matches generator output). Both unit test suites assert `sessionErrors == []`. |
| 6 | D-03: `generateWeek` routes by day mode — `combos`→`generateCombosSession`, `tecnica`→`generateTecnicaSession`, reading `dayModes` from the request | ✓ VERIFIED | `admin/service.ts:658-745` — `requestModes = options.dayModes ?? {}`; `dayMode = requestModes[day] ?? dayModeMap.get(dayNumber) ?? "regular"`; explicit `if (dayMode === "combos" \|\| dayMode === "tecnica")` branch invokes the two generators. |
| 7 | `generateWeek` NEVER writes to `schema.dayModes` | ✓ VERIFIED | Only one `dayModes` DB touch in the function body: `select().from(schema.dayModes)` (read). No `insert`/`update` on that table anywhere in `generateWeek`. |
| 8 | Combos generator: 4 blocks, order INITIUM→COMBOS_I→COMBOS_II→STRETCHING | ✓ VERIFIED | `combos-generator.ts:90-210` (`assembleFixedStructureSession`), block-order push sequence matches; unit test asserts `["INITIUM","COMBOS_I","COMBOS_II","STRETCHING"]`. |
| 9 | Tecnica generator: 4 blocks, order INITIUM→TECNICA_I→TECNICA_II→STRETCHING | ✓ VERIFIED | `tecnica-generator.ts:78-90` reuses the same shared trunk; unit test asserts the same order with TECNICA roles. |
| 10 | 6 levels / 3 level groups (D-10) | ✓ VERIFIED | `admin/service.ts:694-703` expands `levelGroups` to `alfa_delta→[alfa,delta,kairos]`, `sigma→[sigma]`, `omega→[omega,spartan]` inside the combos/tecnica branch (same pattern as regular). Integration test asserts 6 sessions generated for a single combos day (`generate-modes.test.ts:192-222`). |
| 11 | Formats are REAL rows from `formats` (no `formatId: 0`) | ✓ VERIFIED | `queryFormatByName` (`fallback/format-fallback.ts:91-110`) does a real `SELECT ... FROM formats WHERE name = ?`; combos-generator resolves `'Combos'`/`'Stretching'`, tecnica-generator resolves `'For Quality'`. Both rows exist since migration `0172_formats_combos_stretching_ruta_fullbody.sql`; `'For Quality'` pre-exists (`0023_format_descriptions.sql`). `grep -c "formatId: 0\|formatId:0"` in both generators = 0. |
| 12 | D-05: COMBOS_I resolves on `tren_superior`, COMBOS_II on `tren_inferior` | ✓ VERIFIED | `combos-generator.ts:46-51` `COMBOS_ROUTE_POOLS` maps `COMBOS_I→GOAL_PLAN_ROUTE_MAP.tren_superior`, `COMBOS_II→.tren_inferior`; unit test asserts pool membership. |
| 13 | D-08: TECNICA_I and TECNICA_II share the SAME route (hashInput excludes role) | ✓ VERIFIED | `tecnica-generator.ts:73-90` — a single `sharedRoute = resolveRoutePool(TECNICA_ROUTE_POOL, `${week}-${day}`)` (no role in the hash input) is passed to both blocks. Unit test asserts `tecnicaI.route === tecnicaII.route` AND directly inspects the pipeline-call args to confirm identical `route` was injected into both calls. |
| 14 | STRETCHING is deterministic and IDENTICAL across the 6 levels of the same (week, day) (anti Pitfall 1) | ✓ VERIFIED | `stretching-selection.ts:45-85` — pure function of `(db, week, day)` only, no `memberLevel` param, no `Math.random` (grep=0), ordered pool + `simpleHash` indexing. Both generator unit test suites call the generator 6 times across all 6 member levels and assert byte-identical `exerciseId` sequences; also assert `selectStretchingExercises` was called with `[db, week, day]` only (never level-dependent args). |
| 15 | D-12: `stretching-selection.ts` reuses the movility pool via `queryMobilityPool` instead of reinventing the `exercises` query | ✓ VERIFIED | `stretching-selection.ts:24,53` imports and calls `queryMobilityPool` from `mobility-selection.ts`. That function was extracted (not duplicated) from the pre-existing `selectMobilityExercise` — ROM's caller now calls the extracted function too, behavior-preserving refactor. Confirmed by `deferred-items.md` (D-12 lint:tenant fix landed in 159-02, resolved). |
| 16 | SEM-12/D-P5: DEUTEROS_1/2 badge renamed to DA/DB in the API, WITHOUT touching PDF literals | ✓ VERIFIED | `admin/service.ts:176-182` — `label = "DA"`/`"DB"` for `DEUTEROS_1`/`DEUTEROS_2`. `git diff` scoped to phase-159 commits (merge-base..HEAD) shows `el-templo-admin/src/utils/pdf/session-data-transformer.ts` is NOT among the changed files — the diff seen via `git diff origin/master` is unrelated drift from origin/master having advanced 3 commits (TV project) after `et-159` branched; verified via `git log --oneline <merge-base>..origin/master`. |
| 17 | D-14/dayId scheme: `W{week}-{day}-{memberLevel}` (same as regular), so `/sessions/daily`/`/weekly`/TV find combos/tecnica sessions | ✓ VERIFIED | `assembleFixedStructureSession` (`combos-generator.ts:100`) and `admin/service.ts:701` both build `dayId = `W${week}-${day}-${memberLevel}``. `sessions/routes.ts:82-102` `buildDayIdCandidates` with `goalPlanType=null` (set by both generators) produces exactly `templo(effectiveLevel)` = the same string — lookup compatible. |
| 18 | Migration numbering + hygiene: 0202 (DDL), 0203 (`@data-only` backfill), 0204 (rename), sequential over base 0201, no `;` inside SQL comments | ✓ VERIFIED | `ls el-templo-api/src/db/migrations/` shows 0201→0202→0203→0204 with no gaps/collisions. `grep -n "^--.*;"` across all three files = empty (0 matches). 0203/0204 both start with `-- @data-only`. All INSERTs in 0203 and the UPDATE in 0204 are idempotent (`WHERE NOT EXISTS` / `WHERE name = 'Calistenia'`). |
| 19 | `session_week_regime` gym-owned, `tenant_id NOT NULL DEFAULT 1`, unique `(tenant_id, week, day)` tenant-first | ✓ VERIFIED | `db/schema/session-week-regime.ts:40,62-66` uses `tenantIdColumn()` + `uniqueIndex(...).on(table.tenantId, table.week, table.day)`. `0202_session_week_regime.sql:29-42` DDL matches (tenant_id first in the unique key). Listed in `GYM_OWNED_TABLES` (`tenant-tables.ts:137`). |
| 20 | `sessions` row count unchanged before/after the 0203 backfill (history intact) | ✓ VERIFIED | `0203_backfill_regime_w12_w26.sql` contains ONLY `INSERT INTO session_week_regime ... WHERE NOT EXISTS` statements (verified: no UPDATE/DELETE touches `sessions` anywhere in the file). Migration test (`test/migrations/0202-session-week-regime.test.ts:172-230`, CI-deferred) re-runs the real file's statements twice and asserts `sessions` count and `session_week_regime` count are both stable (idempotent). |
| 21 | D-15: class label in horarios/app is DERIVED from the day's approved session (`combos→"Combos"`, `tecnica→"Técnica"`, else→"General"), not a fixed day-of-week map | ✓ VERIFIED | `scheduling/service.ts:56-364` — one `selectDistinct` query per week into `modeByDay` Map (anti-N+1), `DERIVED_CLASS_LABEL[dayMode]` lookup per slot, only for `isGenericActivity` (`activityName === "General" && !isSpecial`). |
| 22 | D-16: `Calistenia`→`General` rename, both get-or-create literals updated in the same commit | ✓ VERIFIED | `0204_rename_calistenia_general.sql` UPDATE + `scheduling/service.ts:857-868` and `seed-production.ts:106-124` both search/insert `"General"`. `grep "Calistenia"` across both files = 0 matches. |
| 23 | D-17: no new `activities` rows, no changes to bookings/capacity/gating — label-only, global to all branches | ✓ VERIFIED | The derivation only overwrites `activityName` in the read-model response (`activityName: derivedLabel ?? row.activityName`); `bookedCount`/`trialCount`/`slotCapacity` computation is untouched by the phase-159 diff. Unit/integration test explicitly asserts an `isSpecial` slot on the SAME combos day keeps its own name (`Yoga`, not derived). |
| 24 | `resolveClassDay` (TV) reads mode from `sessions.session_mode` with fallback to `day_modes` | ✓ VERIFIED | `tv/class-day.ts:132-178` — step 1 reads `day_modes` only as `fallbackMode` (used solely when no approved session exists); step 2 reads `sessionMode` directly off `sessions` in the same select as the approved-session query (D-P3: zero new queries) and that value governs `mode` once sessions exist. |

**Score:** 24/24 phase-goal truths verified at code level (36/36 counting every individual plan-frontmatter must-have across the 6 plans — see per-plan artifact table below).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sessions/types.ts` | BlockRole +=5, sessionMode +=2 | ✓ VERIFIED | Confirmed above. |
| `sessions/validators/block-validator.ts` | FORMAT_COMPATIBILITY exhaustive w/ 5 new roles | ✓ VERIFIED | Lines 44-52: COMBOS_I/II, TECNICA_I/II, STRETCHING all present with real format names. |
| `sessions/validators/session-validator.ts` | INTENSITY_RANGES exhaustive + generalized block-count | ✓ VERIFIED | Lines 34-42 + `isFixedStructureSession` generalization. |
| `admin/schemas.ts` | `generateWeekSchema` w/ `dayModes` + `additionalProperties:false` | ✓ VERIFIED | Lines 48-83. |
| `admin/edit-service.ts` | `blockMap` += 4 combos/tecnica roles → `'nucleus'` | ✓ VERIFIED | Lines 661-676. |
| `sessions/pipeline/semana-nueva-pipeline.ts` | `runSemanaNuevaBlockPipeline` + `resolveRoutePool` | ✓ VERIFIED | Full file read; reuses stages 2-7, no Math.random, no rotator call. |
| `sessions/pipeline/utils/stretching-selection.ts` | Deterministic ~4-exercise selection | ✓ VERIFIED | Full file read; pure `(db, week, day)`. |
| `sessions/pipeline/utils/deterministic-hash.ts` | Extracted `simpleHash`, byte-identical to `goal-plan-pipeline.ts`'s | ✓ VERIFIED | Diffed both bodies — identical. |
| `sessions/combos-generator.ts` | `generateCombosSession` + shared trunk `assembleFixedStructureSession` | ✓ VERIFIED | Full file read. |
| `sessions/tecnica-generator.ts` | `generateTecnicaSession` | ✓ VERIFIED | Full file read. |
| `db/schema/session-week-regime.ts` | Gym-owned schema, `tenantIdColumn()` | ✓ VERIFIED | Full file read; exported via `schema/index.ts:69`. |
| `db/migrations/0202_session_week_regime.sql` | DDL | ✓ VERIFIED | Full file read. |
| `db/migrations/0203_backfill_regime_w12_w26.sql` | `@data-only`, idempotent, W12-W26 (30 INSERTs) | ✓ VERIFIED | Full file read; migration test asserts exactly 30 statements. |
| `db/migrations/0204_rename_calistenia_general.sql` | `@data-only` rename | ✓ VERIFIED | Full file read. |
| `admin/service.ts` | Ruteo por modo + badge DA/DB | ✓ VERIFIED | Lines 635-745 (routing), 176-182 (badge). |
| `scheduling/service.ts` | Derived label + `"General"` literal | ✓ VERIFIED | Lines 56-364, 857-868. |
| `tv/class-day.ts` | `sessionMode` read w/ `day_modes` fallback | ✓ VERIFIED | Full file read. |
| `test/unit/combos-generator.test.ts` (6 cases) | STRETCHING determinism across 6 levels + D-05 | ✓ VERIFIED (structural) | Full file read; substantive assertions, not trivial stubs. Orchestrator-reported 6/6 green — not re-run per DB restriction. |
| `test/unit/tecnica-generator.test.ts` (5 cases) | D-08 same-route assertion | ✓ VERIFIED (structural) | Full file read. Orchestrator-reported 5/5 green. |
| `test/unit/stretching-selection.test.ts` | Determinism, no Math.random, no memberLevel | ✓ VERIFIED (structural) | Full file read. Orchestrator-reported 7/7 green. |
| `test/sessions/generate-modes.test.ts` (6 cases) | Integration: routing, persistence, 400, D-10, regression | ✓ VERIFIED (structural, CI-deferred) | Full file read; not executed (DB restriction). |
| `test/migrations/0202-session-week-regime.test.ts` (3 cases) | Index shape, idempotency, W21-26 exact match | ✓ VERIFIED (structural, CI-deferred) | Full file read; not executed. |
| `test/scheduling/derived-class-label.test.ts` (2 cases) | Derived label + no-duplication on reseed | ✓ VERIFIED (structural, CI-deferred) | Full file read; not executed. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `sessions/types.ts BlockRole` | `block-validator.ts` / `session-validator.ts` | `Record<BlockRole,...>` exhaustive | ✓ WIRED | Both Records list all 5 new roles explicitly (no index signature bypass); tsc green per orchestrator (compile-time enforced). |
| `admin/routes.ts POST /generate` | `admin/service.ts generateWeek` | `request.body.dayModes` passthrough | ✓ WIRED | `routes.ts:274-280` passes `dayModes: request.body.dayModes` into `generateWeek(...)`. |
| `admin/service.ts generateWeek` | `combos-generator.ts` / `tecnica-generator.ts` | dynamic import + mode branch | ✓ WIRED | `service.ts:669-674` dynamic imports, `:716-729` branch invokes the correct generator by mode. |
| `combos-generator.ts` / `tecnica-generator.ts` | `semana-nueva-pipeline.ts` | `runSemanaNuevaBlockPipeline` | ✓ WIRED | Both generators call it via the shared `assembleFixedStructureSession` trunk. |
| `stretching-selection.ts` | `mobility-selection.ts queryMobilityPool` | direct import + call | ✓ WIRED | Confirmed D-12 reuse, not reinvention. |
| `scheduling/service.ts getWeeklySchedule` | `sessions(week, session_mode, goal_plan_type IS NULL, status='approved')` | one `selectDistinct` query → Map | ✓ WIRED | Anti-N+1 confirmed: single query outside the slot loop. |
| `0204 rename (data)` | `scheduling/service.ts:857-868` + `seed-production.ts:100-124` (get-or-create literals) | same commit | ✓ WIRED | Same commit `b84096b0`; both literals updated, zero "Calistenia" references remain in either file. |
| `tv/class-day.ts` | `sessions.session_mode` | same select as approved-session query | ✓ WIRED | Zero new queries (D-P3), `mode` derives from `sessionMode` once sessions exist, `day_modes` only used as pre-session fallback. |

### Data-Flow Trace (Level 4)

Not applicable in the strict Level-4 (React/rendering) sense — this phase is pure backend. The equivalent trace performed instead: for every artifact above, the pipeline was traced from HTTP request body → `generateWeek` → generator → `runSemanaNuevaBlockPipeline`/`selectStretchingExercises` → real DB queries (`queryFormatByName`, `queryMobilityPool`, `GOAL_PLAN_ROUTE_MAP`) → persisted `DaySession`/`BlockPlan` → `saveSession`. No stage in that chain returns a static/hardcoded/empty value; every format/route/exercise resolution hits a real table or a real in-memory curated constant (`GOAL_PLAN_ROUTE_MAP`, pre-existing and untouched).

### Behavioral Spot-Checks

Skipped — see Method note above. The one spot-check attempted (running the mocked unit test files directly) was aborted after discovering `vitest.config.ts` unconditionally provisions a per-worker MySQL DB via `globalSetup`/`setupFiles` even for fully-mocked unit test files, which would violate the hard "no vitest against the shared DB" constraint. No process was left running (`ps aux | grep vitest` empty after the timeout-killed attempt).

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist for this phase; N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| SEM-01 | 05 (+01 foundation) | `/generate` accepts modo per día, persists `session_mode`/roles | ✓ SATISFIED | Truths #1,3,6,7,17. |
| SEM-02 | 03 | Formato Combos mantiene forma actual de reps (rounds+reps/ejercicio) | ✓ SATISFIED | `format-params.ts:82,328,472` (pre-existing, reused via forced-format name lookup, no new single-reps param introduced). |
| SEM-03 | 02, 03 | combos-generator: INITIUM→COMBOS_I(superior)→COMBOS_II(inferior)→STRETCHING | ✓ SATISFIED | Truths #8, 12. |
| SEM-04 | 03 | tecnica-generator: INITIUM→TECNICA_I→TECNICA_II (misma ruta)→STRETCHING | ✓ SATISFIED | Truths #9, 13. |
| SEM-05 | 04 | Ancla semana→régimen + retro-etiquetado W12-26, metadata sin tocar histórico | ✓ SATISFIED | Truths #18-20. |
| SEM-06 | 02, 03, 05 | Tests de integración/unitarios de ambos generadores | ✓ SATISFIED (structural) | 4 unit test files + 1 integration file, all structurally sound; CI-deferred execution per explicit plan decision. |
| SEM-12 | 01, 05 | Roles de bloque nuevos + rename DEUTEROS badge (mitad backend) | ✓ SATISFIED | Truths #2, 16. |
| SEM-13 | 05, 06 | `/generate` con modo por día + etiqueta derivada + rename Calistenia→General | ✓ SATISFIED | Truths #6, 21-24. |
| SEM-07..SEM-11 | — | Frontend/PDF/centralización de labels | N/A — out of phase-159 scope (explicitly deferred to phase 160 per `159-RESEARCH.md:120,352` and `159-CONTEXT.md:172`) | No orphaned requirements: not claimed by any 159 plan, and research explicitly scopes them to fase 160. |

No orphaned requirements found: SEM-07 through SEM-11 are explicitly documented in the phase's own research as fase-160 scope, not silently dropped.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `admin/service.ts` | 143-186 (`routesBySession` summary builder) | COMBOS_I/COMBOS_II both fall back to `role.charAt(0)` = `"C"` (no distinct label); same for TECNICA_I/TECNICA_II = `"T"` | ℹ️ Info / minor cosmetic | The admin session-list summary string (`"I, N: SU 55%, D1: ..."` style) will show two indistinguishable `"C: <route> <intensity>%"` entries for a combos day instead of a COMBOS_I/COMBOS_II-distinct label. Not a declared must-have of any plan (only the DEUTEROS DA/DB rename was) and does not affect generation, persistence, validation, or the schedule/TV read-models verified above — those all use the actual `role` string, not this summary. Non-blocking; worth a 1-line follow-up (e.g. `label = role.endsWith("_I") ? "1" : "2"` prefixed by C/T) whenever admin list UI work for combos/tecnica lands (likely phase 160). |

No debt markers (`TODO`/`FIXME`/`TBD`/`XXX`/`HACK`/`PLACEHOLDER`) found in any file touched by this phase's diff. No stub `return null/[]/{}` patterns beyond one legitimate graceful-degradation branch (`stretching-selection.ts:55`, empty pool → empty array, covered by a dedicated unit test).

### Human Verification Required

None. This phase is backend-only by design (SEM-07 through SEM-11 — the UI-visible surfaces — are explicitly deferred to phase 160). All observable truths are verifiable by reading code, schema, and migrations; no visual/UX/real-time behavior is in scope here.

### Gaps Summary

No gaps. All 24 phase-goal-level truths (36 counting every individual plan-frontmatter must-have) verified against the actual codebase, not against SUMMARY.md prose. The one anti-pattern found (ambiguous COMBOS_I/COMBOS_II and TECNICA_I/TECNICA_II single-letter labels in the admin list summary string) is cosmetic, not a declared must-have, and does not block the phase goal — session generation, persistence, routing, validation, tenancy classification, and the schedule/TV read-model derivation all operate on the real `role` values, not the abbreviated summary label.

The three DB-dependent test files added by this phase (`test/sessions/generate-modes.test.ts`, `test/migrations/0202-session-week-regime.test.ts`, `test/scheduling/derived-class-label.test.ts`) were not executed by this verification (hard constraint: shared `eltemplo_test` DB with an active `et-173` worktree). They were read in full and are structurally sound, with substantive assertions matching every must-have they claim to cover — including reading the real 0203 SQL file at runtime (not a hand-copied duplicate) to detect a stray `;` in a comment. These remain the explicit CI gate the plans designed them to be; CI must confirm green before this phase's work is considered fully closed end-to-end.

---

_Verified: 2026-08-14T12:53:57Z_
_Verifier: Claude (gsd-verifier)_

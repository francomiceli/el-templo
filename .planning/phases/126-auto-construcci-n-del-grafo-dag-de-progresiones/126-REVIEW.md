---
phase: 126-auto-construcci-n-del-grafo-dag-de-progresiones
reviewed: 2026-06-04T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - el-templo-api/src/db/schema/exercise-progressions.ts
  - el-templo-api/src/db/migrations/0139_create_exercise_progressions.sql
  - el-templo-api/src/db/schema/index.ts
  - el-templo-api/rebuild-progression-graph.ts
  - el-templo-api/src/modules/sessions/progressions/exercise-progression-service.ts
  - el-templo-api/test/exercises/rebuild-progression-graph.test.ts
  - el-templo-api/test/exercises/exercise-progression-service.test.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues
---

# Phase 126: Code Review Report

**Reviewed:** 2026-06-04
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 126 lands the persistence layer (`exercise_progressions`), the deterministic
auto-backbone constructor (`runRebuildProgressionGraph`), and the runtime adjacency
primitive (`getNeighbor`). The migration is clean and additive, FK/constraint names
match Drizzle's convention, the SQL-comment-semicolon invariant is honored, and there
is no SQL injection surface (everything is parameterized / typed unions). The
transaction-scoped `DELETE WHERE source='auto'` + re-INSERT correctly preserves manual
edges and is idempotent, and the tests cover the locked D-02..D-05 contracts well.

No Critical issues. However, five Warning-level defects undermine the correctness and
the locked decisions:

1. The runtime `getNeighbor` re-derives adjacency from the `exercises` catalog instead
   of from the persisted `exercise_progressions` graph — directly contradicting D-03
   ("la primitiva vecino = lookup de adyacencia sobre esta tabla") and rendering manual
   128 edges invisible to the in-session adjustment.
2. Because of (1), `getNeighbor` and the backbone constructor disagree on the tiebreak
   case: at a tied `dl` they can pick _different_ neighbors, so the runtime "one step
   down" is not the same node as the persisted backbone edge.
3. `effort` is an unconstrained `varchar(10) NOT NULL` (empty-effort rows demonstrably
   exist — `exercise-fallback.ts` queries `effort = ''`), yet `getNeighbor` casts it to
   `Contraction` with `as`, producing a type-lie when the target/neighbor has `effort=''`.
4. The rebuild does not exclude empty-effort confirmed exercises, so an `effort=''`
   partition silently produces an auto chain that conflates differently-tagged rows.

Details below.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `getNeighbor` ignores the persisted graph — contradicts D-03 and hides manual (128) edges

**File:** `el-templo-api/src/modules/sessions/progressions/exercise-progression-service.ts:59-100`
**Issue:** The primitive resolves the neighbor by re-querying the `exercises` catalog
filtered on `(subfamilyId × effort)` with a directional `dl` bound — it never touches
`exercise_progressions`. D-03 in the locked context states explicitly: _"La primitiva
vecino = lookup de adyacencia sobre esta tabla"_ (adjacency lookup **over the edge
table**). The whole point of persisting `source='manual'` edges (D-03) is that profes in
phase 128 can author cross-edges/reorderings that override the SPOM-derived backbone. By
re-deriving adjacency from the catalog ordering, `getNeighbor` will **never see a manual
edge**, so phase 131's "más fácil / más difícil" will not honor profe overrides. The
03-SUMMARY even codifies this as a "pattern" ("served directly from the exercises catalog
... rather than walking the persisted edges") — i.e. the deviation was intentional but
undocumented against D-03. At minimum this needs an explicit decision/waiver; as written
it silently defeats the manual-edge mechanism this phase was built to support.
**Fix:** Resolve the neighbor by walking `exercise_progressions` (join the target's
incident `auto`/`manual` edges, prefer `manual` when both exist), e.g.:

```ts
// up   = follow edges where from_exercise_id = target, ordered to pick the manual-or-auto successor
// down = follow edges where to_exercise_id   = target
const rows = await this.db
  .select({
    neighborId: schema.exerciseProgressions.toExerciseId,
    source: schema.exerciseProgressions.source,
  })
  .from(schema.exerciseProgressions)
  .where(eq(schema.exerciseProgressions.fromExerciseId, exerciseId)); // up
// then join exercises for the candidate row, prefer source='manual'
```

If catalog-derivation is genuinely the intended design, record an explicit decision note
overriding D-03 so phase 128/131 owners are not surprised.

### WR-02: Runtime `getNeighbor` and the backbone constructor disagree on the `dl`-tie case

**File:** `el-templo-api/src/modules/sessions/progressions/exercise-progression-service.ts:106-117`
vs `el-templo-api/rebuild-progression-graph.ts:135-141`
**Issue:** The two implementations of "neighbor" can return different nodes when there
are ties at a `dl` value. The constructor sorts each partition `dl asc, id asc` and emits
strictly consecutive edges; so for `[id10@dl3, id20@dl3, T@dl5]` the persisted backbone
is `id10→id20→T`, and T's backbone predecessor is **id20**. `getNeighbor(T,'down')` (lines
112-117) instead sorts the `dl<5` candidates by `|dl-distance|` then smallest `id`, so
among `{id10@dl3, id20@dl3}` (both distance 2) it returns **id10**. The runtime "one step
easier" therefore disagrees with the persisted chain. The 03 test (case F) only exercises
the _up_ direction with a single tied pair adjacent to the target, so it does not catch
the divergence. This is a determinism bug: two parts of the same phase encode different
adjacency for the same data.
**Fix:** Make the primitive read the persisted graph (see WR-01), which removes the second
implementation entirely. If the catalog re-derivation is kept, the tiebreak must mirror the
chain: for `down`, among candidates at the closest lower `dl`, pick the **largest** id
(the immediate predecessor in the `id asc` chain), not the smallest. Add a test with two
tied candidates on the `down` side.

### WR-03: `chosen.effort as Contraction` is an unsound cast for empty-effort rows

**File:** `el-templo-api/src/modules/sessions/progressions/exercise-progression-service.ts:125`
**Issue:** `exercises.effort` is `varchar("effort", { length: 10 }).notNull()` — an
unconstrained string, not the `Contraction` union. Empty-effort rows demonstrably exist in
the catalog: `exercise-fallback.ts` repeatedly filters `eq(schema.exercises.effort, "")`
(lines 157, 217, 262, 886) precisely because lower-body routes are poorly tagged. A
confirmed canonical exercise with `effort=''` (nothing excludes it — see WR-04) would make
`getNeighbor` return `contraction: ("" as Contraction)`, an invalid value injected into the
`ExerciseCandidate` that phase 131 consumes. The `as Contraction` cast launders the lie past
the type checker (CLAUDE.md: "No `any` types ... define proper interfaces" — a blind `as`
cast violates the spirit of that rule). The same applies to the `target.effort` used as the
partition discriminator.
**Fix:** Validate/narrow the effort before returning, and skip non-`Contraction` targets:

```ts
const CONTRACTIONS = new Set<Contraction>(["CON", "EXC", "ISO"]);
function asContraction(e: string): Contraction | null {
  return CONTRACTIONS.has(e as Contraction) ? (e as Contraction) : null;
}
// In getNeighbor: if the target effort isn't a real Contraction, return null
const targetEffort = asContraction(target.effort);
if (!targetEffort) { this.log?.debug(...); return null; }
// and narrow chosen.effort the same way before building the candidate.
```

### WR-04: Rebuild does not exclude empty-effort confirmed exercises — silent `effort=''` partition

**File:** `el-templo-api/rebuild-progression-graph.ts:69-74, 119-130`
**Issue:** The READ filter is `subfamily_id IS NOT NULL AND canonical_exercise_id IS NULL`;
it does **not** filter `effort`. Since `effort` is a free varchar that can be `''` (WR-03),
a confirmed canonical exercise with empty effort becomes its own partition key
`` `${subfamilyId}|` `` (line 123). If a sub-family has several empty-effort confirmed rows,
the constructor will chain them into an auto backbone whose "effort axis" is a meaningless
empty string — conflating exercises that were never assigned a contraction. D-04 assumes the
partition axis is one of EXC/ISO/CON; an empty-effort partition violates that assumption
silently and produces edges phase 131/127 will treat as a real contraction chain.
**Fix:** Either exclude empty/invalid effort from the node set in the READ
(`AND effort IN ('CON','EXC','ISO')`), or filter it out in `readExerciseNodes` and log the
skipped count. Add a test seeding an `effort=''` confirmed exercise and asserting it appears
in no auto edge (mirrors the NULL-subfamily exclusion test E).

### WR-05: `readExerciseNodes` silently coerces a missing/NaN `dl` to 0, distorting chain order

**File:** `el-templo-api/rebuild-progression-graph.ts:170-178`
**Issue:** When `dl` is non-finite the row is **not** skipped (unlike `id`/`subfamilyId`);
instead it is coerced to `0` (line 177). `dificultad_lineal` is `NOT NULL DEFAULT 1`, so a
true NULL cannot occur, but the defensive `=> 0` is a wrong default: a `0` sorts _below_
every legitimate `dl` (which start at 1), so any row that somehow yields NaN would be
silently planted at the **head** of its partition's backbone and become the easiest node in
the chain — a wrong-data-in, wrong-edge-out outcome with no signal. The comment says "coerce
defensively to 0 on NaN" but offers no rationale for 0 being safe.
**Fix:** Treat a non-finite `dl` as a data error consistent with `id`/`subfamilyId`: skip the
row and log it (`continue`), rather than fabricating a `dl=0` that silently reorders the
chain. If the column is truly `NOT NULL DEFAULT 1` this branch should be unreachable, so
skipping is strictly safer than inventing an ordering key.

## Info

### IN-01: `source` index is low-cardinality and likely unused for lookups

**File:** `el-templo-api/src/db/schema/exercise-progressions.ts:59` and
`el-templo-api/src/db/migrations/0139_create_exercise_progressions.sql:53`
**Issue:** `exercise_progressions_source_idx` indexes a 2-value enum (`auto|manual`). The
only `source`-scoped query is the rebuild's `DELETE ... WHERE source='auto'`, which rewrites
the whole auto set in one transaction; a low-cardinality index gives little selectivity there
and adds write overhead on every edge insert. Not a correctness issue.
**Fix:** Consider dropping the standalone `source` index, or making it composite
(`(source, from_exercise_id)`) if a `source`-filtered read pattern actually emerges in 127/128.

### IN-02: Per-edge INSERT loop inside the transaction

**File:** `el-templo-api/rebuild-progression-graph.ts:99-105`
**Issue:** Edges are inserted one statement at a time inside the transaction. Correctness is
fine (atomic, ordered), and performance is out of v1 review scope, but a single bulk INSERT
(or chunked multi-row VALUES) would reduce round-trips for a full-catalog rebuild.
**Fix:** Batch the inserts: `INSERT INTO exercise_progressions (...) VALUES ?,?,...` or use
Drizzle's `.insert(...).values(edges.map(...))` in chunks.

### IN-03: Test F (constructor) is mis-described relative to what it asserts

**File:** `el-templo-api/test/exercises/rebuild-progression-graph.test.ts:350-390`
**Issue:** The case comment says the seeds prove "the tiebreak is by id, not insertion/name
order," but `first`/`second` are inserted in ascending-id order (auto-increment), so the test
cannot distinguish "id order" from "insertion order" — both predict `first→second`. The
assertion is correct but does not actually prove what the comment claims.
**Fix:** Either insert the higher-id row first and assert the lower id still leads, or seed two
rows where insertion order and id order diverge (not possible with a single auto-increment
column, so reword the comment to drop the "not insertion order" claim).

### IN-04: Neither test covers the empty-effort or invalid-effort path

**File:** `el-templo-api/test/exercises/rebuild-progression-graph.test.ts` and
`el-templo-api/test/exercises/exercise-progression-service.test.ts`
**Issue:** All seeds use `effort` in `{CON, EXC, ISO}`. The empty-effort reality of the
catalog (WR-03/WR-04) is untested in both the constructor and the primitive, so the unsound
cast and the silent `''` partition would pass CI.
**Fix:** Add cases seeding `effort=''` confirmed exercises and assert the chosen behavior
(exclusion, per the WR-04 fix) in both suites.

---

_Reviewed: 2026-06-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

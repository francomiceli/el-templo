# Phase 126: Auto-construcción del grafo (DAG) de progresiones - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 4 (1 schema, 1 migration, 1 service, 1 test) + 1 barrel edit
**Analogs found:** 4 / 4 (all exact or strong, same domain/phase lineage 124-125)

> All analogs come from the SAME milestone (v5.1 skill tree, phases 124-125). They are the most authoritative templates: matching domain (`exercises`/sub-families/dimensions), matching conventions (hand-written migrations past 0130, drizzle meta desynced), matching test policy (CI-only integration against real MySQL). Prefer these over older repo precedents.

## File Classification

| New/Modified File                                                       | Role                  | Data Flow                                     | Closest Analog                                                                          | Match Quality                        |
| ----------------------------------------------------------------------- | --------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------ |
| `el-templo-api/src/db/schema/exercise-progressions.ts` (NEW)            | model (Drizzle table) | CRUD / graph-edges                            | `src/db/schema/exercise-dimension-proposals.ts` (125) + `exercise-subfamilies.ts` (124) | exact                                |
| `el-templo-api/src/db/migrations/0139_*.sql` (NEW)                      | migration             | DDL (additive CREATE TABLE + FKs)             | `migrations/0138_create_exercise_dimension_proposals.sql` (125)                         | exact                                |
| Graph constructor (NEW) — `runRebuildProgressionGraph(db)` batch script | service / batch       | transform + batch-write (`source=auto` edges) | `bootstrap-dimensions.ts` (125, `runBootstrap(db)`)                                     | exact (same regenerable-batch shape) |
| Neighbor primitive (NEW) — `getNeighbor(exerciseId, direction)`         | service (query)       | request-response / adjacency lookup           | `src/modules/sessions/fallback/exercise-fallback.ts` (D-06 mandate)                     | role + data-flow match               |
| Graph constructor + neighbor integration test (NEW)                     | test                  | integration (real MySQL)                      | `test/exercises/bootstrap-dimensions.test.ts` (125)                                     | exact                                |
| `el-templo-api/src/db/schema/index.ts` (MODIFY)                         | config (barrel)       | n/a                                           | existing `export * from "./exercise-dimension-proposals"` line                          | exact                                |

**Open design choice (Claude's Discretion, D-06):** the constructor + neighbor may live as a root-level batch script (mirroring `bootstrap-dimensions.ts`, which is what 127/128/131 will call) OR as a class-based module service (`ProgramsService` pattern). The neighbor primitive is consumed at runtime by 131, so it likely belongs in a module service (DI-by-constructor), while the one-shot regeneration belongs in a CLI batch script. Both analogs are provided below.

---

## Pattern Assignments

### `src/db/schema/exercise-progressions.ts` (model, graph-edges)

**Analog:** `src/db/schema/exercise-dimension-proposals.ts` (125) — same `int` self-referencing FKs to `exercises.id`, inline `mysqlEnum`, named indexes, header doc-comment explaining FK delete policy.

**File header + imports** (copy structure; `exercise-dimension-proposals.ts` lines 1-11):

```typescript
// Module: exercise-progressions — phase 126 (v5.1 Nuevo Sistema de Entrenamiento)
import {
  mysqlTable,
  int,
  mysqlEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { exercises } from "./exercises";
```

**Inline enum pattern** (from `exercise-dimension-proposals.ts` lines 22-26 — `source` is `auto|manual` per D-03):

```typescript
export const exerciseProgressionSource = mysqlEnum(
  "exercise_progression_source",
  ["auto", "manual"],
);
```

**Table + FK + index pattern** (from `exercise-dimension-proposals.ts` lines 52-74 — note FK to `exercises.id`; pick delete policy consciously: proposals use CASCADE, but an edge probably also wants CASCADE since an edge is meaningless without both endpoints):

```typescript
export const exerciseProgressions = mysqlTable(
  "exercise_progressions",
  {
    id: int("id").primaryKey().autoincrement(),
    fromExerciseId: int("from_exercise_id")
      .references(() => exercises.id, { onDelete: "cascade" })
      .notNull(),
    toExerciseId: int("to_exercise_id")
      .references(() => exercises.id, { onDelete: "cascade" })
      .notNull(),
    source: exerciseProgressionSource.default("auto").notNull(),
  },
  (table) => [
    // UNIQUE on the edge so the auto-regenerate (D-03) can upsert / dedupe
    uniqueIndex("exercise_progressions_edge_uq").on(
      table.fromExerciseId,
      table.toExerciseId,
    ),
    index("exercise_progressions_from_idx").on(table.fromExerciseId),
    index("exercise_progressions_to_idx").on(table.toExerciseId),
    index("exercise_progressions_source_idx").on(table.source),
  ],
);
```

> Self-FK note: `exercises.ts` lines 55-58 show the self-referential FK idiom (`canonicalExerciseId`) using `(): AnyMySqlColumn => exercises.id`. Here both FKs point at a DIFFERENT table file (`exercises`), so the plain `() => exercises.id` form (as in `exercise-dimension-proposals.ts`) is correct — `AnyMySqlColumn` is only needed for same-file self-reference.

**Barrel edit** — add to `src/db/schema/index.ts` directly after line 13 (`export * from "./exercise-dimension-proposals";`):

```typescript
export * from "./exercise-progressions";
```

---

### `src/db/migrations/0139_*.sql` (migration, additive DDL)

**Analog:** `migrations/0138_create_exercise_dimension_proposals.sql` (125) — single additive `CREATE TABLE` with FKs to `exercises`, named indexes, drizzle-convention FK constraint names.

**Migration number:** next free is `0139` (confirmed: `0137`=124, `0138`=125 are the last two; `0139` does not exist). Suggested name `0139_create_exercise_progressions.sql`.

**CRITICAL conventions (from CLAUDE.md §Database Changes + the 0137/0138 headers — all load-bearing):**

1. **No `;` anywhere inside comment lines.** The runner (`src/db/run-migrations.ts`) splits on `;` BEFORE stripping `--` comments. A semicolon in a comment breaks the whole file. (0137 header lines 29-33, 0138 lines 36-38.)
2. Hand-written SQL — do NOT run `drizzle-kit migrate`. The drizzle meta journal is desynced (~0059) while the DB is past 0130. (0137 lines 42-43, 0138 lines 45-46.)
3. Do NOT use statement-level `IF NOT EXISTS` guards — replay is prevented by the `_migrations` table row, per project pattern (0108/0121/0125/0137/0138). (0138 lines 30-34.)
4. FK constraint names must match Drizzle's auto-gen convention so a future `pnpm db:generate` converges: `exercise_progressions_from_exercise_id_exercises_id_fk` and `exercise_progressions_to_exercise_id_exercises_id_fk`. (0137 lines 35-40, 0138 lines 40-43.)
5. Every statement ends with a single `;` on its own non-comment line.

**Body pattern** (from `0138_create_exercise_dimension_proposals.sql` lines 48-64 — adapt columns to the edge table; keep the same CREATE TABLE shape with inline ENUM, named UNIQUE/INDEX, and inline CONSTRAINT FKs):

```sql
CREATE TABLE exercise_progressions (
  id INT NOT NULL AUTO_INCREMENT,
  from_exercise_id INT NOT NULL,
  to_exercise_id INT NOT NULL,
  source ENUM('auto','manual') NOT NULL DEFAULT 'auto',
  PRIMARY KEY (id),
  UNIQUE KEY exercise_progressions_edge_uq (from_exercise_id, to_exercise_id),
  INDEX exercise_progressions_from_idx (from_exercise_id),
  INDEX exercise_progressions_to_idx (to_exercise_id),
  INDEX exercise_progressions_source_idx (source),
  CONSTRAINT exercise_progressions_from_exercise_id_exercises_id_fk
    FOREIGN KEY (from_exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  CONSTRAINT exercise_progressions_to_exercise_id_exercises_id_fk
    FOREIGN KEY (to_exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);
```

> Reminder per memory note: commit the `.sql` file alongside the schema `.ts` change in the same commit.

---

### Graph constructor — `runRebuildProgressionGraph(db)` (service / batch transform)

**Analog:** `bootstrap-dimensions.ts` (125) — a root-level, idempotent/regenerable batch script that reads the catalog, transforms deterministically, and batch-writes into a dimension table. This is the EXACT shape D-03 asks for ("re-correr 126 regenera solo las aristas `auto` sin tocar las `manual`").

**Injectable, testable signature** (from `bootstrap-dimensions.ts` lines 171-173 — generic-DB so the integration test can pass `app.db`):

```typescript
export async function runRebuildProgressionGraph<
  TSchema extends Record<string, unknown>,
>(db: MySql2Database<TSchema>): Promise<void> {
```

**Read-report-before-mutate + idempotent structure** (from `bootstrap-dimensions.ts` lines 174-210 — adapt to: read confirmed-dimension exercises, partition by `(subfamily_id × effort)`, sort by `dificultadLineal`, emit consecutive edges):

```typescript
// 1. READ — only CONFIRMED-dimension canonical exercises (Discretion: exclude
//    rows with NULL subfamily_id; operate on canonical rows). Read-only report
//    before any write.
const rows = await db.execute(
  sql`SELECT id, subfamily_id AS subfamilyId, effort, dificultad_lineal AS dl
      FROM exercises
      WHERE subfamily_id IS NOT NULL
        AND canonical_exercise_id IS NULL`, // canonical only (D-01)
);
// 2. TRANSFORM — group by (subfamilyId × effort), order by dl, build consecutive
//    edges. Deterministic, no inference (D-02). Tiebreak dl ties with a stable
//    key (leverage and/or id) per D-05.
// 3. WRITE — replace ONLY source='auto' edges, never touch source='manual' (D-03):
//      DELETE FROM exercise_progressions WHERE source = 'auto'
//      then bulk INSERT the recomputed auto backbone.
```

**Regeneration guarantee (D-03):** the write step MUST be scoped to `source='auto'`. Pattern: inside a `db.transaction`, `DELETE ... WHERE source='auto'` then re-insert. (Transaction idiom: `ProgramsService.createProgram`, `src/modules/programs/service.ts` lines 50-51 — `await this.db.transaction(async (tx) => { ... })`.)

**Logging:** if implemented as a standalone CLI batch tool, `console.log` is acceptable (precedent: `bootstrap-dimensions.ts` header lines 33-37 explicitly carves this out from the "never console.log" rule, which targets the server + frontends). If folded into a module service, use `FastifyBaseLogger` instead (see `ProgramsService` constructor below).

---

### Neighbor primitive — `getNeighbor(exerciseId, direction)` (service query / adjacency)

**Analog:** `src/modules/sessions/fallback/exercise-fallback.ts` (D-06 mandate: REUSE/extend, do not reimplement). The neighbor is a much SIMPLER query than the full fallback ladder — D-04 FIXES the contraction, so there is no contraction substitution, no tier widening. Reuse the Drizzle query idiom and the deterministic-sort idiom, not the tier machinery.

**Query idiom to copy** (from `exercise-fallback.ts` `queryExercises`, lines 96-112 — same `effort` filter, `dificultadLineal` bounds, deterministic; for the neighbor, additionally filter by `subfamily_id` and select the single adjacent `dl`):

```typescript
const results = await db
  .select({
    id: schema.exercises.id,
    name: schema.exercises.exercise,
    dificultadLineal: schema.exercises.dificultadLineal,
  })
  .from(schema.exercises)
  .where(
    and(
      eq(schema.exercises.subfamilyId, subfamilyId), // partition by sub-family
      eq(schema.exercises.effort, effort), // D-04: FIX the contraction
      // direction up   -> gt(dificultadLineal, currentDl), order asc, take first
      // direction down -> lt(dificultadLineal, currentDl), order desc, take first
    ),
  );
```

**Deterministic tie-break idiom** (D-05: dl ties within `(subfamily × effort)`) — copy the stable-sort approach from `exercise-fallback.ts` `selectClosest` (lines 388-400) and `queryExercisesIncludingEmptyEffort` (lines 172-177): sort by the primary key (dl distance) then break ties by `id`:

```typescript
// stable order: primary key first, deterministic tiebreak by id
.sort((a, b) => (a.dl !== b.dl ? a.dl - b.dl : a.id - b.id));
```

**No-neighbor fallback (D-05):** at the end of a chain, return `null`/empty. Mirror `exercise-fallback.ts`'s explicit terminal `return { status: "failed", ... }` (lines 815-822) — be explicit, do NOT cross `effort` automatically (D-04/D-05). 131 handles the null gracefully.

**If implemented as a class-based module service** (recommended for the runtime consumer 131), copy the DI-by-constructor shape from `ProgramsService` (`src/modules/programs/service.ts` lines 33-39):

```typescript
type DbInstance = MySql2Database<typeof schema>;

export class ExerciseProgressionService {
  constructor(
    private readonly db: DbInstance,
    private readonly log?: FastifyBaseLogger,
  ) {}

  async getNeighbor(
    exerciseId: number,
    direction: "up" | "down",
  ): Promise<ExerciseCandidate | null> {
    /* ... */
  }
}
```

---

### Integration test (test, real MySQL)

**Analog:** `test/exercises/bootstrap-dimensions.test.ts` (125) — same domain, same CI-only policy, seeds `exercises` directly via Drizzle, calls the exported `run*` function with `app.db`, cleans up only its own rows.

**Header + imports + DB-injection call** (from `bootstrap-dimensions.test.ts` lines 25-31):

```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { runRebuildProgressionGraph } from "../../<path-to-constructor>";
```

**Self-scoped seeding + cleanup idiom** (from `bootstrap-dimensions.test.ts` lines 37-63 — unique MARK, track seeded ids, `$returningId()`, `afterEach` deletes edges THEN exercises in FK order):

```typescript
const MARK = `PROGRESSION_TEST_${Date.now()}`;
const seededIds: number[] = [];

async function seedExercise(opts: {
  name: string;
  route: string;
  effort: string;
  subfamilyId: number;
  dl: number;
}): Promise<number> {
  const [res] = await app.db
    .insert(schema.exercises)
    .values({
      pattern: "test",
      category: "test",
      exercise: opts.name,
      effort: opts.effort,
      route: opts.route,
      subfamilyId: opts.subfamilyId,
      dificultadLineal: opts.dl,
    })
    .$returningId();
  seededIds.push(res.id);
  return res.id;
}
```

> Test policy (CLAUDE.md + memory): do NOT run the suite locally — local gate is `tsc` only. When tests are ready, ask Franco before pushing to staging so CI runs them. Real clock (no fake timers — they desync from MySQL `CURRENT_TIMESTAMP`), per the analog header.

**Contracts to assert (derived from D-02/D-03/D-04/D-05):**

- A: backbone is consecutive-by-dl within `(subfamily × effort)` — a 3-exercise chain yields exactly 2 `auto` edges in dl order.
- B: idempotency — re-running `runRebuildProgressionGraph` produces the SAME `auto` edge set (no dupes; UNIQUE backs it).
- C: regeneration preserves manual — seed a `source='manual'` edge, re-run, assert the manual edge survives untouched (D-03 risk closure).
- D: `effort` is NOT crossed — an EXC and a CON exercise in the same sub-family never share an edge.
- E: `getNeighbor` up/down returns the dl-adjacent same-effort exercise; at chain ends returns `null`.
- F: unconfirmed exercises (NULL `subfamily_id`) are excluded from the graph (Discretion).

---

## Shared Patterns

### Drizzle FK to `exercises.id`

**Source:** `src/db/schema/exercise-dimension-proposals.ts` lines 56-58
**Apply to:** the new `exercise-progressions.ts` (both `from`/`to` FKs)

```typescript
exerciseId: int("exercise_id")
  .references(() => exercises.id, { onDelete: "cascade" })
  .notNull(),
```

### Hand-written migration safety

**Source:** `migrations/0137` lines 22-43 + `0138` lines 30-46 (CLAUDE.md §Database Changes)
**Apply to:** the `0139` migration

- No `;` inside any comment line (runner splits on `;` before stripping `--`).
- No `IF NOT EXISTS` guards (replay prevented by `_migrations` row).
- FK names match Drizzle convention (`<table>_<col>_exercises_id_fk`).
- Never `drizzle-kit migrate`; apply with `pnpm db:migrate`.

### Regenerable batch-script shape (read-report → transform → scoped write)

**Source:** `bootstrap-dimensions.ts` lines 171-210
**Apply to:** the graph constructor — exported `run*<TSchema>(db)` for test injection; read-only report before mutate; scope writes to `source='auto'` to honor D-03.

### Transaction wrapper for atomic multi-step write

**Source:** `src/modules/programs/service.ts` lines 50-51
**Apply to:** the constructor's DELETE-auto-then-INSERT-auto step

```typescript
return await this.db.transaction(async (tx) => {
  /* ... */
});
```

### Deterministic ordering / stable tiebreak

**Source:** `exercise-fallback.ts` lines 172-177 (`a.id - b.id`) and 388-400 (`selectClosest`)
**Apply to:** chain ordering in the constructor AND `getNeighbor` — order by `dl`, break ties by a stable key (`id`, optionally `leverage`) per D-05.

---

## No Analog Found

None. Every file has a strong, same-milestone analog. The only genuinely new logic is the deterministic chain-partitioning (`group by (subfamily × effort)`, order by dl, emit consecutive edges) — this is pure in-memory transform with no DB-pattern precedent, but the read/write scaffolding around it is fully covered by `bootstrap-dimensions.ts`.

## Metadata

**Analog search scope:** `el-templo-api/src/db/schema/`, `el-templo-api/src/db/migrations/` (0120-0138), `el-templo-api/src/modules/sessions/fallback/`, `el-templo-api/src/modules/programs/`, `el-templo-api/test/exercises/`, root-level `bootstrap-dimensions.ts`.
**Files scanned:** ~12 read in full or targeted.
**Pattern extraction date:** 2026-06-04

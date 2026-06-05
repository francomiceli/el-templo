# Phase 124: Estructura de datos de las 3 dimensiones + saneo - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 4 (1 modify, 3 create)
**Analogs found:** 4 / 4 (all exact or strong)

## File Classification

| New/Modified File                                              | Role           | Data Flow                                        | Closest Analog                                                                                | Match Quality |
| -------------------------------------------------------------- | -------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------- |
| `el-templo-api/src/db/schema/exercises.ts` (MODIFY)            | model/schema   | transform (additive cols + self-FK + catalog FK) | itself + `refresh-tokens.ts` (self-FK)                                                        | exact         |
| `el-templo-api/src/db/schema/exercise-subfamilies.ts` (CREATE) | model/schema   | CRUD (lookup/catalog table)                      | `routes.ts` / `gladius-products.ts`                                                           | exact         |
| `el-templo-api/src/db/migrations/0137_*.sql` (CREATE)          | migration      | batch (additive DDL + idempotent backfill)       | `0125_create_refresh_tokens.sql` + `0121_users_lead_fields.sql` + `0100_user_status_enum.sql` | exact         |
| `el-templo-api/<saneo-detect>.ts` (CREATE, optional)           | utility/script | batch (detect + soft-merge by pointer)           | `backfill-gender.ts`                                                                          | exact         |

> Migration number: next free is **0137** (0136 is the latest committed migration). Confirm the actual highest at plan time.

## Pattern Assignments

### `el-templo-api/src/db/schema/exercises.ts` (MODIFY — model, transform)

**Analog:** itself (current Drizzle conventions) + `refresh-tokens.ts` for the self-FK thunk.

This is the only existing file modified. New columns/FKs per D-01/D-03/D-07/D-11. `position`, `effort`, `level`, `dificultadLineal` are NOT touched (D-02/D-04/D-11).

**Current import + table conventions to preserve** (lines 1-50): double-quote strings, `mysqlEnum` declared as a top-level const (`exerciseLevelEnum`, lines 9-15), composite index in the `(table) => [...]` array form (lines 40-49), `.$type<...>()` for constrained varchars (lines 35-37 `equipment`). Match this exact style for any new column.

**Self-FK pattern to copy for `canonical_exercise_id`** — from `refresh-tokens.ts` lines 1-9, 42-45:

```typescript
import { /* ... */ type AnyMySqlColumn } from "drizzle-orm/mysql-core";

// inside the table object:
canonicalExerciseId: int("canonical_exercise_id").references(
  (): AnyMySqlColumn => exercises.id,
  { onDelete: "set null" },
),
```

The `(): AnyMySqlColumn =>` annotated thunk is the project's idiom for a self-referencing FK (avoids the circular-type error). `ON DELETE SET NULL` is the right semantic for a canonical pointer (D-07: no deletes, reversible).

**Catalog FK pattern for sub-family** — same `references(() => table.id)` thunk style as `micro-programs.ts` line 51 (`exerciseId: int("exercise_id").references(() => exercises.id)`). Make it **nullable** (D-10: catalog may be empty/minimal in 124):

```typescript
subfamilyId: int("subfamily_id").references(() => exerciseSubfamilies.id),
```

**Nullable `leverage` attribute** (D-03/D-05) — varchar nullable, NOT a global enum. Follow the plain nullable `varchar` style of `position` (line 26) since vocabulary is per-node and open:

```typescript
leverage: varchar("leverage", { length: 50 }), // nullable: per-family, null where N/A
```

Discretion note (D / CLAUDE.md): the planner may also add a "pendiente de ruta" marker column for D-08 detection (e.g. nullable `boolean`/`varchar` flag) rather than a separate script-only output — decide at plan time.

**Index additions** — append to the existing array (lines 40-49), do not rewrite existing ones. Likely add `index("exercises_subfamily_idx").on(table.subfamilyId)` and `index("exercises_canonical_idx").on(table.canonicalExerciseId)`.

---

### `el-templo-api/src/db/schema/exercise-subfamilies.ts` (CREATE — model, CRUD/lookup)

**Analog:** `routes.ts` (smallest catalog: id + code + displayName + createdAt) and `gladius-products.ts` (has the `sortOrder` int + default pattern for "orden").

The sub-family catalog needs: id, ruta (familia/área), nombre, orden (D-01). Copy `routes.ts` import/shape and add `sortOrder` from `gladius-products.ts` line 17.

**Imports + table shape** (from `routes.ts` lines 1-8, `gladius-products.ts` line 17):

```typescript
import { mysqlTable, int, varchar, index } from "drizzle-orm/mysql-core";

export const exerciseSubfamilies = mysqlTable(
  "exercise_subfamilies",
  {
    id: int("id").primaryKey().autoincrement(),
    route: varchar("route", { length: 20 }).notNull(), // mirrors exercises.route width (20)
    name: varchar("name", { length: 150 }).notNull(),
    sortOrder: int("sort_order").default(0).notNull(),
  },
  (table) => [index("exercise_subfamilies_route_idx").on(table.route)],
);
```

Match `exercises.route` width (`varchar(20)`, exercises.ts line 33) so the FK domains align. Use the `(table) => [...]` index-array form (matches `exercises.ts`, `contraction-rules.ts`). Project codebase mixes single/double quotes across older vs newer files — newer files (refresh-tokens, gladius) use double quotes; prefer double quotes for the new file.

**Barrel export** — add `export * from "./exercise-subfamilies";` to `src/db/schema/index.ts` (the barrel, currently lines 1-59). Place it near the exercises-related exports (after line 11 `./exercises`). Whatever schema is imported by `exercises.ts` must be exported too so Drizzle resolves the FK.

---

### `el-templo-api/src/db/migrations/0137_*.sql` (CREATE — migration, batch DDL + idempotent backfill)

**Analogs (combine three):**

- `0125_create_refresh_tokens.sql` — CREATE TABLE + self-FK constraint naming.
- `0121_users_lead_fields.sql` — ADD COLUMN (nullable, no default) + ADD CONSTRAINT FK + CREATE INDEX, hand-written.
- `0100_user_status_enum.sql` — idempotent backfill with `WHERE ... IS NULL` guards (D-12).

**CRITICAL project invariants** (all three analogs document these in their header comments — replicate the header block verbatim-style):

1. **No `;` inside any SQL comment line** — the runner (`src/db/run-migrations.ts`) splits on `;` BEFORE stripping `--`. A semicolon in a comment shatters the whole file. (See header of 0124/0121/0125; this is the project rule restated in D-12 and MEMORY.)
2. **No `IF NOT EXISTS` guards** — idempotency comes from the `_migrations` table tracking the filename (project pattern, see 0108/0111/0121 precedents). MySQL 8 inline `IF NOT EXISTS` for ADD COLUMN/INDEX is version-flaky.
3. **Applied via the custom runner** (`pnpm db:migrate` → `tsx src/db/run-migrations.ts`), NEVER `drizzle-kit migrate`. The drizzle meta journal is desynced (at 0059) — irrelevant; `_migrations` table is source of truth.
4. **Commit the SQL alongside the schema change** (D-12, MEMORY rule).

**CREATE TABLE block** — copy `0125` lines 31-44 structure:

```sql
CREATE TABLE exercise_subfamilies (
  id INT NOT NULL AUTO_INCREMENT,
  route VARCHAR(20) NOT NULL,
  name VARCHAR(150) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX exercise_subfamilies_route_idx (route)
);
```

**ADD COLUMN + ADD CONSTRAINT (FK) + CREATE INDEX** — copy `0121` lines 24-42 structure. Constraint names MUST follow Drizzle's auto-generated convention so a future `pnpm db:generate` converges (called out in 0121 lines 33-35 and 0125 lines 20-26):

```sql
ALTER TABLE exercises
  ADD COLUMN subfamily_id INT NULL DEFAULT NULL AFTER route;

ALTER TABLE exercises
  ADD COLUMN leverage VARCHAR(50) NULL DEFAULT NULL AFTER subfamily_id;

ALTER TABLE exercises
  ADD COLUMN canonical_exercise_id INT NULL DEFAULT NULL AFTER leverage;

ALTER TABLE exercises
  ADD CONSTRAINT exercises_subfamily_id_exercise_subfamilies_id_fk
  FOREIGN KEY (subfamily_id) REFERENCES exercise_subfamilies(id) ON DELETE SET NULL;

ALTER TABLE exercises
  ADD CONSTRAINT exercises_canonical_exercise_id_exercises_id_fk
  FOREIGN KEY (canonical_exercise_id) REFERENCES exercises(id) ON DELETE SET NULL;

CREATE INDEX exercises_subfamily_idx ON exercises(subfamily_id);

CREATE INDEX exercises_canonical_idx ON exercises(canonical_exercise_id);
```

**Idempotent backfill (if done in SQL)** — copy the `WHERE ... IS NULL` guard idiom from `0100` lines 25-34. For dupe soft-merge (D-07), point each exact-dupe to the lowest-id canonical, guarded so re-runs no-op:

```sql
-- exact dupe = same exercise name + dificultad_lineal + route + effort (D-06)
-- canonical = the MIN(id) of each dupe group; dupes point to it; no deletes (D-07)
UPDATE exercises e
  JOIN (
    SELECT MIN(id) AS canonical_id, exercise, dificultad_lineal, route, effort
    FROM exercises
    GROUP BY exercise, dificultad_lineal, route, effort
    HAVING COUNT(*) > 1
  ) g
    ON e.exercise = g.exercise
   AND e.dificultad_lineal = g.dificultad_lineal
   AND e.route = g.route
   AND e.effort = g.effort
  SET e.canonical_exercise_id = g.canonical_id
  WHERE e.id <> g.canonical_id
    AND e.canonical_exercise_id IS NULL;
```

> Whether the dupe-detection + "pendiente de ruta" detection live in the migration SQL or in a separate TS script (next file) is a **planner decision**. The migration is the right home for deterministic set-based backfill; the script is better if the detection needs reporting/inspection before mutating. Both must be idempotent and reversible (rollback = null the pointers + drop the new columns/table).

> NOTE: the correlated/grouped backfill above touches `exercises`, whose `id` is FK-referenced by `session_prescriptions.exercise_id` (session-prescriptions.ts line 18, NOT NULL) and `program_content_blocks.exercise_id` (micro-programs.ts line 51). Because we only set a NEW pointer column and never DELETE/reassign `id`, those FKs are untouched — this is exactly why D-07 mandates soft-merge over delete.

---

### `el-templo-api/<saneo-detect>.ts` (CREATE, optional — utility/script, batch)

**Analog:** `el-templo-api/backfill-gender.ts` (one-off maintenance CLI run via `npx tsx`, works against any env via `.env DATABASE_URL`).

Use this analog if the planner wants detect-then-act with a printed report (recommended for the dupe soft-merge and "pendiente de ruta" marking so a human can eyeball before committing pointer writes), rather than blind SQL backfill.

**Connection + entrypoint pattern** (backfill-gender.ts lines 13-17, 241-247, 340-349):

```typescript
import "dotenv/config";
import { createSingleConnection } from "./src/db/index"; // exported in src/db/index.ts line 23
import { exercises } from "./src/db/schema";
import { isNull, sql } from "drizzle-orm";

async function main(): Promise<void> {
  const { db, connection } = await createSingleConnection();
  try {
    // 1. detect exact-dupe groups + exercises with empty/placeholder route
    // 2. report counts (one-off CLI: console.log is the established pattern here)
    // 3. set canonical_exercise_id pointers / mark "pendiente de ruta"
    //    guarded by ... IS NULL so re-runs no-op
  } finally {
    await connection.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Saneo failed: ${message}`);
  process.exit(1);
});
```

**Guarded batch UPDATE** — copy the `db.execute(sql\`UPDATE ... WHERE id IN (${sql.join(...)})\`)`idiom from backfill-gender.ts lines 298-323 for writing pointers per group, and the`WHERE col IS NULL` idempotency guard (lines 250-257).

**Convention note:** This script is the ONE place `console.log` is acceptable — it is a standalone CLI maintenance tool, exactly like `backfill-gender.ts`. The CLAUDE.md "never console.log" rule targets the API server (use `request.log`/`app.log`) and frontend apps, NOT one-off `tsx` scripts. `catch (err: unknown)` + `instanceof Error` narrowing (lines 345-348) is mandatory (CLAUDE.md TS rules). No `any`.

---

## Shared Patterns

### Self-referencing FK (canonical pointer)

**Source:** `el-templo-api/src/db/schema/refresh-tokens.ts` lines 1-9, 42-45
**Apply to:** `exercises.canonicalExerciseId`

```typescript
import { type AnyMySqlColumn } from "drizzle-orm/mysql-core";
replacedById: int("replaced_by_id").references(
  (): AnyMySqlColumn => refreshTokens.id,
  { onDelete: "set null" },
),
```

SQL counterpart (0125 line 43): `CONSTRAINT <tbl>_<col>_<tbl>_id_fk FOREIGN KEY (...) REFERENCES <tbl>(id) ON DELETE SET NULL`.

### Hand-written migration header (project invariants)

**Source:** `0124_users_bar_challenge_fields.sql` lines 1-27, `0121` lines 1-22
**Apply to:** the 0137 migration
Replicate the four documented blocks: purpose, idempotency rationale (`_migrations` tracks filename, no `IF NOT EXISTS`), **comment safety (no `;` in comments)**, hand-written/desynced-journal note.

### Idempotent backfill guard

**Source:** `0100_user_status_enum.sql` lines 25-57, `backfill-gender.ts` lines 250-257
**Apply to:** every UPDATE in the migration / saneo script

```sql
UPDATE exercises e SET e.<new_col> = <val> WHERE e.<new_col> IS NULL AND <condition>;
```

### Drizzle catalog/lookup table shape

**Source:** `routes.ts` lines 1-8 + `gladius-products.ts` line 17 (`sort_order` int default not-null)
**Apply to:** `exercise_subfamilies` table

### FK-preservation constraint (why soft-merge, not delete)

**Source:** `session-prescriptions.ts` line 18 (`exerciseId ... .notNull()`), `micro-programs.ts` line 51 (`.references(() => exercises.id)`)
**Apply to:** ALL row mutations on `exercises` — never DELETE/reassign `exercises.id`; only set new pointer columns (D-07).

## No Analog Found

None. Every file has a strong codebase analog.

## Metadata

**Analog search scope:** `el-templo-api/src/db/schema/`, `el-templo-api/src/db/migrations/`, `el-templo-api/scripts/`, `el-templo-api/*.ts`
**Files scanned:** 11 (4 schema, 4 migration, 2 script, 1 barrel)
**Pattern extraction date:** 2026-06-04

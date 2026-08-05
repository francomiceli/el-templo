# Phase 125: Bootstrap (heurístico) + revisión de profes de la descomposición - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 7 (5 create, 2 modify)
**Analogs found:** 7 / 7 (all strong, same codebase)

> Engine change (D-05): the first pass is **HEURISTIC, NO LLM**. No `@anthropic-ai/sdk`, no `ANTHROPIC_API_KEY`, no AI-SPEC. The bootstrap script is a deterministic rule engine over `exercises.route` codes + leverage keywords in the name.

---

## File Classification

| New/Modified File                                                                                          | Role                   | Data Flow         | Closest Analog                                                                                                          | Match Quality     |
| ---------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `el-templo-api/src/db/schema/exercise-dimension-proposals.ts` (CREATE)                                     | model (schema)         | CRUD              | `src/db/schema/exercise-subfamilies.ts` (124) + `refresh-tokens.ts` (FK thunk) + `evaluation-requests.ts` (status enum) | exact             |
| `el-templo-api/src/db/schema/index.ts` (MODIFY)                                                            | config (barrel)        | n/a               | itself (124 added `./exercise-subfamilies` here)                                                                        | exact             |
| `el-templo-api/src/db/migrations/0138_*.sql` (CREATE)                                                      | migration              | DDL               | `0137_exercise_dimensions_and_saneo.sql` (124)                                                                          | exact             |
| `el-templo-api/bootstrap-dimensions.ts` (CREATE)                                                           | script (one-off CLI)   | batch / transform | `saneo-exercises.ts` (124) + `backfill-gender.ts`                                                                       | exact             |
| `el-templo-api/src/modules/admin/proposal-service.ts` + admin `routes.ts` (CREATE service + MODIFY routes) | service + route        | CRUD / approval   | `admin/exercise-service.ts` + `admin/service.ts#bulkApprove` + admin `routes.ts` exercise endpoints                     | exact (role+flow) |
| `el-templo-admin/src/pages/ProposalReviewPage.vue` + `useProposalsApi.ts` + router entry                   | component + composable | request-response  | `ExercisesPage.vue` + `useExercisesApi.ts` + `router/routes.ts`                                                         | exact             |
| `el-templo-api/test/exercises/bootstrap-dimensions.test.ts` (CREATE)                                       | test                   | CRUD/transform    | `test/exercises/saneo-exercises.test.ts` (124)                                                                          | exact             |

**Module placement decision:** proposal endpoints live in the **`admin` module** (`src/modules/admin/`), NOT a new module. The admin module already owns all `/admin/exercises*` endpoints (list/create/PATCH/bulk-update-equipment in `routes.ts`), the `ExerciseService`, and the bulk-approve pattern. Add a `ProposalService` (or extend `ExerciseService`) and `/admin/exercises/proposals*` routes there. Frontend lives as a new admin page reusing the `ExercisesPage.vue` table shape.

---

## Pattern Assignments

### `el-templo-api/src/db/schema/exercise-dimension-proposals.ts` (model, CRUD)

**Analog:** `exercise-subfamilies.ts` (table skeleton, 124) + `refresh-tokens.ts` (FK + `defaultNow` meta) + `evaluation-requests.ts` (status enum idiom)

**Status enum idiom** — `evaluation-requests.ts:4,10` (named module-level enum, `.default('pending').notNull()`):

```typescript
export const evaluationRequestStatus = mysqlEnum('evaluation_request_status', ['pending', 'approved', 'denied']);
// ...
status: evaluationRequestStatus.default('pending').notNull(),
```

For D-01 use values `['pending', 'accepted', 'rejected']` (note: `accepted`/`rejected`, per CONTEXT, not `approved`/`denied`).

**FK to exercises** — copy the `.references(() => ..., { onDelete: ... })` idiom from `refresh-tokens.ts:36-38` and the existing `exercises.subfamilyId` FK in `exercises.ts:41-43`:

```typescript
exerciseId: int("exercise_id")
  .references(() => exercises.id, { onDelete: "cascade" })
  .notNull(),
```

Use `onDelete: "cascade"` (a proposal is meaningless without its exercise) — contrast with the truth columns in 124 which use `set null` to preserve historical FKs. Proposals are NOT FK-referenced by anything historical, so cascade is safe.

**Table skeleton + index** — `exercise-subfamilies.ts:19-28` (autoincrement PK, callback returns array of `index(...)`):

```typescript
export const exerciseDimensionProposals = mysqlTable(
  "exercise_dimension_proposals",
  {
    id: int("id").primaryKey().autoincrement(),
    exerciseId: int("exercise_id")
      .references(() => exercises.id, { onDelete: "cascade" })
      .notNull(),
    proposedSubfamily: varchar("proposed_subfamily", { length: 150 }), // canonical name text (D-01); width mirrors exercise_subfamilies.name
    proposedLeverage: varchar("proposed_leverage", { length: 50 }), // nullable (D-03); width mirrors exercises.leverage
    proposedRoute: varchar("proposed_route", { length: 20 }), // nullable, only for route_pending (D-03); width mirrors exercises.route
    status: exerciseProposalStatus.default("pending").notNull(),
    engine: varchar("engine", { length: 30 }), // metadato del motor (D-01) e.g. "heuristic-v1"
    confidence: int("confidence"), // optional confidence meta (D-01) — nullable
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("exercise_dimension_proposals_exercise_idx").on(table.exerciseId),
    index("exercise_dimension_proposals_status_idx").on(table.status),
    index("exercise_dimension_proposals_route_idx").on(table.proposedRoute), // grouping by route (D-07)
  ],
);
```

Add `import { exercises } from "./exercises";` at top (Drizzle FK resolution). Widths chosen to mirror the truth columns (D-02) so accept writes never truncate.

**Idempotency hook for the script (D-06):** add a unique index on `exercise_id` if a given exercise can have at most ONE live proposal (the script only inserts where no proposal exists). Planner to confirm — a UNIQUE on `exercise_id` enforces "only generate proposal where none exists yet" at the DB level and makes the script's `WHERE NOT EXISTS` guard belt-and-suspenders.

---

### `el-templo-api/src/db/schema/index.ts` (barrel, MODIFY)

**Analog:** itself — 124 added `export * from "./exercise-subfamilies";` at line 12 right after `./exercises`.

Add one line near the exercises group (after line 12):

```typescript
export * from "./exercise-dimension-proposals";
```

Required so Drizzle resolves the FK and `import * as schema` exposes the table.

---

### `el-templo-api/src/db/migrations/0138_*.sql` (migration, DDL)

**Analog:** `0137_exercise_dimensions_and_saneo.sql` (124) — same author conventions verified in the SUMMARY.

**Confirmed next free number: 0138** (0137 is the last migration; `ls migrations | tail` ends at 0137). Suggested name: `0138_create_exercise_dimension_proposals.sql`.

**Hard rules from the 0137 header (CLAUDE.md + project precedent):**

- NO `;` anywhere inside `--` comment lines (the runner splits on `;` BEFORE stripping comments — see MEMORY note `feedback_no_semicolon_in_sql_comments`). 0137:29-33 documents this invariant.
- NO `IF NOT EXISTS` (MySQL 8 flaky; `_migrations` table is the replay guard) — 0137:22-27.
- Drizzle-convention FK constraint name so a future `db:generate` converges — 0137:35-40: pattern `{table}_{col}_{reftable}_{refcol}_fk`, i.e. `exercise_dimension_proposals_exercise_id_exercises_id_fk`.
- Hand-written, tracked by `_migrations` filename; never `drizzle-kit migrate`. **Commit the SQL** alongside the schema (MEMORY: executors miss this).
- Pure additive (CREATE TABLE only) → reversible, document rollback in header.

**Structure to copy** (0137:45-52 is the CREATE TABLE shape):

```sql
CREATE TABLE exercise_dimension_proposals (
  id INT NOT NULL AUTO_INCREMENT,
  exercise_id INT NOT NULL,
  proposed_subfamily VARCHAR(150) NULL DEFAULT NULL,
  proposed_leverage VARCHAR(50) NULL DEFAULT NULL,
  proposed_route VARCHAR(20) NULL DEFAULT NULL,
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  engine VARCHAR(30) NULL DEFAULT NULL,
  confidence INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX exercise_dimension_proposals_exercise_idx (exercise_id),
  INDEX exercise_dimension_proposals_status_idx (status),
  INDEX exercise_dimension_proposals_route_idx (proposed_route),
  CONSTRAINT exercise_dimension_proposals_exercise_id_exercises_id_fk
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);
```

(If a UNIQUE on `exercise_id` is chosen, replace the plain index with `UNIQUE KEY`.) Do NOT apply locally — CI/prod pipeline applies it (project policy, confirmed in 124 SUMMARY:62).

---

### `el-templo-api/bootstrap-dimensions.ts` (script, batch/transform — HEURISTIC, NO LLM)

**Analog:** `saneo-exercises.ts` (124, structure verbatim) + `backfill-gender.ts` (same family).

**Exported runner for testability** — `saneo-exercises.ts:46-48`:

```typescript
export async function runBootstrap<TSchema extends Record<string, unknown>>(
  db: MySql2Database<TSchema>,
): Promise<void> {
  /* ... */
}
```

**CLI entrypoint + try/finally + main().catch** — `saneo-exercises.ts:35-37, 134-150` (copy exactly, swap the filename guard):

```typescript
import "dotenv/config";
import { createSingleConnection } from "./src/db/index";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
// ...
async function main(): Promise<void> {
  const { db, connection } = await createSingleConnection();
  try {
    await runBootstrap(db);
  } finally {
    await connection.end();
  }
}
if (process.argv[1] && process.argv[1].endsWith("bootstrap-dimensions.ts")) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Bootstrap failed: ${message}`);
    process.exit(1);
  });
}
```

`console.log` is allowed here — it's a standalone CLI, not the server (saneo:26-28 documents the exemption). Run via `npx tsx bootstrap-dimensions.ts`.

**Idempotency pattern (D-06)** — saneo guards every write so re-runs no-op (saneo:79, 104). For the bootstrap this means: only INSERT a proposal where one does not already exist for that exercise. With the optional UNIQUE on `exercise_id`, use `INSERT ... WHERE NOT EXISTS (SELECT 1 FROM exercise_dimension_proposals WHERE exercise_id = e.id)`, or read existing proposal exercise_ids first and skip them. Resumable if it fails mid-run.

**Read → transform → write shape** — bootstrap READS `exercises` (`id, exercise/name, route, route_pending` — saneo:62-66 shows the read pattern via `db.execute(sql\`...\`)`or use typed`db.select`), applies deterministic rules, INSERTs into `exercise_dimension_proposals`. Report counts to console BEFORE mutating (saneo:68-73).

**Heuristic rules to implement (D-05, planner fills the real maps from prod data):**

- **Sub-familia** = base map from `route` code → canonical name (PL→Planche, FL→Front Lever, BL→Back Lever, HS→Handstand, MU→Muscle Up, …). The route already encodes the family/área (CONTEXT specifics + saneo header). Document the full map as a `const` in the script.
- **Leverage** = keyword match on the exercise name: `tuck` / `adv tuck` (advanced) / `straddle` / `half` / `full` and analogs → the `leverage` value; nullable when no keyword matches (D-03: leverage is per-family, nullable).
- **Route (proposed_route)** = ONLY for rows with `route_pending = 1` (D-03). Never overwrite an existing route.
- Do NOT touch `effort` (D-03) and do NOT write any truth column — only insert proposal rows.

`readCount` helper (saneo:122-130) is reusable verbatim for the report counts.

---

### `el-templo-api/src/modules/admin/proposal-service.ts` + admin `routes.ts` (service + route, approval flow)

**Analogs:**

- List/filter: `admin/exercise-service.ts` (`ExerciseService.listExercises`, the filters+pagination+count pattern, lines 46-149).
- Approval write: `admin/service.ts#bulkApprove` (lines 468-480) — `.update().set({status}).where(inArray(...))` returning `affectedRows`.
- Route registration + auth: admin `routes.ts:50-65` (the `onRequest` hook with `fastify.authenticate` + `TRAINING_ROLES` check guards EVERY route in the plugin) and the exercise endpoints at `routes.ts:909-1034` (list/create/PATCH) + `routes.ts:221-234` (bulk-approve route shape).

**Auth — already covered by the plugin-level hook** (`routes.ts:54-64`). Any new route added to `adminRoutes` inherits it. No per-route auth needed:

```typescript
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(TRAINING_ROLES as readonly string[]).includes(request.user.role)) {
    return reply
      .status(403)
      .send({ error: "Acceso de administrador requerido" });
  }
});
```

**List proposals (grouped/filtered by route)** — mirror `ExerciseService.listExercises` (exercise-service.ts:55-136): build `conditions: SQL[]`, optional `route` / `status` filter, `COUNT(*)` for total, then `.select({...}).from(...).where(whereClause).orderBy(...)`. Join `exercises` (and `exercise_subfamilies` if resolving names) so the row carries the exercise name + current route for the review table. Default filter `status = 'pending'`.

**Bulk-accept-group (D-07)** — model on `bulkApprove` (service.ts:468-480) but accept does MORE than flip status: per D-02 it must, inside a transaction, (1) resolve/create the `exercise_subfamilies` row for `proposed_subfamily` and set `exercises.subfamily_id`; (2) set `exercises.leverage`; (3) for route_pending set `exercises.route` + `route_pending = 0`; (4) mark the proposal `accepted`. Wrap in `db.transaction(async (tx) => { ... })` because it spans multiple tables (the bulk-update-equipment route at `routes.ts:1119+` and the inArray update are the simplest analogs; for the truth writes use a tx — sessions edit-service uses transactions throughout).

**Accept route signature** — copy the typed-route shape (`routes.ts:222-234`):

```typescript
fastify.post<{ Body: { ids: number[] } }>(
  "/exercises/proposals/bulk-accept",
  { schema: bulkAcceptSchema },
  async (request) => {
    const count = await proposalService.bulkAccept(
      request.body.ids,
      request.user.userId,
    );
    return { success: true, acceptedCount: count };
  },
);
```

Reject route mirrors this with `.set({ status: "rejected" })` only (no truth writes, D-02). Individual override/accept = same handler with a single id + optional edited fields in the body (inline-edit, D-07).

**Resolve-or-create subfamily helper:** SELECT from `exercise_subfamilies` by `(route, name)`; if none, INSERT (catalog is empty/minimal after 124 per SUMMARY:45) and use `insertId`; then set `exercises.subfamily_id`. Use `.$returningId()` (seen in saneo test:58) for the insert id.

**Error handling:** admin routes use `handleServiceError` from `../shared/error-handler` (imported at `routes.ts:47`) and `request.log.info(...)` for audit (e.g. `routes.ts:1030`). No `console.log`.

---

### `el-templo-admin` review screen — `ProposalReviewPage.vue` + `useProposalsApi.ts` + router entry (component + composable)

**Analogs:** `ExercisesPage.vue` (table + filters + inline edit) + `useExercisesApi.ts` (composable) + `router/routes.ts:36-38` (page registration).

**Composable shape** — copy `useExercisesApi.ts` (ref loading/error, `api` from `src/boot/axios`, `extractError`, `Notify`, `createLogger`). Methods: `fetchProposals(filters)`, `acceptProposal(id, overrides?)`, `rejectProposal(id)`, `bulkAccept(ids)`. Error idiom (useExercisesApi:99-113):

```typescript
async function acceptProposal(id: number, fields?: {...}): Promise<void> {
  try {
    await api.post(`/admin/exercises/proposals/${id}/accept`, fields ?? {});
  } catch (err: unknown) {
    const message = extractError(err, 'Error aceptando propuesta');
    log.error('Failed to accept proposal', { id, error: message });
    Notify.create({ type: 'negative', message });
    throw err;
  }
}
```

Bulk-accept idiom = `useSessionsApi.ts:75-80` (`api.post('/admin/.../bulk-accept', { ids })`).

**Filter bar** — `ExercisesPage.vue:48-138` (q-input search + q-select route/status, `@update:model-value="onFilterChange"`). Group/filter by route per D-07.

**Q-table with inline-editable cells** — `ExercisesPage.vue:139-328`. The name-cell click-to-edit (`:149-184`) and the inline `q-select` for category (`:186-198`, calls `onInlineCategoryChange(props.row.id, val)`) are the exact patterns for inline-editing `proposed_subfamily` / `proposed_leverage` / `proposed_route`. Reuse `body-cell-<col>` slots. Add per-row Accept / Reject buttons + a group-level "Aceptar grupo" button (D-07).

**Script imports** — `ExercisesPage.vue:503-512`:

```typescript
import { ref, reactive, computed, onMounted } from "vue";
import { useQuasar } from "quasar";
import type { QTableProps } from "quasar";
import { useProposalsApi } from "src/composables/useProposalsApi";
```

**Router registration** — `el-templo-admin/src/router/routes.ts`, add a child of `AdminLayout` next to the exercises entry (routes.ts:36-38):

```typescript
{ path: 'proposals', component: () => import('pages/ProposalReviewPage.vue') },
```

Add a nav link in `AdminLayout.vue` (planner to confirm the layout's menu pattern). Types go in `src/types/` (mirror `src/types/exercise.ts`).

---

### `el-templo-api/test/exercises/bootstrap-dimensions.test.ts` (test, CRUD/transform)

**Analog:** `test/exercises/saneo-exercises.test.ts` (124) — same directory, near-identical contract shape.

**Structure to copy verbatim:**

- Header doc block explaining the contract + CI-only note (saneo-test:1-21). MEMORY: do NOT run the suite locally — tsc gate only; ask before pushing to staging for CI.
- `createTestApp()` from `../helpers`, `import * as schema`, `import { runBootstrap } from "../../bootstrap-dimensions"` (saneo-test:23-28).
- `seedExercise(...)` helper using `.insert(schema.exercises).values({...}).$returningId()` with a unique `MARK` so the test only touches its own rows (saneo-test:33-61).
- `afterEach` cleanup: null self-pointers / FK refs first, then delete seeded rows (saneo-test:90-102) — here, delete seeded proposals THEN seeded exercises (FK cascade order).
- `beforeAll`/`afterAll` app lifecycle (saneo-test:86-88, 104-106).

**Cases to cover (D-02/D-06):**

- A — bootstrap inserts a `pending` proposal for an exercise (route→subfamily map applied; leverage keyword matched).
- B — idempotency (D-06): a second `runBootstrap` does NOT create a duplicate proposal for the same exercise.
- C — route_pending exercise gets a `proposed_route`; a routed exercise gets `proposed_route = NULL`.
- D — accept writes truth columns correctly (creates/resolves `exercise_subfamilies`, sets `exercises.subfamily_id` + `leverage`; for route_pending sets `exercises.route` + `route_pending = 0`; proposal → `accepted`). Test the service method directly (like saneo-test drives `runSaneo`), or via the API route using `helpers.ts` auth utilities.
- E — reject marks `rejected` and leaves `exercises` untouched.
- (Optional) F — bulk-accept-group accepts all proposals in a route group.

Real clock (no fake timers — MySQL skew; saneo-test:19).

---

## Shared Patterns

### Auth (all admin endpoints)

**Source:** `el-templo-api/src/modules/admin/routes.ts:54-64` (plugin-level `onRequest` hook, `fastify.authenticate` + `TRAINING_ROLES`).
**Apply to:** every proposal endpoint — inherited automatically when added to `adminRoutes`. No per-route guard.

### One-off idempotent CLI script

**Source:** `el-templo-api/saneo-exercises.ts` (exported `run*(db)` + `createSingleConnection` + try/finally + `main().catch` + filename-guarded CLI + `readCount` helper).
**Apply to:** `bootstrap-dimensions.ts`. `console.log` allowed (CLI, not server).

### Hand-written additive migration

**Source:** `el-templo-api/src/db/migrations/0137_exercise_dimensions_and_saneo.sql` (no `;` in comments, no `IF NOT EXISTS`, Drizzle-convention FK names, `_migrations`-tracked, documented rollback, commit the SQL, never apply locally).
**Apply to:** `0138_create_exercise_dimension_proposals.sql`.

### Status-enum + approval write

**Source:** `evaluation-requests.ts:4,10` (named enum) + `admin/service.ts#bulkApprove:468-480` (`.update().set({status}).where(inArray)` → `affectedRows`).
**Apply to:** proposals `status` column + accept/reject/bulk-accept service methods (accept additionally writes truth columns in a transaction per D-02).

### Admin frontend table + composable

**Source:** `ExercisesPage.vue` (q-table + filters + inline-edit slots) + `useExercisesApi.ts` (axios + extractError + Notify + createLogger).
**Apply to:** `ProposalReviewPage.vue` + `useProposalsApi.ts`. NEVER `console.log` — use `createLogger` (CLAUDE.md).

### Integration test (CI-only, real MySQL)

**Source:** `test/exercises/saneo-exercises.test.ts` (MARK-scoped seeding, `$returningId`, FK-safe `afterEach` cleanup, `runSaneo(app.db)` direct drive).
**Apply to:** `test/exercises/bootstrap-dimensions.test.ts`.

---

## FK / Data-Integrity Constraints Inherited from 124

- **Never delete `exercises` rows.** `exercises.id` is FK-referenced by `session_prescriptions.exercise_id` and `program_content_blocks.exercise_id` (historical sessions/programs) — 0137 header + saneo:10-12. Accept WRITES columns; it never deletes.
- **Truth columns are nullable with `ON DELETE SET NULL`** (`exercises.subfamily_id`, `canonical_exercise_id`). Proposals point at exercises with `ON DELETE CASCADE` (proposals carry no historical weight).
- **Truth-column widths** (`subfamily.name` 150, `exercises.leverage` 50, `exercises.route` 20) — the proposal columns mirror these so accept never truncates.
- **`exercise_subfamilies` catalog is empty/minimal after 124** (SUMMARY:45). The accept flow / bootstrap must resolve-or-CREATE subfamily rows — they will not pre-exist.
- **Read only CONFIRMED dimensions downstream:** the graph (126) reads truth columns, never `pending` proposals (D-01). Keeping proposals in a separate table enforces this.
- **`route` is `NOT NULL` (empty string = "sin ruta")** — route_pending marks the empties (saneo:100-110). The bootstrap proposes `proposed_route` only for `route_pending = 1`.

## No Analog Found

None. Every file has a strong same-codebase analog (124 + admin module + admin frontend).

## Metadata

**Analog search scope:** `el-templo-api/src/db/schema/`, `el-templo-api/src/db/migrations/`, `el-templo-api/src/modules/admin/`, `el-templo-api/src/modules/sessions/`, `el-templo-api/test/exercises/`, `el-templo-admin/src/pages/`, `el-templo-admin/src/composables/`, `el-templo-admin/src/router/`, root `el-templo-api/*.ts` scripts.
**Files scanned:** ~14 read in full/targeted.
**Pattern extraction date:** 2026-06-04

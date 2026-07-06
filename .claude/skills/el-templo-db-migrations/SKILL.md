---
name: el-templo-db-migrations
description: >
  Database schema changes and migrations for El Templo (el-templo-api, Fastify +
  Drizzle ORM + MySQL). Use whenever a task involves: schema change, migration,
  drizzle, drizzle-kit, ALTER TABLE, CREATE TABLE, new column, enum change,
  db:generate, db:migrate, db:push, seed data, backfill, data fix, prod data
  change, staging data, _migrations table, or the migration runner. Covers the
  custom runner, hand-written migration numbering, the semicolon-in-comment trap,
  the shared staging/prod MySQL host trap, and Drizzle gotchas that CI catches
  but tsc does not.
---

# El Templo — Database Migrations Runbook

Everything DB-schema-related lives in the backend app: `el-templo-api/`.
This is the highest-stakes area of the repo. Read the **Hard Rules** first.

## Hard Rules (memorize these)

| #   | Rule                                                                                                                         | Why                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **NEVER run `drizzle-kit migrate`.**                                                                                         | Its `meta/_journal.json` is stale (last entry: `0059_check_in_responses`; real migrations go up to `0169` as of 2026-07-05). The `_migrations` DB table is the ONLY source of truth, local and prod.                 |
| 2   | **NEVER put a `;` inside a `--` SQL comment** in a migration file.                                                           | The runner splits the file on `;` BEFORE stripping comments. A semicolon in a comment splits the migration mid-sentence and leaves orphan comment text as malformed SQL. This broke all of CI once (migration 0119). |
| 3   | **ALWAYS commit the migration `.sql` file in the same commit as the schema change.**                                         | Historically the most frequent miss: schema `.ts` changed, `.sql` forgotten → CI/prod DB drifts from code.                                                                                                           |
| 4   | **Test/mock data NEVER goes in a migration.** Prod data changes ALWAYS go in a migration (never seed re-runs).               | Staging and prod share one MySQL server. Migrations committed on `staging` run against the **prod** database when staging merges to master. See "The shared-host trap".                                              |
| 5   | **`pnpm db:push` is prototyping only** — never in committed work.                                                            | It bypasses `_migrations` tracking entirely.                                                                                                                                                                         |
| 6   | **`mysqlEnum("first_arg", ...)` first argument IS the physical column name** and must match the migration SQL byte-for-byte. | Mismatch = CI fails with `Unknown column`; `tsc` passes green (types come from the TS schema, not the live DB).                                                                                                      |

## Canonical flow (and where it breaks)

The documented flow is:

1. Edit schema files in `el-templo-api/src/db/schema/` (one file per table, exported via `index.ts`).
2. `pnpm db:generate` to produce SQL in `el-templo-api/src/db/migrations/`.
3. Review the generated SQL.
4. `pnpm db:migrate` to apply.

**Reality as of 2026-07-05: step 2 is broken.** `drizzle-kit generate` hits a
pre-existing interactive drift prompt around `sessions.goal_plan_type` (the
column exists in several schema files: `sessions.ts`, `completed-sessions.ts`,
`micro-programs.ts`), and its stale journal would mis-number the output file.
Every recent migration (0153, 0155, 0158 and onward) was **hand-written** for
this reason — their header comments say so explicitly. **Default to
hand-writing migrations.** Only trust `db:generate` output if you have verified
the drift is fixed and the numbering is correct.

Scripts (from `el-templo-api/package.json`):

```bash
cd el-templo-api
pnpm db:generate   # drizzle-kit generate — BROKEN by drift, avoid (see above)
pnpm db:migrate    # tsx src/db/run-migrations.ts — the real apply command
pnpm db:push       # drizzle-kit push — prototyping ONLY, bypasses tracking
pnpm db:studio     # drizzle-kit studio
pnpm db:seed       # tsx src/db/seed.ts
```

Drizzle config: `el-templo-api/drizzle.config.ts` (schema `./src/db/schema`,
out `./src/db/migrations`, dialect mysql, credentials from env, default DB
`eltemplo`).

## Hand-written migration pattern

**Location:** `el-templo-api/src/db/migrations/NNNN_short_snake_name.sql`

**Numbering:** take the highest existing number and add 1. Check with:

```bash
ls el-templo-api/src/db/migrations/*.sql | sort | tail -3
```

The runner applies files in **lexicographic filename order** and records each
filename in `_migrations`. Numbering is therefore a hard ordering constraint —
see "Shipping out of order" below.

**Registration:** there is NO journal to update. The runner discovers every
`*.sql` in the directory automatically; once applied it inserts the filename
into `_migrations`. Do NOT touch `src/db/migrations/meta/` (drizzle-kit's stale
journal — leave it alone).

**Conventions used by recent migrations** (see `0158_planes_notification_category.sql`
as a model):

- Header `--` comment: phase/requirement reference, why hand-written, and any
  invariants (e.g. "enum values appended last, existing order preserved").
- **No `;` inside comments** (Hard Rule 2). If you need rich prose with
  semicolons, use drizzle's `--> statement-breakpoint` delimiter between
  statements instead — the runner detects it and skips the `;`-split entirely.
- Make data statements **idempotent** where practical (`WHERE NOT EXISTS`,
  `INSERT ... SELECT ... WHERE NOT EXISTS`) so a partial re-run cannot
  duplicate rows.
- When ALTERing an enum, **append new values last** so existing values keep
  their order, and keep the value list identical to the `mysqlEnum` in the
  schema file.

**Apply locally:**

```bash
cd el-templo-api && pnpm db:migrate
```

**Verify what's applied** (single-line re-check):

```bash
mysql -u root -p eltemplo -e "SELECT name FROM _migrations ORDER BY name DESC LIMIT 5;"
```

## The runner: `el-templo-api/src/db/run-migrations.ts`

Actual behavior (read from source, as of 2026-07-05):

1. Loads env like the API: `.env.production` if `NODE_ENV=production`, else
   `.env.development`, then `.env`. Connects via `mysql2/promise` using
   `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` (default DB `eltemplo`).
2. `CREATE TABLE IF NOT EXISTS _migrations (id, name UNIQUE, applied_at)` —
   the tracking table.
3. Reads all `*.sql` files in `src/db/migrations/`, **sorted by filename**,
   and skips any whose filename is already in `_migrations`.
4. Splits each file into statements via exported `splitSqlStatements()`:
   - If the file contains `--> statement-breakpoint`, split on that (safe path).
   - **Fallback: split on `;` FIRST, then strip `--` comment lines from each
     fragment.** This is the semicolon trap — the runner's own doc comment
     (line 33) flags it. `test/setup.ts` (`provisionWorkerDB`) uses the same
     parser, so a bad comment also nukes the entire test suite.
5. Executes statements one by one. Error tolerance: errors matching
   `Duplicate column name` / `Duplicate key name` / `Duplicate foreign key` /
   `already exists` / `Can't DROP` are treated as "migration previously
   applied" and skipped; once one such skip happens, **all subsequent errors
   in that file are also skipped**. Any other error before that throws and
   aborts (the filename is NOT recorded, so it re-runs next time).
6. On success, `INSERT INTO _migrations (name) VALUES (?)` per file.

Implications:

- A migration that fails halfway leaves partial changes applied but
  unrecorded — the next run re-executes from the top of the file. This is why
  idempotent statements matter.
- The duplicate-error heuristic means a genuinely wrong statement can be
  silently skipped if an earlier statement in the same file hit a
  "duplicate" error. Keep migrations small and single-purpose.

## CI/CD

- CI (`.github/workflows/ci.yml` and deploy workflows) runs the integration
  test suite against MySQL database(s) named `eltemplo_test*`. Locally, each
  vitest worker provisions its own `eltemplo_test_<POOL_ID>` database using
  the **same** `splitSqlStatements` parser (`el-templo-api/test/setup.ts`), so
  a broken migration file fails every test.
- Deploys (`.github/workflows/deploy.yml` line ~419, `deploy-staging.yml`
  line ~435) run migrations on the server with:
  `NODE_ENV=production node dist/db/run-migrations.js` — the compiled version
  of the exact same runner. Local `pnpm db:migrate` and production are
  identical in behavior; `_migrations` is the single source of truth in both.
- **The deploy does NOT back up the database** — only code is backed up.
  Treat destructive migrations accordingly (see below).

## The shared-host trap (staging + prod = one MySQL)

The EC2 server runs **one MySQL with two databases**: `eltemplo` (prod) and
`eltemplo_staging` (staging clone). They are NOT separate servers — the two
deploy pipelines only differ in `DB_NAME`.

Consequences:

- A migration merged into `staging` applies to `eltemplo_staging` on staging
  deploy, and the SAME file applies to `eltemplo` (prod) when staging merges
  to master. **Every migration you commit will eventually run against prod.**
- **Test/mock/staging-only data must NEVER be a migration.** Use an ad-hoc
  script run over SSH against `eltemplo_staging`, with a hard guard
  (`if (DB_NAME !== 'eltemplo_staging') throw` plus a `SELECT DATABASE()`
  sanity check), and delete the script after. Tag mock rows (e.g. a notes
  marker) for later cleanup.
- **Prod data changes (new branch, plan price fix, backfill) DO go through a
  migration** — targeted `INSERT`/`UPDATE` for just the intended rows. Never
  re-run the production seed script: it touches many tables at once, can
  clobber manually-adjusted prod values, and leaves no `_migrations` audit
  trail. Real examples: `0130_fix_pomilio_renewal_price.sql`,
  `0149_extend_ranieri_memberships.sql`.

## Shipping out of order (numbering conflicts)

Migration numbering is a hard constraint when master and staging diverge —
e.g. staging holds a milestone with migrations 0153–0157 while master is at
0152 and you need a hotfix WITH a migration from master.

Reasoning framework:

- **Code-only hotfix (no migration):** free — branch from `origin/master`,
  ship, then merge master back into staging.
- **Hotfix WITH a migration:** you cannot reuse a number staging already
  occupies (both branches eventually deploy against the same prod DB, and
  filenames must be unique in `_migrations`). Options, in order of preference:
  1. **Land the milestone in master first**, then number the hotfix after the
     milestone's top number. Cleanest.
  2. If the hotfix can't wait: give it the **next number after staging's
     highest** (not master's), verify it is fully independent of the
     milestone's tables, and accept that staging and prod apply migrations in
     divergent order. After shipping to master, merge master→staging
     immediately so both branches carry the same file set.
- Never renumber an already-applied migration — `_migrations` tracks by
  filename, so renaming makes the runner re-apply it.

## Destructive / derived-data migrations (the 0151 pattern)

When a column holds **derived, recalculable** data and its shape changes
(e.g. an enum's value set is replaced), don't write value-mapping logic.
Model: `0151_attendance_label_enum.sql`:

1. `UPDATE table SET col = NULL;` — reset every row first, so no row holds a
   value outside the new enum when the ALTER lands.
2. `ALTER TABLE ... MODIFY COLUMN col enum(...new values...) DEFAULT NULL;`
3. Let the existing recompute path (nightly cron + on-login recalc, in 0151's
   case) repopulate.

Preconditions for using this pattern: the data must be genuinely derivable
from other tables, and a repopulation mechanism must already exist. Remember:
deploys don't back up the DB, so a destructive migration on non-derivable
data has no safety net.

## Drizzle gotchas CI catches but tsc does NOT

These two have each broken CI while `pnpm tsc --noEmit` stayed green, because
TypeScript types come from the schema files, not the live database.

**(a) `mysqlEnum` first arg = physical column name.**
Example from `src/db/schema/notifications.ts`:

```ts
export const notificationCategoryEnum = mysqlEnum("notification_category", [...]);
```

The column in the DB is `notification_category` — regardless of the property
name you assign it to in the table definition. Hand-written migrations
0138/0139 once created columns `status`/`source` while the schema declared
`mysqlEnum("exercise_proposal_status", ...)` → every query failed in CI with
`ER_BAD_FIELD_ERROR: Unknown column`. Before committing a new table/enum,
cross-check:

```bash
grep -n mysqlEnum el-templo-api/src/db/schema/<file>.ts
grep -in enum el-templo-api/src/db/migrations/<file>.sql
```

Names AND value lists (including order) must match byte-for-byte.

**(b) Unqualified columns in `.select()` break correlated subqueries.**
A `sql\`...\``fragment referencing`${schema.table.col}` renders QUALIFIED
(`` `table`.`col` ``) inside `.where()`, but UNQUALIFIED (bare `` `col` ``)
inside `.select({...})`. In a correlated subquery, the bare outer-table
reference resolves to the inner alias's same-named column — the correlation
silently becomes `alias.id <> alias.id` (always false), or errors as ambiguous
when the outer query has JOINs. Real incident: phase 121's
`src/modules/analytics/expiry-cohort.ts` counted every renewer as churn.
**Rule:** inside correlated subqueries in `.select()`, write the outer
reference as a literal prefixed string (`subscriptions.user_id`), not
`${schema.subscriptions.userId}`. To diagnose, print `query.toSQL().sql`.

## Test databases

- Integration tests run against real MySQL. CI provisions `eltemplo_test`;
  locally each vitest worker creates `eltemplo_test_<POOL_ID>` (see
  `el-templo-api/test/setup.ts`) by applying the migration files with the
  runner's own parser. So the migrations directory IS the test schema — a
  malformed file fails the whole suite.
- Run: `cd el-templo-api && pnpm test` (project convention is to let the full
  suite run in CI; run locally only the specific new test file plus a local
  typecheck).

## Pre-flight checklist for any schema change

1. [ ] Schema edited in `el-templo-api/src/db/schema/` (and exported in `index.ts` if a new file).
2. [ ] Hand-written `.sql` in `el-templo-api/src/db/migrations/`, numbered = highest existing + 1 (check BOTH branches if master/staging diverge).
3. [ ] No `;` inside any `--` comment (or use `--> statement-breakpoint`).
4. [ ] `mysqlEnum` first args and enum value lists match the SQL byte-for-byte; new enum values appended last.
5. [ ] No test/mock data in the migration (it WILL run on prod).
6. [ ] Data statements idempotent where practical.
7. [ ] `pnpm db:migrate` applied clean locally; `SELECT name FROM _migrations ORDER BY name DESC LIMIT 1` shows it.
8. [ ] `.sql` file staged in the SAME commit as the schema change (stage by explicit path, never `git add -A`).
9. [ ] New/changed API behavior has an integration test in `el-templo-api/test/`.

## When NOT to use this skill

- Branching strategy, what ships where, push approvals, hotfix trains →
  `el-templo-change-control` (this skill only covers the migration-numbering
  consequences of shipping out of order).
- Diagnosing runtime bugs, failing tests, 500s → `el-templo-debugging-playbook`.
- Running the apps, env setup, build/deploy mechanics beyond the migration
  step → `el-templo-build-and-run`.
- Past incident history and why conventions exist → `el-templo-failure-archaeology`.

## Provenance & maintenance

Written 2026-07-05 from: `el-templo-api/src/db/run-migrations.ts` (read in
full), `el-templo-api/package.json` db scripts, `drizzle.config.ts`,
`src/db/migrations/` (latest: `0169_plan_programs.sql`; journal stale at
`0059`), migrations 0151/0153/0155/0158, `test/setup.ts`,
`.github/workflows/{ci,deploy,deploy-staging}.yml`, and root `CLAUDE.md`.

One-line re-verifications:

- Last applied migration: `mysql -u root -p eltemplo -e "SELECT name FROM _migrations ORDER BY name DESC LIMIT 1;"`
- Is `db:generate` still broken? Run `cd el-templo-api && pnpm db:generate` in a throwaway worktree; if it prompts interactively about `goal_plan_type` or numbers the file near 0060, it's still broken — hand-write.
- Runner behavior drifted? Re-read `src/db/run-migrations.ts` — especially `splitSqlStatements()` and the duplicate-error skip logic.

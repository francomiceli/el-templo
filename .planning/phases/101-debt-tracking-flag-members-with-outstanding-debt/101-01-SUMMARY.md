---
phase: 101-debt-tracking-flag-members-with-outstanding-debt
plan: 01
subsystem: api/db
tags: [schema, migration, debt, mysql, drizzle]
dependency_graph:
  requires:
    - el-templo-api/src/db/schema/users.ts (FK target)
    - el-templo-api/src/db/run-migrations.ts (migration runner)
  provides:
    - el-templo-api/src/db/schema/debts.ts (Drizzle schema for debts + debtsRelations)
    - el-templo-api/src/db/migrations/0096_debts_table.sql (applied migration)
    - MySQL table `debts` (one-active-debt-per-user, service-enforced invariant)
  affects:
    - el-templo-api/src/db/schema/index.ts (now re-exports ./debts)
tech_stack:
  added: []
  patterns:
    - Drizzle mysqlTable with composite service-invariant index
    - Hand-written SQL migration (no drizzle-kit generate — avoids interactive prompts, matches Phase 86/98/100 precedent)
    - Soft-cancel via is_cancelled + cancelled_at (no DELETE)
key_files:
  created:
    - el-templo-api/src/db/schema/debts.ts
    - el-templo-api/src/db/migrations/0096_debts_table.sql
    - .planning/phases/101-debt-tracking-flag-members-with-outstanding-debt/101-01-SUMMARY.md
  modified:
    - el-templo-api/src/db/schema/index.ts
decisions:
  - Migration renumbered from 0094 -> 0096: Phase 100 shipped earlier and claimed 0094 (session_blocks.custom_title) and 0095 (insert_games_format). Using the next free slot.
  - currency declared as VARCHAR(3) DEFAULT 'ARS' (per D-06, mirrors subscriptions/payments)
  - One-active-debt-per-user invariant enforced at service layer, not via DB partial unique index (MySQL lacks partial unique indexes)
  - FK fk_debts_user_id has no ON DELETE / ON UPDATE clause — users are soft-deleted via users.deleted_at, no cascade needed
  - CREATE TABLE (no IF NOT EXISTS) — run-migrations.ts tracker is the idempotency layer
metrics:
  duration_sec: 84
  completed_date: "2026-04-22"
  tasks_completed: 3
  files_touched: 3
---

# Phase 101 Plan 01: Debts Schema & Migration Summary

**One-liner:** Created `debts` table (Drizzle schema + raw SQL migration 0096) with a service-layer "one active debt per user" invariant enforced via the `idx_debts_user_active(user_id, is_cancelled)` composite index, soft-cancel semantics, and per-debt currency — ready for Plan 02's service + API to query.

## What Was Built

**Drizzle schema** — `el-templo-api/src/db/schema/debts.ts`:

```typescript
export const debts = mysqlTable(
  "debts",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    amount: int("amount").notNull(),
    currency: varchar("currency", { length: 3 }).default("ARS").notNull(),
    note: text("note"),
    isCancelled: boolean("is_cancelled").default(false).notNull(),
    cancelledAt: timestamp("cancelled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_debts_user_id").on(table.userId),
    index("idx_debts_user_active").on(table.userId, table.isCancelled),
  ],
);

export const debtsRelations = relations(debts, ({ one }) => ({
  user: one(users, { fields: [debts.userId], references: [users.id] }),
}));
```

**Migration** — `el-templo-api/src/db/migrations/0096_debts_table.sql`: pure DDL `CREATE TABLE debts` with the same column set, FK `fk_debts_user_id`, and both indexes. Zero data statements (no seeds/backfill — table is net-new).

**Barrel** — `el-templo-api/src/db/schema/index.ts`: added `export * from "./debts"` right after `./payments`.

## Exact Column Definitions (As Applied)

Verified via `SHOW CREATE TABLE debts` against the local dev MySQL:

```sql
CREATE TABLE `debts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `amount` int NOT NULL,
  `currency` varchar(3) NOT NULL DEFAULT 'ARS',
  `note` text,
  `is_cancelled` tinyint(1) NOT NULL DEFAULT '0',
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_debts_user_id` (`user_id`),
  KEY `idx_debts_user_active` (`user_id`,`is_cancelled`),
  CONSTRAINT `fk_debts_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

Notes:

- `BOOLEAN` -> MySQL `tinyint(1)` with `DEFAULT '0'` (standard mapping, matches D-02's `BOOLEAN ... DEFAULT FALSE`).
- `TEXT NULL` shows as just `text` in MySQL output (NULL is the column's default nullability since no `NOT NULL` was specified).
- All indexes and FK created exactly as specified.

## Drizzle vs Raw SQL Ambiguity

**None.** The Drizzle schema and the raw SQL DDL are 1:1:

| Drizzle                                                        | SQL                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `int("id").primaryKey().autoincrement()`                       | `id INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (id)`                                    |
| `int("user_id").references(() => users.id).notNull()`          | `user_id INT NOT NULL` + `FOREIGN KEY ... REFERENCES`                                 |
| `int("amount").notNull()`                                      | `amount INT NOT NULL`                                                                 |
| `varchar("currency", { length: 3 }).default("ARS").notNull()`  | `currency VARCHAR(3) NOT NULL DEFAULT 'ARS'`                                          |
| `text("note")`                                                 | `note TEXT NULL`                                                                      |
| `boolean("is_cancelled").default(false).notNull()`             | `is_cancelled BOOLEAN NOT NULL DEFAULT FALSE` (tinyint(1))                            |
| `timestamp("cancelled_at")`                                    | `cancelled_at TIMESTAMP NULL`                                                         |
| `timestamp("created_at").defaultNow().notNull()`               | `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`                             |
| `timestamp("updated_at").defaultNow().onUpdateNow().notNull()` | `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` |
| `index("idx_debts_user_id").on(table.userId)`                  | `INDEX idx_debts_user_id (user_id)`                                                   |
| `index("idx_debts_user_active").on(table.userId, isCancelled)` | `INDEX idx_debts_user_active (user_id, is_cancelled)`                                 |

Plan 02 can safely `drizzle-insert/select` against this schema with no shape mismatch.

## `_migrations` Table Record

Verified via SELECT:

```
SELECT name FROM _migrations WHERE name = '0096_debts_table.sql';
--> [{"name":"0096_debts_table.sql"}]
```

Migration is recorded as applied. Re-running `pnpm db:migrate` will be a no-op against the local dev DB.

## Deviations from Plan

### 1. [Renumber] Migration filename 0094 -> 0096

- **Found during:** Task 2 (before writing the file) — the executor context flagged it and Task 1 Read confirmed it.
- **Issue:** Plan 101-01 (frontmatter + D-14 + task action block) specified `0094_debts_table.sql`. That filename was already taken by Phase 100's `0094_session_blocks_custom_title.sql`. Phase 100 also shipped `0095_insert_games_format.sql`.
- **Fix:** Renamed target to `0096_debts_table.sql` (the next free slot). Added a migration numbering note to the migration header comment so future readers understand the jump. Updated Plan 02 coordination implicitly — Plan 02 must not reference the old 0094 filename. Frontmatter `files_modified` still lists `0094_debts_table.sql` (historical accuracy of the plan — not updated, since the plan is an immutable artifact).
- **Files modified:** `el-templo-api/src/db/migrations/0096_debts_table.sql` (named differently than plan's path)
- **Commits:** Task 2 commit `ebbf868c`

No other deviations. Plan executed exactly as written for Task 1 and Task 3.

## Commits

| Task | Name                                                | Commit   | Files                                                                                    |
| ---- | --------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| 1    | Create Drizzle schema `debts.ts` + barrel re-export | 18bad2bf | el-templo-api/src/db/schema/debts.ts, el-templo-api/src/db/schema/index.ts               |
| 2    | Write raw SQL migration (renumbered to 0096)        | ebbf868c | el-templo-api/src/db/migrations/0096_debts_table.sql                                     |
| 3    | [Checkpoint auto-approved] Apply migration          | —        | (applied migration; no new file commits — `_migrations` row is DB state, not repo state) |

## Auth Gates

None — this plan is pure DB schema + local migration, no auth involved.

## Known Stubs

None — this plan is schema foundation only; no UI data flows are wired yet (Plan 02/03 will do that).

## Threat Flags

No new threat surface beyond what the plan's `<threat_model>` already enumerated. The FK `fk_debts_user_id` mitigates T-101-01; the composite index `idx_debts_user_active` mitigates T-101-02; T-101-03 and T-101-04 are accepted per the plan.

## Success Criteria

- [x] `el-templo-api/src/db/schema/debts.ts` matches D-02 column-for-column
- [x] `el-templo-api/src/db/schema/index.ts` re-exports `./debts`
- [x] `el-templo-api/src/db/migrations/0096_debts_table.sql` created, pure DDL (renumbered from 0094 per context rule)
- [x] `pnpm db:migrate` applied locally; `debts` table visible via `SHOW CREATE TABLE`
- [x] Typecheck passes on the API package (`npx tsc --noEmit` clean)
- [x] All files committed together (schema + migration, per CLAUDE.md rule)

## Self-Check: PASSED

- FOUND: `el-templo-api/src/db/schema/debts.ts`
- FOUND: `el-templo-api/src/db/migrations/0096_debts_table.sql`
- FOUND: commit `18bad2bf` (Task 1)
- FOUND: commit `ebbf868c` (Task 2)
- FOUND: MySQL `debts` table with correct shape (verified via `SHOW CREATE TABLE`)
- FOUND: `_migrations` row for `0096_debts_table.sql`

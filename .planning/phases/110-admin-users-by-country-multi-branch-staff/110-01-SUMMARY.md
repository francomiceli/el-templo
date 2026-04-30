---
phase: 110-admin-users-by-country-multi-branch-staff
plan: 01
subsystem: api/db-schema
tags:
  [schema, migration, drizzle, mysql, permissions, country-scope, multi-branch]
requires:
  - el-templo-api/src/db/schema/users.ts (existing column list)
  - el-templo-api/src/db/schema/branches.ts (FK target for user_branches.branch_id)
  - el-templo-api/src/db/schema/index.ts (barrel export wiring)
provides:
  - users.country column (varchar(2), nullable)
  - user_branches join table (id PK + unique (user_id, branch_id))
  - migration 0107_admin_users_by_country.sql with atomic backfill
affects:
  - Plan 110-02 (runs `pnpm db:migrate` to apply 0107)
  - Plan 110-03+ (consumes new schema in country-scope.ts, branch-access.ts, services)
tech-stack:
  added: []
  patterns:
    - drizzle junction table convention (id PK + uniqueIndex) — blogPostTags analog
    - migration with atomic backfill — Phase 98 D-14/D-15 idiom (0091_*.sql analog)
    - Phase 103-01 SQL splitter gotcha — no inline ';' in comments
key-files:
  created:
    - el-templo-api/src/db/schema/user-branches.ts
    - el-templo-api/src/db/migrations/0107_admin_users_by_country.sql
  modified:
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/db/schema/index.ts
decisions:
  - "Junction-table convention (id PK + unique index) chosen over SPEC R2 literal composite PK — matches every existing junction table in the codebase (blog_post_tags etc.); zero migration runner risk; same uniqueness invariant"
  - "users.country left nullable — owner stays NULL (D-12 global-by-role); member/coach/recepcion stay NULL (their scope is via other columns/tables)"
  - "users.branch_id stays NOT NULL for ALL roles — redefined as 'sede personal de entrenamiento' (REQ-4), distinct from operational scope tables"
  - "No transaction wrapper in migration — MySQL DDL auto-commits; idempotency achieved via UPDATE guard (`country IS NULL`) + INSERT IGNORE"
  - "No index on users.country — small cardinality (2-3 values), low query volume; Phase 98 D-14 omitted index on branches.country for the same reason"
metrics:
  duration: 177s
  completed: 2026-04-30
---

# Phase 110 Plan 01: Admin users por país + multi-sede staff — schema + migration

## One-liner

Drizzle schema declares `users.country varchar(2)` (nullable) plus new `user_branches` join table with cascade FKs; migration 0107 ALTER + CREATE TABLE + atomic backfill ready for Plan 02 to apply.

## Tasks Completed

| #   | Task                                                                             | Commit     | Files                                                                                        |
| --- | -------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| 1   | Add `users.country` column to Drizzle schema + document `branch_id` semantics    | `9ce2f4f6` | `el-templo-api/src/db/schema/users.ts`                                                       |
| 2   | Create `user-branches.ts` schema file + register in barrel export                | `9edc561b` | `el-templo-api/src/db/schema/user-branches.ts` (NEW), `el-templo-api/src/db/schema/index.ts` |
| 3   | Write migration `0107_admin_users_by_country.sql` with ALTER + CREATE + backfill | `d7144350` | `el-templo-api/src/db/migrations/0107_admin_users_by_country.sql` (NEW)                      |

## What changed

**Schema (Drizzle):**

- `users` gains a new `country: varchar("country", { length: 2 })` column inserted between `branchId` and `level`. Nullable. NOT NULL is enforced conceptually at the service layer in Plan 03+ for admin/gestion.
- `users.branchId` declaration is now prefixed by a documentation block clarifying that it is the user's **sede personal de entrenamiento** — distinct from the new operational scope tables. Type/`.notNull()` unchanged.
- New `user_branches` table declared with `id` autoincrement PK, `userId` + `branchId` (both `.notNull()`, both `.references(...).onDelete: "cascade"`), unique index `user_branch_unique` on the natural key, and per-column lookup indexes.
- `db/schema/index.ts` barrel re-exports `./user-branches` next to `./users` (auth-related grouping).

**Migration (`0107_admin_users_by_country.sql`):**

- Statement 1: `ALTER TABLE users ADD COLUMN country VARCHAR(2) NULL`.
- Statement 2: `CREATE TABLE user_branches (...)` with the same shape as the Drizzle declaration (FK CASCADE inline, unique key + indexes).
- Statement 3: `UPDATE users SET country = (SELECT country FROM branches WHERE branches.id = users.branch_id) WHERE role IN ('admin','gestion') AND country IS NULL` — backfill guarded by `IS NULL` for replay safety.
- Statement 4: `INSERT IGNORE INTO user_branches (user_id, branch_id) SELECT id, branch_id FROM users WHERE role IN ('coach','recepcion')` — `INSERT IGNORE` skips on unique-key conflict, idempotent.

No transaction wrapper (MySQL DDL auto-commits). Idempotency achieved via the `_migrations` tracker plus the UPDATE/INSERT guards.

## Deviations from Plan

### Surfaced (intentional, plan-acknowledged)

**1. [Plan-acknowledged deviation from SPEC R2] Composite PK → autoincrement-id + unique index**

- **SPEC §Requirement 2 literal text:** `PRIMARY KEY (user_id, branch_id)`.
- **What was built:** `id INT AUTO_INCREMENT PRIMARY KEY` + `UNIQUE KEY user_branch_unique (user_id, branch_id)`.
- **Reason:** The codebase has zero composite-PK tables; every existing junction table (`blog_post_tags`, etc.) uses the autoincrement-id + unique-index pattern. The migration runner (`run-migrations.ts`) has no precedent applying composite-PK DDL. The unique index achieves the same uniqueness invariant — a `(user_id, branch_id)` tuple cannot be duplicated — without runner risk.
- **Impact:** None functional. Future joins on `user_branches.user_id` / `user_branches.branch_id` still hit the per-column lookup indexes. The redundant `id` column costs ~4 bytes/row at trivial cardinality (a few rows per coach/recepción).
- **Surfaced:** PATTERNS.md "Pattern caveat" called this out; PLAN Task 2 acknowledged the deviation; documented here per PLAN's `<output>` directive.

### Auto-fixed Issues

None — plan executed exactly as written.

## Acceptance Criteria

- [x] `grep -c 'country: varchar("country", { length: 2 })' el-templo-api/src/db/schema/users.ts` returns 1.
- [x] `grep -c "Phase 110:" el-templo-api/src/db/schema/users.ts` returns 2 (column comment + branchId semantic comment).
- [x] `users.branch_id` retains `.notNull()` (no nullable change).
- [x] `el-templo-api/src/db/schema/user-branches.ts` exists with `userBranches` declaration, 2 cascade FKs, unique-index `user_branch_unique`.
- [x] `el-templo-api/src/db/schema/index.ts` re-exports `./user-branches`.
- [x] `0107_admin_users_by_country.sql` exists with exactly 4 SQL statements (ALTER, CREATE TABLE, UPDATE, INSERT IGNORE).
- [x] No inline `;` inside SQL line comments (Phase 103-01 splitter gotcha verified clean).
- [x] `cd el-templo-api && pnpm tsc --noEmit` exits 0 after each task.

## Threat Surface Notes

No new security-relevant surface introduced beyond what the threat register (PLAN `<threat_model>`) anticipated:

- **T-110-01-01** (migration backfill tampering) — mitigated as planned via `IS NULL` guard + `INSERT IGNORE`.
- **T-110-01-04** (composite-PK deviation EoP) — mitigated as planned: the unique-index enforces the same uniqueness invariant; no row can violate `(user_id, branch_id)` uniqueness.
- No new endpoints, auth paths, or trust boundaries introduced — schema-only plan.

## Out of Scope (explicitly NOT done in this plan)

- `pnpm db:migrate` was **not** executed. Plan 02 owns running the migration in local + staging.
- Hook `country-scope.ts` extension to populate `branchIds` and `role` — Plan 03.
- `canAccessBranch` helper + `requireBranchAccess` preHandler — Plan 04+.
- Service-level cardinality validation, UI form changes, endpoint scope-eados — Plans 05–09 per the wave map.

## Self-Check: PASSED

**Files exist:**

- `el-templo-api/src/db/schema/users.ts` — modified
- `el-templo-api/src/db/schema/user-branches.ts` — created
- `el-templo-api/src/db/schema/index.ts` — modified
- `el-templo-api/src/db/migrations/0107_admin_users_by_country.sql` — created

**Commits exist on master:**

- `9ce2f4f6` feat(110-01): add users.country column + branch_id semantics docs
- `9edc561b` feat(110-01): add user_branches join table schema
- `d7144350` feat(110-01): add migration 0107 for users.country + user_branches with backfill

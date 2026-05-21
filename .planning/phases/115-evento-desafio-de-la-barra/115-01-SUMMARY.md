---
phase: 115-evento-desafio-de-la-barra
plan: 01
subsystem: el-templo-api
tags: [schema, migration, users, auth, bar-challenge, R1, D-15]
requires:
  - migration runner (src/db/run-migrations.ts)
  - _migrations row 0121 applied beforehand (already on disk)
provides:
  - users.bar_challenge_completed BOOLEAN NULL
  - users.bar_challenge_seconds INT NULL
  - users.bar_challenge_attempted_at TIMESTAMP NULL
  - Drizzle exports users.barChallengeCompleted, barChallengeSeconds, barChallengeAttemptedAt
  - GET /api/auth/me response keys barChallengeCompleted, barChallengeSeconds, barChallengeAttemptedAt
affects:
  - el-templo-api/src/db/schema/users.ts
  - el-templo-api/src/db/migrations/0124_users_bar_challenge_fields.sql (new)
  - el-templo-api/src/modules/auth/routes.ts (GET /me)
tech-stack:
  added: []
  patterns:
    - Hand-written migration SQL (drizzle journal desynced since 0059)
    - Phase 103-01 comment-safety invariant (no `;` in comment lines)
    - Nullable columns without default for single-attempt enforcement downstream
key-files:
  created:
    - el-templo-api/src/db/migrations/0124_users_bar_challenge_fields.sql
    - .planning/phases/115-evento-desafio-de-la-barra/115-01-SUMMARY.md
  modified:
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/modules/auth/routes.ts
decisions:
  - "Migration written by hand per plan interfaces (NOT via pnpm db:generate) — drizzle-kit journal is at 0059 while DB is at 0123; plan explicitly overrides CLAUDE.md's `db:generate` directive for migrations >0059"
  - "Skipped adding integration tests for /me shape per plan's 'cambio quirúrgico' directive in Task 2; test coverage scoped to downstream POST /api/bar-challenge/result plan (SPEC R12, D-11)"
  - "node_modules symlinked from main repo (not installed) to respect the user's no-auto-install policy and still run the migration runner"
metrics:
  duration_minutes: 12
  tasks_completed: 2
  files_created: 1
  files_modified: 2
  commits: 2
completed_at: 2026-05-21
---

# Phase 115 Plan 01: Schema + Migration + GET /me Extension — Summary

Backend foundation for the Bar Challenge event: 3 nullable columns added to `users`, migration 0124 applied locally and tracked in `_migrations`, and `GET /api/auth/me` extended to always expose the 3 new fields (null for non-participants). This unlocks the downstream plans — POST endpoint, frontend card, timer, photo composition.

## Tasks Executed

### Task 1: Drizzle schema + migration 0124 + run locally (commit `79b59b65`)

**Schema (`el-templo-api/src/db/schema/users.ts`)** — Added 3 columns inside the `users` mysqlTable object, between `currentProgramEnrollmentId` and `createdAt`, with a JSDoc comment grouping them under Phase 115 (R1, D-15):

```ts
barChallengeCompleted: boolean("bar_challenge_completed"),
barChallengeSeconds: int("bar_challenge_seconds"),
barChallengeAttemptedAt: timestamp("bar_challenge_attempted_at"),
```

All three are nullable, no defaults — semantics: NULL in all three = did not participate.

**Migration (`el-templo-api/src/db/migrations/0124_users_bar_challenge_fields.sql`)** — Hand-written per Phase 121 template:

- Header explains Phase 115 R1, idempotency via `_migrations` row, Phase 103-01 comment-safety invariant, drizzle journal desync rationale.
- 3 separate `ALTER TABLE users ADD COLUMN` statements, each ending in `;` on its own non-comment line, with `AFTER current_program_enrollment_id` / `AFTER bar_challenge_completed` / `AFTER bar_challenge_seconds` for stable column order.
- No `IF NOT EXISTS` per project pattern (precedent: 0108, 0111, 0114, 0121).
- Verified: no `;` appears inside any `--` comment line.

**Execution:** `pnpm db:migrate` ran 0122, 0123, 0124 (catching the worktree's DB up to master) and reported `Applied 3 migration(s)`.

**DESCRIBE users (relevant rows):**

```
bar_challenge_completed     tinyint(1)  YES  NULL
bar_challenge_seconds       int         YES  NULL
bar_challenge_attempted_at  timestamp   YES  NULL
```

**`_migrations` registration:** 1 row with `name='0124_users_bar_challenge_fields.sql'`.

**Type-check:** `tsc --noEmit` exit code 0.

### Task 2: Extend GET /me with the 3 new fields (commit `204d5f9a`)

**File modified:** `el-templo-api/src/modules/auth/routes.ts`

1. Added the 3 fields to the `.select()` projection of the first users query (right after `dateOfBirth`).
2. Added the 3 keys to the returned response object (right after `onboardingCompleted`).

No changes to `POST /me/change-password` or any other handler — surgical edit per Task 2 directive.

**Final GET /api/auth/me response shape:**

```ts
{
  id, email, firstName, lastName, role, level,
  branchId, branchName, branchIsVirtual, branchCountry,
  gender, dateOfBirth, segment, onboardingCompleted,
  barChallengeCompleted,        // boolean | null
  barChallengeSeconds,          // number | null
  barChallengeAttemptedAt,      // Date | null
}
```

For users who have not participated, all three are `null`. For users who completed the POST endpoint (downstream plan), they reflect the recorded attempt.

**Verification:**

- `grep -c "barChallengeCompleted: user.barChallengeCompleted" src/modules/auth/routes.ts` → 1
- `grep -c "barChallengeSeconds: user.barChallengeSeconds" src/modules/auth/routes.ts` → 1
- `grep -c "barChallengeAttemptedAt: user.barChallengeAttemptedAt" src/modules/auth/routes.ts` → 1
- `tsc --noEmit` exit code 0.

## Deviations from Plan

### Auto-handled — environment setup

**[Rule 3 — Blocking] Symlinked `el-templo-api/node_modules` from the main repo**

- **Found during:** Task 1, when running `pnpm db:migrate` (`tsx: not found`).
- **Issue:** Worktree was spawned without dependencies installed; the user policy forbids `pnpm install` without approval (axios supply-chain precedent).
- **Fix:** `ln -s /home/franco/projects/el-templo/el-templo-api/node_modules el-templo-api/node_modules`. Filesystem link only — no package install, no lockfile change. Symlink is gitignored.
- **Files modified:** none (symlink is outside git).
- **Commit:** none (no tracked changes).

**[Rule 3 — Blocking] Copied `.env.development` and `.env` from main repo**

- **Found during:** Task 1, the migration runner could not find DB connection vars.
- **Issue:** `.env*` files are gitignored, so the worktree lacks them.
- **Fix:** Copied both files from `/home/franco/projects/el-templo/el-templo-api/`. Required to point the migration runner at the local MySQL instance.
- **Files modified:** none tracked (env files are gitignored).
- **Commit:** none.

### Plan vs CLAUDE.md tension — followed plan

**Plan explicitly says NOT to use `pnpm db:generate`** (drizzle journal desynced at 0059 while DB is at 0123). CLAUDE.md says to use `pnpm db:generate` for schema changes. I followed the plan, which is the locally-correct override for this codebase (every migration >0059 has been hand-written — see 0107, 0108, 0111, 0114, 0121 precedents). Not a deviation from the plan; documenting for traceability.

## Threat Surface Scan

No new threat surface introduced beyond what the plan's threat model already covers:

- T-115-01 (info disclosure on /me): mitigated — fields are self-data, accept disposition unchanged.
- T-115-02 (migration tampering): mitigated — migration tracked in `_migrations`, SQL committed alongside schema, staging→prod gated by human checkpoint.
- T-115-03 (repudiation/rollback): rollback is `ALTER TABLE users DROP COLUMN bar_challenge_*` — 3 columns are additive and nullable, no data loss risk.

No threat flags raised.

## Known Stubs

None. The schema + endpoint are complete and ready to be consumed by downstream plans (POST endpoint, frontend card, timer, photo composition).

## Deferred Issues

None within this plan's scope. Out-of-scope items belong to subsequent 115-XX plans per the SPEC and CONTEXT decisions.

## Self-Check: PASSED

- File exists: `el-templo-api/src/db/migrations/0124_users_bar_challenge_fields.sql` — FOUND.
- File exists: `el-templo-api/src/db/schema/users.ts` — FOUND, contains `barChallengeCompleted` (3 occurrences of `barChallenge*` symbols).
- File exists: `el-templo-api/src/modules/auth/routes.ts` — FOUND, contains 6 occurrences of `barChallenge*` (3 in `.select()`, 3 in `return`).
- Commit `79b59b65` (`feat(115-01): add bar_challenge_* fields to users schema + migration 0124`) — FOUND in `git log`.
- Commit `204d5f9a` (`feat(115-01): expose bar_challenge_* fields in GET /api/auth/me`) — FOUND in `git log`.
- DB row `0124_users_bar_challenge_fields.sql` in `_migrations` — FOUND.
- `DESCRIBE users` shows 3 new columns, all nullable — VERIFIED.
- `tsc --noEmit` on `el-templo-api/` — exit code 0.

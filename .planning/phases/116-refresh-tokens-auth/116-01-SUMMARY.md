---
phase: 116-refresh-tokens-auth
plan: 01
subsystem: auth
tags: [jwt, refresh-tokens, drizzle, mysql, fastify, sha256]

# Dependency graph
requires:
  - phase: 116-context
    provides: locked decisions D-01..D-05 + SPEC requirements 1/3/5/6
provides:
  - "Drizzle schema refresh_tokens (FK users CASCADE, self-FK replacedById SET NULL, unique token_hash) + migration 0125 committed (NOT applied)"
  - "RefreshTokenService: issue/rotate/revoke/revokeAllForUser with reuse detection, hash-only persistence, rotate returns { newToken, userId }"
  - "RefreshTokenError typed error (code REFRESH_INVALID) for route layer to map to 401"
  - "fastify.accessTokenExpiresIn decorator (30m) exposed to routes; legacy token sign stays 7d"
  - "JWT_ACCESS_EXPIRES_IN=30m env var documented"
affects: [116-02 routes (refresh/logout/login/register/change-password/delete-account), 116-04 member-app, 116-05 admin]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Opaque refresh token persisted as sha256 hex only (plaintext never stored)"
    - "Rotation chain via replaced_by_id self-FK + reuse detection revokes whole family"
    - "Constructor DI (db, log) service pattern (Phase 56)"
    - "Per-call @fastify/jwt sign expiry override exposed via instance decorator"

key-files:
  created:
    - el-templo-api/src/db/schema/refresh-tokens.ts
    - el-templo-api/src/db/migrations/0125_create_refresh_tokens.sql
    - el-templo-api/src/modules/auth/refresh-token-service.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/plugins/auth.ts
    - el-templo-api/.env.example

key-decisions:
  - "RefreshTokenError(code=REFRESH_INVALID) is the typed 401 signal; route layer (Plan 02) maps it"
  - "rotate returns { newToken, userId } — userId comes free from the validated row, saving Plan 02 a query"
  - "revokeAllForUser uses sql\`NOW()\` (DB clock); single-row updates use new Date() (JS clock) — acceptable, no transaction since all ops are single-statement"
  - "Migration 0125 hand-written (drizzle-kit journal desynced at 0059) — schema file is canonical"

patterns-established:
  - "Refresh token hash-only persistence: createHash(sha256).update(plain).digest(hex)"
  - "Reuse detection: revoked-token replay -> revokeAllForUser + throw RefreshTokenError"

requirements-completed: [Req1, Req3, Req5, Req6]

# Metrics
duration: 3min
completed: 2026-05-25
---

# Phase 116 Plan 01: Refresh Token Foundation Summary

**refresh_tokens schema + migration 0125, RefreshTokenService (issue/rotate/revoke + reuse detection, sha256 hash-only) and 30m access-token expiry decorator — the persistence + domain layer that Plan 02 wires into routes.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-25T20:19:46Z
- **Completed:** 2026-05-25T20:22:52Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- `refresh_tokens` Drizzle schema + committed migration 0125 (FK user_id CASCADE, self-FK replaced_by_id SET NULL, unique token_hash, index on user_id). Migration is committed but NOT applied (Plan 02 [BLOCKING] owns the run).
- `RefreshTokenService` with `issue`/`rotate`/`revoke`/`revokeAllForUser`, reuse detection that revokes the whole family, hash-only persistence, warn-level failure logging, and `rotate()` returning `{ newToken, userId }`.
- 30m access expiry exposed to routes via `fastify.accessTokenExpiresIn` decorator + `JWT_ACCESS_EXPIRES_IN=30m` env var; legacy `token` sign default left at 7d and `fastify.authenticate` untouched (Req 8 no-change).

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema + barrel export + migration 0125** - `810bebb2` (feat)
2. **Task 2: RefreshTokenService** - `7de5cd21` (feat)
3. **Task 3: Access 30m decorator + env var** - `b0bc73cd` (feat)

_Task 2 is marked `tdd="true"` but its plan-defined verification is tsc + grep (no test file in this plan's `files_modified`); the integration test suite `test/auth/refresh.test.ts` is owned by a later plan per PATTERNS.md. Single feat commit per the plan's actual verify gate._

## Files Created/Modified

- `el-templo-api/src/db/schema/refresh-tokens.ts` - Drizzle table refresh_tokens + relations (sha256 hash, sliding expiry, rotation chain)
- `el-templo-api/src/db/migrations/0125_create_refresh_tokens.sql` - DDL CREATE TABLE refresh_tokens (committed, not applied)
- `el-templo-api/src/db/schema/index.ts` - barrel export of refresh-tokens
- `el-templo-api/src/modules/auth/refresh-token-service.ts` - RefreshTokenService + RefreshTokenError
- `el-templo-api/src/plugins/auth.ts` - accessTokenExpiresIn decorator + type augmentation
- `el-templo-api/.env.example` - JWT_ACCESS_EXPIRES_IN=30m

## Decisions Made

- `rotate()` returns `{ newToken, userId }` (userId derived from the validated row already in memory) so Plan 02 signs the access JWT without re-querying.
- Typed `RefreshTokenError` (`code: "REFRESH_INVALID"`) used for unknown/expired/reused tokens; route layer maps to 401.
- `revokeAllForUser` uses `sql\`NOW()\``(DB clock); per-row single updates use`new Date()`. All operations are single-statement, so no transaction is opened (per plan note).
- Migration 0125 hand-written (drizzle-kit `_journal.json` desynced at 0059); the Drizzle schema file is canonical.

## Deviations from Plan

None - plan executed exactly as written.

(One in-flight correction during Task 1: an initial migration comment line contained a `;` inside a `--` comment — caught immediately by the plan's own verify gate and rewritten to `.` before commit. This is the gate working as designed, not a deviation.)

## Issues Encountered

- Initial migration header had a semicolon inside a comment line (`defense (D-05);`). The Task 1 verify command flagged it (count 1, expected 0); reworded to a period and re-verified to 0 before committing. Critical because the project's `run-migrations.ts` splits on `;` before stripping `--` comments.

## Threat Model Coverage

- **T-116-01 (Information Disclosure):** mitigated — only sha256 hex persisted; plaintext returned once, re-derived for lookup. No insert of plaintext anywhere.
- **T-116-02 (Spoofing/Replay):** mitigated — reuse detection revokes the whole family on rotated-token replay.
- **T-116-03 (Elevation of Privilege):** mitigated — access expiry fixed at 30m via decorator/env.
- **T-116-04 / T-116-05:** accepted per plan (FK CASCADE as future defense; no row cleanup this phase).

No new security surface beyond the threat model.

## User Setup Required

None - `JWT_ACCESS_EXPIRES_IN` defaults to `30m` if unset. Operators should add it to production `.env` for explicitness, but absence is non-breaking.

## Next Phase Readiness

- Service contract firm: Plan 02 can wire `/auth/refresh`, `/auth/logout`, extend `/login` + `/register` responses, and add `revokeAllForUser` to change-password (D-01) + delete-account (D-05).
- **BLOCKING for Plan 02:** migration 0125 must be applied via `pnpm db:migrate` (NOT done in this plan). Plus staging+prod runs require the standard human checkpoint.
- Full `pnpm tsc --noEmit` is clean across the whole API.

## Self-Check: PASSED

- Files: refresh-tokens.ts, 0125_create_refresh_tokens.sql, refresh-token-service.ts all exist.
- Commits: 810bebb2, 7de5cd21, b0bc73cd all in git log.

---

_Phase: 116-refresh-tokens-auth_
_Completed: 2026-05-25_

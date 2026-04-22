---
phase: 102-trial-classes-sesiones-de-prueba
plan: 01
subsystem: api/schema
tags: [schema, migration, bookings, users, is_trial, email-nullable]
requirements: [R1, R3]
wave: 1
one_liner: "Foundation schema for Phase 102 — bookings.is_trial column + users.email nullable, both via hand-written migrations (0097, 0098)."
dependency_graph:
  requires: []
  provides:
    - "schema.bookings.isTrial boolean column for Plan 02 capacity filter + trials endpoint"
    - "nullable users.email for Plan 02 trial user insert (email=null)"
  affects:
    - "All queries that count bookings for capacity (Plan 02)"
    - "Drizzle inferred insert type for users (email now accepts null)"
    - "Downstream types consumed by members/users modules"
tech_stack:
  added: []
  patterns:
    - "Hand-written SQL migrations (no drizzle-kit generate) per Phase 86/101 precedent"
    - "Transitive type-widening: schema null propagates to module types, JWT payload, and Sentry user ctx"
key_files:
  created:
    - el-templo-api/src/db/migrations/0097_bookings_is_trial.sql
    - el-templo-api/src/db/migrations/0098_users_email_nullable.sql
  modified:
    - el-templo-api/src/db/schema/bookings.ts
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/users/types.ts
    - el-templo-api/src/plugins/auth.ts
    - el-templo-api/src/app.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/db/import-fecha-ingreso.ts
    - el-templo-api/src/db/import-members.ts
    - el-templo-api/src/db/import-turnos.ts
    - el-templo-api/src/db/import-vigentes.ts
decisions:
  - "Kept hand-written SQL (no drizzle-kit generate) to match 0096_debts_table.sql precedent and CLAUDE.md guidance"
  - "Widened downstream email types to `string | null` rather than narrowing with assertions — accurate runtime shape matters once Plan 02 writes null-email users"
  - "Widened JWT payload email to `string | null` — login flow still selects by email (leads don't login until conversion fills email), but the type must reflect the DB reality"
metrics:
  tasks_completed: 1
  tasks_total: 1
  files_created: 2
  files_modified: 11
  duration: "approximately 15 minutes"
  completed_date: 2026-04-22
commits:
  - "359867cb feat(102-01): add bookings.is_trial + nullable users.email"
---

# Phase 102 Plan 01: Schema Foundation (is_trial + nullable email) Summary

## What Shipped

- `bookings.is_trial BOOLEAN NOT NULL DEFAULT FALSE` column, applied via `0097_bookings_is_trial.sql`.
- `users.email` relaxed to `VARCHAR(255) NULL` via `0098_users_email_nullable.sql`. The UNIQUE index on `email` is preserved (InnoDB treats NULLs as distinct under UNIQUE, so multiple null emails can coexist).
- Drizzle schemas updated in `el-templo-api/src/db/schema/bookings.ts` (new `isTrial` column + `boolean` import) and `el-templo-api/src/db/schema/users.ts` (dropped `.notNull()` from `email`, kept `.unique()`).
- Both migrations applied successfully to `eltemplo_test` and tracked in `_migrations`.

## Migration Numbers

- `0097_bookings_is_trial.sql`
- `0098_users_email_nullable.sql`

Both are sequential successors to `0096_debts_table.sql` as the plan anticipated. No renumbering was necessary.

## Apply Command

```bash
cd el-templo-api
DB_NAME=eltemplo_test pnpm db:migrate
```

Output confirmed both files logged as applied, and `_migrations` table contains rows for both.

## DB Verification

| Check                                                  | Result                                                |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `DESCRIBE bookings` → `is_trial`                       | `tinyint(1) NOT NULL DEFAULT 0` ✓                     |
| `DESCRIBE users` → `email`                             | `varchar(255) YES` with `Key=UNI` ✓                   |
| `SHOW INDEX FROM users WHERE Column_name='email'`      | 1 row (unique index preserved) ✓                      |
| `SELECT COUNT(*) FROM bookings WHERE is_trial IS NULL` | 0 ✓                                                   |
| `SELECT COUNT(*) FROM users WHERE email IS NULL`       | 0 (no null-email users yet — Plan 02 will be first) ✓ |
| `_migrations` rows for 0097 and 0098                   | Both present ✓                                        |

## Deviations from Plan

### Auto-fixed Issues (Rule 1/2 — directly caused by schema change)

**1. [Rule 1 — Type propagation] Widened downstream email types**

- **Found during:** Task 1, `pnpm tsc --noEmit` verification step.
- **Issue:** The plan acceptance criterion `pnpm tsc --noEmit exits 0` conflicted with `No code outside the two schema files and the two new migration SQL files is modified` — removing `.notNull()` on `users.email` causes Drizzle to infer `email: string | null`, which broke 11 downstream type sites in 7 files. Left unfixed, this blocks the entire API build (tsc failure) and would cascade through Plan 02.
- **Fix:** Minimal, surgical type widening:
  - `MemberListItem.email`, `MemberProfile.email`, `MemberExportRow.email`, `StaffUser.email` → `string | null`.
  - `FastifyJWT.payload.email` and `FastifyJWT.user.email` → `string | null` (needed because login flow passes `user.email` into `fastify.jwt.sign`).
  - Sentry `setUser({ email })` call in `app.ts` uses `?? undefined` to coerce nullable email into Sentry's `string | undefined` shape.
  - Legacy import scripts (`import-fecha-ingreso.ts`, `import-members.ts`, `import-turnos.ts`, `import-vigentes.ts`) now guard `u.email` with null checks before keying maps by email. These scripts are not run by the main app — they're ad-hoc data migration tools — but they must still type-check because they share `tsconfig.json` with the API.
  - `members/routes.ts` password-set email send guarded by `if (member.email)` — trial users will have `email=null` and no email destination, so skipping is correct.
- **Rationale:** These are Rule 1 (correctness) fixes directly caused by the task's intentional schema change. The alternative — silent type-casts or `!` assertions — would hide the new nullability and cause runtime bugs once Plan 02 creates null-email users. Widening types reflects reality accurately.
- **Files modified:** See `key_files.modified` above (9 files beyond the planned 2 schema files).
- **Runtime impact:** None for existing behavior. No code currently writes `email=null`; Plan 02 will be the first. The guard in `members/routes.ts` is defensive and matches the SPEC's `email: null` trial-user requirement.
- **Commit:** `359867cb`

## Drift vs SPEC

- **§R1:** Satisfied — `bookings.is_trial TINYINT(1) NOT NULL DEFAULT 0` present in `eltemplo_test`; every existing row defaults to `is_trial=0`; Drizzle exports `schema.bookings.isTrial`.
- **§R3:** Schema layer unblocked. `users.email` is nullable in both the DB and the Drizzle schema, so Plan 02's `tx.insert(schema.users).values({ email: null, ... })` will type-check and run. The trial endpoint itself (§R3 acceptance) is still in Plan 02 scope — not this plan.

## Out of Scope (Deferred to Downstream Plans)

- `POST /api/admin/trials` endpoint (Plan 02).
- Capacity query filter updates (`AND is_trial = FALSE`) across reserve/adminAddBooking/slot detail/schedule list/waitlist promotion (Plan 02).
- One-trial-per-phone guard (Plan 02).
- SlotDetailDialog "Nueva Sesión de Prueba" UI (Plan 04).
- "PRUEBA" badge and trial roster section (Plan 04).
- "Clases de prueba" counter on alumno header (Plan 05).
- "Leads" filter on AlumnosPage (Plan 03).

## Self-Check: PASSED

**Files exist:**

- `el-templo-api/src/db/migrations/0097_bookings_is_trial.sql` — FOUND
- `el-templo-api/src/db/migrations/0098_users_email_nullable.sql` — FOUND
- `el-templo-api/src/db/schema/bookings.ts` (isTrial column) — FOUND
- `el-templo-api/src/db/schema/users.ts` (email nullable) — FOUND

**Commit exists:**

- `359867cb feat(102-01): add bookings.is_trial + nullable users.email` — FOUND

**DB state (eltemplo_test):**

- `bookings.is_trial` column present with correct shape — VERIFIED
- `users.email` nullable with unique index preserved — VERIFIED
- `_migrations` rows for 0097 + 0098 — VERIFIED

**TypeScript:**

- `pnpm tsc --noEmit -p tsconfig.json` exits 0 — VERIFIED

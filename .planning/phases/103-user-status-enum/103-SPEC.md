# Phase 103: User Status Enum (prueba/alumno/inactivo) — Specification

**Created:** 2026-04-25
**Ambiguity score:** 0.13 (gate: ≤ 0.20)
**Requirements:** 12 locked

## Goal

Materialize the "alumno lifecycle" concept as a first-class `users.status` enum column (`prueba` | `alumno` | `inactivo`), maintained automatically by subscription create/cancel transitions; in the same change, split the operational staff-disable flag into its own `users.staff_disabled` column and remove the legacy `users.is_active` column. Result: a user's commercial state is a stored fact, not a runtime derivation, and the dual-purpose `is_active` flag (today doing soft-delete + staff-disable + accidentally meaning "has subscription" depending on caller) is gone.

## Background

Today, **no column on `users` represents whether a person is a lead, an alumno, or an inactive ex-alumno.** All three concepts are derived in query at runtime:

- "Lead" = `EXISTS (booking with is_trial=true) AND NOT EXISTS (active/paused subscription)` — see `el-templo-api/src/modules/members/service.ts:196-203`
- "Alumno" = `EXISTS (active/paused subscription)` — `members/service.ts:247-294`, `366-404`, `775-793`
- "Inactivo" = neither of the above

Phase 102 (Trial Classes, just shipped) explicitly chose this derived model — its SPEC.md calls it "Option B" and rationalizes: "Keeps schema to a single boolean on `bookings` and avoids a new status enum." That choice was correct **for the scope of Phase 102** (deliver trial classes quickly, without rearchitecting member state), but it has now run into three frictions worth fixing:

1. **The "Solo Leads" toggle in `AlumnosPage.vue:121` will become a dropdown** with values that need to be visible business states (Prueba / Alumno / Inactivo). Once a concept is going into the UI as a status value, materializing it is more honest than continuing to derive it.
2. **`users.is_active` is recognized tech debt.** A comment at `members/service.ts:115` says: "Derive active status from subscriptions (not the **stale** users.is_active column)." The column is also redundant with `users.deleted_at` (real soft-delete timestamp added later) — `deleteMember()` writes both, but reads filter by `deleted_at IS NULL`. Two columns express the same intent; one is documented as stale.
3. **`users.is_active` conflates two unrelated concepts that share the table by accident.** For `role='member'` it parallels (poorly) what should be a commercial status; for staff roles (`coach`, `recepcion`, `gestion`, `admin`, `owner`) it acts as an operational disable switch (see `UsuariosPage.vue:396-409` toggle "Activar/Desactivar usuario"). These two uses have nothing to do with each other and should not share storage.

This phase reverses Phase 102's Option B decision, deliberately, and cleans up the `is_active` legacy at the same time.

## Requirements

1. **`users.status` enum column added.**
   - Current: No `status` column on `users`. The concepts "alumno", "lead", "inactivo" are inferred at query time from `subscriptions` and `bookings`.
   - Target: New column `status` of type `ENUM('prueba', 'alumno', 'inactivo')` on `users`. NULL allowed (only members get a status; staff rows stay NULL). Default at member creation: `prueba`. An index `idx_users_status` is added for filter performance.
   - Acceptance: `DESCRIBE users` shows `status enum('prueba','alumno','inactivo') DEFAULT NULL`. `SHOW INDEX FROM users WHERE Key_name = 'idx_users_status'` returns one row.

2. **`users.staff_disabled` boolean column added.**
   - Current: Staff disable state is shared with `users.is_active` (boolean dating to v1, today flipped both for "soft-delete" and "deactivate staff member").
   - Target: New column `staff_disabled BOOLEAN NOT NULL DEFAULT FALSE` on `users`. Semantically applies only to non-`member` roles (the column is NOT NULL on every row but is meaningless for members — they use `status`/`deleted_at`).
   - Acceptance: `DESCRIBE users` shows `staff_disabled tinyint(1) NOT NULL DEFAULT 0`.

3. **`users.is_active` column dropped.**
   - Current: `users.is_active BOOLEAN NOT NULL DEFAULT TRUE` exists but is documented as "stale" (`members/service.ts:115`); reads for "alumno active" derive from subscriptions, soft-delete uses `deleted_at`, staff-disable uses the same column for a third unrelated purpose.
   - Target: Column removed in the same migration that adds `status` and `staff_disabled`. Index `idx_users_is_active` is also dropped. All call sites are updated to read either `status`, `staff_disabled`, or the derived "has active sub" subquery as appropriate (see R5–R12).
   - Acceptance: `DESCRIBE users` does not include `is_active`. `grep -rn "is_active\\|isActive" el-templo-api/src/db/schema el-templo-api/src/modules el-templo-app/src el-templo-admin/src` returns zero matches that refer to `users.is_active` (matches on unrelated entities like `promo.isActive`, `schedule.isActive`, `plan.isActive`, `subscription.isActive`, `useWakeLock.isActive` are allowed).

4. **Initial data migration backfills `status` and `staff_disabled` for every existing user.**
   - Current: No `status` column to populate; `is_active` is the existing operational flag.
   - Target: A single SQL migration applies these rules in order, idempotently:
     - For `role='member'`:
       - Has a subscription with `subscription_status IN ('active','paused')` → `status='alumno'`
       - Else has a `bookings` row with `is_trial=TRUE` → `status='prueba'`
       - Else → `status='inactivo'`
       - `is_active=FALSE` and not `deleted_at IS NOT NULL` → override to `status='inactivo'` (legacy "deactivated members")
     - For all non-`member` roles: `status=NULL`, `staff_disabled = NOT is_active` (so a previously deactivated coach stays deactivated).
   - Acceptance: After migration, `SELECT COUNT(*) FROM users WHERE role='member' AND status IS NULL` returns 0. `SELECT COUNT(*) FROM users WHERE role!='member' AND status IS NOT NULL` returns 0. Spot-check: a known member with an active subscription has `status='alumno'`; a known lead from Phase 102 has `status='prueba'`; a known cancelled-sub member has `status='inactivo'`.

5. **Auto-transition: creating a subscription for a member with no active subscription flips `status` to `alumno`.**
   - Current: Subscription creation in `el-templo-api/src/modules/subscriptions/service.ts` sets `users.converted_at` (Phase 102-07) but does not maintain any status column.
   - Target: In the same transaction that inserts a subscription, if the affected user has no other subscription with `subscription_status IN ('active','paused')` immediately before insert, set `users.status='alumno'`. Applies regardless of prior status (`prueba` or `inactivo` both transition the same way).
   - Acceptance: Integration test: create member (status='prueba'), call subscription create endpoint, assert `status='alumno'` post-commit. Integration test: same flow for a member with `status='inactivo'`, assert flips to `'alumno'`.

6. **Auto-transition: cancelling the last active subscription flips `status` to `inactivo`.**
   - Current: Subscription cancel in `subscriptions/service.ts` updates `subscription_status` but does not touch any user-level status.
   - Target: In the same transaction that flips a subscription to a non-active status (`cancelled` or terminal equivalent), if the affected user has no other subscription with `subscription_status IN ('active','paused')` post-update, set `users.status='inactivo'`. A user with another active subscription remains `'alumno'`.
   - Acceptance: Integration test: member with one active subscription (status='alumno'), cancel it, assert `status='inactivo'`. Integration test: member with two active subscriptions, cancel one, assert `status` stays `'alumno'`.

7. **Member creation default is `status='prueba'` for `role='member'`.**
   - Current: `members/service.ts` creates members without a status concept; lead-ness is derived later from booking history.
   - Target: Every new `users` row inserted with `role='member'` (admin-created or self-registered) defaults to `status='prueba'`. If the same flow assigns a subscription in the same request (existing optional-`planId` path from Phase 101), the auto-transition in R5 then promotes to `'alumno'` — net result: member created with a plan ends up `'alumno'`, member created without a plan stays `'prueba'`.
   - Acceptance: Integration test: `POST /api/admin/members` without `planId` → user has `status='prueba'`. With `planId` → user has `status='alumno'` (transition fires in same transaction).

8. **Members list API replaces the derived `status` filter with a first-class enum filter.**
   - Current: `GET /api/admin/members` accepts `status: 'todos' | 'alumnos' | 'leads'` (Phase 102-03). The implementation in `members/service.ts:196-203` runs `EXISTS`/`NOT EXISTS` subqueries against `bookings` and `subscriptions` to compute lead-ness on the fly.
   - Target: Same endpoint, expanded enum: `status: 'todos' | 'prueba' | 'alumno' | 'inactivo'`. Implementation reads `users.status` directly. The legacy `'leads'` value is renamed to `'prueba'` and `'alumnos'` to `'alumno'` in the API contract (admin app is the only client and is updated in R10).
   - Acceptance: `GET /api/admin/members?status=prueba` returns only users with `status='prueba'`. Integration test asserts the result count matches `SELECT COUNT(*) FROM users WHERE status='prueba' AND deleted_at IS NULL`.

9. **AlumnosPage filter: `Solo Leads` toggle replaced by `Estado` dropdown.**
   - Current: `el-templo-admin/src/pages/AlumnosPage.vue:121` renders a toggle bound to `filters.leadsOnly` (Phase 102-05) and a separate `isActive` toggle bound to `filters.isActive`.
   - Target: A single dropdown labeled "Estado" with options: `Todos` (default), `En Prueba`, `Alumnos`, `Inactivos`. Maps to API `status` values per R8. The standalone `isActive` toggle is removed (its semantic is now subsumed by `status`).
   - Acceptance: AlumnosPage shows one dropdown with 4 labeled options; selecting `Inactivos` calls the list endpoint with `?status=inactivo`; the existing "Solo Leads" toggle is gone from the markup.

10. **Member list/detail rows show `status` (not derived `isActive`).**
    - Current: AlumnosPage row chip (`AlumnosPage.vue:250-251`) and AlumnoDetailPage header chip (`AlumnoDetailPage.vue:54-55`) read `isActive` from the API response — a value the backend currently computes via the `isActiveSubquery` and aliases as `isActive`.
    - Target: API responses include `status` (string enum) instead of (or in addition to during a brief migration window) `isActive`. UI chips render labeled badges from `status`: "En Prueba" (warning color), "Alumno" (positive color), "Inactivo" (grey). The `isActive` field is removed from `MemberListItem`/`MemberProfile` types once UI consumers are migrated.
    - Acceptance: `GET /api/admin/members` response payload contains `status` per row (verified via integration test). AlumnosPage and AlumnoDetailPage render the new tri-state badge. Grep shows no remaining `member.isActive` reads in admin app.

11. **UsuariosPage staff toggle acts on `staff_disabled` (not `is_active`).**
    - Current: `el-templo-admin/src/pages/UsuariosPage.vue:396-409` shows an "Activar/Desactivar usuario" button. The endpoint `PATCH /api/admin/users/:userId/status` (`useUsersApi.ts:101`) flips `users.is_active`.
    - Target: The same button continues to exist with the same UX wording. The endpoint payload field is renamed from `isActive` to `disabled` (semantic inversion: `disabled=true` deactivates) and writes to `users.staff_disabled`. The list endpoint response exposes `staffDisabled` per staff row. Filtering staff users by enabled/disabled continues to work.
    - Acceptance: Toggling a coach in UsuariosPage flips `users.staff_disabled` in DB; the row badge updates accordingly. Integration test: `PATCH /api/admin/users/:id/status { disabled: true }` for `role='coach'` writes `staff_disabled=1`.

12. **Auth flows no longer reference `is_active`.**
    - Current: `el-templo-api/src/modules/auth/routes.ts:251`, `:329`, `:359`, `:439`, `:572` all read or write `users.isActive` in login/me/account-delete handlers. `el-templo-app` does not consume the field, but it is present in the auth payload.
    - Target: References to `users.isActive` are replaced. For login authorization gates (currently relying on `is_active`/`deleted_at`), use `deleted_at IS NULL` and (for staff roles) `staff_disabled = false`. The auth payload no longer includes `isActive`. Account-delete writes `deleted_at` only, not `is_active=false`.
    - Acceptance: Login still succeeds for active members and is rejected for soft-deleted users (`deleted_at IS NOT NULL`). Login for a staff user with `staff_disabled=true` is rejected with the same error code as the prior `is_active=false` path. Auth response payload schema no longer lists `isActive`.

## Boundaries

**In scope:**

- Schema: add `users.status` enum, add `users.staff_disabled` boolean, drop `users.is_active`, drop the obsolete index, add `idx_users_status`
- Drizzle schema file update + generated migration SQL committed
- Data migration: backfill all existing users per R4
- Subscription create/cancel auto-transitions for `users.status` (R5, R6)
- Member creation default `status='prueba'` (R7)
- Members API: `status` filter values renamed to enum (`prueba`/`alumno`/`inactivo`); response includes `status` field (R8, R10)
- Admin app `AlumnosPage`: dropdown filter replaces `leadsOnly` and `isActive` toggles (R9)
- Admin app `AlumnoDetailPage`: badge renders from `status` (R10)
- Admin app `UsuariosPage` + `useUsersApi`: staff toggle writes `staff_disabled` (R11)
- Auth routes: replace `is_active` reads/writes with `deleted_at` / `staff_disabled` (R12)
- Integration tests for every auto-transition and every endpoint contract change

**Out of scope:**

- Member app UI changes — leads/alumnos/inactivos already inherit existing sub-less-vs-with-sub UX; no new screens. (Confirmed in conversation: the only place `users.isActive` appears in `el-templo-app` is unrelated component state.)
- Manual admin override of `status` — the column is auto-maintained from subscription state; no admin UI for editing it directly. If a regression case appears (e.g., a member needs to be hidden without being soft-deleted), that is a separate phase. Reason: keeping `status` derivable from `subscription` state preserves consistency and matches Phase 102's spirit of single-source-of-truth.
- Renaming the value `prueba` to anything else, adding `expirado`/`pausado`/etc as separate states — this phase locks the 3-value enum. Future expansion is a separate ADR. Reason: avoid bikeshedding scope creep.
- Reports refactor beyond what R8/R10 require — `el-templo-api/src/modules/reports/service.ts` queries that use `u.converted_at IS NULL` continue to work as-is and are not migrated to read `status` in this phase. Reason: those queries are correct and non-blocking; rewriting them is busywork.
- WhatsApp bot or external CRM integration with the new status — the WhatsApp bot is a separate project (see `MEMORY.md`).
- Coach-app changes — coaches don't consume `users.is_active` directly.
- Backwards-compat shim that keeps `isActive` in the API response during a rollout window — staging/master share a release; no need.
- Deprecating `users.converted_at` even though `status='alumno'` overlaps semantically — `converted_at` is a timestamp (when did conversion happen), `status` is the present state; both are valid and distinct.

## Constraints

- **Single migration:** The schema change (add 2 columns, drop 1, drop+add indexes) and the data backfill MUST be in the same SQL migration. No multi-step migration with intermediate code releases — the codebase is updated atomically with the migration.
- **Idempotent:** The migration must be safe to re-run without error. Use `IF NOT EXISTS` / `IF EXISTS` clauses and conditional updates.
- **Atomic transitions:** Auto-transitions in R5 and R6 must execute inside the same DB transaction as the subscription insert/update. If the transaction rolls back, the status update rolls back with it.
- **No backwards-compat:** No `isActive` field shim in API responses, no transitional dual-write to `is_active` and `staff_disabled`. All clients (admin app) ship in lockstep with the API.
- **Migration tracking:** Migration runs through the project's custom runner (`pnpm db:migrate` → `src/db/run-migrations.ts`), not `drizzle-kit migrate`. The `_migrations` table is the source of truth (per `CLAUDE.md`).
- **Test coverage:** Per `CLAUDE.md` engineering preferences ("err on the side of too many tests"), every endpoint contract change in R8, R10, R11, R12 has a corresponding integration test in `el-templo-api/test/`, and every auto-transition in R5, R6, R7 has an integration test that exercises the transaction path.
- **Naming consistency:** Enum values stored in DB are Spanish (`prueba`, `alumno`, `inactivo`) to match the existing convention in the project (other enums like `documentTypeEnum` use Spanish values).

## Acceptance Criteria

- [ ] `DESCRIBE users` shows `status enum('prueba','alumno','inactivo') DEFAULT NULL` and `staff_disabled tinyint(1) NOT NULL DEFAULT 0`; does NOT show `is_active`.
- [ ] `SHOW INDEX FROM users WHERE Key_name = 'idx_users_status'` returns one row; `idx_users_is_active` does not exist.
- [ ] After migration, `SELECT COUNT(*) FROM users WHERE role='member' AND status IS NULL AND deleted_at IS NULL` returns 0.
- [ ] After migration, `SELECT COUNT(*) FROM users WHERE role!='member' AND status IS NOT NULL` returns 0.
- [ ] Integration test: creating a member without `planId` → `status='prueba'`.
- [ ] Integration test: creating a subscription for a `prueba` user → `status='alumno'` post-commit, in the same transaction.
- [ ] Integration test: cancelling the last active subscription for an `alumno` user → `status='inactivo'` post-commit, in the same transaction.
- [ ] Integration test: cancelling one of two active subscriptions → `status` stays `'alumno'`.
- [ ] `GET /api/admin/members?status=prueba` returns exactly the rows where `users.status='prueba'`.
- [ ] AlumnosPage renders a single "Estado" dropdown with options Todos / En Prueba / Alumnos / Inactivos; the prior `leadsOnly` and `isActive` toggles are gone from the markup.
- [ ] AlumnosPage row badges and AlumnoDetailPage header badge render from `status` (3 distinct states with distinct colors/labels).
- [ ] UsuariosPage staff toggle calls `PATCH /api/admin/users/:id/status` with `{ disabled: bool }` and flips `users.staff_disabled`.
- [ ] `grep -rn "users.isActive\\|users\\.is_active" el-templo-api/src el-templo-admin/src el-templo-app/src` returns 0 matches outside of migration files.
- [ ] Auth payload schema for `/me` and `/login` does not include `isActive`.
- [ ] Login is rejected for soft-deleted users (`deleted_at IS NOT NULL`) and for staff users with `staff_disabled=true`, with appropriate error codes.

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                                                 |
| ------------------- | ----- | ----- | ------ | ------------------------------------------------------------------------------------- |
| Goal Clarity        | 0.92  | 0.75  | ✓      | Goal narrows to: materialize status enum + split staff disable + drop is_active.      |
| Boundary Clarity    | 0.88  | 0.70  | ✓      | Explicit out-of-scope list with reasoning; member-app exclusion confirmed by grep.    |
| Constraint Clarity  | 0.78  | 0.65  | ✓      | Single atomic migration, idempotent, no shim, transactions match project conventions. |
| Acceptance Criteria | 0.85  | 0.70  | ✓      | 14 pass/fail checks covering schema, data, transitions, API contract, UI markup.      |
| **Ambiguity**       | 0.13  | ≤0.20 | ✓      |                                                                                       |

## Interview Log

The Socratic interview happened conversationally before this SPEC.md was written; the rounds below reflect the actual discussion arc with the user.

| Round | Perspective     | Question summary                                                                                | Decision locked                                                                                                          |
| ----- | --------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1     | Researcher      | What represents "lead" today? Where does it live?                                               | Nothing represents it — it's derived from `is_trial=true booking + no active sub` (Phase 102's "Option B").              |
| 2     | Simplifier      | What's the simplest version: cosmetic UI change, or full schema refactor?                       | User chose schema refactor — "lead/alumno/inactivo" should be stored, not derived. Cosmetic-only would be insufficient.  |
| 2     | Simplifier      | Does the new status need to be editable or just a filter view of derived state?                 | Status is auto-derived from subscription state; no manual admin override needed in v1.                                   |
| 3     | Boundary Keeper | Should `is_active` stay alongside `status`, or should we eliminate it?                          | Eliminate `is_active` — it's already documented as "stale", redundant with `deleted_at`, and conflates members vs staff. |
| 3     | Boundary Keeper | What about staff (coach/recepcion/admin) — they need an operational disable; how to express it? | New column `staff_disabled` boolean for non-member roles. Members don't need it; staff don't get a `status`.             |
| 3     | Boundary Keeper | What's NOT in scope?                                                                            | No member-app UI changes (none needed), no manual status editing, no reports refactor, no value beyond 3-state enum.     |
| 4     | Failure Analyst | What about users who are members but `is_active=false` today (pre-soft-delete legacy)?          | Migrate them to `status='inactivo'` (R4 has the override rule).                                                          |
| 4     | Failure Analyst | What about a member with multiple subscriptions — when does `status` flip back to `inactivo`?   | Only when the LAST active sub is cancelled (R6); having any one of N active keeps `status='alumno'`.                     |
| 5     | Seed Closer     | Naming: should the enum value be `lead` (English) or `prueba` (Spanish)?                        | `prueba` — matches the existing Spanish convention in other enums and matches the user-facing UI label ("En Prueba").    |
| 5     | Seed Closer     | Does this revert Phase 102's Option B decision? How is that documented?                         | Yes, deliberately — Background section explains the why (Phase 102 was right for its scope; now its scope is past).      |

---

_Phase: 103-user-status-enum_
_Spec created: 2026-04-25_
_Next step: /gsd-discuss-phase 103 — implementation decisions (migration mechanics, transition placement in service code, transaction shape, etc.)_

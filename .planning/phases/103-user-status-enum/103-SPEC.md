# Phase 103: User Status Enum (freemium/prueba/activo/inactivo) — Specification

**Created:** 2026-04-25
**Updated:** 2026-04-25 (post-discuss)
**Ambiguity score:** 0.13 (gate: ≤ 0.20)
**Requirements:** 12 locked

## Goal

Materialize the user lifecycle as a first-class `users.status` enum column (`freemium` | `prueba` | `activo` | `inactivo`), maintained automatically by subscription create/cancel transitions and by the trial-creation endpoint; in the same change, split the operational staff-disable flag into its own `users.staff_disabled` column and remove the legacy `users.is_active` column. Result: a user's commercial state is a stored fact, not a runtime derivation, and the dual-purpose `is_active` flag (today doing soft-delete + staff-disable + accidentally meaning "has subscription" depending on caller) is gone.

## Background

Today, **no column on `users` represents whether a person is a freemium signup, a presential trial lead, a paying student, or an inactive ex-student.** All distinctions are derived in query at runtime:

- "Lead" (presential trial) = `EXISTS (booking with is_trial=true) AND NOT EXISTS (active/paused subscription)` — see `el-templo-api/src/modules/members/service.ts:196-203`
- "Active student" = `EXISTS (active/paused subscription)` — `members/service.ts:247-294`, `366-404`, `775-793`
- "Inactive" = neither of the above
- "Freemium online signup" = no representation at all (lumped with inactive)

Phase 102 (Trial Classes, just shipped) explicitly chose this derived model — its SPEC.md calls it "Option B" and rationalizes: "Keeps schema to a single boolean on `bookings` and avoids a new status enum." That choice was correct **for the scope of Phase 102** (deliver trial classes quickly, without rearchitecting member state), but it has now run into four frictions worth fixing:

1. **The "Solo Leads" toggle in `AlumnosPage.vue:121` will become a dropdown** with values that need to be visible business states. Once a concept is going into the UI as a status value, materializing it is more honest than continuing to derive it.
2. **`users.is_active` is recognized tech debt.** A comment at `members/service.ts:115` says: "Derive active status from subscriptions (not the **stale** users.is_active column)." The column is also redundant with `users.deleted_at` (real soft-delete timestamp added later) — `deleteMember()` writes both, but reads filter by `deleted_at IS NULL`.
3. **`users.is_active` conflates two unrelated concepts that share the table by accident.** For `role='member'` it parallels (poorly) what should be a commercial status; for staff roles (`coach`, `recepcion`, `gestion`, `admin`, `owner`) it acts as an operational disable switch (see `UsuariosPage.vue:396-409` toggle "Activar/Desactivar usuario"). These two uses have nothing to do with each other and should not share storage.
4. **The self-registration flow in `auth/routes.ts:32-228` (`POST /register`) creates members on the virtual `ONLINE` branch with no subscription** — these users are functionally "freemium signups" exploring the product, distinct from both presential trial leads and ex-alumno inactives. Today they're invisible in the lead funnel and indistinguishable from churned ex-alumno in queries. Phase 89-91 (Planes Online — Digital Monetization) will turn these into a paying audience; the model needs to support them now to avoid migrating again later.

This phase reverses Phase 102's Option B decision, deliberately, and cleans up the `is_active` legacy at the same time.

## Requirements

1. **`users.status` enum column added.**
   - Current: No `status` column on `users`. The concepts "freemium", "prueba", "activo", "inactivo" are inferred at query time from `subscriptions`, `bookings`, and `branches`.
   - Target: New column `status` of type `ENUM('freemium', 'prueba', 'activo', 'inactivo')` on `users`. NULL allowed (only members get a status; staff rows stay NULL). Default for newly-inserted member rows: `freemium`. An index `idx_users_status` is added for filter performance.
   - Acceptance: `DESCRIBE users` shows `status enum('freemium','prueba','activo','inactivo') DEFAULT NULL`. `SHOW INDEX FROM users WHERE Key_name = 'idx_users_status'` returns one row.

2. **`users.staff_disabled` boolean column added.**
   - Current: Staff disable state is shared with `users.is_active` (boolean dating to v1, today flipped both for "soft-delete" and "deactivate staff member").
   - Target: New column `staff_disabled BOOLEAN NOT NULL DEFAULT FALSE` on `users`. Semantically applies only to non-`member` roles (the column is NOT NULL on every row but is meaningless for members — they use `status`/`deleted_at`).
   - Acceptance: `DESCRIBE users` shows `staff_disabled tinyint(1) NOT NULL DEFAULT 0`.

3. **`users.is_active` column dropped.**
   - Current: `users.is_active BOOLEAN NOT NULL DEFAULT TRUE` exists but is documented as "stale" (`members/service.ts:115`); reads for "active student" derive from subscriptions, soft-delete uses `deleted_at`, staff-disable uses the same column for a third unrelated purpose.
   - Target: Column removed in the same migration that adds `status` and `staff_disabled`. Index `idx_users_is_active` is also dropped. All call sites are updated to read either `status`, `staff_disabled`, or the derived "has active sub" subquery as appropriate (see R5–R12).
   - Acceptance: `DESCRIBE users` does not include `is_active`. `grep -rn "users.isActive\|users\.is_active" el-templo-api/src el-templo-admin/src el-templo-app/src` returns zero matches outside of migration files (matches on unrelated entities like `promo.isActive`, `schedule.isActive`, `plan.isActive`, `subscription.isActive`, `useWakeLock.isActive` are allowed).

4. **Initial data migration backfills `status` and `staff_disabled` for every existing user.**
   - Current: No `status` column to populate; `is_active` is the existing operational flag.
   - Target: Three sequential SQL `UPDATE` statements applied in order against `users` rows where `role='member'`, each touching only rows where `status IS NULL` (idempotent):
     1. `status='activo'` for members who have a subscription with `subscription_status IN ('active','paused')`
     2. `status='prueba'` for members (still NULL after step 1) who have a `bookings` row with `is_trial=TRUE`
     3. For the remainder (still NULL after step 2):
        - `status='freemium'` if `branchId` references a branch with `code='ONLINE'`
        - `status='inactivo'` otherwise
     4. Members with `is_active=FALSE` and `deleted_at IS NULL` (legacy "deactivated members") are then unconditionally overridden to `status='inactivo'`.
     5. For all non-`member` roles: `status=NULL`, `staff_disabled = NOT is_active` (so a previously deactivated coach stays deactivated).
   - Acceptance: After migration, `SELECT COUNT(*) FROM users WHERE role='member' AND status IS NULL AND deleted_at IS NULL` returns 0. `SELECT COUNT(*) FROM users WHERE role!='member' AND status IS NOT NULL` returns 0. Spot-check: a known active subscriber has `status='activo'`; a known Phase-102 lead has `status='prueba'`; a known cancelled-sub member has `status='inactivo'`; a known online self-registered user with no plan has `status='freemium'`.

5. **Auto-transition: creating a subscription for a member with no active subscription flips `status` to `activo`.**
   - Current: Subscription creation in `el-templo-api/src/modules/subscriptions/service.ts` sets `users.converted_at` (Phase 102-07) via `markConvertedIfLead` but does not maintain any status column.
   - Target: A new private method `recomputeUserStatus(userId, tx)` on `SubscriptionService` is the single source of truth for post-subscription-change state. It (a) inspects the user's current subscriptions and bookings, (b) sets `users.status` to the correct value (`activo` if any active/paused sub exists; otherwise leaves a previously-`freemium`/`prueba` user as `inactivo` if a sub ever existed before), and (c) sets `users.converted_at = CURRENT_TIMESTAMP` if it's still NULL and the user is transitioning to `activo` and has any `is_trial=TRUE` booking. The legacy `markConvertedIfLead` is deleted; its logic lives inside `recomputeUserStatus`. Every site in `subscriptions/service.ts` that inserts a subscription (`createSubscription`/`assignPlan`, renew, change-plan, etc.) calls `recomputeUserStatus(userId, tx)` before the transaction commits.
   - Acceptance: Integration test: create freemium user → call subscription create → assert `status='activo'` post-commit, in same transaction. Same flow for `prueba` and `inactivo` source states — all flip to `'activo'`. `markConvertedIfLead` no longer exists in the codebase.

6. **Auto-transition: cancelling the last active subscription flips `status` to `inactivo`.**
   - Current: Subscription cancel in `subscriptions/service.ts:1262` updates `subscription_status` but does not touch any user-level status.
   - Target: `cancelSubscription` calls `recomputeUserStatus(userId, tx)` before the transaction commits. If the affected user has no other subscription with `subscription_status IN ('active','paused')` post-update, `recomputeUserStatus` sets `users.status='inactivo'`. A user with another active subscription remains `'activo'`. Cancelled users always go to `inactivo` — never back to `freemium` or `prueba` — because they were paying members at some point.
   - Acceptance: Integration test: member with one active subscription (status='activo'), cancel it, assert `status='inactivo'`. Integration test: member with two active subscriptions, cancel one, assert `status` stays `'activo'`. Integration test: previously-freemium user who bought and then cancelled → `status='inactivo'`, not back to `freemium`.

7. **Member creation status is set per entry-point intent (DB default is NULL).**
   - Current: `members/service.ts` creates members without a status concept. Self-register `auth/routes.ts:116`, admin-create, and trial endpoint all insert with no status.
   - Target: The DB column default for `status` is `NULL` (so staff inserts that omit the field stay NULL). Each member-creating endpoint explicitly sets `status` based on the intent of that entry point:
     - `POST /register` (self-register from app) → INSERT with `status='freemium'` (online signup, no presential intent yet). If a valid `promoCode` is provided, the subsequent `assignPlan` triggers `recomputeUserStatus` → flips to `activo`.
     - `POST /api/admin/members` (admin creates member) → INSERT with `status='prueba'` (presential intent — admin is enrolling someone who walked into a sede). If `planId` is also provided in the same request, the subsequent `assignPlan` triggers `recomputeUserStatus` → flips to `activo`.
     - `POST /api/admin/trials` (admin creates trial-class lead) → INSERT with `status='prueba'` and a trial booking (Phase 102 behavior unchanged).
     - Staff role inserts (coach, recepcion, etc.) → no `status` field passed → DB default NULL.
   - Acceptance: Integration test: `POST /register` without `promoCode` (default ONLINE branch) → user has `status='freemium'`. Integration test: `POST /register` with valid `promoCode` → user has `status='activo'`. Integration test: `POST /api/admin/members` without `planId` → user has `status='prueba'`. Integration test: `POST /api/admin/members` with `planId` → user has `status='activo'`. Integration test: `POST /api/admin/trials` → user has `status='prueba'`. Integration test: creating a `coach` user via the staff endpoint → user has `status=NULL`.

8. **Members list API replaces the derived `status` filter with a first-class enum filter.**
   - Current: `GET /api/admin/members` accepts `status: 'todos' | 'alumnos' | 'leads'` (Phase 102-03). The implementation in `members/service.ts:196-203` runs `EXISTS`/`NOT EXISTS` subqueries against `bookings` and `subscriptions` to compute lead-ness on the fly.
   - Target: Same endpoint, expanded enum: `status: 'todos' | 'freemium' | 'prueba' | 'activo' | 'inactivo'`. Implementation reads `users.status` directly. The legacy `'leads'` value is renamed to `'prueba'` and `'alumnos'` to `'activo'` in the API contract (admin app is the only client and is updated in R10).
   - Acceptance: `GET /api/admin/members?status=prueba` returns only users with `status='prueba'`. Integration test asserts the result count matches `SELECT COUNT(*) FROM users WHERE status='prueba' AND deleted_at IS NULL`. Same for the other 3 enum values.

9. **AlumnosPage filter: `Solo Leads` toggle replaced by `Estado` dropdown with 5 options.**
   - Current: `el-templo-admin/src/pages/AlumnosPage.vue:121` renders a toggle bound to `filters.leadsOnly` (Phase 102-05) and a separate `isActive` toggle bound to `filters.isActive`.
   - Target: A single dropdown labeled "Estado" with options: `Todos` (default), `Freemium`, `En Prueba`, `Activos`, `Inactivos`. Maps to API `status` values per R8. The standalone `isActive` toggle is removed (its semantic is now subsumed by `status`).
   - Acceptance: AlumnosPage shows one dropdown with 5 labeled options; selecting `Inactivos` calls the list endpoint with `?status=inactivo`; the existing "Solo Leads" toggle is gone from the markup.

10. **Member list/detail rows show `status` (not derived `isActive`).**
    - Current: AlumnosPage row chip (`AlumnosPage.vue:250-251`) and AlumnoDetailPage header chip (`AlumnoDetailPage.vue:54-55`) read `isActive` from the API response — a value the backend currently computes via the `isActiveSubquery` and aliases as `isActive`.
    - Target: API responses include `status` (string enum) instead of `isActive`. UI chips render labeled badges from `status`: "Freemium" (info color), "En Prueba" (warning color), "Activo" (positive color), "Inactivo" (grey). The `isActive` field is removed from `MemberListItem`/`MemberProfile` types.
    - Acceptance: `GET /api/admin/members` response payload contains `status` per row (verified via integration test). AlumnosPage and AlumnoDetailPage render the new 4-state badge with distinct colors. Grep shows no remaining `member.isActive` reads in admin app.

11. **UsuariosPage staff toggle acts on `staff_disabled` (not `is_active`).**
    - Current: `el-templo-admin/src/pages/UsuariosPage.vue:396-409` shows an "Activar/Desactivar usuario" button. The endpoint `PATCH /api/admin/users/:userId/status` (`useUsersApi.ts:101`) flips `users.is_active`.
    - Target: The same button continues to exist with the same UX wording. The endpoint payload field is renamed from `isActive` to `disabled` (semantic inversion: `disabled=true` deactivates) and writes to `users.staff_disabled`. The list endpoint response exposes `staffDisabled` per staff row.
    - Acceptance: Toggling a coach in UsuariosPage flips `users.staff_disabled` in DB; the row badge updates accordingly. Integration test: `PATCH /api/admin/users/:id/status { disabled: true }` for `role='coach'` writes `staff_disabled=1`.

12. **Auth flows no longer reference `is_active`.**
    - Current: `el-templo-api/src/modules/auth/routes.ts:251`, `:329`, `:359`, `:439`, `:572` all read or write `users.isActive` in login/me/account-delete handlers. `el-templo-app` does not consume the field, but it is present in the auth payload.
    - Target: References to `users.isActive` are replaced. Login authorization gates use `deleted_at IS NULL` (universal) and `staff_disabled = false` (only enforced for non-member roles). The auth payload no longer includes `isActive`. Account-delete writes `deleted_at` only, not `is_active=false`.
    - Acceptance: Login still succeeds for active members and is rejected for soft-deleted users (`deleted_at IS NOT NULL`). Login for a staff user with `staff_disabled=true` is rejected with the same error code as the prior `is_active=false` path. Auth response payload schema no longer lists `isActive`.

## Boundaries

**In scope:**

- Schema: add `users.status` enum (4 values), add `users.staff_disabled` boolean, drop `users.is_active`, drop `idx_users_is_active`, add `idx_users_status`
- Drizzle schema file update + generated migration SQL committed
- Data migration: backfill all existing users per R4 (3 sequential UPDATE statements + override step)
- Subscription service: `recomputeUserStatus(userId, tx)` helper (replaces `markConvertedIfLead`); called from every site that inserts/cancels/changes subscriptions, inside the same transaction
- Member creation: `freemium` as DB-level default; `/api/admin/trials` overrides to `prueba`
- Members API: `status` filter values renamed to enum (`freemium`/`prueba`/`activo`/`inactivo`); response includes `status` field (R8, R10)
- Admin app `AlumnosPage`: dropdown filter (5 options) replaces `leadsOnly` and `isActive` toggles (R9)
- Admin app `AlumnoDetailPage`: 4-state badge replaces 2-state badge (R10)
- Admin app `UsuariosPage` + `useUsersApi`: staff toggle writes `staff_disabled` via `disabled` payload field (R11)
- Auth routes: replace `is_active` reads/writes with `deleted_at` / `staff_disabled` (R12)
- Integration tests for every auto-transition and every endpoint contract change

**Out of scope:**

- Member app UI changes — freemium/prueba/activo/inactivo all already inherit existing sub-less-vs-with-sub UX; no new screens. (Confirmed: the only place `users.isActive` appears in `el-templo-app` is unrelated component state.)
- Manual admin override of `status` — the column is auto-maintained from subscription/booking state and the trial-creation endpoint; no admin UI for editing it directly. If a regression case appears (e.g., a member needs to be hidden without being soft-deleted), that is a separate phase. Reason: keeping `status` derivable preserves consistency.
- Adding states beyond the 4-value enum (e.g., `pausado`, `expirado`, `lapsed`) — this phase locks the 4-value enum. Future expansion is a separate ADR. Reason: avoid bikeshedding scope creep.
- Reports refactor beyond what R8/R10 require — `el-templo-api/src/modules/reports/service.ts` queries that use `u.converted_at IS NULL` continue to work as-is and are not migrated to read `status` in this phase. Reason: those queries are correct and non-blocking.
- Online plans / freemium UX in the member app — that is fase 89-91 (Planes Online — Digital Monetization). This phase only adds the model column to support future work.
- WhatsApp bot or external CRM integration with the new status — separate project.
- Coach-app changes — coaches don't consume `users.is_active` directly.
- Backwards-compat shim that keeps `isActive` in the API response during a rollout window — staging/master share a release; no need.
- Deprecating `users.converted_at` even though `status='activo'` overlaps semantically — `converted_at` is a timestamp (when did first conversion happen), `status` is the present state; both are valid and distinct.

## Constraints

- **Single migration:** The schema change (add 2 columns, drop 1, drop+add indexes) and the data backfill MUST be in the same SQL migration. No multi-step migration with intermediate code releases — the codebase is updated atomically with the migration.
- **Idempotent:** The migration must be safe to re-run without error. Each backfill UPDATE only touches rows where `status IS NULL`, so re-running is a no-op after the first successful run.
- **Atomic transitions:** `recomputeUserStatus` MUST execute inside the same DB transaction as the subscription insert/update that triggered it. If the transaction rolls back, the status update rolls back with it.
- **No backwards-compat:** No `isActive` field shim in API responses, no transitional dual-write to `is_active` and `staff_disabled`. All clients (admin app) ship in lockstep with the API.
- **Migration tracking:** Migration runs through the project's custom runner (`pnpm db:migrate` → `src/db/run-migrations.ts`), not `drizzle-kit migrate`. The `_migrations` table is the source of truth (per `CLAUDE.md`).
- **Test coverage:** Per `CLAUDE.md` engineering preferences ("err on the side of too many tests"), every endpoint contract change in R8, R10, R11, R12 has a corresponding integration test in `el-templo-api/test/`, and every auto-transition path in R5, R6, R7 has an integration test that exercises the transaction.
- **Naming consistency:** Enum values stored in DB are lowercase Spanish where natural (`prueba`, `activo`, `inactivo`); the freemium value uses the SaaS-standard English term `freemium` (no clean Spanish equivalent). UI labels mirror the same words capitalized: `Freemium`, `En Prueba`, `Activo`, `Inactivo`.

## Acceptance Criteria

- [ ] `DESCRIBE users` shows `status enum('freemium','prueba','activo','inactivo') DEFAULT NULL` and `staff_disabled tinyint(1) NOT NULL DEFAULT 0`; does NOT show `is_active`.
- [ ] `SHOW INDEX FROM users WHERE Key_name = 'idx_users_status'` returns one row; `idx_users_is_active` does not exist.
- [ ] After migration, `SELECT COUNT(*) FROM users WHERE role='member' AND status IS NULL AND deleted_at IS NULL` returns 0.
- [ ] After migration, `SELECT COUNT(*) FROM users WHERE role!='member' AND status IS NOT NULL` returns 0.
- [ ] Integration test: `POST /register` without promo (default ONLINE branch) → `status='freemium'`.
- [ ] Integration test: `POST /register` with valid promo (auto-assigns plan) → `status='activo'`.
- [ ] Integration test: `POST /api/admin/members` without `planId` → `status='prueba'`.
- [ ] Integration test: `POST /api/admin/members` with `planId` → `status='activo'`.
- [ ] Integration test: `POST /api/admin/trials` → `status='prueba'`.
- [ ] Integration test: creating a `coach` (or any non-member role) → `status=NULL`.
- [ ] Integration test: creating a subscription for a `freemium`/`prueba`/`inactivo` user → `status='activo'` post-commit, in the same transaction.
- [ ] Integration test: cancelling the last active subscription for an `activo` user → `status='inactivo'` post-commit, in the same transaction.
- [ ] Integration test: cancelling one of two active subscriptions → `status` stays `'activo'`.
- [ ] Integration test: previously-freemium user who bought and then cancelled → `status='inactivo'`, not back to `'freemium'`.
- [ ] `GET /api/admin/members?status=freemium` returns exactly the rows where `users.status='freemium'`. Same check for the other 3 values.
- [ ] AlumnosPage renders a single "Estado" dropdown with options Todos / Freemium / En Prueba / Activos / Inactivos; the prior `leadsOnly` and `isActive` toggles are gone from the markup.
- [ ] AlumnosPage row badges and AlumnoDetailPage header badge render from `status` (4 distinct states with distinct colors/labels).
- [ ] UsuariosPage staff toggle calls `PATCH /api/admin/users/:id/status` with `{ disabled: bool }` and flips `users.staff_disabled`.
- [ ] `markConvertedIfLead` is removed from `subscriptions/service.ts`; `recomputeUserStatus` is the only post-subscription helper.
- [ ] `grep -rn "users.isActive\\|users\\.is_active" el-templo-api/src el-templo-admin/src el-templo-app/src` returns 0 matches outside of migration files.
- [ ] Auth payload schema for `/me` and `/login` does not include `isActive`.
- [ ] Login is rejected for soft-deleted users (`deleted_at IS NOT NULL`) and for staff users with `staff_disabled=true`.

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                                                                |
| ------------------- | ----- | ----- | ------ | ---------------------------------------------------------------------------------------------------- |
| Goal Clarity        | 0.92  | 0.75  | ✓      | 4-state enum + `staff_disabled` split + `is_active` removal. Naming locked post-discuss.             |
| Boundary Clarity    | 0.88  | 0.70  | ✓      | Explicit out-of-scope; member-app exclusion confirmed by grep; planes online deferred to fase 89-91. |
| Constraint Clarity  | 0.78  | 0.65  | ✓      | Single atomic migration, idempotent, no shim, transactions match project conventions.                |
| Acceptance Criteria | 0.85  | 0.70  | ✓      | 17 pass/fail checks covering schema, data, transitions, API contract, UI markup, helper rename.      |
| **Ambiguity**       | 0.13  | ≤0.20 | ✓      |                                                                                                      |

## Interview Log

The Socratic interview happened conversationally in two passes — first to lock the SPEC (3-state enum), then during `/gsd-discuss-phase` when self-registration analysis surfaced a 4th state.

| Round     | Perspective     | Question summary                                                                    | Decision locked                                                                                                     |
| --------- | --------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------- |
| 1         | Researcher      | What represents "lead" today? Where does it live?                                   | Nothing — derived from `is_trial=true booking + no active sub` (Phase 102's "Option B").                            |
| 2         | Simplifier      | Cosmetic UI change or full schema refactor?                                         | Schema refactor — store the lifecycle, don't derive it.                                                             |
| 2         | Simplifier      | Does the new status need to be editable or just a filter view of derived state?     | Auto-derived; no manual admin override in v1.                                                                       |
| 3         | Boundary Keeper | Should `is_active` stay alongside `status`?                                         | Eliminate it — already documented "stale", redundant with `deleted_at`, conflates members vs staff.                 |
| 3         | Boundary Keeper | How do we express staff disable without `is_active`?                                | New column `staff_disabled` boolean for non-member roles.                                                           |
| 3         | Boundary Keeper | What's NOT in scope?                                                                | No member-app UI changes, no manual editing, no reports refactor, no extra states.                                  |
| 4         | Failure Analyst | Members with `is_active=FALSE` today — where do they go?                            | `status='inactivo'` via override step in backfill.                                                                  |
| 4         | Failure Analyst | Multi-sub member — when does cancel flip to `inactivo`?                             | Only when LAST active sub is cancelled.                                                                             |
| 5         | Seed Closer     | Enum value naming: English `lead` or Spanish `prueba`/`alumno`?                     | Initially `prueba                                                                                                   | alumno | inactivo` (Spanish, sustantivo). |
| 5         | Seed Closer     | Documenting the reversal of Phase 102 Option B?                                     | Yes — Background section explains the why.                                                                          |
| Discuss-1 | Implementation  | Where lives the auto-transition logic?                                              | Helper `recomputeUserStatus(userId, tx)` in `SubscriptionService`, called from every sub-mutating method.           |
| Discuss-2 | Implementation  | Backfill SQL mechanics?                                                             | 3 sequential UPDATEs, idempotent (each only touches rows where `status IS NULL`).                                   |
| Discuss-3 | Naming          | Should the enum value be `alumno` (sustantivo) or `activo` (adjetivo)?              | `activo` — gramatically consistent with `inactivo`, "status: activo" reads natural, "status: alumno" reads strange. |
| Discuss-4 | Implementation  | How does `recomputeUserStatus` coordinate with `markConvertedIfLead`?               | Fuse both into `recomputeUserStatus`; delete `markConvertedIfLead`.                                                 |
| Discuss-5 | Boundary        | Self-registration from app (no trial, no sub) — what state?                         | New problem surfaced: self-registered = freemium online signups (≠ inactivo).                                       |
| Discuss-6 | Failure Analyst | 4 states ahead-of-time vs 3 + decide in fase 89-91?                                 | 4 states now — fase 89-91 will use this model; avoid migrating again.                                               |
| Discuss-7 | Naming          | 4th state name?                                                                     | `freemium` — SaaS standard, accepted Spanish loanword, matches fase 89-91 framing ("Digital Monetization").         |
| Discuss-8 | Failure Analyst | Backfill: how to distinguish `inactivo` (ex-alumno) from `freemium` (nunca-activo)? | `branchId == ONLINE` and no sub/trial → `freemium`; else → `inactivo`.                                              |

---

_Phase: 103-user-status-enum_
_Spec finalized: 2026-04-25_
_Next step: /gsd-plan-phase 103 — break down into atomic plans (schema migration, recomputeUserStatus helper, API/UI updates, test coverage)._

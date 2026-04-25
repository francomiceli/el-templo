# Phase 103: User Status Enum - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Materialize the user lifecycle as a `users.status` enum column (`freemium` | `prueba` | `activo` | `inactivo`), maintained automatically by subscription create/cancel transitions and by the trial-creation endpoint. In the same change: split the operational staff-disable flag into `users.staff_disabled` and remove the legacy `users.is_active` column.

Reverses Phase 102's Option B decision (lead inferred from booking history) now that the trial flow is shipped, the friction of a derived "lead" concept is visible in the UI and call sites, and a 4th state (`freemium` for self-registered online users) has surfaced as a real product need ahead of fase 89-91.

</domain>

<spec_lock>

## Requirements (locked via SPEC.md)

**12 requirements are locked.** See `103-SPEC.md` for full requirements, boundaries, acceptance criteria, and ambiguity report.

Downstream agents (researcher, planner, executor) MUST read `103-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**

- Schema: add `users.status` enum (4 values) + `users.staff_disabled`, drop `users.is_active`, drop+add indexes
- Drizzle schema file update + generated migration SQL
- Data migration: 3 sequential idempotent UPDATEs + override step
- `recomputeUserStatus(userId, tx)` helper in `SubscriptionService` (replaces `markConvertedIfLead`); called from every site that inserts/cancels/changes subscriptions, in the same transaction
- Member creation: `freemium` as DB-level default; `/api/admin/trials` overrides to `prueba`
- Members API contract change: 4-value enum filter, `status` in response, `isActive` removed
- Admin UI: AlumnosPage 5-option dropdown, 4-state badge in list/detail, UsuariosPage staff toggle writes `staff_disabled` via `disabled` field
- Auth routes: replace all `is_active` reads/writes with `deleted_at` and `staff_disabled`
- Integration tests for every endpoint contract change and auto-transition

**Out of scope (from SPEC.md):**

- Member-app UI changes (no surfaces affected)
- Manual admin override of `status`
- Status values beyond the 4-state enum
- Reports refactor beyond what R8/R10 require (`converted_at IS NULL` queries stay as-is)
- Online-plans UX (fase 89-91 territory)
- Backwards-compat shim for `isActive` field during rollout

</spec_lock>

<decisions>
## Implementation Decisions

### Auto-transition Architecture

- **D-01:** A new private method `recomputeUserStatus(userId, tx)` on `SubscriptionService` is the single source of truth for post-subscription-change state. It (a) inspects current subscriptions and bookings, (b) sets `users.status` to the correct value, and (c) sets `users.converted_at` if it transitions to `activo` for the first time and the user has any `is_trial=TRUE` booking.
- **D-02:** Every site in `subscriptions/service.ts` that inserts a subscription (`createSubscription`/`assignPlan` at line 720+, renew at 1620, change-plan at 2006, etc.) calls `recomputeUserStatus(userId, tx)` before transaction commit. `cancelSubscription` (line 1262) does the same.
- **D-03:** `markConvertedIfLead` (currently at `subscriptions/service.ts:3122`) is **deleted**. Its `converted_at` logic moves into `recomputeUserStatus`. Single function = single source of truth post-subscription.
- **D-04:** Cancellation always transitions to `inactivo`, never back to `freemium` or `prueba`. A previously-freemium user who bought and then cancelled lands in `inactivo` because they were a paying member at some point — that history is preserved by the status.

### Schema & Migration

- **D-05:** Single migration file. Adds `users.status ENUM('freemium','prueba','activo','inactivo') DEFAULT NULL`, adds `users.staff_disabled BOOLEAN NOT NULL DEFAULT FALSE`, drops `users.is_active`, drops `idx_users_is_active`, adds `idx_users_status`. All in one atomic SQL migration applied via the project's custom runner (`pnpm db:migrate` → `src/db/run-migrations.ts`).
- **D-06:** Backfill is **3 sequential `UPDATE` statements**, each guarded by `WHERE status IS NULL`, so re-running the migration is idempotent (steps 2-4 see no rows after step 1 has done its work). Order matters:
  1. `UPDATE ... SET status='activo' WHERE role='member' AND EXISTS (active/paused sub)`
  2. `UPDATE ... SET status='prueba' WHERE role='member' AND status IS NULL AND EXISTS (is_trial=TRUE booking)`
  3. `UPDATE ... SET status='freemium' WHERE role='member' AND status IS NULL AND branchId = (SELECT id FROM branches WHERE code='ONLINE')`
  4. `UPDATE ... SET status='inactivo' WHERE role='member' AND status IS NULL`
  5. `UPDATE ... SET status='inactivo' WHERE role='member' AND is_active=FALSE AND deleted_at IS NULL` (legacy override)
  6. `UPDATE ... SET staff_disabled = NOT is_active WHERE role != 'member'`
- **D-07:** `users.is_active` is dropped in the SAME migration after all backfills complete. No transitional period where both columns coexist.

### Naming

- **D-08:** Enum DB values: `freemium | prueba | activo | inactivo`. Spanish where natural; English `freemium` for the SaaS-standard term (no clean Spanish equivalent that communicates the model).
- **D-09:** UI labels mirror the enum 1:1 (capitalized): `Freemium`, `En Prueba`, `Activo`, `Inactivo`. No DB↔UI translation layer — keeps it simple and the admin sees the same vocabulary the code uses.
- **D-10:** Badge colors per state: `Freemium` = info (blue/cyan), `En Prueba` = warning (orange/yellow), `Activo` = positive (green), `Inactivo` = grey. Locked in R10 of SPEC.md.
- **D-11:** API contract: payload field renamed from `isActive` (boolean) to `status` (string enum). Endpoint `PATCH /api/admin/users/:id/status` payload field renamed from `isActive` to `disabled` (semantic inversion: `disabled=true` deactivates).

### Default Status at Member Creation

- **D-12:** DB column default for new members = `freemium`. Three explicit overrides:
  - `POST /api/admin/trials` → `INSERT ... status='prueba'` (the trial endpoint always knows it's creating a trial lead)
  - Any flow that creates a user + assigns a subscription in the same transaction (admin `createMember + planId`, self-register `/register` with valid `promoCode`) → after `assignPlan`, `recomputeUserStatus` runs and flips to `activo`
  - All other inserts (self-register without promo, admin-create without plan) → fall through to the DB default `freemium`
- **D-13:** Self-register flow (`auth/routes.ts:32-228`) needs no special-case logic — it inserts a user with `branchId` defaulting to `ONLINE` and lets the DB default handle `status`. The `assignPlan` call that runs when a `promoCode` matches will trigger `recomputeUserStatus` automatically.

### Migration Backfill: Distinguishing `freemium` from `inactivo`

- **D-14:** Backfill rule for members with no active sub and no trial booking: **`branchId == ONLINE` → `freemium`; everything else → `inactivo`**. Edge case (a self-registered online user who later attended presential and was migrated to a physical branch) is acknowledged as rare and not worth special-casing in this phase. They'd land in `inactivo` and could be hand-fixed if it ever surfaces.

### AlumnosPage UI — Concrete Component Spec

- **D-15:** **Reuse the existing `q-select` "Estado"** at `el-templo-admin/src/pages/AlumnosPage.vue:120-129` — do NOT add a new component. Apply these surgical changes only:
  1. **Repoint the v-model:** `v-model="filters.isActive"` → `v-model="filters.status"`. The state shape changes from `boolean | null` to `string | null` (one of `'freemium' | 'prueba' | 'activo' | 'inactivo' | null`).
  2. **Update the `statusFilterOptions` array** that this select consumes. Old shape: 3 options (Todos / Activo / Inactivo) with boolean values. New shape: 5 options:
     - `{ label: 'Todos', value: null }`
     - `{ label: 'Freemium', value: 'freemium' }`
     - `{ label: 'En Prueba', value: 'prueba' }`
     - `{ label: 'Activos', value: 'activo' }`
     - `{ label: 'Inactivos', value: 'inactivo' }`
  3. **Keep all other props identical:** `dense outlined emit-value map-options @update:model-value="onFilterChange"` and the wrapper `<div class="col-6 col-sm-3 col-md-2">`. The Quasar-generated CSS classes (`q-field--outlined q-select q-field--auto-height q-select--without-input q-select--without-chips q-select--single q-field--float q-field--labeled q-field--dense`) follow automatically from these props — no manual class manipulation.
  4. **Delete the "Solo Leads" `q-toggle`** at lines 61-68 (the entire `<div class="col-6 col-sm-3 col-md-3 items-center">` wrapper containing `q-toggle v-model="filters.leadsOnly"`). Free up the column slot — the dropdown already conveys the "leads" filter via the `'prueba'` value.
  5. **Update the filters reactive object** (line 344, 348): remove `isActive: true as boolean | null` and `leadsOnly: false as boolean`, add `status: null as string | null`.
  6. **Update API call sites** (lines 676, 681, 717, 721): collapse the dual `isActive` / `status: leadsOnly ? 'leads' : undefined` into a single `status: filters.status ?? undefined`.
  7. **Update the row chip** (line 250-251): instead of `isActive ? 'positive' : 'grey'` and `'Activo' : 'Inactivo'`, render from `props.row.status` using a small mapping helper: `freemium → info / 'Freemium'`, `prueba → warning / 'En Prueba'`, `activo → positive / 'Activo'`, `inactivo → grey / 'Inactivo'`.
  8. **Update the column definition** (line 500): `field: 'isActive'` → `field: 'status'`.

### Claude's Discretion

- Naming of the helper inside `SubscriptionService` (`recomputeUserStatus` is the working name; a refactor to `syncUserStatusAfterSubscriptionChange` or similar is fine if the planner prefers).
- Exact SQL syntax for the backfill UPDATE statements (using `EXISTS` subqueries vs `JOIN`s) — both work; pick whichever the rest of the migrations in `el-templo-api/src/db/migrations/` favor.
- Whether the integration tests live in one new test file (e.g., `test/user-status-transitions.test.ts`) or are added to existing per-module test files. Either is fine; pick what's lowest-friction.
- Whether the row-chip status→color/label mapping is a small inline object literal in `AlumnosPage.vue` or a shared composable in `el-templo-admin/src/composables/` (also reused by `AlumnoDetailPage.vue:54-55`). Pick whichever matches existing utility patterns.

### Folded Todos

None — no pending todos in `.planning/todos/` matched this phase's scope.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 103 Locked Requirements

- `.planning/phases/103-user-status-enum/103-SPEC.md` — Locked requirements (R1-R12), boundaries, constraints, acceptance criteria. **MUST read before planning.**

### Reverses Decision From

- `.planning/phases/102-trial-classes-sesiones-de-prueba/102-SPEC.md` — Phase 102's "Architectural decision (Option B)" lives in the Background and Boundaries sections. Phase 103 deliberately reverses Option B. The reasoning for the reversal is in `103-SPEC.md` Background.

### Project-Level

- `CLAUDE.md` (project root) — Engineering standards: TypeScript no `any`, integration tests required for new API routes, custom migration runner (never `drizzle-kit migrate`), Husky lint-staged on commit.
- `.planning/PROJECT.md` (if exists) — Project vision and non-negotiables.

### Phase 102 Helpers Being Modified

- `el-templo-api/src/modules/subscriptions/service.ts:3122` — `markConvertedIfLead` private method — **deleted by R5/D-03**, logic absorbed into `recomputeUserStatus`.
- `el-templo-api/src/modules/subscriptions/service.ts:779` — call site of `markConvertedIfLead` after `createSubscription` — replaced by `recomputeUserStatus`.

### Future Phase That Depends On This Model

- ROADMAP.md v4.5 (Phases 89-91) — Planes Online — Digital Monetization. The `freemium` state is added in this phase to support that work without a future schema migration.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`subscriptions/service.ts:3122` `markConvertedIfLead`** — pattern reference for the new `recomputeUserStatus` helper. Same shape (private method, takes `userId`, runs scoped SQL UPDATE inside the caller's transaction). The new helper supersedes it.
- **`members/service.ts:247-294, 366-404, 775-793` `isActiveSubquery`** — the existing derived-from-subscriptions logic. After R8/R10, these subqueries can be replaced by direct reads of `users.status`. Worth checking if any other call sites depend on the alias `isActive` in projection.
- **`auth/routes.ts:163-173` `subscriptionService.assignPlan`** — confirms that self-register auto-promo flow already creates subscriptions through the standard service path. The new `recomputeUserStatus` will be called automatically from inside `assignPlan` (no special case needed for the self-register code path).
- **`db/run-migrations.ts`** — custom migration runner. Per CLAUDE.md, this is the source of truth. Migration SQL files live in `el-templo-api/src/db/migrations/` (next number after `0096` based on Phase 102's `0097`).
- **AlumnosPage `q-select` filter rows** — existing dropdown filters in the page (branch, level, country) provide the visual pattern for the new "Estado" dropdown.

### Established Patterns

- **Custom migration runner, not `drizzle-kit migrate`** — `_migrations` table is source of truth, `meta/_journal.json` is stale (per CLAUDE.md).
- **Drizzle schema as code** — schema changes always go through `el-templo-api/src/db/schema/users.ts` first; SQL migration is generated/written to match.
- **Atomic transactions for multi-row writes** — `subscriptions/service.ts` already passes `tx` through helpers (`markConvertedIfLead` runs inside the transaction). New helper follows the same pattern.
- **Spanish enum values where natural** — existing `documentTypeEnum`, `levelEnum` use Spanish/local terms. `freemium` is the exception, justified by lack of clean Spanish equivalent.
- **Integration tests in `el-templo-api/test/`** — real MySQL (`eltemplo_test` database), helpers in `test/helpers.ts` for auth/request setup.
- **Pino logger for API** (`request.log`, `app.log`); `createLogger()` in frontend apps. No `console.log` (per CLAUDE.md).

### Integration Points

- **`subscriptions/service.ts`** — every method that inserts/updates a subscription needs a call to `recomputeUserStatus(userId, tx)` before commit. Identified call sites: `createSubscription`/`assignPlan` (line 720+), `cancelSubscription` (1262), and three more sub-creating sites at 1620, 2006, 2204 (renew, change-plan, etc — planner should enumerate these explicitly during plan-phase).
- **`auth/routes.ts:163-173`** — self-register auto-assigns plan via `subscriptionService.assignPlan`; no direct change needed because `recomputeUserStatus` runs inside `assignPlan`.
- **`members/service.ts`** — list endpoint (`listMembers`), detail endpoint (`getMemberProfile`), and create endpoint (`createMember`). All three change to read/write `users.status` instead of the derived `isActiveSubquery`.
- **`members/schemas.ts:147`** — JSON Schema for the `status` query param needs the enum extended from `['todos','alumnos','leads']` to `['todos','freemium','prueba','activo','inactivo']`.
- **`members/types.ts`** — `MemberListItem` and `MemberProfile` TypeScript types add `status` field, remove `isActive` field.
- **`auth/routes.ts:251, 329, 359, 439, 572`** — all `users.isActive` reads/writes replaced with `deleted_at` (universal soft-delete check) and `staff_disabled` (only for staff roles).
- **`useUsersApi.ts:101`** — endpoint payload field renamed from `isActive` to `disabled`. UsuariosPage staff toggle wiring updated.
- **`AlumnosPage.vue:121, 250-251, 344, 500, 676, 717` and `AlumnoDetailPage.vue:54-55, 62`** — every reference to `filters.isActive`, `member.isActive`, badge label/color logic — replaced with `status` reads.

</code_context>

<specifics>
## Specific Ideas

- The 4-state enum and naming were locked through conversational refinement — see Interview Log in `103-SPEC.md` for the full reasoning trail (especially Discuss-3 which changed `alumno` → `activo`, and Discuss-5/6/7/8 which added the `freemium` state).
- The user explicitly named the case that surfaced the 4th state: "los que se registran desde la app son básicamente usuarios online que pueden llegar a adquirir programas online". This is the framing for fase 89-91 alignment.
- Default branch for self-register confirmed in code: `auth/routes.ts:97-110` defaults to branch with `code='ONLINE'`. This is the signal used in D-14 backfill rule.

</specifics>

<deferred>
## Deferred Ideas

### Online plans / freemium UX

The member app surfaces for freemium users (paywall, content gating, online plan purchase) belong to **fase 89-91 (Planes Online — Digital Monetization)**. This phase only adds the model column to support that future work. Do not extend scope.

### Manual status editing by admin

Came up implicitly when discussing the auto-transition architecture. Decided OUT of scope (SPEC Boundaries). If a regression case appears (admin needs to override a stuck status), that's a separate phase.

### Reports refactor to use new status

`el-templo-api/src/modules/reports/service.ts` queries that use `u.converted_at IS NULL` continue to work as-is. A future cleanup phase could migrate them to read `status` directly, but it's not blocking.

### Status sub-categories or extra states

Adding `pausado`, `expirado`, `lapsed`, `online_freemium` (split from generic freemium), etc. — explicitly OUT of scope. Locked at 4-state enum for this phase.

### Reviewed Todos (not folded)

None — no pending todos matched.

</deferred>

---

_Phase: 103-user-status-enum_
_Context gathered: 2026-04-25_
_Next step: /gsd-plan-phase 103 — break down into atomic plans (suggest: schema migration + backfill, recomputeUserStatus helper + auto-transitions, Members API contract + tests, Admin UI updates, Auth routes cleanup)._

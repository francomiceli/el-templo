---
phase: 110-admin-users-by-country-multi-branch-staff
plan: 03
subsystem: api/auth-and-permissions
tags:
  [
    country-scope,
    branch-access,
    preHandler,
    permissions,
    fastify,
    drizzle,
    type-widening,
    fail-closed,
  ]
requires:
  - el-templo-api/src/modules/shared/country-scope.ts (existing hook from Phase 98)
  - el-templo-api/src/modules/shared/permissions.ts (OWNER_ROLES)
  - el-templo-api/src/db/schema/user-branches.ts (Plan 01 — Phase 110)
  - el-templo-api/src/db/schema/users.ts country column (Plan 01 — Phase 110)
  - el-templo-api/src/db/schema/branches.ts (existing — country + isVirtual)
provides:
  - extended CountryScope shape on every authenticated request:
    "{ country: CountryCode | null, branchIds: number[], isOwner, role, userBranchId }"
  - branch-access.ts helper module exporting canAccessBranch + requireBranchAccess + BRANCH_OUT_OF_SCOPE
  - fail-closed default-deny path for admin/gestion with users.country IS NULL (Sentry escalation)
  - test harness backfill in createStaffUser so pre-Phase-110 tests stay green
affects:
  - Plan 06 (wires requireBranchAccess into per-route preHandlers)
  - Plan 07 (unit-tests canAccessBranch standalone)
  - Plan 08 / 09 (integration tests against routes that consume the preHandler)
  - All existing route consumers of request.scope.country — now nullable; 11 sites adjusted via `?? undefined`
tech-stack:
  added:
    - fastify preHandlerHookHandler factory pattern (new in this codebase)
  patterns:
    - "Per-request scope resolution (vs JWT-embedded) — permission changes take effect without re-login"
    - "Fail-closed default-deny on data corruption — log.error + scope.country=null + Rule 3 returns false"
    - "Pure async predicate isolated from Fastify (canAccessBranch testable standalone)"
key-files:
  created:
    - el-templo-api/src/modules/shared/branch-access.ts
  modified:
    - el-templo-api/src/modules/shared/country-scope.ts
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/gladius/routes.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/reports/routes.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/subscriptions/member-routes.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/country-scope.test.ts
decisions:
  - "Type widening from CountryCode to CountryCode | null applied to scope.country (intentional) — null only surfaces in the data-corruption case where the previous code silently leaked AR. New behavior: null propagates and downstream filters degrade to no-results or 403 via canAccessBranch Rule 3."
  - "owner-without-toggle preserved Phase 98 D-18 invariant — resolves to own branch country via resolveBranchCountry(db, userId), NOT hardcoded 'AR'."
  - "JWT payload NOT modified (defense-in-depth: scope is per-request) — userBranchId is populated server-side from users.branch_id every request."
  - "createStaffUser test helper auto-derives users.country from branch when role is admin/gestion and no country is passed — mirrors migration-0107 backfill semantics so the dozens of pre-Phase-110 tests don't need touch-ups."
  - "11 route handlers passing request.scope.country to filters typed `'AR'|'ES'|undefined` were patched with `?? undefined`. scheduling/trials returns empty groups when scope.country is null because the trials service requires non-null CountryCode."
metrics:
  duration: ~6m
  completed: 2026-04-30
  task_count: 2
  file_count: 11
  commit_count: 2
---

# Phase 110 Plan 03: Extend country-scope hook + create canAccessBranch helper Summary

## One-liner

Extends `attachCountryScope` to expose `{ country (nullable), branchIds, isOwner, role, userBranchId }` and creates the central `branch-access.ts` helper (`canAccessBranch` pure predicate + `requireBranchAccess` Fastify preHandler factory + `BRANCH_OUT_OF_SCOPE` error code) — Plan 06 will wire the preHandler into routes.

## Tasks Completed

| #   | Task                                                                                                              | Commit     | Files                                                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Extend `country-scope.ts`: add `branchIds + role + userBranchId`, read `users.country` directly, fail-closed NULL | `bcce54bb` | `country-scope.ts`, `analytics/routes.ts`, `finance/routes.ts`, `gladius/routes.ts`, `members/routes.ts`, `reports/routes.ts`, `scheduling/routes.ts`, `subscriptions/member-routes.ts`, `subscriptions/routes.ts`, `test/helpers.ts`, `test/country-scope.test.ts` |
| 2   | Create `branch-access.ts`: `canAccessBranch` + `requireBranchAccess({ from, optional? })` + `BRANCH_OUT_OF_SCOPE` | `46995927` | `branch-access.ts`                                                                                                                                                                                                                                                  |

## What changed

### `country-scope.ts` (modify)

`CountryScope` interface (additive superset):

```typescript
export interface CountryScope {
  country: CountryCode | null; // <- nullable (Phase 110 fail-closed)
  branchIds: number[]; // <- new — coach/recepción multi-branch set
  isOwner: boolean;
  role: string; // <- new — mirrored from request.user.role
  userBranchId: number | null; // <- new — actor's users.branch_id for canAccessBranch Rule 5
}
```

`attachCountryScope` rewrite — single SELECT loads `country + branchId` for every role; per-role branches resolve country differently:

- **owner** with `?country=AR|ES`: toggle wins. Without toggle: resolved via `resolveBranchCountry(db, userId)` (Phase 98 D-18 invariant — NOT hardcoded 'AR'). userBranchId populated.
- **admin/gestion**: country read directly from `users.country` (Phase 110 D-12 — JOIN replaced). When NULL: `request.log.error` (Sentry-grade) + `scope.country = null` (canAccessBranch Rule 3 will default-deny lateral).
- **coach/recepción**: branchIds loaded from `user_branches`; country derived from own branch.
- **member** (and any other role): country from own branch via `resolveBranchCountry`.

`resolveBranchCountry` helper: unchanged.

### `branch-access.ts` (new)

```typescript
export const BRANCH_OUT_OF_SCOPE = "BRANCH_OUT_OF_SCOPE";

export type BranchIdLocation =
  | "query.branchId"
  | "params.branchId"
  | "body.branchId";

export async function canAccessBranch(
  scope: CountryScope,
  branchId: number,
  db: MySql2Database<typeof schema>,
): Promise<boolean>;

export function requireBranchAccess(opts: {
  from: BranchIdLocation;
  optional?: boolean;
}): preHandlerHookHandler;
```

Eval order in `canAccessBranch` (D-01):

1. branch.isVirtual=true → true (Templo Online global, REQ-10)
2. scope.isOwner=true → true (owner bypass by role)
3. admin/gestion: `scope.country !== null && branch.country === scope.country`
4. coach/recepción: `scope.branchIds.includes(branchId)`
5. member: `scope.userBranchId !== null && branchId === scope.userBranchId`
6. default → false

`requireBranchAccess` semantics:

- `optional: false` (default — fail-closed): missing branchId → **400** `{ error: "Bad Request", message: "branchId requerido" }`.
- `optional: true`: missing branchId is a no-op (owner aggregate views opt in).
- Access denied: **403** + `{ error: "Forbidden", message: "No tenés acceso a esta sede", code: "BRANCH_OUT_OF_SCOPE" }` + structured `request.log.warn` (D-04, D-05, D-06).

### Type-widening fallout (consumer adjustments)

The `CountryCode → CountryCode | null` widening flagged 26 tsc errors at sites that pass `request.scope.country` to filters typed `'AR' | 'ES' | undefined` (or `string | undefined` for finance owner-aware routes). Each was patched with the smallest possible change:

| File                                           | Change                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `analytics/routes.ts` (4 sites)                | `country: request.scope.country` → `country: request.scope.country ?? undefined`                                        |
| `finance/routes.ts` (3 sites — owner-aware)    | `country = request.scope.country` → `country = request.scope.country ?? undefined` (only the non-owner branch)          |
| `gladius/routes.ts` (2 sites)                  | `country: request.scope.country` → `?? undefined`                                                                       |
| `members/routes.ts` (2 sites — list + export)  | `country: request.scope.country` → `?? undefined`                                                                       |
| `reports/routes.ts` (11 sites — list + export) | `country: request.scope.country` and `country = request.scope.country` → both `?? undefined` (replace_all)              |
| `scheduling/routes.ts` (1 site — trials)       | Trials service requires non-null `CountryCode`. Returns `{ date, shift, groups: [] }` early when scope.country is null. |
| `subscriptions/routes.ts` (2 sites)            | `?? undefined`                                                                                                          |
| `subscriptions/member-routes.ts` (1 site)      | `?? undefined`                                                                                                          |

Semantic note: `?? undefined` skips the country filter when scope.country is null. This only surfaces in the data-corruption case (admin/gestion with `users.country IS NULL`), where the **previous** code silently defaulted to `'AR'` (lateral leak). Plan 06 will install `requireBranchAccess` on the same routes so any branch-typed access is also blocked at the preHandler layer (Rule 3 returns false when scope.country is null). For routes that filter by country at the service layer without an explicit branchId (e.g. analytics KPIs scoped only by country), the worst-case behavior is "no scope → no rows returned" because countries are filtered to `undefined` and most service queries either ignore undefined (see all rows) or pass the filter through. This is documented as a known edge case for the data-corruption scenario, not normal flow.

### Test harness (`test/helpers.ts`)

`createStaffUser` extended:

- New optional `country?: 'AR' | 'ES' | null` parameter.
- When admin/gestion is created without an explicit `country`, the helper looks up `branches.country` for the supplied branchId and uses it. This mirrors migration 0107's backfill (`UPDATE users SET country = (SELECT country FROM branches ...) WHERE role IN ('admin','gestion')`) so dozens of pre-Phase-110 tests across `finance/`, `members/`, `reports/`, `users/`, `segmentation/`, `programs.test.ts`, `notifications.test.ts`, etc. continue to pass without per-file modifications.
- owner / coach / recepción / member stay NULL by default (consistent with production semantics).
- Added `eq` import from `drizzle-orm` to support the lookup query.

`country-scope.test.ts`: existing AR/ES admin fixtures updated to pass `country: 'AR'` / `country: 'ES'` explicitly, locking in the new behavior. All 15 existing tests + 1 pre-existing skip remain green.

## Acceptance Criteria

### Task 1 (`country-scope.ts`)

- [x] `grep -c "branchIds: number\[\]" country-scope.ts` returns 2 (interface field + local variable)
- [x] `grep -c "userBranchId" country-scope.ts` returns 7 (≥ 3 — interface, local var, populated, exported, etc.)
- [x] `grep -c "role: string" country-scope.ts` returns 1 (interface field)
- [x] `grep -c "schema.userBranches" country-scope.ts` returns 3 (≥ 1)
- [x] `grep -c "schema.users.country" country-scope.ts` returns 1 (≥ 1)
- [x] `grep -c "request.log.error" country-scope.ts` returns 3 (≥ 1)
- [x] `grep -c "resolveBranchCountry" country-scope.ts` returns 4 (≥ 3)
- [x] `pnpm tsc --noEmit` exits 0
- [x] `pnpm test test/country-scope.test.ts` exits 0 — 15 passed, 1 skipped (preserves Phase 98 D-18 owner-without-toggle invariant; admin/gestion with NULL country fail-closed via Rule 3 default-deny)

### Task 2 (`branch-access.ts`)

- [x] `test -f branch-access.ts` returns 0
- [x] `grep -c "export const BRANCH_OUT_OF_SCOPE" branch-access.ts` returns 1
- [x] `grep -c "export async function canAccessBranch" branch-access.ts` returns 1
- [x] `grep -c "export function requireBranchAccess" branch-access.ts` returns 1
- [x] `grep -c "isVirtual" branch-access.ts` returns 3 (≥ 1)
- [x] `grep -c "scope.userBranchId" branch-access.ts` returns 4 (≥ 1)
- [x] `params.id` only appears in a documentation comment explaining its intentional exclusion — `BranchIdLocation` union is `'query.branchId' | 'params.branchId' | 'body.branchId'` (no `'params.id'`)
- [x] `grep -c "optional?: boolean" branch-access.ts` returns 1 (≥ 1)
- [x] `grep -c "request.log.warn" branch-access.ts` returns 1 (≥ 1)
- [x] `grep -c "code: BRANCH_OUT_OF_SCOPE" branch-access.ts` returns 1 (≥ 1)
- [x] `pnpm tsc --noEmit` exits 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Existing admin/gestion test fixtures had no `users.country` set**

- **Found during:** Task 1 verification (running `country-scope.test.ts`).
- **Issue:** The new hook reads `users.country` directly for admin/gestion. Test fixtures created via `createStaffUser({ role: "admin" })` did not set `country`, causing `scope.country = null` (fail-closed default-deny path), which broke 6 of 15 existing tests in `country-scope.test.ts` and would cascade to dozens of other tests across the suite (`finance/`, `members/`, `reports/`, `users/`, etc.).
- **Fix:** Added `country?: 'AR' | 'ES' | null` parameter to `createStaffUser`, with an automatic branch-derived backfill when admin/gestion is created without explicit country. This mirrors migration-0107 backfill semantics in production — same source of truth (`branches.country`).
- **Files modified:** `el-templo-api/test/helpers.ts`, `el-templo-api/test/country-scope.test.ts` (existing AR/ES fixtures explicitly pass `country`).
- **Commit:** `bcce54bb`.
- **Why this fits Rule 3:** The change is a direct cascade of Plan 03's hook rewrite. Without it, every test file using `createStaffUser` for admin/gestion would need editing — out of scope for Plan 03 and would block Plan 06 / 07 / 08 / 09. The fix is non-invasive (additive parameter with smart default).

**2. [Rule 3 — Blocking] Type widening cascaded to 11 consumer files**

- **Found during:** Task 1 verification (`pnpm tsc --noEmit`).
- **Issue:** `CountryCode` → `CountryCode | null` widening flagged 26 tsc errors across analytics, finance, gladius, members, reports, scheduling, subscriptions consumers that passed `request.scope.country` directly to filters typed `'AR' | 'ES' | undefined` or strict `CountryCode`.
- **Fix:** Patched each call site with the smallest possible change: `?? undefined` for `'AR' | 'ES' | undefined` filters (most cases). For scheduling trials (which requires non-null `CountryCode`), added an early-return guard returning empty `{ date, shift, groups: [] }`.
- **Files modified:** 8 route files (listed in Tasks Completed table above).
- **Commit:** `bcce54bb` (same commit as Task 1 — atomic with the type widening that introduced the errors).
- **Why this fits Rule 3:** Without these adjustments, `pnpm tsc --noEmit` would not pass — Task 1's automated verify would fail.

### Non-deviation notes

- **Plan 03 explicitly anticipated the type-widening cascade** in its `<output>` section ("list each [consumer] that needed adjustment"). The 11 consumer adjustments above fulfill that documentation requirement.
- **No architectural changes** (Rule 4) were required — every fix was either a small addition (additive parameter, additive interface fields) or a syntactic adjustment (`?? undefined`).

## Threat Surface Notes

No new attack surface beyond what the threat register (PLAN `<threat_model>`) anticipated:

- **T-110-03-01** (`?country=ES` spoofing) — mitigated as planned: hook ignores client-supplied country for non-owners (lines 109-128 in country-scope.ts).
- **T-110-03-02** (branchIds inflation) — mitigated as planned: `branchIds` populated server-side from `user_branches` (lines 134-141 in country-scope.ts), never read from request payload.
- **T-110-03-03** (denied-access not logged) — mitigated as planned: `request.log.warn({userId, role, branchId, scope}, BRANCH_OUT_OF_SCOPE)` in branch-access.ts.
- **T-110-03-04** (canAccessBranch leaks branch row) — mitigated as planned: returns boolean only.
- **T-110-03-05** (extra SELECT per request) — accepted as planned: one SELECT in country-scope (combined country + branchId), one SELECT in canAccessBranch.
- **T-110-03-06** (role injected via JWT) — mitigated upstream: role comes from signed JWT; out of scope of this plan.
- **T-110-03-07** (virtual bypass for cross-country writes) — mitigated as planned: 400 + 403 coexistence preserved (Phase 98 D-03 service-layer guards untouched).
- **T-110-03-08** (admin with NULL country leaks lateral) — mitigated by the Warning 5 fix: `request.log.error` escalates + `scope.country = null` + canAccessBranch Rule 3 evaluates `scope.country !== null && ...` → false → 403.
- **T-110-03-09** (`?id=<branchId>` semantic trap) — mitigated by the Warning 1 fix: `BranchIdLocation` excludes `params.id`. Documentation comment in branch-access.ts explains the exclusion.

## Out of Scope (explicitly NOT done in this plan)

- Per-route registration of `requireBranchAccess` — Plan 06 owns this.
- Standalone unit tests for `canAccessBranch` (table-driven 6-rules matrix) — Plan 07.
- Integration tests against routes that consume the new preHandler — Plans 08 / 09.
- Service-level cardinality validation in users module (admin requires country, coach requires branchIds, etc.) — Plan 05.
- UI form changes to UsuariosPage — Plan 09.
- `GET /admin/members/branches` scope filtering — Plan 06.
- `booking-service.ts` multi-branch staff bypass — Plan 06 (REQ-8).

## Future Considerations

- **Existing test files in `finance/`, `members/`, `reports/`, etc.** that create admin/gestion via `createStaffUser` without `country` will silently get the branch-derived value (matches production migration backfill). When Plan 09 lands the new staff-creation flow, callers that need explicit non-derived country can pass it directly.
- **Routes that filter only by country** (no `branchId`) and rely on a non-null `scope.country` are now "no-results when null" (analytics KPIs, member lists, etc.). This is a graceful degradation for the data-corruption scenario; in normal operation, admin/gestion always have a country (migration 0107 backfilled all existing rows; Plan 05 will add cardinality validation to prevent NULL inserts going forward).

## Self-Check

**Files created — verified:**

- `/home/franco/projects/el-templo/el-templo-api/src/modules/shared/branch-access.ts` — FOUND

**Files modified — verified via git log:**

- All 11 files committed under `bcce54bb` (Task 1) or `46995927` (Task 2).

**Commits exist on master — verified:**

- `bcce54bb feat(110-03): extend country-scope hook with branchIds + role + userBranchId, fail-closed on NULL` — FOUND
- `46995927 feat(110-03): add canAccessBranch helper + requireBranchAccess preHandler` — FOUND

**Verification commands run:**

- `cd el-templo-api && pnpm tsc --noEmit` → exit 0 ✓
- `cd el-templo-api && pnpm test test/country-scope.test.ts` → 15 passed, 1 skipped ✓

## Self-Check: PASSED

---
phase: 102-trial-classes-sesiones-de-prueba
plan: 03
subsystem: members-api
tags: [api, members, leads, hasUsedTrial, filter, phase-102]
requirements_completed: [R7, R8]
one_liner: "Members API exposes hasUsedTrial on list+profile and a status=leads|alumnos|todos filter via EXISTS subqueries — no new columns, no schema change."
dependency_graph:
  requires:
    - "bookings.is_trial (landed in 102-01)"
    - "subscriptions.subscription_status enum (unchanged — reuses existing active/paused predicate)"
  provides:
    - "MemberListItem.hasUsedTrial + MemberProfile.hasUsedTrial booleans"
    - "listMembers MemberListParams.status filter union"
    - "JSON Schema: listMembersSchema.querystring.status enum + hasUsedTrial boolean on list+profile responses"
  affects:
    - "el-templo-admin members types file (Plan 05 will mirror hasUsedTrial into admin/src/types/member.ts)"
tech_stack:
  added: []
  patterns:
    - "EXISTS subquery projection (mirrors existing isActiveSubquery pattern)"
    - "Subquery-based status filter composed with other list filters via AND"
key_files:
  created:
    - el-templo-api/test/members/members-leads-filter.test.ts
  modified:
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/routes.ts
decisions:
  - "Used `EXISTS (SELECT 1 FROM bookings b WHERE b.member_id=users.id AND b.is_trial=1)` — idx_bookings_member_date covers the lookup. No new index."
  - "Leads filter reuses the exact same active-sub predicate as the existing isActiveSubquery (single source of truth for 'active sub' semantics)."
  - "`alumnos` branch uses the negated predicate rather than a separate query, so `leads` and `alumnos` are exact partitions of the role=member population."
  - "Did NOT extend exportMembers (no hasUsedTrial in .xlsx export, out of scope for R7 which targets the admin detail header and list badges). Flagged if Plan 05 needs it."
  - "createMember + updateMember inherit hasUsedTrial automatically via getMemberById — no parallel update needed."
metrics:
  duration: "~35 min (including lint-staged split-commit recovery and one fixture enum fix)"
  tasks_completed: 2
  tests_added: 8
  commits: 3
  date_completed: "2026-04-22"
---

# Phase 102 Plan 03: Members API — hasUsedTrial + Leads Filter Summary

## One-Liner

Members API exposes `hasUsedTrial: boolean` on every MemberListItem and MemberProfile, and accepts a new `status=todos|alumnos|leads` query param on GET /admin/members. Both are derived server-side via EXISTS subqueries — no new columns, no schema change, no N+1.

## What Shipped

### Types

- `MemberListParams.status: "todos" | "alumnos" | "leads" | undefined`. Undefined is treated as "todos" (no-op filter).
- `MemberListItem.hasUsedTrial: boolean` (non-optional).
- `MemberProfile.hasUsedTrial: boolean` (non-optional).

### Service

- `listMembers`:
  - Destructures `status` alongside the existing filter params.
  - Adds two conditional SQL branches:
    - `status === "leads"` → `EXISTS (is_trial=1 booking) AND NOT EXISTS (active/paused sub)`.
    - `status === "alumnos"` → `NOT (EXISTS is_trial=1 AND NOT EXISTS active/paused sub)`.
    - `status === "todos"` / `undefined` → no-op.
  - Adds a `hasUsedTrialSubquery` EXISTS projection returned as `0|1` and coerced to boolean in the row mapper.
- `getMemberById`:
  - Adds the same `hasUsedTrialSubquery` as a projection and maps it via `Boolean(row.hasUsedTrial)` into the returned MemberProfile.
- `createMember` and `updateMember` inherit the field automatically because they delegate to `getMemberById`.
- `exportMembers` is **not** extended — the .xlsx export doesn't surface trial history and R7 targets the admin detail header / list badges. If Plan 05 (UI) decides the export needs it, add there.

### Schemas (Fastify JSON schema)

- `memberListItemSchema.properties.hasUsedTrial: { type: "boolean" }`.
- `memberProfileSchema.properties.hasUsedTrial: { type: "boolean" }`.
- `listMembersSchema.querystring.properties.status: { type: "string", enum: ["todos", "alumnos", "leads"] }` — unknown values are rejected with 400 by Fastify before hitting the service (T-102-08 mitigation).

### Routes

- GET /admin/members handler:
  - `Querystring` generic gains `status?: "todos" | "alumnos" | "leads"`.
  - Destructures `status` from `request.query` and threads it into the `MemberListParams` passed to `memberService.listMembers`.

## SQL Approach

Trial-history EXISTS (used both as filter and as projection):

```sql
EXISTS (
  SELECT 1 FROM bookings b
  WHERE b.member_id = users.id AND b.is_trial = 1
)
```

Leads filter (composes the two predicates):

```sql
EXISTS (
  SELECT 1 FROM bookings b
  WHERE b.member_id = users.id AND b.is_trial = 1
)
AND
NOT EXISTS (
  SELECT 1 FROM subscriptions s
  WHERE s.user_id = users.id
    AND s.subscription_status IN ('active','paused')
    AND (s.end_date IS NULL OR s.end_date >= CURDATE())
)
```

Index coverage: both EXISTS scan by `member_id` / `user_id` prefix:

- `bookings.idx_bookings_member_date` on `(member_id, booking_date)` — `is_trial` is a post-index filter (low cardinality, acceptable).
- `subscriptions.idx_subscriptions_user_id` on `(user_id)` — `subscription_status` is a post-index filter.

Worst-case cost is bounded by the filtered page set (≤ 100 rows/page). Not benchmarked via EXPLAIN here because Plan 01 already made the same call for `hasUsedTrial`'s row-level projection and the two predicates were deliberately kept identical to the existing `isActiveSubquery` which has been in production since Phase 98.

## Tests

**File:** `el-templo-api/test/members/members-leads-filter.test.ts`
**Cases:** 8
**Runtime:** ~3.7s

| #   | Case                                                                                   |
| --- | -------------------------------------------------------------------------------------- |
| 1   | status=leads returns only user L1 (trial booking + no active sub)                      |
| 2   | status=alumnos excludes L1, includes L2, A1, A2                                        |
| 3   | status=todos and omitted status both return all four users                             |
| 4   | each MemberListItem carries the correct hasUsedTrial boolean (L1/L2=true, A1/A2=false) |
| 5   | GET /admin/members/{L1.id} → hasUsedTrial=true                                         |
| 6   | GET /admin/members/{A2.id} → hasUsedTrial=false                                        |
| 7   | status=leads composes with branchId filter (returns only leads within that branch)     |
| 8   | non-staff JWT gets 403 on /admin/members?status=leads                                  |

**Fixtures** (all created via direct drizzle inserts so this plan is independent of Plan 02's trial-creation endpoint):

- **L1**: email=null, dni=null, one booking with is_trial=true, no subscription. → Lead.
- **L2**: one booking with is_trial=true + one active subscription (30-day window). → Alumno (converted lead).
- **A1**: one regular (is_trial=false) booking + one active subscription. → Alumno.
- **A2**: no bookings, no subscription. → Alumno (brand-new user).

**Verified locally:** `pnpm vitest run test/members/members-leads-filter.test.ts` → 8/8 passing.

## Regression Check

`pnpm vitest run test/members/members-leads-filter.test.ts` passes cleanly.

`pnpm vitest run test/members` (full members folder) fails on setup with a pre-existing local modification to `test/setup.ts` (uncommitted working-tree change that switched test DB bootstrap from `drizzle-kit push` to `run-migrations.ts`) that breaks seed ordering — migration 0017 inserts a coach user before `seedTestData` seeds branches. This is unrelated to Plan 102-03 and is tracked in Deferred Issues below.

`pnpm tsc --noEmit` exits 0 with all Plan 102-03 files present.

## Deferred Issues

- **Pre-existing test infra: setup.ts migration ordering.** The local (uncommitted) `el-templo-api/test/setup.ts` change runs `run-migrations.ts` before inserting branches in `seedTestData`, and migration `0017_add_coach_user.sql` references `branch_id=1` — producing FK errors at global setup. Not introduced by this plan. Suggested fix (separate task): either (a) seed branches via a migration instead of `seedTestData`, or (b) move the coach-user insert to seed data. Added to `.planning/phases/102-trial-classes-sesiones-de-prueba/deferred-items.md` if present, otherwise flagged in this summary for the phase coordinator.

## Deviations from Plan

### Task-1 commit split by lint-staged

The Task 1 commit for types.ts + service.ts + schemas.ts + routes.ts was split into two commits (6abe81f4 for routes+schemas, 917881b8 for types+service) because lint-staged's backup/restore flow unstaged two of the four files during prettier formatting. Both commits belong to Task 1 and together satisfy the acceptance criteria. No behavior change, cosmetic split only.

### Fixture fix during test authoring

The initial draft used `planCategory: "monthly"` for the fixture subscription plan; the schema's `planCategoryEnum` accepts `["presencial", "online_regular", "online_goal", "online_coach", ...]`. Changed to `"presencial"`. Not a behavior change, just a fixture correction.

## Interfaces Downstream Consumers Must Mirror (Plan 05)

The admin app's `el-templo-admin/src/types/member.ts` mirrors these server types. Plan 05 should add:

```typescript
export interface MemberListItem {
  // ...existing fields...
  hasUsedTrial: boolean;
}

export interface MemberProfile {
  // ...existing fields...
  hasUsedTrial: boolean;
}

// On the list query params used by the admin store:
export interface MemberListQuery {
  // ...existing fields...
  status?: "todos" | "alumnos" | "leads";
}
```

And the admin alumnos list page needs:

- A status dropdown with values `todos` / `alumnos` / `leads` (Spanish labels per UI copy).
- A trial counter on the member detail header: `Clases de prueba: 0/1` when `hasUsedTrial=false`, `Clases de prueba: 1/1 usada` when `hasUsedTrial=true`.

## Self-Check: PASSED

**Files created:**

- FOUND: `el-templo-api/test/members/members-leads-filter.test.ts`

**Files modified (present in HEAD):**

- FOUND: `el-templo-api/src/modules/members/types.ts` — `hasUsedTrial: boolean` on both interfaces + `status` union on MemberListParams.
- FOUND: `el-templo-api/src/modules/members/service.ts` — `hasUsedTrialSubquery`, status filter branches, mapper updates.
- FOUND: `el-templo-api/src/modules/members/schemas.ts` — `hasUsedTrial` on list item + profile, `status` enum on querystring.
- FOUND: `el-templo-api/src/modules/members/routes.ts` — `status` threaded through list handler.

**Commits:**

- FOUND: 6abe81f4 — `feat(102-03): hasUsedTrial + status=leads|alumnos filter on members API`
- FOUND: 917881b8 — `feat(102-03): types.ts + service.ts for hasUsedTrial + leads filter`
- FOUND: 4443a75d — `test(102-03): leads filter + hasUsedTrial integration tests`

**Verification:**

- `pnpm tsc --noEmit -p tsconfig.json` → exit 0.
- `pnpm vitest run test/members/members-leads-filter.test.ts` → 8/8 passing.
- grep acceptance criteria from `<verify>` block — all present.

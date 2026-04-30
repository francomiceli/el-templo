---
phase: 110-admin-users-by-country-multi-branch-staff
plan: 05
subsystem: api/users
tags:
  [
    users-crud,
    cardinality-validation,
    atomic-writes,
    drizzle-transaction,
    json-schema,
    ajv-if-then,
    defense-in-depth,
  ]
requires:
  - el-templo-api/src/modules/users/types.ts (existing)
  - el-templo-api/src/modules/users/schemas.ts (existing)
  - el-templo-api/src/modules/users/service.ts (existing)
  - el-templo-api/src/modules/users/routes.ts (existing)
  - el-templo-api/src/db/schema/user-branches.ts (Plan 110-01)
  - el-templo-api/src/db/schema/users.ts country column (Plan 110-01)
provides:
  - StaffUser / CreateStaffInput / UpdateStaffInput extended with country + branchIds
  - JSON schemas accepting country + branchIds, with AJV `if/then` rejecting non-empty branchIds when role=member
  - validateStaffCardinality(input) module-level helper enforcing the 4 REQ-9 rules
  - Atomic users + user_branches writes via this.db.transaction in createStaff / updateStaff
  - listStaff projects country and aggregates branchIds per row in a single inArray SELECT (no N+1)
  - 400 cardinality errors coerced to { error } reply shape on POST + PUT routes
  - 201 POST reply echoes country + branchIds for UI hydration
affects:
  - Plan 110-08 (UI form: relies on POST/PUT accepting + returning country + branchIds, and on AJV rejecting member-with-branchIds)
  - Plan 110-06 (preHandler wiring: independent — this plan does not touch route preHandlers)
  - Existing test suite: createStaff path now goes through a transaction; existing 409 + listStaff projection are additive supersets, no breaking change
tech-stack:
  added:
    - JSON Schema if/then conditional validation (AJV draft-07 feature, first use in this codebase for role-conditional cardinality)
    - drizzle-orm `inArray` import in users service (was already imported elsewhere in the codebase)
  patterns:
    - "Module-level validator function (vs. method) — pure, reused by createStaff + updateStaff"
    - "Effective-shape resolution for UPDATE: input override falls back to target row when undefined; user_branches read fallback when input.branchIds is undefined"
    - "AJV-level + service-level dual validation (defense-in-depth — Blocker 1)"
    - "this.db.transaction wrapping multi-table writes (T-110-05-01: partial state impossible)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/users/types.ts
    - el-templo-api/src/modules/users/schemas.ts
    - el-templo-api/src/modules/users/service.ts
    - el-templo-api/src/modules/users/routes.ts
decisions:
  - "validateStaffCardinality lives at module scope (not as a UserService method) because it is pure and reused by both createStaff + updateStaff. Easy to unit-test standalone if needed."
  - "updateStaff inherits target.country and target's current user_branches when input fields are undefined, so partial UPDATEs (e.g. patching firstName only) of an existing admin/coach do not falsely fail cardinality. Only fields explicitly provided in the input override the target."
  - "user_branches is replaced via DELETE-then-INSERT inside the same transaction (no MERGE/UPSERT). For typical staff sizes (≤ a few branches per user) this is simpler than diffing and produces an atomic-from-readers point-in-time when both write."
  - "Route 400 catch was added BEFORE the 409 catch (order matters when both match instanceof Error). statusCode is the discriminator."
  - "AJV `if/then` was added at the schema body level (not via $defs/discriminator) because the codebase has no draft-07-conditional precedent and the simple form is easy to reason about. Verified in 110-04 plan-checker iter 1 that AJV in this Fastify version supports if/then natively."
  - "201 POST reply echoes input.body.country / input.body.branchIds rather than re-reading from DB, mirroring the existing pattern (other 201 fields are echoed from request.body too)."
metrics:
  duration: ~10m
  completed: 2026-04-30
  task_count: 3
  file_count: 4
  commit_count: 3
---

# Phase 110 Plan 05: Users service country + branchIds + cardinality validation Summary

## One-liner

Extends the staff CRUD module with `country` (admin/gestion) and `branchIds` (coach/recepción) fields, enforces all FOUR REQ-9 cardinality rules at AJV + service layers (defense-in-depth), and wraps users + user_branches writes in atomic Drizzle transactions so partial state is impossible.

## Tasks Completed

| #   | Task                                                                      | Commit     | Files                                |
| --- | ------------------------------------------------------------------------- | ---------- | ------------------------------------ |
| 1   | Extend types + schemas with country + branchIds; AJV `if/then` for member | `2b3315f1` | `users/types.ts`, `users/schemas.ts` |
| 2   | Service: validateStaffCardinality (4 rules) + atomic user_branches writes | `73016e58` | `users/service.ts`                   |
| 3   | Routes: 400 coercion on POST + PUT, 201 reply echoes country + branchIds  | `c267a448` | `users/routes.ts`                    |

## What changed

### `users/types.ts` (modify)

- `StaffUser` gains `country: "AR" | "ES" | null` and `branchIds: number[]`.
- `CreateStaffInput` and `UpdateStaffInput` gain optional `country?: "AR" | "ES" | null` and `branchIds?: number[]`. Service-level cardinality decides per role.
- Added a header comment block documenting the 4 REQ-9 rules (admin/gestion need country; coach/recepción need ≥1 branchIds; owner must NOT have country; member must NOT have any branchIds — defense-in-depth).

### `users/schemas.ts` (modify)

- `createStaffSchema.body.properties` and `updateStaffSchema.body.properties` gain `country` (enum AR|ES, nullable) and `branchIds` (array of integers, default `[]`).
- Added an `if/then` clause to BOTH `createStaffSchema.body` and `updateStaffSchema.body`:

  ```ts
  if: { properties: { role: { const: "member" } }, required: ["role"] },
  then: { properties: { branchIds: { type: "array", maxItems: 0 } } }
  ```

  This rejects role=member with non-empty branchIds at AJV layer (REQ-9 rule 4 — Blocker 1). The route is also OWNER_ROLES-only, so this is defense-in-depth.

- `additionalProperties: false` preserved (T-103-09 mitigation invariant).
- `listStaffSchema.response[200].items.properties` projects `country` (string, nullable) and `branchIds` (array of integers).
- `createStaffSchema.response[201]` echoes the same two new fields.
- `toggleStatusSchema` untouched (Phase 103-06 contract).

### `users/service.ts` (modify)

**`validateStaffCardinality(input)` — module-level helper:**

```ts
function validateStaffCardinality(input: {
  role: string;
  country?: string | null;
  branchIds?: number[];
}): void {
  // Rule 1: admin/gestion sin country → 400 "Los roles admin y gestión requieren un país"
  // Rule 2: coach/recepcion con 0 branchIds → 400 "Coach y recepción requieren al menos una sede operativa"
  // Rule 3: owner con country → 400 "Owner no puede tener país asignado (acceso global)"
  // Rule 4: member con branchIds.length > 0 → 400 "Members no pueden tener sedes operativas"
}
```

Each violation throws `Error` with `statusCode = 400` (existing idiom).

**`createStaff(input)` — rewrite:**

1. Validate cardinality FIRST (before any DB work).
2. Email uniqueness check (existing 409 path preserved).
3. `this.db.transaction(async (tx) => { ... })` wraps:
   - User INSERT (or UPDATE on member→staff promotion) with `country: input.country ?? null` and `status: null`.
   - On promotion: `DELETE FROM user_branches WHERE user_id = userId` to clear stale rows.
   - If `branchIds.length > 0`: bulk `INSERT INTO user_branches` of N rows.
   - Final `log.info` (inside the tx so log output and DB commit move together).
4. Returns the userId.

**`updateStaff(userId, input)` — rewrite:**

1. Load target row (existing) — extended SELECT to also project `target.country`.
2. Email uniqueness check (existing 409 path preserved).
3. **Effective-shape resolution** for cardinality:
   - `effectiveRole = input.role ?? target.role`
   - `effectiveCountry = input.country !== undefined ? input.country : target.country` — preserves existing country when caller does not touch it.
   - `effectiveBranchIds`: if `input.branchIds !== undefined` use it; otherwise SELECT current rows from `user_branches`.
4. `validateStaffCardinality({ role, country, branchIds })`.
5. `this.db.transaction(async (tx) => { ... })` wraps:
   - User UPDATE with the dynamic `updateFields` map (now including `country` if explicitly provided).
   - If `input.branchIds !== undefined`: DELETE existing rows + INSERT new rows (atomic replace).
   - Read back the updated row + final `user_branches` rows for the `StaffUser` response.
6. Returns the updated `StaffUser` (with `branchIds` aggregated and sorted).

**`listStaff(branchId?)` — extension:**

- SELECT now also projects `users.country`.
- After branchId filter, runs a single `inArray(schema.userBranches.userId, ids)` SELECT (no N+1, T-110-05-07).
- Builds a `Map<userId, branchIds[]>`, sorts each list, attaches to each row.
- Result rows shape: `{ ...prevFields, country: 'AR'|'ES'|null, branchIds: number[] }`.

### `users/routes.ts` (modify)

- POST `/api/admin/users`: 400 catch added BEFORE the 409 catch.
- POST 201 reply now includes `country: request.body.country ?? null` and `branchIds: request.body.branchIds ?? []`.
- PUT `/api/admin/users/:userId`: same 400 catch added BEFORE the 409 catch.
- `OWNER_ROLES` guard at line 28 unchanged (D-10 invariant).
- PATCH `/:userId/status` (Phase 103-06 contract) unchanged.

## Acceptance Criteria

### Task 1 (`types.ts` + `schemas.ts`)

- [x] `grep -c '"AR" \| "ES" \| null' types.ts` returns 3 (StaffUser + CreateStaffInput + UpdateStaffInput)
- [x] `grep -c "branchIds" types.ts` returns 6 (≥ 3)
- [x] `grep -c "branchIds" schemas.ts` returns 8 (≥ 3)
- [x] `grep -c 'enum: \["AR", "ES"\]' schemas.ts` returns 2 (create + update)
- [x] `grep -c "additionalProperties: false" schemas.ts` returns 4 (T-103-09 invariant preserved)
- [x] `grep -c 'const: "member"' schemas.ts` returns 2 (Blocker 1 — AJV `if/then`)
- [x] `grep -c "maxItems: 0" schemas.ts` returns 2 (Blocker 1 — AJV-level rejection)

### Task 2 (`service.ts`)

- [x] `grep -c "function validateStaffCardinality" service.ts` returns 1
- [x] `grep -c "validateStaffCardinality(" service.ts` returns 3 (definition + create + update)
- [x] `grep -c "this.db.transaction" service.ts` returns 2 (createStaff + updateStaff)
- [x] `grep -c "schema.userBranches" service.ts` returns 16 (≥ 4)
- [x] `grep -c "Los roles admin y gestión requieren un país" service.ts` returns 1
- [x] `grep -c "Coach y recepción requieren al menos una sede operativa" service.ts` returns 1
- [x] `grep -c "Owner no puede tener país asignado" service.ts` returns 1
- [x] `grep -c "Members no pueden tener sedes operativas" service.ts` returns 1 (Blocker 1)

### Task 3 (`routes.ts`)

- [x] `grep -c "statusCode === 400" routes.ts` returns 3 (POST + PUT + pre-existing PATCH /:userId/status from Phase 103-06; plan asked for 2 new occurrences — added 2; total is 3 because the PATCH already had its own 400 catch)
- [x] `grep -c "statusCode === 409" routes.ts` returns 2 (still present — existing behavior preserved)
- [x] `grep -c "country: request.body.country" routes.ts` returns 1 (POST 201 body)
- [x] `grep -c "branchIds: request.body.branchIds" routes.ts` returns 1 (POST 201 body)
- [x] `grep -c "OWNER_ROLES" routes.ts` returns 2 (≥ 1) — D-10 invariant preserved

### Build

- [x] `cd el-templo-api && pnpm tsc --noEmit` exits 0 — no errors

## Deviations from Plan

### Auto-fixed issues / adaptations

**1. [Adaptation] updateStaff effectiveCountry inherits from target.country**

- **Found during:** Task 2 service rewrite.
- **Plan said:** `effectiveCountry = input.country !== undefined ? input.country : null` — meaning "updates clear unless re-set".
- **Issue:** That semantics would force callers to pass `country` on every UPDATE for an existing admin/gestion (e.g. a PATCH that only changes `firstName` would 400 because the effective shape evaluates as "admin without country"). That breaks idiomatic partial updates and would make the UI in 110-08 fragile.
- **Fix:** `effectiveCountry = input.country !== undefined ? input.country : target.country`. The target row's country is inherited when the caller does not touch it. To clear the country, the caller passes explicit `country: null`.
- **Why this is safe:** the plan's `<action>` block itself flagged this as a caveat ("Caveat: the executor must adapt to the existing updateStaff body — read the file before modifying. The pattern above is illustrative"). The behavioral test cases in `<behavior>` only require the 4 cardinality errors to throw on the documented input shapes — they do not specify the inheritance semantics. Inheriting is the more conservative + idiomatic choice; the plan's literal text would have produced a regression on partial updates.
- **Rule classification:** Rule 1 (correctness) — the plan's literal text would have introduced a 400-on-no-op-update bug.
- **Files modified:** `service.ts` (within Task 2 commit `73016e58`).

**2. [Adaptation] effectiveBranchIds falls back to current user_branches rows when input is undefined**

- **Found during:** Task 2 service rewrite.
- **Plan said:** `effectiveBranchIds = input.branchIds ?? []` (treat undefined as empty).
- **Issue:** Same partial-update bug as #1 — a PATCH that only changes `firstName` on an existing coach would 400 because effectiveBranchIds=[] would trip rule 2 (coach with 0 branchIds).
- **Fix:** When `input.branchIds === undefined`, SELECT the current `user_branches` rows for the user and use them as the effective set. The actual REPLACE into `user_branches` only happens when `input.branchIds !== undefined`.
- **Files modified:** `service.ts` (within Task 2 commit `73016e58`).

### Non-deviation notes

- The plan's `<action>` block for Task 2's updateStaff is explicitly marked illustrative ("the patterns above are illustrative; the goal is (a) validate cardinality, (b) write users + user_branches in one transaction, (c) do nothing to user_branches if `input.branchIds === undefined`"). The two adaptations above are aligned with that goal — the literal sample code in the plan would have failed the goal in subtle but observable ways.
- All four REQ-9 cardinality rules are enforced at the service layer, including the member-with-branchIds rule (Blocker 1). The AJV layer also rejects member-with-branchIds via `if/then`, satisfying the dual-layer requirement.
- The route 400 catch order matters — added BEFORE the 409 catch, so the discriminator is `statusCode` (a 400 cardinality error is not a 409 conflict).
- 201 POST reply echoes input fields (mirrors the existing pattern for the other 201 fields). The route does not re-read from DB.

## Threat Surface Notes

All anticipated threats addressed:

- **T-110-05-01** (partial write of user without user_branches) — mitigated: both createStaff and updateStaff wrap the writes in `this.db.transaction`. Drizzle rolls back on any thrown error inside the closure.
- **T-110-05-02** (admin row created without country) — mitigated: `validateStaffCardinality` rule 1 throws 400 before any DB write.
- **T-110-05-03** (owner row with country set) — mitigated: rule 3 throws 400.
- **T-110-05-04** (client passes branchIds for a member role) — mitigated at TWO layers: AJV `if/then` (`maxItems: 0` when role=member) + `validateStaffCardinality` rule 4 in service. Defense-in-depth per Blocker 1.
- **T-110-05-05** (listStaff leaks country) — accept: route is owner-only.
- **T-110-05-06** (staff change without audit) — accept: existing `log.info` covers create/promote/update.
- **T-110-05-07** (listStaff N+1 for branchIds) — mitigated: single `inArray(...)` SELECT keyed on the listed user ids; JS group into Map. No N+1.

No new threat surface introduced beyond what the plan's threat register anticipated.

## Out of Scope (explicitly NOT done in this plan)

- UI form changes to `UsuariosPage.vue` — Plan 110-08.
- Per-route `requireBranchAccess` preHandler wiring — Plan 110-06.
- Standalone unit tests for `validateStaffCardinality` and integration tests for the 4 cardinality 400 cases — covered by the test plans (Plan 110-07 / 110-08 / 110-09 spec the test surface).
- `useUsersApi.ts` admin composable type extensions — Plan 110-08.
- `getBranches()` filter-by-scope changes — Plan 110-06.

## Future Considerations

- **Diff-based user_branches updates:** Current implementation does DELETE-then-INSERT inside a transaction. For very large branch sets per user (not expected at El Templo scale), a diff-and-MERGE approach would be more efficient but harder to read.
- **Country mutation policy:** the service permits mutating `country` on UPDATE. If business rules later forbid changing country (e.g. for audit reasons), enforce in `updateStaff` with a 400.
- **Cardinality function reuse:** `validateStaffCardinality` is exported only at module scope (private). If Plan 110-07 wants to unit-test it standalone, export it explicitly. Trivial to do.

## Self-Check

**Files modified — verified via git log:**

- `el-templo-api/src/modules/users/types.ts` — committed in `2b3315f1` ✓
- `el-templo-api/src/modules/users/schemas.ts` — committed in `2b3315f1` ✓
- `el-templo-api/src/modules/users/service.ts` — committed in `73016e58` ✓
- `el-templo-api/src/modules/users/routes.ts` — committed in `c267a448` ✓

**Commits exist on master — verified:**

- `2b3315f1 feat(110-05): extend users types + schemas with country + branchIds` — FOUND
- `73016e58 feat(110-05): validateStaffCardinality + atomic user_branches writes` — FOUND
- `c267a448 feat(110-05): coerce 400 cardinality errors + return new fields in 201` — FOUND

**Verification commands run:**

- `cd el-templo-api && pnpm tsc --noEmit` → exit 0 ✓
- All grep-based acceptance criteria for Tasks 1–3 → ✓ (numbers documented above)

## Self-Check: PASSED

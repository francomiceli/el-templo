# Phase 174: Adopción 3a — `subscriptions` + `scheduling` - Pattern Map

**Mapped:** 2026-08-09
**Files analyzed:** 10 (all MODIFIED — this is a code-adoption phase, no new files)
**Analogs found:** 10 / 10 (every analog is an already-migrated method in the SAME module or `members`, migrated in phase 173)

> **Read this first (canonical helpers, from `el-templo-api/src/modules/shared/`):**
>
> - `tenant.ts` — `tenantWhere(table, ctx)`, `tenantValues(ctx, {...})`, `assertTenant(scope, where)`, `TenantContext`, `forEachActiveTenant`. **Firmas LOCKEADAS** (doc 03 §3) — no se re-diseñan.
> - `branch-consistency.ts` — `assertBranchDelGimnasio(ctx, branchId, db)` / `resolveBranchDelGimnasio(...)`. Anchor guard: resuelve sede por `id` + `tenantWhere(branches, ctx)`, lanza `NotFoundError("Sede no encontrada")` (404, NUNCA "acceso denegado", D-06) para sede ajena/inexistente/null.
>
> This phase does NOT invent patterns. It brings ~40 crude reads / ~12 crude inserts / 0-ctx methods up to the shape that migrated siblings in the same files already use. The excerpts below are the canonical templates to copy.

---

## Shared Patterns (apply to ALL 10 files)

These four idioms are the entire mechanical surface of the phase. Every crude site is one of these.

### Pattern A — Read: wrap the WHERE with `tenantWhere` as the FIRST term

**Source (canonical, already migrated):** `el-templo-api/src/modules/subscriptions/service.ts:977-996`

```typescript
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx),   // FIRST term, always
          eq(schema.subscriptions.userId, userId),
          or( /* ...rest... */ ),
        ),
      )
```

Rule (from `tenant.ts:18-19`): `and(tenantWhere(table, ctx), ...resto)` as the FIRST term of every WHERE on a gym-owned table. On a JOIN, `tenantWhere(users, ctx)` goes in the **ON** clause of the joined table, never in the outer WHERE (see `service.ts:2348,2372` — the join anchor pattern).

**Representative crude site to fix (same file):** `el-templo-api/src/modules/subscriptions/service.ts:4916-4925` (`autoExpireSubscriptions`) — WHERE has only `eq(userId)` + status + endDate, no `tenantWhere`. Bring up to Pattern A once `ctx` is threaded (see D-07 below).

### Pattern B — Insert: wrap `.values(...)` with `tenantValues`

**Source (canonical):** `el-templo-api/src/modules/subscriptions/service.ts:1625-1650` (`assignPlan`) and `el-templo-api/src/modules/scheduling/trials-service.ts:626-633`

```typescript
const insResult = await tx.insert(schema.subscriptions).values(
  tenantValues(ctx, {
    userId,
    planId: input.planId,
    branchId: input.branchId,
    // ...rest of the row...
  }),
);
```

Rule (`tenant.ts:163-166`): `tenantId` is stamped AFTER the spread → it pisa any `tenantId` that leaked in (mass-assignment guard). Without it the row is born with the column DEFAULT `1` — an alta in gym 2 gets written to gym 1.

**Representative crude sites to fix:** `service.ts:4021-4045` (`changePlanAfterCurrent`), plus the PRICING debt markers at `service.ts:3547` (`changePlanNow`), `:4018` (`changePlanAfterCurrent`), `:4482` (`renewSubscription`) — the three pricing inserts, owned by plan **174-02** under golden — and separately `:4756` (`bulkMigratePlan`, hardcodes `pricePaid: 0`, NOT a pricing method → owned by plan **174-01**) ("DEUDA CON DUEÑO — FASE 174 … sin `tenantValues`"). Each is a bare `.insert(schema.subscriptions).values({...})` → wrap the object literal in `tenantValues(ctx, {...})`.

### Pattern C — Anchor guard on virtual→physical branch migration

**Source (canonical):** `el-templo-api/src/modules/subscriptions/service.ts:1708-1727` (`assignPlan`)

```typescript
const branch = await assertBranchDelGimnasio(ctx, input.branchId, tx);
await tx
  .update(schema.users)
  .set({
    branchId: branch.id,
    branchUpdatedAt: new Date(),
    branchSource: "manual",
  })
  .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)));
```

Rule: never write the raw `branchId` from the payload; write `branch.id` from the already-resolved row. Twin sites: `service.ts:3722`. The phase-174 target is to **restore** this guard at `service.ts:5210-5212` (`activateScheduledSub`) once `ctx` is real (currently `ctx ? assert… : scheduled.branchId`).

### Pattern D — Provisional `isNotNull(table.tenantId)` guard ONLY where there is no actor

**Source (canonical):** `el-templo-api/src/modules/subscriptions/service.ts:5182-5195` and `service.ts:6016-6026`

```typescript
      .where(
        ctx
          ? and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId))
          : and(isNotNull(schema.users.tenantId), eq(schema.users.id, userId)),
      );
```

Rule (D-05/D-07, `specifics`): use `isNotNull(table.tenantId)` **only** where there is genuinely no actor. Where an actor exists, thread real `ctx` and use Pattern A — do NOT reach for `isNotNull` as a shortcut. This phase REMOVES most provisional guards on the member-facing path by threading real ctx (D-07).

---

## File Classification

| Modified File                                                   | Role    | Data Flow                           | Closest Analog                                                                             | Match Quality               |
| --------------------------------------------------------------- | ------- | ----------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------- |
| `el-templo-api/src/modules/subscriptions/service.ts`            | service | CRUD + lifecycle                    | migrated methods in same file (`assignPlan` 1271, `getActiveMemberSubscriptions` read 977) | exact (self)                |
| `el-templo-api/src/modules/subscriptions/booking-population.ts` | service | batch/file-I/O (booking generation) | `scheduling/booking-service.ts` generation reads                                           | role-match                  |
| `el-templo-api/src/modules/subscriptions/member-routes.ts`      | route   | request-response                    | `scheduling`/`members` routes that call `assertTenant(request.scope, …)`                   | role-match                  |
| `el-templo-api/src/modules/scheduling/booking-service.ts`       | service | CRUD + batch                        | migrated reads in same file (100-101, 572-576, 955-959)                                    | exact (self)                |
| `el-templo-api/src/modules/scheduling/service.ts`               | service | CRUD                                | `trials-service.ts` migrated reads/inserts                                                 | role-match (sibling)        |
| `el-templo-api/src/modules/scheduling/activity-service.ts`      | service | CRUD                                | `trials-service.ts` migrated reads/inserts                                                 | role-match (sibling)        |
| `el-templo-api/src/modules/scheduling/holiday-service.ts`       | service | CRUD                                | `trials-service.ts` migrated reads/inserts                                                 | role-match (sibling)        |
| `el-templo-api/src/modules/scheduling/schedule-exceptions.ts`   | service | CRUD                                | `trials-service.ts` migrated reads                                                         | role-match (sibling)        |
| `el-templo-api/src/modules/scheduling/trials-service.ts`        | service | CRUD                                | migrated methods in same file (238, 357, 626)                                              | exact (self, most-advanced) |
| `el-templo-api/src/modules/attendance/service.ts`               | service | event-driven + CRUD                 | migrated methods in same file (94, 583-590, 1159)                                          | exact (self)                |

---

## Pattern Assignments

### `el-templo-api/src/modules/subscriptions/service.ts` (service, CRUD + lifecycle)

**Adoption state:** 67 `.from()` / 30 `tenantWhere`; 16 `.insert()` / 10 `tenantValues`. ~40 crude reads + ~6 crude inserts remain. Already imports `tenantWhere`, `tenantValues` (63-64), `assertBranchDelGimnasio` (67), `isNotNull`.

- **Reads:** apply Pattern A. Canonical template: `:977-996`.
- **Inserts:** apply Pattern B. Canonical template: `:1625-1650`. Pricing debt markers to clear here (owned by 174-02, under golden): `:3547` (`changePlanNow`), `:4018` (`changePlanAfterCurrent :4021-4045`), `:4482` (`renewSubscription`). NOTE: `:4756` is inside `bulkMigratePlan` (non-pricing, `pricePaid: 0`) → owned by 174-01, NOT part of this pricing set.
- **Anchor guard:** Pattern C. Restore at `:5210-5212` (`activateScheduledSub`) once ctx is real.

**Pricing chain (D-06 — golden FIRST, then migrate, acceptance = diff cero):**
Replicated INLINE (no single centralized fn) across:

- `assignPlan` `:1271` (block ~1468-1650)
- `changePlan` `:3281` → `changePlanNow` `:3300` / `changePlanAfterCurrent` `:3792`
- `renewSubscription` `:4148`
- previews `getChangePlanPreview` `:3176`, `getPricingPreview` `:4808`
- helpers `resolvePriceType :5302`, `getBasePrice :5337`, `deriveCoveredUntil :192`, `AURA_DISCOUNT_TIERS` (`types.ts:70`), `computeReferralDiscountPercent` (`referrals/service.ts:206`, **sin ctx — NO se le threadea acá**, D-03).
  The pricing migration only adds `tenantWhere`/`tenantValues` around the reads/inserts these methods already do; it must NOT change any arithmetic. Capture golden (assignPlan/changePlan/renewSubscription + 2 previews, incl. referral+boarding-pass+AURA combos) before touching.

**D-07 ctx threading (member-facing path):**
`getMemberSubscriptions(userId)` `:1024` and `getMemberSubscriptionHistory` `:1147` and `autoExpireSubscriptions(userId)` `:4912` currently take **no ctx** and read crude (e.g. `:4916-4925`). Thread `ctx: TenantContext` through to the ~8 call sites listed in CONTEXT D-07 (`service.ts:1116,1437,2823,4245`, `member-routes.ts:165`, `routes.ts:288,301`, `scheduling/booking-service.ts:137`), then apply Pattern A to the freed reads. `activateScheduledSub(ctx, id)` `:5051` is already `ctx: TenantContext | null` — real ctx lets Pattern C be restored.

**Cron path (D-07):** `autoExpireDueSubscriptions()` `:2324` (called from `jobs/auto-resume-pauses.ts:129`) is a genuinely cross-tenant sweep → do NOT force per-tenant ctx; formalize ONE documented `tenant-safe` exception (embedded SQL tag the sentinel reads, per the 173 convention: embedded tag for sentinel vs TS comment for lint).

---

### `el-templo-api/src/modules/scheduling/booking-service.ts` (service, CRUD + batch — largest crude surface)

**Adoption state:** 40 `.from()` / 5 `tenantWhere`; 3 `.insert()` / 0 `tenantValues`. 27 methods already receive `ctx`. Already imports `tenantWhere` (39).

**Analog (self, migrated read):** `:100-101`

```typescript
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, memberId)))
```

Twins already correct: `:572-576`, `:955-959`.

**Crude sites (representative):** `.from(schema.bookings)` at `:325, :353, :395, :463, :730, :775, :826, :988, :1089, :1118` → apply Pattern A with `tenantWhere(schema.bookings, ctx)`. `.from(schema.attendance)` `:620` → `tenantWhere(schema.attendance, ctx)`. The 3 inserts → Pattern B.

**`holidays` (D-02):** reads at `:1341-1347` and `:1424-1430` filter by `country` ONLY. `holidays` is tenant-scoped (col `tenant_id`, fase 167) → add `tenantWhere(schema.holidays, ctx)` as the first `and(...)` term alongside the existing country/date filters. Same treatment in `schedule-exceptions` reads (`:1355, :1442`).

---

### `el-templo-api/src/modules/scheduling/trials-service.ts` (service, CRUD — most-advanced sibling, use as the module template)

**Adoption state:** 21 `.from()` / 11 `tenantWhere`; 5 `.insert()` / 3 `tenantValues`. This is the cleanest already-migrated file in `scheduling` — its methods are the copy-source for the cruder siblings.

**Read analog:** `:238`, `:353`, `:438`, `:907` — `and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId))`.
**Insert analog:** `:626-633` (see Pattern B) and `:357`.
**Update-in-tx analog:** `:613-633` (update `users` with tenantWhere, then conditional `tenantValues` insert into `userStatusHistory`).

Remaining crude reads/inserts in this file → bring up to its own already-migrated methods.

---

### `el-templo-api/src/modules/attendance/service.ts` (service, event-driven + CRUD)

**Adoption state:** 23 `.from()` / 11 `tenantWhere`; 5 `.insert()` / 0 `tenantValues`. 38 ctx params already present.

**Read analog (self):** `:94`, `:1062`, `:1159`, `:1219` (`tenantWhere(schema.users, ctx)`), plus multi-table `:583-590` / `:619-626` (`tenantWhere(schema.users, ctx)` + `tenantWhere(schema.memberProfiles, ctx)`), and `:387` (`tenantWhere(schema.userBranches, ctx)`).
**Inserts:** 0/5 wrapped → apply Pattern B (`tenantValues(ctx, {...})`) to all 5 attendance inserts. This is the file's main gap.

---

### `el-templo-api/src/modules/scheduling/service.ts` (service, CRUD)

**Adoption state:** 19 `.from()` / 5 `tenantWhere`; 6 `.insert()` / 0 `tenantValues`. Copy from `trials-service.ts` analogs above: Pattern A on the 14 crude reads, Pattern B on all 6 inserts. Thread `ctx: TenantContext` into methods that lack it before wrapping.

### `el-templo-api/src/modules/scheduling/activity-service.ts` (service, CRUD — fully crude)

**Adoption state:** 5 `.from()` / 0 `tenantWhere`; 1 `.insert()` / 0 `tenantValues`; 0 ctx. Thread ctx into every method, then Pattern A + Pattern B using `trials-service.ts` as template.

### `el-templo-api/src/modules/scheduling/holiday-service.ts` (service, CRUD — fully crude)

**Adoption state:** 5 `.from()` / 0 `tenantWhere`; 1 `.insert()` / 0 `tenantValues`; 0 ctx. Reads currently filter `holidays` by `country` only (`:104-105, :139-141, :162-170`). Add `tenantWhere(schema.holidays, ctx)` (D-02: `holidays` is tenant-scoped). Insert at `:34` → Pattern B. Thread ctx into all methods.

### `el-templo-api/src/modules/scheduling/schedule-exceptions.ts` (service, CRUD)

**Adoption state:** 1 `.from()` / 0 `tenantWhere`. Small — Pattern A with `tenantWhere(schema.scheduleExceptions, ctx)` after threading ctx.

### `el-templo-api/src/modules/subscriptions/booking-population.ts` (service, batch — fully crude)

**Adoption state:** 9 `.from()` / 0 tenancy; 0 ctx. Thread `ctx: TenantContext` from its callers, apply Pattern A to all reads (incl. `holidays` → `tenantWhere(schema.holidays, ctx)`, D-02), Pattern B to any inserts. Template: `scheduling/booking-service.ts` generation reads.

### `el-templo-api/src/modules/subscriptions/member-routes.ts` (route, request-response)

**Adoption state:** near-crude, 2 `assertTenant` in 4 handlers. Analog: the 2 handlers that already do `const ctx = assertTenant(request.scope, "subscriptions.<handler>");` then pass `ctx` into the service. Bring the other 2 handlers up to that; this is where real ctx enters for the D-07 chain (`:165`).

---

## Cross-cutting: `program_enrollments` one-liner (D-02, of-passing)

**File:** `el-templo-api/src/modules/programs/enrollment-service.ts:407-419` — INSERT missing `tenantValues`. Apply Pattern B. Cheap, already located; enters phase 174 even though the file is `programs`.

---

## No Analog Found

None. Every file has a same-module or `members`/`shared` migrated analog. This is pure code-adoption — the templates already exist in-repo.

## Explicitly OUT of scope (do NOT touch — planner must not assign)

| Item                                                     | Location                     | Reason                                                                         |
| -------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `getReferralOverview` internal `tenantWhere`             | `referrals/service.ts:270`   | referrals not strict → 175 (D-03)                                              |
| `computeReferralDiscountPercent` interior (no ctx)       | `referrals/service.ts:206`   | pricing calls it but does NOT thread ctx here (D-03)                           |
| `activeMemberExists` "ctx real"                          | `shared/active-member.ts:27` | pure SQL predicate, not used by subs/sched; ROADMAP #3 misattributes it (D-04) |
| FK compuesta `user_branches → branches(tenant_id, id)`   | schema                       | schema hardening / migration, not code adoption (D-03)                         |
| 58-insert general sweep outside subs/sched               | repo-wide                    | each in its own module (D-05)                                                  |
| Switch to strict / ISO battery / cross-tenant price test | —                            | phase 174.1                                                                    |

## Metadata

**Analog search scope:** `el-templo-api/src/modules/{subscriptions,scheduling,attendance,shared,programs,referrals}` (read from worktree `et-173`, branch `feat/173-adopcion-members`, HEAD `2b977b78`).
**Files scanned:** 10 target files + `shared/tenant.ts` + `shared/branch-consistency.ts`.
**Pattern extraction date:** 2026-08-09
**Path convention:** all paths repo-relative (worktree-agnostic); line numbers reference the `et-173` code the executors will modify.

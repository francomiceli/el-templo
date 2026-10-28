---
phase: 175-adopci-n-4a-analytics-resto-del-core-adopci-n-de-c-digo
plan: 01
subsystem: campaigns
tags: [tenancy, adoption, campaigns, D-08]
dependency-graph:
  requires: []
  provides:
    - "campaigns/service.ts create/listCampaigns/send/sendTest/loadSedes scoped by tenant"
  affects:
    - el-templo-api/src/modules/campaigns/service.ts
    - el-templo-api/src/modules/campaigns/routes.ts
tech-stack:
  added: []
  patterns:
    - "Pattern A (tenantWhere first term of WHERE) applied to campaigns/campaignSends/branches reads inside create/listCampaigns/send/sendTest/loadSedes"
    - "Pattern B (tenantValues) applied to campaigns INSERT (create) and campaignSends INSERT (send)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/campaigns/service.ts
    - el-templo-api/src/modules/campaigns/routes.ts
    - el-templo-api/tenant-lint-allowlist.json
    - el-templo-api/test/campaigns-send.test.ts
decisions:
  - "funnel() and listEligible()'s branches join left untouched — plan explicitly scoped them out (migrated in 173-08); allowlist entries for branches/campaigns/campaign_sends/campaign_events stay because funnel() still has live unscoped accesses to those 4 tables (allowlist is keyed by file+table, not by line)"
  - "Only the campaign_unsubscribes allowlist entry was removable — its only access in the file is inside the existing D-02 tenant-safe exemption in listEligible(), never a live violation this plan needed to fix"
metrics:
  duration: "~50 min (incl. a transient shared-MySQL DB provisioning race unrelated to the code changes)"
  completed: 2026-08-14
---

# Phase 175 Plan 01: campaigns/service.ts tenancy adoption Summary

Threaded `TenantContext` through `create`, `listCampaigns`, `send`, `sendTest`, and `loadSedes` in
`campaigns/service.ts`, closing the highest-severity gap of the phase: `send()` already received `ctx`
but ignored it in 6 of its 7 database accesses, meaning an admin of gym 2 could operate on (and mass-send)
a campaign `:id` belonging to a different tenant, and every new campaign was born with `tenant_id` DEFAULT(1).

## What Changed

**Task 1 — `create`/`listCampaigns`/`loadSedes` signatures + their direct callers**

- `create(ctx, input, adminUserId)`: the `campaigns` INSERT now uses `tenantValues(ctx, {...})`; the
  post-insert lookup-by-id is scoped with `tenantWhere(schema.campaigns, ctx)`.
- `listCampaigns(ctx, country)`: `tenantWhere(schema.campaigns, ctx)` is always the first WHERE term,
  ANDed with the existing optional country filter.
- `loadSedes(ctx, country)` (private): added `tenantWhere(schema.branches, ctx)` alongside the existing
  `isActive`/`isVirtual`/`address IS NOT NULL` filters.
- `routes.ts`: `POST /admin` and `GET /admin` now resolve `const ctx = assertTenant(request.scope, "campaigns.<label>")`
  and pass it to the service.
- `send()`'s own call to `loadSedes` was updated to pass its existing `ctx` param (send() already received
  ctx before this plan) — a trivial consequence of the new `loadSedes` signature.

**Task 2 — every access inside `send()` and `sendTest()`**

- `send(ctx, campaignId)`: campaign lookup, the atomic `draft -> sending` claim UPDATE, the `campaignSends`
  enrollment INSERT (`tenantValues`), the pending-sends SELECT, the per-chunk "mark sent" UPDATE, the
  "mark campaign sent" UPDATE, and the final recipient COUNT — all 7 accesses now carry `tenantWhere`/`tenantValues`.
  A `send` targeting another tenant's campaign now 404s at the lookup instead of silently operating on it.
- `sendTest(ctx, campaignId, toEmail)`: `ctx` is now a required first parameter; its campaign lookup is
  scoped with `tenantWhere`; its `loadSedes` call passes `ctx`.
- `routes.ts`: `POST /admin/:id/test` now resolves `ctx` via `assertTenant` and passes it to `sendTest`.
- `test/campaigns-send.test.ts`: updated the `create()`/`sendTest()` call sites to the new ctx-first
  signatures (using the file's existing `CTX = { tenantId: 1 }` constant, already used by `send()`'s call
  sites before this plan).

**Task 3 — allowlist**
Removed exactly one entry: `campaigns/service.ts` / `campaign_unsubscribes`. That table's only access in
the file lives inside `listEligible()`'s correlated `NOT EXISTS` subquery, already covered by the D-02
tenant-safe exemption anchored at `service.ts:88` (migrated in 173-08) — it was never a live violation
this plan needed to fix, just a stale entry once verified.

The other four entries for `campaigns/service.ts` (`branches`, `campaigns`, `campaign_sends`,
`campaign_events`) were **kept**, deliberately. The allowlist is keyed by `(file, table)`, not by line —
and `funnel()` (explicitly out of scope for this plan: "YA está migrado de 173-08 — no tocar") still has
live unscoped accesses to `campaigns` (its own lookup), `campaign_sends` (enviado/reservó/asistió/convirtió
counts), and `campaign_events` (abierto/click counts). `branches` also still has one live unscoped access
in `listEligible()`'s `innerJoin(br, eq(br.id, u.branchId))` (also out of scope, already migrated in 173-08).
Removing any of those 4 entries would immediately trip `unlistedViolations`. This was verified empirically:
removing all 5 original entries and re-running `pnpm lint:tenant` reported exactly `branches (1 acceso)`,
`campaign_events (4 accesos)`, `campaign_sends (4 accesos)`, `campaigns (4 accesos)` as unlisted — 13 total,
all traceable to `funnel()`/`listEligible()` — and zero mention of `campaign_unsubscribes`.

## Verification

- `pnpm exec tsc --noEmit`: clean, 0 errors.
- `pnpm exec vitest run --no-file-parallelism test/campaigns-send.test.ts test/campaigns-audience.test.ts test/campaigns-funnel.test.ts test/campaigns-template.test.ts test/campaigns-tracking.test.ts`:
  26 passed / 1 pre-existing failure (see Known Issues below) / 4 skipped(todo) / 1 file skipped
  (`campaigns-template.test.ts`, 4 todo tests, pre-existing).
- `pnpm lint:tenant`: `unlistedViolations: 0`, `staleMissingFile: 0`, `staleNoLongerViolating: 0`,
  `gainedEntries: 0` (no `--base` passed locally, per plan's verify command), **`DISCREPANCIAS: 0`**.
- `pnpm exec vitest run --no-file-parallelism test/tenancy`: **498/498 passed**, 24/24 files, including
  `con-06-lint.test.ts` (38 tests).

## Known Issues (pre-existing, NOT caused by this plan)

**`test/campaigns-funnel.test.ts:211` — "D-18: a booking before sent_at is NOT attributed to the campaign"**
fails with a `TenantSentinelError` on a raw fixture `UPDATE bookings SET booked_at = ? WHERE id = ?` that
lacks `tenantWhere`. `bookings` (scheduling) became `TENANT_STRICT_MODULES` in phase **174.1** — before this
plan started. Verified pre-existing: neither this test file nor `funnel()` (the method it exercises) are
touched by this plan's diff, and `funnel()` is explicitly out-of-scope per the plan's own inventory
("YA está migrado de 173-08 — no tocar"). Reproduced consistently across two independent full runs of the
`test/campaigns-*` suite. Documented as **D5** in
`.planning/phases/175-adopci-n-4a-analytics-resto-del-core-adopci-n-de-c-digo/deferred-items.md`
(same class as the phase's already-known **D3** — a test fixture that wasn't updated when its module went
strict — but for a `bookings`/scheduling access inside a `campaigns` test file, not previously catalogued).

## Deviations from Plan

### Auto-fixed / mechanical

**1. Test call-site updates for the new ctx-first signatures** — `test/campaigns-send.test.ts` calls
`service.create(...)` (8 sites) and `service.sendTest(...)` (2 sites) without a leading `ctx` argument.
Since `create`/`sendTest` gained a required `ctx: TenantContext` first parameter, these call sites would
not compile. Updated all 10 to pass the file's existing `CTX = { tenantId: 1 }` constant — the same
constant `service.send(CTX, ...)` already used before this plan. Not a change to any assertion or expected
behavior; purely a mechanical signature-migration, same class as `send()`'s call sites when `ctx` was
added to it in 173-08.

### Deferred (documented, not fixed — out of scope)

**2. [D5, out of scope] Pre-existing red test** — see "Known Issues" above. Logged to `deferred-items.md`,
not fixed (not in this plan's `<files>`, and `funnel()`/its test are explicitly "no tocar" per the plan).

### Infra note (not a code deviation)

One full `test/campaigns-*` run hit a transient `Unknown database 'eltemplo_test_1'` error during
per-worker DB provisioning (a race in `test/setup.ts`'s `provisionWorkerDB`, unrelated to this plan's
code). No orphaned vitest process was found (`ps aux` clean before and after); a clean re-run immediately
after reproduced the expected, stable result (26 passed / 1 pre-existing failure). Documented here per the
"no lo maquilles" instruction, not because it indicates any defect in the code delivered by this plan.

## Threat Flags

None. All three threats in this plan's `<threat_model>` (T-175-01-I, T-175-01-E, T-175-01-T) are exactly
the ones mitigated by Tasks 1-2; no new security-relevant surface was introduced.

## Self-Check: PASSED

- `el-templo-api/src/modules/campaigns/service.ts` — FOUND, modified as described.
- `el-templo-api/src/modules/campaigns/routes.ts` — FOUND, modified as described.
- `el-templo-api/tenant-lint-allowlist.json` — FOUND, `campaign_unsubscribes` entry removed.
- `el-templo-api/test/campaigns-send.test.ts` — FOUND, modified as described.
- Commit `1adf3088` — FOUND in `git log` on `feat/173-adopcion-members`.
- Commit `80a1eff6` — FOUND in `git log` on `feat/173-adopcion-members`.
- Commit `dae033f3` — FOUND in `git log` on `feat/173-adopcion-members`.

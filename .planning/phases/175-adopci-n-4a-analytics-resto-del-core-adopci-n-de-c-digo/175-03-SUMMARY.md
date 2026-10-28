---
phase: 175-adopci-n-4a-analytics-resto-del-core-adopci-n-de-c-digo
plan: 03
subsystem: notifications (tenancy adoption)
tags: [tenancy, notifications, con-06, lint-allowlist]
dependency-graph:
  requires:
    [174-PATTERNS.md, shared/tenant.ts, 175-02 (tenant-safe idiom precedent)]
  provides:
    [notifications module fully code-adopted for tenancy (not strict yet)]
  affects:
    [
      el-templo-api/src/jobs/notification-cron.ts,
      el-templo-api/src/jobs/tenure-milestones.ts,
    ]
tech-stack:
  added: []
  patterns:
    - "pre-scope derivation from the recipient's own row (resolveUserTenant) when no ctx is threadable into a method's ~13 external call sites"
    - "tenant-safe embedded/leading-comment exemptions for genuine cross-tenant cron batch sweeps (processQueue/purgeOldNotifications)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/notifications/service.ts
    - el-templo-api/src/modules/notifications/routes.ts
    - el-templo-api/src/jobs/notification-cron.ts
    - el-templo-api/src/jobs/tenure-milestones.ts
    - el-templo-api/tenant-lint-allowlist.json
decisions:
  - "queueNotification/registerToken/updatePreference keep their existing external signatures (no ctx param) — tenant is derived pre-scope from the target user's own row via a new private resolveUserTenant(userId) helper, per T-173-08's explicit boundary against threading ctx into ~13 foreign call sites."
  - "queueAdHocNotification and seedTemplates DO take a required ctx param, since both callers of each (routes.ts send-segment/seed-templates, jobs/tenure-milestones.ts, jobs/notification-cron.ts boot seed) already resolve a real TenantContext at their call site."
  - "processQueue/sendToDevice/recordOpened/purgeOldNotifications stay unscoped (genuine cross-tenant cron batch by PK/status), annotated tenant-safe per the plan's explicit instruction not to force ctx into system crons this phase."
metrics:
  duration: "~1.5h"
  completed: 2026-08-14
---

# Phase 175 Plan 03: notifications tenancy adoption Summary

Scoped every gym-owned table access in `notifications/service.ts` and the two admin
template endpoints in `notifications/routes.ts` by tenant; closed the real post-168
template-lookup cross-tenant bug; removed all 5 resolved entries from
`tenant-lint-allowlist.json` (189 -> 184 total, not "197->192" as the last commit
message mistakenly says — see Deviations).

## What shipped

**Task 1 (service.ts):**

- `registerToken` / `updatePreference`: the 2 raw-SQL `INSERT ... ON DUPLICATE KEY`
  statements on `device_tokens` / `notification_preferences` now stamp `tenant_id`,
  derived from the recipient's own `users` row via a new private
  `resolveUserTenant(userId)` helper (pre-scope lookup, same idiom as
  `campaigns/tracking-service.ts#getSendEmail` from 175-02). `registerToken`'s
  `ON DUPLICATE` also refreshes `tenant_id` (a physical device can pass from a
  user of one gym to a user of another via logout/login — without the refresh the
  row would keep the first owner's tenant).
- `queueNotification`'s `notification_templates` lookup by `templateKey` now
  applies `tenantWhere` with the derived ctx — **this is the real bug fix**: since
  migration 168 the unique is `(tenant_id, template_key)`, so an unscoped
  `.limit(1)` could non-deterministically resolve another gym's template (title,
  body, route leaking cross-tenant).
- `resolveUseFemale` and `userHasDeviceToken` now take a real `TenantContext`
  (their only caller, `queueNotification`, now has one derived) instead of the
  `isNotNull(tenantId)` provisional guard.
- `queueNotification`'s and `queueAdHocNotification`'s inserts into
  `pending_notifications` now use `tenantValues(ctx, {...})` — previously missing
  entirely (rows landed under `tenant_id` DEFAULT 1 regardless of the real
  recipient's gym). `queueAdHocNotification` takes `ctx` as an explicit parameter
  since both its callers already resolve one.
- `seedTemplates` now requires `ctx: TenantContext` and seeds per-tenant (raw
  `INSERT IGNORE` now includes `tenant_id`). This forced two out-of-plan call-site
  fixes (Rule 3, compile-blocking):
  - `jobs/notification-cron.ts`'s boot-time seed call now goes through
    `forEachActiveTenant` (the file's existing comment literally anticipated this
    exact change "hasta la adopción de notifications, fase 175").
  - `jobs/tenure-milestones.ts`'s `queueAdHocNotification` call now passes the
    `ctx` it already had in scope (`runForTenant`'s parameter).
- `processQueue` / `sendToDevice` / `recordOpened` / `purgeOldNotifications` stay
  genuinely cross-tenant batch sweeps (by PK/status, no ctx) — annotated
  `tenant-safe` at every individual statement, per the plan's explicit
  instruction not to force ctx into system crons this phase.

**Task 2 (routes.ts):**

- `GET /admin/templates`: now `assertTenant` + `tenantWhere` — previously listed
  every gym's templates (cross-tenant leak).
- `PUT /admin/templates/:id`: now `assertTenant` + `tenantWhere` on both the
  existence lookup and the `UPDATE` — previously an admin of gym A could read AND
  edit gym B's template by guessing/incrementing the PK (tampering). A foreign id
  now 404s (D-06: never "acceso denegado" for cross-tenant resource lookups).
  Also scoped the post-update re-select.
- `send-segment` and `seed-templates` handlers updated to pass their already-resolved
  `ctx` into `queueAdHocNotification`/`seedTemplates` per the new signatures.

**Task 3 (allowlist):**

- Removed 5 entries: `notifications/routes.ts`×`notification_templates`,
  `notifications/service.ts`×{`device_tokens`, `notification_preferences`,
  `notification_templates`, `pending_notifications`}.
- `pnpm lint:tenant` → `unlistedViolations: 0`, `staleMissingFile: 0`,
  `staleNoLongerViolating: 0`, `gainedEntries: 0` (not run against `--base`
  locally per tool's own warning — that gate runs in CI), `DISCREPANCIAS: 0`.
  Allowlist total: 189 → 184.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `seedTemplates`/`queueAdHocNotification` signature changes broke 2 out-of-scope call sites**

- **Found during:** Task 1 (tsc after adding real `ctx` requirements)
- **Issue:** `notification-cron.ts:786` and `tenure-milestones.ts:189` called the
  old signatures.
- **Fix:** `notification-cron.ts`'s boot seed wrapped in `forEachActiveTenant`
  (matching the file's own pre-existing comment anticipating this exact change);
  `tenure-milestones.ts` passes its already-in-scope `ctx`.
- **Files modified:** `el-templo-api/src/jobs/notification-cron.ts`,
  `el-templo-api/src/jobs/tenure-milestones.ts`
- **Commit:** `28267599`

**2. [Rule 2 - Missing critical functionality] `pending_notifications` inserts in `queueNotification`/`queueAdHocNotification` had no `tenant_id` at all**

- **Found during:** Task 1, while closing the `pending_notifications` allowlist
  entry (every access to that table in the file has to be compliant/exempted to
  remove it, not just the 4 sites literally named in the plan's interfaces).
- **Issue:** Both inserts used a bare `.values({...})` — rows always landed under
  `tenant_id` DEFAULT 1 (El Templo) regardless of the recipient's actual gym.
- **Fix:** Wrapped both in `tenantValues(ctx, {...})`.
- **Files modified:** `el-templo-api/src/modules/notifications/service.ts`
- **Commit:** `28267599`

**3. [Rule 1 - Lint mechanics bug, self-caused] Mid-chain `tenant-safe` comments were not anchored by the static lint**

- **Found during:** Task 3 verification (isolated allowlist-entry-removal test
  surfaced 4 remaining violations after my first pass of annotations).
- **Issue:** I initially placed several `/* tenant-safe: ... */` comments between
  chained Drizzle calls (e.g. `.delete(x)\n/* ... */\n.where(y)`) and inside raw
  `sql` template strings only. Comments between chained calls and comments
  embedded purely inside a `sql\`\``string are not picked up by the lint's`MultiLineCommentTrivia`exemption scanner (confirmed by reading`src/db/scripts/lint-tenant.ts`'s `visitForTags`).
- **Fix:** Moved 2 comments (`removeToken`, `getUserPreferences`) to a genuine
  leading position before the whole statement; added a matching leading TS
  comment (in addition to the existing embedded-in-sql one) for the 2
  `notification_templates` raw-SQL `UPDATE` sites (`processQueue`'s
  `sent_count` increment, `recordOpened`'s `opened_count` increment).
- **Files modified:** `el-templo-api/src/modules/notifications/service.ts`
- **Commit:** `28267599` (fixed before any commit was made — caught during my own
  verification loop, not a post-commit fix)

### Documented, not fixed (explicitly in-scope per plan)

**`processQueue` cron double-processing risk once tenant 2 activates.** Documented
inline in `service.ts`'s `processQueue` docblock: `runNotificationQueueTickForTenant`
in `notification-cron.ts` calls `processQueue()` once per active tenant via
`forEachActiveTenant`, but `processQueue()` itself has no `ctx` and processes the
**entire** `pending_notifications` queue globally (by `status`/`scheduledAt` only).
With one active tenant this is a no-op duplication (N=1), but the day a tenant 2
activates, the same global queue would be reprocessed twice per tick. The plan
explicitly instructs NOT to force `ctx` into this cron this phase ("NO forzar ctx
si es un cron de sistema") — real fix (threading `ctx` + filtering
`pending_notifications` by tenant) is deferred, most naturally to 175.1 or a
dedicated plan when tenant 2 onboarding is closer.

## Commit note (correcting my own commit message)

The 3rd commit's message says "197->192" for the allowlist count — that number is
wrong (I copied it from the phase-level CONTEXT doc's stated baseline, which
doesn't match the actual file state at HEAD when I started). The real count: 189
entries before this plan (confirmed by reading the file at plan start) → 184 after
removing the 5 notifications entries. I did not amend the commit per the
"never amend, always new commit" rule — flagging it here for the record instead.

## Threat Flags

None. All 3 threats in the plan's `<threat_model>` (T-175-03-T tampering,
T-175-03-I information disclosure, T-175-03-E elevation of privilege) were
mitigated as specified. No new security-relevant surface was introduced beyond
what the plan already anticipated (`resolveUserTenant`'s pre-scope-by-userId
lookup and the `forEachActiveTenant` wrap in `notification-cron.ts` both follow
already-established, already-reviewed idioms from 173/174/175-02).

## Self-Check: PASSED

- `el-templo-api/src/modules/notifications/service.ts` — FOUND, modified as described.
- `el-templo-api/src/modules/notifications/routes.ts` — FOUND, modified as described.
- `el-templo-api/src/jobs/notification-cron.ts` — FOUND, modified as described.
- `el-templo-api/src/jobs/tenure-milestones.ts` — FOUND, modified as described.
- `el-templo-api/tenant-lint-allowlist.json` — FOUND, 5 notifications entries removed.
- Commits `28267599`, `968307f7`, `4f0a76bb` — FOUND in `git log` on
  `feat/173-adopcion-members` in worktree `et-173`.
- `pnpm exec tsc --noEmit` — 0 errors (verified after every commit).
- `pnpm exec vitest run --no-file-parallelism test/notifications` — 37/37 passed,
  no expectations adjusted (verified twice, before and after Prettier reformat).
- `pnpm lint:tenant` — `DISCREPANCIAS: 0` (verified after final commit).
- `git status` in `et-173` — clean (verified after final commit).
- `test/tenancy` — **NOT run** by this executor per explicit instruction (the
  orchestrator runs it after this plan).

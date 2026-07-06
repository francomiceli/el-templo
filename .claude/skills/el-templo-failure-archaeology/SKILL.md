---
name: el-templo-failure-archaeology
description: >
  Historical record of El Templo's expensive bugs, dead-end investigations, and
  settled decisions. Read this BEFORE investigating a bug, a regression, weird
  behavior, a CI failure that tsc didn't catch, or anything that "looks broken" —
  the battle may already be won (or intentionally lost). Triggers: "why is X like
  this", "this looks broken", "known issues", historical incident, unexplained 400s,
  "Unknown column" in CI, migration failed, check-in rejected, booking not persisting,
  member went inactive after plan change, "should I fix this?", suspicious destructive
  migration, Sentry gap, db:generate broken.
---

# El Templo — Failure Archaeology

A chronicle of investigations, expensive bugs, dead ends, and settled decisions in
this monorepo, so nobody re-fights a battle that is already won. Each entry:
**Symptom → Root cause → Evidence → Status** plus a one-line lesson.

Written 2026-07-05. Commit hashes verified against local git history at that date.
Entries marked _"per project notes, unverified in code"_ come from working notes only.

## Jargon (defined once)

- **GSD phase**: numbered unit of planned work (e.g. "phase 121") tracked under
  `.planning/phases/`. Phases produce PLAN/REVIEW/VERIFICATION artifacts.
- **The train ("tren")**: batched promotion of many phases from `staging` branch to
  `master` (= production deploy) in one merge. Migrations ride the train.
- **Migration runner**: `el-templo-api/src/db/run-migrations.ts`, the ONLY supported
  way to apply SQL migrations; tracks state in the `_migrations` DB table.
  `drizzle-kit migrate` is forbidden (its journal is stale).
- **tsc-invisible bug**: a bug type checking cannot see because the mismatch lives in
  a SQL string or a DB identifier, not in TypeScript types.

## Index

| ID    | Area         | One-liner                                                                                                                                  | Status                               |
| ----- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| FA-01 | DB/Drizzle   | Unqualified columns in `.select()` sql fragments → correlated subquery compares column to itself → renewals counted as churn + 500s        | fixed                                |
| FA-02 | DB/Drizzle   | `mysqlEnum` 1st arg is the COLUMN NAME; drift vs migration = CI "Unknown column", tsc silent                                               | fixed (recurring trap)               |
| FA-03 | DB/tooling   | `pnpm db:generate` broken by pre-existing schema drift → migrations hand-written since 0153                                                | open (workaround settled)            |
| FA-04 | DB/runner    | `;` inside a `--` SQL comment breaks the migration (runner splits on `;` before stripping comments)                                        | wontfix (documented rule)            |
| FA-05 | DB/domain    | `changePlanNow` with future startDate → member inactive indefinitely (backfill migration 0120)                                             | fixed                                |
| FA-06 | DB/settled   | Migration 0151 destructive `member_segment → NULL` reset is INTENTIONAL                                                                    | settled — do not "fix"               |
| FA-07 | API          | v5.2 post-milestone CI: DELETE member route without params-schema → `'3' !== 3` → cancel cascade silently skipped                          | fixed                                |
| FA-08 | API          | v5.2 post-milestone CI: `listMovEgresos` dropped `memberId` in row mapping                                                                 | fixed                                |
| FA-09 | API          | Bookings reactivation: unique index ignores status; `INSERT IGNORE` silently skipped re-creating cancelled bookings → QR check-in rejected | fixed                                |
| FA-10 | API          | Phase 144: presencial booking possible after membership expiry (latent gap in `reserve()`)                                                 | fixed                                |
| FA-11 | API          | Raw SQL string drift after Drizzle column renames (`sub.status` vs `subscription_status`)                                                  | fixed (bot branch) + sweep-lint      |
| FA-12 | API          | NODE-43: roster 403 in Horarios — plugin-level role hook too narrow for the page's audience                                                | fixed                                |
| FA-13 | API          | Phase 134 D-06: prereq gating ignored session-evidence mastery → nodes never unlocked                                                      | fixed                                |
| FA-14 | Incident     | Check-in 400 spike on 2026-06-24: data healthy, root cause never determined; 400s invisible to Sentry by design                            | open/cold                            |
| FA-15 | Domain audit | Attendance hardening backlog: overdue check not implemented, no transactions on reserve/check-in, coach check-in lacks one-per-day guard   | open/known-weak                      |
| FA-16 | Mobile/iOS   | Associated Domains entitlement commented out to unblock build 1.5.5 → Universal Links OFF on iOS                                           | open (restore before mail campaigns) |
| FA-17 | CI/deps      | Tracking `pnpm-workspace.yaml` broke `cap sync`; `minimumReleaseAge` is useless under `--frozen-lockfile`                                  | fixed (reverted)                     |

---

## DB & Migrations

### FA-01 — Drizzle renders unqualified columns inside `sql` fragments in `.select()`

- **Symptom**: 9 churn/renewal tests failing in CI (phase 121 metrics). Every renewal
  mislabelled as churn (`renovados=0`); `GET /churn` and `/renewal` returned 500 on
  the breakdown queries. Separately, 3 more tests 500'd on `/churn`, `/renewal`, `/ltv`.
- **Root cause** (two distinct bugs):
  1. Drizzle qualifies columns in `.where()` but renders `${schema.subscriptions.col}`
     **unqualified** inside `sql` fragments placed in `.select()`. Inside a correlated
     `EXISTS`, the bare `id` / `end_date` bound to the inner alias's same-named columns:
     `s_next.id <> id` became `s_next.id <> s_next.id` — always FALSE. With joins in
     play the bare `id` was ambiguous → MySQL error → 500.
  2. `applyScope()` returned a `branches.country = ?` condition with
     `needsBranchJoin=true`, but several aggregates spread the conditions **without
     joining branches** → "Unknown column 'branches.country'" → 500. Only fired on the
     route path (test admin user resolves `country='AR'`), so direct-service tests
     passed and hid it.
- **Evidence**: commits `866f29a7` (qualify outer-row refs) and `18bfb035`
  (conditional `innerJoin(branches)` via `.$dynamic()`), 2026-06-04. Handoff
  `PHASE_121_HANDOFF_2026-06-04.md` at repo root.
- **Status**: fixed.
- **Lesson**: inside any `sql\`\``fragment used in`.select()`, write the literal
qualified name (`subscriptions.end_date`), never rely on Drizzle's column
interpolation — and if `applyScope()` says it needs a branch join, join it.

### FA-02 — `mysqlEnum` first argument is the column name, and CI is the only thing that notices

- **Symptom**: CI fails with MySQL "Unknown column" on routes that type-check
  perfectly. Happened twice back-to-back (phases 125 and 126).
- **Root cause**: `mysqlEnum("<column_name>", [...])` — the first argument is the SQL
  column name and must match the migration byte-for-byte (name AND value order).
  tsc cannot see the mismatch because it lives in a string.
- **Evidence**: commits `96287ef2` (fix(125): name `exercise_dimension_proposals`
  enum column `status`) and `b8ae23bf` (fix(126): name `exercise_progressions` enum
  column `source` to match migration 0139). The trap is now warned about in migration
  headers themselves, e.g. `el-templo-api/src/db/migrations/0153_validation_status.sql`:
  "enum drift = CI 'Unknown column' that tsc cannot detect".
- **Status**: fixed; the trap remains structural — every new `mysqlEnum` is a chance
  to re-hit it.
- **Lesson**: when adding/altering an enum, diff the `mysqlEnum` first arg and value
  order against the migration SQL before pushing; CI is your first detector.

### FA-03 — `pnpm db:generate` is broken by pre-existing drift; migrations are hand-written

- **Symptom**: `pnpm db:generate` hits an interactive prompt on the pre-existing
  `sessions.goal_plan_type` drift and cannot produce a clean migration. Also
  `meta/_journal.json` is stale (stuck at 0059), so generate would mis-number files.
- **Root cause**: accumulated drift between Drizzle schema files and the journal that
  drizzle-kit believes in. The `_migrations` DB table (custom runner) is the real
  source of truth; drizzle-kit's bookkeeping was never reconciled.
- **Evidence**: hand-written migration headers say so explicitly —
  `0155_movement_expense_kinds.sql` ("Hand-written: db:generate hits the pre-existing
  sessions.goal_plan_type interactive drift, same reason 0153/0154 were hand-written")
  and `0158_planes_notification_category.sql` (adds the stale-journal mis-numbering
  reason). As of 2026-07, migrations up to 0169 exist and recent ones are hand-written.
- **Status**: open. The settled workaround: write migration SQL by hand, number it
  sequentially yourself, never use `drizzle-kit push/migrate` for committed work.
- **Lesson**: don't burn time "fixing" db:generate mid-phase; hand-write the SQL,
  copy the header discipline from 0155/0158 (state why, match enums byte-for-byte).

### FA-04 — A `;` inside a `--` comment corrupts a migration

- **Symptom**: migration fails or executes a malformed statement even though the SQL
  looks valid in any client.
- **Root cause**: the runner's fallback parser splits the file on `;` BEFORE
  stripping `--` line comments, so a semicolon inside a comment produces a bogus
  split. (Files using drizzle's `--> statement-breakpoint` delimiter are unaffected.)
- **Evidence**: `el-templo-api/src/db/run-migrations.ts`, `splitSqlStatements()` —
  the caveat is documented in its doc comment (lines ~33-35, "Phase 103-01 caveat").
- **Status**: wontfix (accepted parser limitation, documented rule).
- **Lesson**: migration files MUST keep `;` out of `--` comment lines. Reworded
  comments are cheaper than a smarter parser.

### FA-05 — `changePlanNow` with a future startDate left members inactive indefinitely

- **Symptom**: admin uses "Cambiar plan ahora" with a future date; the member goes
  `inactivo` on the day of the change and never comes back.
- **Root cause**: `changePlanNow` hardcoded `subscription_status = 'active'` even for
  future `startDate`. The old sub was closed as `changed` immediately (losing paid
  coverage days), the new one sat `active` with a future `start_date`, so
  `recomputeUserStatus` saw no sub with `start_date <= today` → inactive — and the
  `activateDueScheduledSubs` cron never rescued it because it only scans
  `status='scheduled'`, not `active`-with-future-start.
- **Evidence**: dispatcher fix in subscriptions `service.ts` plus data backfill
  migration `el-templo-api/src/db/migrations/0120_backfill_changeplan_now_future_startdate_bug.sql`
  (the header narrates the whole failure chain).
- **Status**: fixed (code + prod backfill).
- **Lesson**: any code path that creates a subscription must derive status from
  `startDate` (`scheduled` vs `active`); crons only rescue the states they scan for.

### FA-06 — Migration 0151's destructive `member_segment` reset is intentional (SETTLED)

- **Symptom**: migration `0151_attendance_label_enum.sql` runs
  `UPDATE member_profiles SET member_segment = NULL;` — looks like data loss.
- **Root cause**: none — by design. `member_segment` is a **derived** field, fully
  recalculable from attendance/createdAt/plan by the 3AM cron and on-login recompute.
  Phase 136 replaced the segmentation subsystem; the reset guarantees a clean
  recompute under the new enum.
- **Evidence**: the migration file itself (comment notes the mysqlEnum name-match
  rule too); phase 136 shipped to staging+master 2026-06-23.
- **Status**: settled — **do not "fix" or restore this data**; a backup-restore of
  `member_segment` would resurrect stale labels.
- **Lesson**: destructive migrations on derived fields are fine when a recompute path
  exists; say so in the migration header (0151 does).

---

## API & Backend

### FA-07 — Fastify route without params-schema: `'3' !== 3` silently skipped the cancel cascade

- **Symptom**: post-v5.2 CI red. `DELETE /api/admin/members/:userId` soft-deleted the
  member but never cancelled the subscription and never fired the
  `SUB_HAS_ACTIVE_TRANSACTIONS` guard.
- **Root cause**: this was the **only** `:userId` route without a Fastify params
  schema, so `request.params.userId` stayed a string. Phase 137's
  `_cancelSubscription` added a strict comparison `subRow.userId !== userId` →
  `3 !== '3'` → NotFoundError thrown and swallowed by the route → cascade silently
  skipped.
- **Evidence**: commit `4389ddc6` (2026-06-25) adds `deleteMemberSchema` with
  `userId:{type:integer}`; deliberately no response schema so the structured 400 body
  isn't stripped by the serializer.
- **Status**: fixed.
- **Lesson**: EVERY Fastify route with numeric params gets a params-schema — the
  schema is not just validation, it's type coercion, and strict `!==` downstream
  depends on it.

### FA-08 — v5.2 CI: `listMovEgresos` dropped `memberId`; plus 2 test-drift failures

- **Symptom**: 6 CI failures after the v5.2 accounting milestone (phases 137-142)
  landed on staging. Two were real regressions (this one + FA-07), two were
  test/fixture drift.
- **Root cause**: the `/movements-history` row mapping omitted `memberId` even though
  the SELECT (and the LEFT JOIN's whole purpose) carried it — NULL-member rows
  serialized `undefined` instead of `null`. The drift pair: `revenueByKind` gained
  intentional fixed `cash_transfer:0`/`expense:0` keys (stale `toEqual`), and a
  fixture paid an EUR add-on in cash at an AR branch, which the new caja resolver
  correctly rejects (EUR≠ARS drawer) — pay by transfer instead.
- **Evidence**: commits `37385ccd` (fix 139 memberId), `4d2b62a0` (test 139 keys),
  `e31adda6` (test 138 EUR transfer), all 2026-06-25. Companion fix `4389ddc6` = FA-07.
- **Status**: fixed. `V52_CI_FIX_HANDOFF_2026-06-25.md` at repo root is OBSOLETE
  (predates the fixes).
- **Lesson**: after a multi-phase autonomous milestone, expect ~half the CI red to be
  fixture drift against new invariants — diagnose each failure as "regression or
  drift?" before touching product code.

### FA-09 — Cancelled bookings blocked re-creation: `INSERT IGNORE` swallowed the conflict

- **Symptom** (prod reports, ~2026-05): admin assigns fixed schedule slots via
  "Cambiar Plan"; admin sees them assigned, but the member's QR scan says
  "no tenés clase reservada". Reported at Alem and by multiple students.
- **Root cause**: `bookings` has a unique index on
  `(member_id, schedule_id, booking_date)` that does NOT distinguish status.
  Cancelling sets status `cancelado` (rows are kept). Re-creating the same booking:
  `populateBookings` used `INSERT IGNORE` (silently dropped) and
  `generateFixedBookings` checked `if (!existing)` without looking at status
  (silently skipped). Member kept stale cancelled rows and got no new reservations;
  `subscription_schedules` looked fine, which is why admins saw it as assigned.
- **Evidence**: fix commit `998d1f14` ("reactivar bookings cancelados al
  cambiar/renovar plan fijo") — on `master` and `origin/master`. Prod cleanup
  migration `0122_reactivate_stale_cancelled_bookings.sql`.
  `ON DUPLICATE KEY UPDATE` now reactivates only `cancelado` rows
  (`booking-population.ts` ~line 191). Handoff
  `BOOKINGS_REACTIVATION_BUG_HANDOFF_2026-05-14.md` at repo root documents the
  investigation (its "uncommitted" status is stale — the fix shipped).
- **Status**: fixed.
- **Lesson**: with a status-blind unique index, every insert path must handle the
  "row exists but is cancelled" case explicitly — `INSERT IGNORE` turns a design gap
  into silent data loss.

### FA-10 — Members could book presencial classes after their membership expired

- **Symptom**: latent — expired members could still reserve. Surfaced during phase
  144 (expiry notifications) design, 2026-06-25.
- **Root cause**: `reserve()` in `scheduling/booking-service.ts` never checked
  coverage end. Phase 144 introduced the single shared concept "covered until" =
  `deriveCoveredUntil(db, userId)` = MAX(end_date) over the active+scheduled
  subscription chain, used identically by the expiry cron, the coverage route, and
  `reserve()`.
- **Evidence**: `booking-service.ts` (~lines 97-99) rejects `date > coveredUntil`;
  helper lives in `subscriptions/service.ts` and is consumed by
  `jobs/notification-cron.ts`. Error surfaces as `CoverageExpiredError`
  (`COVERAGE_EXPIRED` code) with a dialog in the member app.
- **Status**: fixed (phase 144; on the v5.2/v5.3/144 train).
- **Lesson**: "is this member covered on date X" must have exactly ONE
  implementation — three near-copies of a MAX(end_date) query will drift.

### FA-11 — Raw SQL strings drift when Drizzle columns get renamed

- **Symptom**: features reading subscriptions/bookings via raw SQL silently matched
  nothing after schema column renames (`status` → `subscription_status` /
  `booking_status`): e.g. `find(s => s.status === "active")` never true.
- **Root cause**: Drizzle-level renames don't touch raw `sql` template strings or the
  interfaces typed around their result rows. tsc-invisible (FA-02's cousin).
- **Evidence**: phase 95 commit `d90fc782` (`bk.status` → `bk.booking_status`);
  phase 97.5 commits `cfb13e2c` (RED: reproduce drift + add permanent sweep-lint
  `test/lint/raw-sql-column-drift.test.ts`) and `56deb8d2` (GREEN: rename 8 sites).
  NOTE (2026-07): those 97.5 commits live on `origin/feature/whatsapp-bot-scaffold`
  (the `el-templo-bot` app), not on master — the sweep-lint is not in the main API
  test tree.
- **Status**: fixed on that branch; the pattern remains a live risk anywhere raw SQL
  exists in the main API.
- **Lesson**: after any column rename, grep every raw SQL template AND its row
  interfaces; consider porting the sweep-lint test to the main API.

### FA-12 — NODE-43: roster 403 in Horarios — plugin-level role hook scoped for the wrong audience

- **Symptom** (Sentry NODE-43, prod): `[HorariosPage] Error loading roster`, 403 —
  for admin/gestión/recepción staff.
- **Root cause**: `ratings/routes.ts` gated `GET /roster` and `/ratings/coaches`
  behind `TRAINING_ROLES` (coach/owner) via a plugin-level hook, but HorariosPage is
  opened by ALL staff roles. Introduced by phase 143.
- **Evidence**: hotfix commit `65efec0d` (2026-06-25, shipped direct to master):
  plugin hook → `ALL_STAFF_ROLES` for reads; `POST /roster` tightened to owner-only.
- **Status**: fixed. (Visual verification of the relocated roster grid was still
  pending as of 2026-06-25.)
- **Lesson**: a plugin-level auth hook gates every route in the plugin — when adding
  a route consumed by a broader audience, check whose hook it inherits.

### FA-13 — Phase 134 D-06: prereq gating ignored session-evidence mastery

- **Symptom**: training-tree nodes never unlocked even though the prerequisite was
  mastered via a completed session.
- **Root cause**: `allPrereqsDominated` only checked `dominatedExerciseIds`
  (explicit "dominado" adjustments), ignoring the D-01 branch-b rule that a completed
  session also counts as mastery.
- **Evidence**: commit `7e41ff9b` (2026-06-08) extracts a shared `isDominated()`
  helper used for both node state and prereq gating; adds test S9.
- **Status**: fixed.
- **Lesson**: when a domain predicate has two evidence sources, centralize it in one
  helper the day the second source appears — every inline re-derivation will forget
  one branch.

---

## CI / Deploy / Tooling

### FA-17 — Tracking `pnpm-workspace.yaml` broke `cap sync`, for zero benefit

- **Symptom**: Capacitor sync broke after `pnpm-workspace.yaml` files were committed
  (intended to extend `minimumReleaseAge` dependency-cooldown protection to CI).
- **Root cause**: `minimumReleaseAge` only applies at dependency **resolution** time.
  CI installs with `--frozen-lockfile`, which never resolves — the rule is never
  evaluated. Zero security benefit, plus the tracked file broke cap sync.
- **Evidence**: revert commit `9466cdb7` (2026-05-22), reverting `a636d3e9`.
- **Status**: fixed (reverted). Do not re-track these files.
- **Lesson**: supply-chain knobs that act at resolve-time do nothing under frozen
  lockfiles; verify where a safeguard actually executes before paying its cost.

---

## Incidents & Investigations

### FA-14 — Check-in 400 spike, 2026-06-24: cause never found; 400s don't reach Sentry by design

_(per project notes 2026-06; Sentry/logging mechanics verified in code, prod log
counts unverifiable from the repo)_

- **Symptom**: `POST /api/members/attendance/check-in` normally returns ~8-14
  business-rejection 400s/day ("No tenés una clase reservada para hoy");
  on 2026-06-24 the count hit **113**. Nothing in Sentry.
- **Investigation result**: prod data was HEALTHY. Only 2 members lacked their fixed
  bookings (Sívori, user 2785; Morgan, user 2316 — sede 3 Constitución), fixable by
  regenerating reservations; that alone cannot explain 113. The June-9
  `hotfix/renew-legacy-plans` issue was ruled out (wrong date). Sant Joan (ES
  holiday) ruled out — ES traffic was near zero. **Root cause: not determined.**
  The deployed code did not log the 400 reason, so a retroactive breakdown was
  impossible.
- **Why Sentry is blind**: the API returns `BadRequestError` without `log.error`
  (correct — these are business rejections, not faults); the member app logs the
  failure with `log.warn` in `CheckInPage.vue`, and only `createLogger().error()`
  ships to Sentry. So an entire class of user-facing rejection is invisible to
  monitoring.
- **Status**: open/cold. Agreed next step if it recurs: add
  `request.log.warn({memberId, branchId, reason})` in the check-in handler
  (NOT implemented as of 2026-07-05).
- **Lesson**: before chasing a 4xx spike, know that this API's 4xx path is
  deliberately Sentry-silent — the first move is adding a structured `warn` with the
  rejection reason, not reading Sentry.

---

## Known-weak points (OPEN — verified in code unless noted)

### FA-15 — Attendance system hardening backlog (audit 2026-04-07)

Open, prioritized findings from a full attendance/booking audit. Verify each against
current code before implementing — but as of 2026-07-05 the following still hold in
`el-templo-api/src/modules/attendance/service.ts` and
`scheduling/booking-service.ts`:

1. **Overdue check documented but NOT implemented** — both services mention overdue
   blocking in JSDoc (attendance `service.ts` ~line 45) but never call it. Members
   with overdue payments can book and check in.
2. **No DB transaction on booking reserve** — capacity count and INSERT are separate
   queries; concurrent requests can exceed capacity.
3. **No DB transaction on QR check-in** — one-per-day check and INSERT are separate;
   concurrent scans can duplicate attendance and double-decrement `classesRemaining`.
4. **`coachCheckIn` has no one-per-day guard** — repeat check-ins each award AURA and
   decrement classes.
5. **Force check-in bypasses ALL validation** — documented as intentional, but risky.

**Two things in this area that are NOT bugs (settled — don't re-flag):**

- **"QR tokens never expire" is a FALSE POSITIVE.** `shared/qr-token.ts` tokens are
  static branch QR codes posted at the location; payload is just
  `{branchId, type:"checkin"}` signed with HMAC. Expiry is intentionally absent —
  one-per-day enforcement lives in the attendance service layer, not the token.
  Every fresh audit rediscovers this; stop here.
- **Credits are deducted at CHECK-IN, not at reserve.** Deliberate product decision.

### FA-16 — iOS Universal Links are OFF (entitlement removed to unblock build 1.5.5)

- **Symptom**: deep links from emails don't open the iOS app (Android unaffected).
- **Root cause**: the Apple provisioning profile lacked the Associated Domains
  capability, blocking the 1.5.5 build; the entitlement was removed temporarily.
- **Evidence**: `el-templo-app/src-capacitor/ios/App/App/App.entitlements` — comment
  "Associated Domains (Universal Links iOS) REMOVIDO temporalmente".
- **Status**: open. Must be restored (profile capability + entitlement) BEFORE
  resuming any mail campaign that relies on deep links.
- **Lesson**: if an iOS deep link "regression" appears, check the entitlements file
  before debugging routing code.

### FA-03 (cross-ref) — `pnpm db:generate` remains broken; hand-write migrations.

---

## When NOT to use this skill

- **Making a change / shipping it**: branch rules, staging-first, the train →
  `el-templo-change-control`.
- **Writing or running a migration** (mechanics, numbering, runner usage) →
  `el-templo-db-migrations`. This skill only tells you which migration landmines
  already exploded.
- **Actively debugging a live issue** (how to reproduce, where logs live, tooling) →
  `el-templo-debugging-playbook`. Come here first to check the issue isn't archived,
  then go there.
- **Building/running the apps locally** → `el-templo-build-and-run`.

---

## Provenance & maintenance

Sources used (2026-07-05): `git log`/`git show` (every cited hash re-verified to
exist and touch what the entry claims), migration files under
`el-templo-api/src/db/migrations/`, `run-migrations.ts`, attendance/booking/QR
source, root-level `*HANDOFF*.md` files, `.planning/phases/` artifacts, and project
working notes. Claims that could only be sourced from notes are tagged
_"per project notes, unverified in code"_.

Stale-document warning: some handoff files at the repo root describe problems that
were later fixed (e.g. `V52_CI_FIX_HANDOFF_2026-06-25.md`,
`BOOKINGS_REACTIVATION_BUG_HANDOFF_2026-05-14.md`). This skill supersedes them for
status; trust git over handoffs.

### How to add an entry

1. Verify the story against git (`git show <hash> --stat`) and current code. If you
   can't, tag it `per project notes (2026-XX), unverified in code`.
2. Assign the next `FA-NN` id, add one row to the Index table, and place the entry in
   the right area section (or "Known-weak points" if open).
3. Use the template:

```markdown
### FA-NN — <one-line title, symptom-first>

- **Symptom**: what was observed, where (prod/CI/local), and when (date volatile facts).
- **Root cause**: the mechanism, not the fix. Name files/functions.
- **Evidence**: commit hash(es) verified with `git show`, file paths, migration numbers.
- **Status**: fixed | open | open/cold | wontfix | settled — do not "fix".
- **Lesson**: one line a stranger can act on.
```

4. No secrets, no credentials, no personal data beyond what an entry strictly needs.
5. If an entry's status changes (open → fixed), update the entry AND the index row;
   don't delete history — the dead end is the point.

---
slug: bot-raw-sql-status-column-drift
status: open
trigger: "Phase 98 STOP-and-reclassify (2026-06-17): closing the D-05 cleanup cascade in ai-tools.test.ts revealed that el-templo-bot raw SQL reads `sub.status` / `s.status` (tools.ts:495,500; machine.ts:77) but the SQL column is `subscription_status` (migration 0032). MySQL throws `Unknown column 'sub.status' in 'field list'` (errno 1054, sqlState 42S22) on every check_membership call and on lookupClientState whenever a subscription row exists. Confirmed prod bug, not test-infra. Same drift class as Phase 95 BUG-03 (vi) `bk.status` → `bk.booking_status` — second instance, treated as SYSTEMIC."
created: 2026-06-17
updated: 2026-06-17
goal: full_sweep_then_fix
specialist_dispatch_enabled: true
v54_gate: true
related:
  [
    api-30-test-failures-triage (resolved 2026-06-16; verdict (a) "pure test-infra" now known to be INCOMPLETE),
    Phase 95 BUG-03 (vi) (bk.status drift,
    fixed),
  ]
blocks:
  [Phase 98 (test-hygiene-98-a-b-c), Phase 97 RGUARD-01, v5.4.0 path step 3]
---

# Debug — el-templo-bot raw SQL column-name drift (systemic Drizzle-mismatch)

## Symptoms

- **Expected behavior:** `el-templo-bot/src/ai/tools.ts` `checkMembership` returns subscription info for an active member when called from the WhatsApp webhook. `el-templo-bot/src/state/machine.ts` `lookupClientState` returns `active_member` / `inactive_member` / `expired_member` based on the user's subscription row.
- **Actual behavior:** Both paths throw `Unknown column 'sub.status' in 'field list'` (or `s.status`, depending on alias) on the first SELECT against `subscriptions` when a row exists. Error surfaces as a MySQL 1054 / sqlState 42S22 propagating out of Drizzle's `db.execute(sql\`...\`)` invocation.
- **Reproduction (verified live 2026-06-17 13:02 UTC):** With Phase 98 Task 1 (95d58f98) + Phase 98 Task 2 WIP patch applied to `worktree-agent-a10bd401b163da68c`, run `cd el-templo-api && pnpm vitest run test/whatsapp/ai-tools.test.ts`. 3 of the 5 failures show `code: 'ER_BAD_FIELD_ERROR', errno: 1054, sqlMessage: 'Unknown column \\'sub.status\\' in \\'field list\\''`.
- **Compilation status:** `pnpm tsc --noEmit` clean on both `el-templo-api` and `el-templo-bot` — TypeScript does not catch the drift because the raw SQL inside `` sql`...` `` template literals isn't type-checked against schema column names.

## Failing surface (verified from Phase 98 halt state)

| File                                 | Line | Symbol                     | Wrong                                | Right                                                                                                                   |
| ------------------------------------ | ---- | -------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `el-templo-bot/src/ai/tools.ts`      | 495  | `checkMembership` SELECT   | `sub.status`                         | `sub.subscription_status`                                                                                               |
| `el-templo-bot/src/ai/tools.ts`      | 500  | `checkMembership` WHERE    | `sub.status IN ('active', 'paused')` | `sub.subscription_status IN ('active', 'paused')`                                                                       |
| `el-templo-bot/src/state/machine.ts` | 77   | `lookupClientState` SELECT | `s.status, s.end_date, sp.is_trial`  | `s.subscription_status AS status, s.end_date, sp.is_trial` (or rename `SubscriptionRow.status` → `subscription_status`) |

Both files also have JS-side reads of the returned row using `.status` (e.g., `tools.ts:538`, `machine.ts:90`, `:116`). Decision branch in the fix: either (A) `SELECT ... AS status` to preserve the JS-side property name (smaller diff, hides the column-name truth), or (B) rename `SubscriptionRow.status` field to `subscription_status` and update all reads (larger diff, more explicit). Recommendation: (B) — explicit > clever, per project CLAUDE.md engineering preferences.

## Required scope — full sweep, not point-fix

**Why sweep:** this is the second instance of the same drift class. First instance was `bk.status` → `bk.booking_status` (Phase 95 BUG-03 (vi), fixed at `tools.ts:330` and `:824`). Two instances of the same root cause in two sibling tables (bookings, subscriptions) strongly suggest the drift pattern is systemic. Other Drizzle declarations that rename SQL columns away from their JS property names are likely also exposed.

**Sweep procedure (proposed for the debug agent):**

1. **Enumerate all `mysqlEnum(name, ...)` and `varchar(name, ...)` etc. declarations across `el-templo-api/src/db/schema/**/\*.ts`\*\* where the first argument (SQL column name) differs from the JS property name in the table definition.
   - Use `grep -rnE 'mysqlEnum\("[a-z_]+"' el-templo-api/src/db/schema/` to find all renamed columns.
   - Build a map: `(table, js_property) → sql_column`. Known entries: `(bookings, status) → booking_status`, `(subscriptions, status) → subscription_status`. Find all others.
2. **Grep raw SQL templates across `el-templo-bot/src/**/_.ts`and`el-templo-api/src/\*\*/_.ts`\*\* for column references matching the JS property name (without the SQL prefix) on tables in the map.
   - `grep -rnE 'sql\`' el-templo-bot/src/ el-templo-api/src/` to locate the templates, then inspect each.
   - Cross-reference each `.column` reference against the table+column map.
3. **Classify each finding:**
   - **Drift:** JS property used in raw SQL → wrong → fix.
   - **Correct:** SQL column name used in raw SQL → OK.
   - **Drizzle-mediated:** Uses `db.select(table).where(eq(table.col, ...))` → OK (Drizzle resolves).
4. **Fix all drift instances in one GREEN commit.** Add a sweep-lint test that fails if any raw SQL references a JS property name for a renamed-column table — prevents future regressions of the same class.

**Estimated drift candidates (require sweep to confirm):**

Possibly also affected:

- `el-templo-bot/src/schedulers/trial-followup.ts:113` — `SELECT 1 FROM subscriptions s2 WHERE ...` — inspect for `s2.status` references.
- `el-templo-bot/src/schedulers/class-reminder.ts:88` — `FROM bookings b` — inspect for `b.status` references (note: bookings uses `booking_status` per migration 0035).
- Any other raw-SQL site touching `subscriptions`, `bookings`, or other renamed-column tables.

## Verdict update for related closed debug session

`.planning/debug/resolved/api-30-test-failures-triage.md` (closed 2026-06-16) classified the 30 pre-existing test failures as verdict **(a) "Pure test-infra (seed drift)"** under the leading hypothesis "DB-state seed drift". Phase 98 halt evidence (2026-06-17) shows that verdict was **incomplete**: of the original 30 failures, at least 3 (the check_membership cluster in `ai-tools.test.ts`) are actually verdict **(b) "Test-infra + production bug"**. The cascade-close work done in Phase 98 Task 2 was necessary to surface them — the verdict-(a) classification was correct at the level of the symptoms visible 2026-06-16 (cascade-masked SELECT failures look like INSERT failures) but missed the downstream prod bug.

Recommend: amend the api-30 verdict to **(b) test-infra + 1 systemic production bug class (raw-SQL ↔ Drizzle-column-name drift)**. The amendment narrative is captured in `.planning/phases/98-test-hygiene-98-a-b-c/98-HALT.md`; the closed session should reference both this debug session and the halt doc as the "verdict update" pointer.

## Out of scope for this debug session

These are real prod concerns but unrelated to the column-drift class — capture for v5.4.0 backlog, do not fold into this session:

- **`formatBranchLocations` accent-insensitive matching** (`el-templo-bot/src/ai/tools.ts:599-623`): `BranchRow.name.toLowerCase().includes(BRANCH_ADDRESSES_key)` fails when the branch name carries an accent (e.g., `"Constitución"`) but the address-table key does not (e.g., `'constitucion'`). Effect: get_location returns "we have this branch" but no address. Suggested fix: NFD-normalize + strip combining marks on both sides. Not in this session's column-drift scope; capture as a v5.4.0 staging-gate review item.

- **Test-side check_schedule date mismatch** (`el-templo-api/test/whatsapp/ai-tools.test.ts:153-175`, `:178-200`): tests seed bookings with `today`, prod queries the next occurrence of `day_of_week`. Test-side fix only; lands in Phase 98 retry as part of Task 2 expansion. Not a prod bug.

## Recommended sequencing

1. **This debug session:** /gsd-debug full sweep per "Required scope" above. Produce a finding list with column-drift instances. Verdict, count, and fix surface.
2. **Prod-fix phase (new, between Phase 96.5 and Phase 97):** TDD RED/GREEN — failing test that reproduces `Unknown column` for each drift site, then atomic fix commit. Include a sweep-lint test to prevent recurrence.
3. **Phase 97 RGUARD-01:** unblocked once prod-fix phase ships.
4. **Phase 98 retry:** cherry-pick `phase-98-preserve/task-1-green-baseline` (Task 1) + apply `98-TASK-2-WIP.patch` (Task 2 expansion) + Task 3 (98-C webhook mock + image-test rewrite) + Task 4 (human-verify checkpoint).

## Inputs already captured (no re-discovery needed)

- `.planning/phases/98-test-hygiene-98-a-b-c/98-HALT.md` — full Phase 98 halt narrative, prod-bug findings, preserved artifact pointers.
- `.planning/phases/98-test-hygiene-98-a-b-c/98-TASK-2-WIP.patch` — preserved Task 2 expansion (104 lines).
- `phase-98-preserve/task-1-green-baseline` branch at SHA `95d58f98` — Task 1 (98-A) committed work.
- `worktree-agent-a10bd401b163da68c` — original executor worktree with Task 1 commit + uncommitted Task 2 WIP (redundant with patch + preserve branch; safe to remove after the prod-fix phase ships).
- `.planning/debug/resolved/api-30-test-failures-triage.md` — original triage of the 30 failures; verdict (a) needs update.

## Test-suite baseline reference

- Pre-Phase 98 baseline (verified 2026-06-16, HEAD `4e5d8d75`): 30 failed / 482 passed / 512 total.
- Post-Phase 98 Task 1 (95d58f98, in `phase-98-preserve/task-1-green-baseline`): 6 of 30 closed (subscriptions.test.ts). New baseline if Task 1 lands on main: 24 failed / 488 passed.
- Post-Phase 98 Task 2 WIP (uncommitted): another 3 of 24 closed in ai-tools.test.ts (D-05 cleanup cascade + wording asserts + bookings column rename + address fixes). New baseline if Task 2 WIP also lands on main: 21 failed / 491 passed.
- Remaining at halt: 21 failures — split into (a) test-side check_schedule date mismatch (2 in ai-tools.test.ts), (b) prod bug propagation in webhook.test.ts (~3, via state machine), (c) BUG-03 (i) LIKE-search Phase-95-deferred RED (1, stays red), (d) other drift discovered during sweep (unknown count).

Phase 97 RGUARD-01 cannot lock a baseline on top of any of these. Sweep + fix is the gate.

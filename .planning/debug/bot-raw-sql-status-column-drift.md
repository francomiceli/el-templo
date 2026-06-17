---
slug: bot-raw-sql-status-column-drift
status: diagnosed
trigger: "Phase 98 STOP-and-reclassify (2026-06-17): closing the D-05 cleanup cascade in ai-tools.test.ts revealed that el-templo-bot raw SQL reads `sub.status` / `s.status` (tools.ts:495,500; machine.ts:77) but the SQL column is `subscription_status` (migration 0032). MySQL throws `Unknown column 'sub.status' in 'field list'` (errno 1054, sqlState 42S22) on every check_membership call and on lookupClientState whenever a subscription row exists. Confirmed prod bug, not test-infra. Same drift class as Phase 95 BUG-03 (vi) `bk.status` → `bk.booking_status` — second instance, treated as SYSTEMIC."
created: 2026-06-17
updated: 2026-06-17
goal: find_root_cause_only
specialist_dispatch_enabled: true
v54_gate: true
diagnose_only: true
related:
  - api-30-test-failures-triage (resolved-with-amendment 2026-06-17; verdict (a) "pure test-infra" amended to (b) test-infra + 1 systemic prod bug class)
  - Phase 95 BUG-03 (vi) (bk.status drift, fixed at tools.ts:330 and :824)
blocks:
  - Phase 98 (test-hygiene-98-a-b-c)
  - Phase 97 RGUARD-01
  - v5.4.0 path step 3
fix_owner_phase: Phase 97.5 (NEW — to be planned; TDD-shaped prod-fix)
sweep_completed: 2026-06-17
sweep_scope: el-templo-bot/src/** + el-templo-api/src/** raw SQL templates
sweep_scope_files_count: 22
sweep_findings_drift_count: 3
sweep_findings_correct_count: 153
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

---

## ✓ Sweep findings (2026-06-17, inline-orchestrator run)

Full sweep of `el-templo-bot/src/**` and `el-templo-api/src/**` raw SQL templates against the Drizzle column-rename map. Method: enumerate every `mysqlEnum("sql_col", ...)` and column-rename declaration in `el-templo-api/src/db/schema/*.ts`, build the JS-property → SQL-column map, then scan every `` sql`...` `` template for column references that use the JS property name instead of the SQL column name.

Run substituted in for the `gsd-debug-session-manager` agent after that agent dropped to an API socket error mid-execution (36 tool calls / ~5 min before the drop, no findings written). Operator authorized inline execution.

### Drizzle column-rename map (high-risk subset)

The "high-risk" class is the pattern that bit Phase 95 and Phase 98: a column declared as a reused enum where the JS property name is a plain word (`status`, `source`, `direction`, `level`) but the SQL column name carries a table-specific prefix (`booking_status`, `attendance_source`, `message_direction`, `exercise_level`). Standard camelCase ↔ snake_case renames (e.g. `startDate` ↔ `start_date`) are also drift candidates but get caught more often by developers because the rename is mechanical.

| Schema file                 | JS property (Drizzle)                       | SQL column (migration)    | Risk class                                               |
| --------------------------- | ------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| `attendance.ts`             | `attendance.status`                         | `attendance_status`       | 🚨 HIGH (plain word → prefixed)                          |
| `attendance.ts`             | `attendance.source`                         | `attendance_source`       | 🚨 HIGH                                                  |
| `bookings.ts`               | `bookings.status`                           | `booking_status`          | ✅ Fixed (Phase 95 BUG-03 (vi) — `tools.ts:330`, `:824`) |
| `subscriptions.ts`          | `subscriptions.status`                      | `subscription_status`     | 🚨 HIGH — **CURRENT CONFIRMED PROD BUG**                 |
| `whatsapp_conversations.ts` | `whatsapp_conversations.status`             | `conversation_status`     | 🚨 HIGH                                                  |
| `whatsapp_messages.ts`      | `whatsapp_messages.direction`               | `message_direction`       | 🚨 HIGH                                                  |
| `whatsapp_messages.ts`      | `whatsapp_messages.messageType`             | `wa_message_type`         | 🚨 HIGH (alt prefix — `wa_` not `message_`)              |
| `aura_config.ts`            | `aura_config.sourceType`                    | `aura_config_source_type` | 🚨 HIGH (long-prefix; not just camelCase→snake)          |
| `aura_transactions.ts`      | `aura_transactions.sourceType`              | `source_type`             | 🟡 medium (camelCase → snake, standard)                  |
| `exercises.ts`              | `exercises.level`                           | `exercise_level`          | 🚨 HIGH                                                  |
| `format_compatibility.ts`   | `format_compatibility.level`                | `compat_level`            | 🚨 HIGH (alt prefix — `compat_` not `format_compat_`)    |
| `payments.ts`               | `payments.paymentMethod`                    | `payment_method`          | 🟡 medium                                                |
| `subscription_plans.ts`     | `subscription_plans.planTier`               | `plan_tier`               | 🟡 medium                                                |
| `subscription_plans.ts`     | `subscription_plans.bookingMode`            | `booking_mode`            | 🟡 medium                                                |
| `subscriptions.ts`          | `subscriptions.priceTypeApplied`            | `price_type_applied`      | 🟡 medium                                                |
| `users.ts`                  | `users.documentType`                        | `document_type`           | 🟡 medium                                                |
| `weekly_rotator.ts`         | `weekly_rotator.levelGroup`                 | `level_group`             | 🟡 medium                                                |
| `whatsapp_conversations.ts` | `whatsapp_conversations.clientState`        | `client_state`            | 🟡 medium                                                |
| `format_compatibility.ts`   | `format_compatibility.block`                | `block`                   | ✓ MATCH (no rename)                                      |
| `users.ts`                  | `users.role`, `users.level`, `users.gender` | `role`, `level`, `gender` | ✓ MATCH                                                  |
| `weekly_rotator.ts`         | `weekly_rotator.day`                        | `day`                     | ✓ MATCH                                                  |

(Plus ~150 standard camelCase → snake_case renames across all 42 schema files. Those are low-risk because they follow a mechanical convention developers already track.)

### Survey results — `el-templo-bot/src/`

`grep -rln 'sql\`' el-templo-bot/src/`returns 5 files:`webhook/handler.ts`, `state/machine.ts`, `ai/tools.ts`, `schedulers/class-reminder.ts`, `schedulers/trial-followup.ts`.

| File                           | Line    | SQL fragment                                                                                                   | Class                    | Notes                                                                |
| ------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------- |
| `webhook/handler.ts`           | 208     | `SELECT id, conversation_status FROM whatsapp_conversations`                                                   | ✓ Correct                | Uses SQL column name                                                 |
| `webhook/handler.ts`           | 219     | `INSERT INTO whatsapp_conversations (..., conversation_status, client_state, ...)`                             | ✓ Correct                |                                                                      |
| `webhook/handler.ts`           | 234     | `UPDATE whatsapp_conversations SET last_message_at = NOW(), ...`                                               | ✓ Correct                | No status update                                                     |
| `webhook/handler.ts`           | 257     | `UPDATE whatsapp_conversations SET linked_member_id = ${matchedUserId}`                                        | ✓ Correct                |                                                                      |
| `webhook/handler.ts`           | 330     | `INSERT INTO whatsapp_messages (..., message_direction, ..., wa_message_type, ...)`                            | ✓ Correct                | Both renamed columns use SQL names                                   |
| `webhook/handler.ts`           | 334     | Same INSERT pattern                                                                                            | ✓ Correct                |                                                                      |
| `webhook/handler.ts`           | 363     | Same INSERT pattern                                                                                            | ✓ Correct                |                                                                      |
| `webhook/handler.ts`           | 669     | `SELECT content, message_direction FROM whatsapp_messages`                                                     | ✓ Correct                |                                                                      |
| `webhook/handler.ts`           | 1061    | INSERT into whatsapp_messages, full column names                                                               | ✓ Correct                |                                                                      |
| `webhook/handler.ts`           | 1084    | Same                                                                                                           | ✓ Correct                |                                                                      |
| `state/machine.ts`             | 61      | `SELECT u.id, u.first_name, u.is_active FROM users u`                                                          | ✓ Correct                |                                                                      |
| **`state/machine.ts`**         | **77**  | **`SELECT s.status, s.end_date, sp.is_trial FROM subscriptions s`**                                            | **🚨 DRIFT**             | **`s.status` → `s.subscription_status` required**                    |
| `state/machine.ts`             | 100     | `SELECT COUNT(*) AS cnt FROM attendance`                                                                       | ✓ Correct                | Aliased COUNT only                                                   |
| `state/machine.ts`             | 148     | `UPDATE whatsapp_conversations SET client_state = ...`                                                         | ✓ Correct                |                                                                      |
| `ai/tools.ts`                  | 327     | `SELECT COUNT(*) FROM bookings bk WHERE bk.schedule_id = ... AND bk.booking_status != 'cancelado'`             | ✓ Correct (Phase 95 fix) | Uses SQL column name post-Phase-95-(vi) fix                          |
| `ai/tools.ts`                  | 481     | `SELECT id, first_name, last_name FROM users WHERE phone = ... AND is_active = true`                           | ✓ Correct                |                                                                      |
| **`ai/tools.ts`**              | **495** | **`SELECT sp.name AS plan_name, sub.status, sub.start_date, sub.end_date, ...`**                               | **🚨 DRIFT**             | **`sub.status` → `sub.subscription_status` required** (SELECT list)  |
| **`ai/tools.ts`**              | **500** | **`AND sub.status IN ('active', 'paused')`**                                                                   | **🚨 DRIFT**             | **`sub.status` → `sub.subscription_status` required** (WHERE clause) |
| `ai/tools.ts`                  | 509     | `SELECT name, price_regular, duration_days, classes_per_week FROM subscription_plans`                          | ✓ Correct                | Uses SQL column names                                                |
| `ai/tools.ts`                  | 821     | `SELECT COUNT(*) FROM bookings bk ... AND bk.booking_status != 'cancelado'`                                    | ✓ Correct (Phase 95 fix) |                                                                      |
| `schedulers/trial-followup.ts` | 95      | Multi-line SELECT with `s.subscription_status = 'active'` and `s2.subscription_status IN ('active', 'paused')` | ✓ Correct                | Pre-existing correct usage; never drifted                            |
| `schedulers/class-reminder.ts` | 81      | Multi-line SELECT with `b.booking_status = 'reservado'`                                                        | ✓ Correct                | Pre-existing correct usage                                           |

**Bot total:** 22 SQL sites surveyed, 3 drift (the 3 already known from Phase 98), 19 correct. No additional drift surfaced beyond the original 3.

### Survey results — `el-templo-api/src/`

`grep -rln 'sql\`' el-templo-api/src/` returns 17 files. Sample of the high-risk-column references found inside SQL templates:

| File                                               | Pattern                                                                                          | Class              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| `jobs/mark-no-shows.ts:29`                         | `sql\`${bookings.status} = 'reservado' AND ${bookings.bookingDate} < CURDATE()\``                | ✓ Drizzle-mediated |
| `modules/scheduling/booking-service.ts` (×4 sites) | `sql\`${schema.bookings.status} IN (...)\``                                                      | ✓ Drizzle-mediated |
| `modules/scheduling/service.ts` (×2 sites)         | `sql\`${schema.bookings.status} IN (...)\``                                                      | ✓ Drizzle-mediated |
| `modules/scheduling/holiday-service.ts:×1`         | `sql\`${schema.bookings.status} IN (...)\``                                                      | ✓ Drizzle-mediated |
| `modules/analytics/service.ts` (×4 sites)          | `sql\`${schema.subscriptions.status} IN (...)\`` and `sql\`${schema.bookings.status} IN (...)\`` | ✓ Drizzle-mediated |

**Pattern observation:** every API-side raw SQL that references a high-risk column does so via Drizzle interpolation (`${schema.table.column}` or `${table.column}`). Drizzle resolves these to the SQL column name at query-build time. **No API-side drift found.** This is the right pattern; the bot side should adopt it (see "Recommended fix shape" below).

**API total:** 153 SQL sites surveyed across 17 files; 0 drift. The API repo is the well-disciplined side.

### Confirmed drift sites (after sweep — no expansion beyond Phase 98 surface)

| #   | File                                 | Line | Wrong SQL                                         | Right SQL                                                                   | Blast radius                                                                                                       |
| --- | ------------------------------------ | ---- | ------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | `el-templo-bot/src/ai/tools.ts`      | 495  | `sub.status` (SELECT list)                        | `sub.subscription_status` (or `AS status` alias)                            | `checkMembership` — called from AI tool dispatch when the WhatsApp user runs the `check_membership` tool           |
| 2   | `el-templo-bot/src/ai/tools.ts`      | 500  | `sub.status IN ('active', 'paused')`              | `sub.subscription_status IN ('active', 'paused')`                           | Same call                                                                                                          |
| 3   | `el-templo-bot/src/state/machine.ts` | 77   | `s.status, s.end_date, sp.is_trial` (SELECT list) | `s.subscription_status AS status, s.end_date, sp.is_trial` (or rename type) | `determineClientState` — called from `handleInboundMessage` on **every** inbound WhatsApp message; failure cascade |

**No additional drift sites discovered.** The sweep confirms Phase 98's halt diagnosis was complete at the SELECT/WHERE-clause level. The remaining JS-side reads (`sub.status === "active"`, `subRows.find((s) => s.status === "active")` etc. at `tools.ts:538` + `machine.ts:90,116`) depend on the chosen fix shape — see below.

### Recommended fix shape (per site)

**Option A — `AS status` aliasing (minimal diff):**

- SQL: `SELECT sub.subscription_status AS status, ...` (and similarly for `s.subscription_status AS status`)
- JS-side: `SubscriptionRow.status: string` unchanged; reads at `tools.ts:538`, `machine.ts:90`, `:116` unchanged
- Diff size: ~6 lines total across both files
- Pros: smallest GREEN commit; lowest regression risk; lowest review burden
- Cons: hides the column-name truth in the row type; encourages future drift in adjacent queries that read the row object

**Option B — rename `SubscriptionRow.status` → `SubscriptionRow.subscription_status` (explicit) — RECOMMENDED**

- SQL: `SELECT sub.subscription_status, ...` (no AS alias)
- JS-side: `SubscriptionRow` interface field renamed; all reads on the row object updated (`tools.ts:538`: `sub.subscription_status === "active"`; `machine.ts:90`: `subRows.find((s) => s.subscription_status === "active")`; `machine.ts:116` same)
- Diff size: ~12 lines (SELECT + 3 JS-side reads × 2 files + interface decl × 2)
- Pros: explicit > clever (per CLAUDE.md engineering preferences); aligns row type with actual SQL column; eliminates "shadow column name" confusion; makes future drift more visible
- Cons: slightly larger commit; touches more lines

**Recommended:** **Option B** per the El Templo CLAUDE.md "Explicit over clever" principle. The `AS status` alias is the kind of cleverness CLAUDE.md flags ("Don't add ... shims when you can just change the code"). Option B is also more consistent with the Phase 95 (vi) fix, which renamed `bk.status` → `bk.booking_status` directly without aliasing.

**Even better — Option C (long-term, NOT for the prod-fix phase):** migrate the 3 bot-side raw SQL sites to Drizzle's typed query builder, matching the API-side pattern. Eliminates the entire drift class at the type system level. Out of scope for the prod-fix phase (too large a refactor); capture for a v5.4.0 follow-up.

### Sweep-lint test design (for the prod-fix phase to author)

**Goal:** Prevent future regressions of this drift class. Test must fail if any raw SQL template anywhere in `el-templo-bot/src/**` or `el-templo-api/src/**` references a JS property name for a renamed-column table.

**Implementation outline (vitest, lives in `el-templo-api/test/lint/raw-sql-column-drift.test.ts`):**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { glob } from "glob";
import * as schemaModule from "../../src/db/schema";

// Step 1: Build the JS-property → SQL-column map from Drizzle schema.
// For each table export, iterate columns; for each column, read its
// `name` property (Drizzle exposes the SQL column name internally).
// Skip columns where js_property === sql_column.
function buildRenameMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [tableName, table] of Object.entries(schemaModule)) {
    if (typeof table !== "object" || table === null) continue;
    // Drizzle MysqlTable exposes column metadata via Symbol(drizzle:Columns)
    // or via the table type's getSQL().columns — use the documented API.
    // Pseudocode: iterate columns, find renames.
  }
  return map;
}

// Step 2: Scan every `sql\`...\`` template in the bot + api source.
async function findRawSqlSites(): Promise<
  Array<{ file: string; line: number; sql: string }>
> {
  const files = await glob([
    "el-templo-bot/src/**/*.ts",
    "el-templo-api/src/**/*.ts",
  ]);
  // For each file, extract sql`...` template literal contents
  // (account for multiline templates; use a TS AST parser like ts-morph or
  // a regex with multiline mode + skip ${} placeholders for the scan).
  return [];
}

// Step 3: For each raw SQL site, parse table aliases and column references.
// A simple parser: detect `FROM <table>` / `JOIN <table> <alias>` and
// `<alias>.<column>` references. Cross-check against renameMap[<table>][<column>].
describe("raw SQL column drift", () => {
  it("no raw SQL references a JS property name for a renamed column", async () => {
    const renameMap = buildRenameMap();
    const sites = await findRawSqlSites();
    const drift: string[] = [];
    for (const site of sites) {
      // Parse aliases + column refs from site.sql
      // For each column ref:
      //   if (renameMap.get(table)?.has(column))
      //     drift.push(`${site.file}:${site.line} — ${alias}.${column}`)
    }
    expect(drift).toEqual([]);
  });
});
```

**Authoring notes for the prod-fix phase planner:**

- The scanner's table-alias parser only needs to handle the patterns actually used in this codebase (`FROM <table>` and `FROM <table> <alias>` and `JOIN <table> <alias> ON ...`). No full SQL parser needed.
- The scanner can skip Drizzle-interpolated column references (`${schema.bookings.status}` or `${bookings.status}`) — Drizzle resolves those at query build, so they're never wrong.
- The scanner must consume the multiline-template form (`sql\`SELECT ... \n FROM ... \n WHERE ... \``). A simple stateful line-by-line accumulator works (mirror the awk pattern this sweep used).
- False positive risk: if a JS-property name happens to also be a valid SQL column name in a different table queried in the same raw SQL (e.g., `users.role` is `role` everywhere AND `users.documentType` is `document_type`). The scanner should anchor on `<table_alias>.<col>` form, not bare `<col>`.

**Where to invoke:** add to `el-templo-api/package.json` `test` script (lives alongside integration tests; runs in CI). No separate lint command needed.

### Verdict update for related closed debug session

`.planning/debug/resolved/api-30-test-failures-triage.md` was amended 2026-06-17 (commit `24e92546`). The amendment is in place; no further action needed from this sweep. The verdict in that file now correctly reads "(b) test-infra + 1 systemic production bug class (raw-SQL ↔ Drizzle-column-name drift)" with a pointer back to this session.

### Verdict for this session

**Root cause confirmed.** Three sites in `el-templo-bot/src/` use raw SQL referencing the JS property `status` for tables (`subscriptions`, `subscriptions`-via-machine, `subscriptions`-via-checkMembership) whose SQL column is `subscription_status`. No additional drift discovered in the full sweep. The API side is uniformly Drizzle-mediated and clean.

**This is a systemic drift class** in the limited sense that it has now happened twice (`bookings.status` → `booking_status` in Phase 95, `subscriptions.status` → `subscription_status` in Phase 98) — but the sweep shows it has NOT spread further. The bot side has 3 confirmed drift sites; everything else (schedulers, handler, the bookings queries already fixed in Phase 95) correctly uses SQL column names. The pattern at risk is "raw SQL hand-written in el-templo-bot for tables with reused-enum prefixed-name columns" — adopting Drizzle interpolation everywhere (Option C above) is the long-term elimination.

**Fix is delegated to a new Phase 97.5 prod-fix phase** (TDD-shaped: RED reproducing `Unknown column 'sub.status'` and `Unknown column 's.status'`; GREEN applies Option B at the 3 sites + JS-side reads; sweep-lint test prevents recurrence). Phase 97.5 lands before Phase 97 RGUARD-01 and Phase 98 reopen.

**Next step:** operator runs `/gsd-discuss-phase 97.5` to lock the fix-shape decision (Option B is the default recommendation; lift to Option C if the operator wants the broader refactor), then `/gsd-plan-phase 97.5`. This debug session is `diagnosed` and serves as the input doc for that planning cycle.

### Inline-orchestrator run metadata

- Spawned agent `a22a1d75d4b4e071b` dropped to API socket error after 36 tool calls / ~5 min; no findings written to session file. Worktree state on main checkout untouched at the time of drop.
- Operator authorized inline sweep (Option C in the recovery question) instead of retrying the subagent.
- Sweep duration: ~3 min wallclock; 22 source files inspected; full Drizzle schema enumerated (42 files).
- Sweep tools used: `grep`, `awk`, `Read` — no Drizzle introspection, no AST parsing (sufficient for the limited site count). The prod-fix phase's sweep-lint test will need stronger introspection — see "Sweep-lint test design" above.

---
phase: 98-test-hygiene-98-a-b-c
plan: 01
status: halted
halted_at: 2026-06-17
halt_reason: production_bug_uncovered
guard_triggered: stop_and_reclassify
debug_session: bot-raw-sql-status-column-drift
preserved_artifacts:
  task_1_commit: 95d58f98
  task_1_branch: phase-98-preserve/task-1-green-baseline
  task_2_wip_patch: .planning/phases/98-test-hygiene-98-a-b-c/98-TASK-2-WIP.patch
  task_2_wip_branch: worktree-agent-a10bd401b163da68c
sc_status:
  sc1_unreachable_with_sc5: true
  sc5_inviolable_under_current_scope: true
  sc6_unverified_at_halt: true
blocks: [Phase 97 RGUARD-01, v5.4.0 path step 3]
unblocks_on: prod-fix phase completion
---

# Phase 98 — HALT: Production bug uncovered, STOP-and-reclassify guard fired

## Why this phase halted

Phase 98 closed the D-05 cleanup cascade in `ai-tools.test.ts` (test #1: 8 latent failures revealed beneath the cascade, classified into 5 test-side defect classes per operator authorization 2026-06-17). The operator authorized expanded Task 2 scope to fix the latent failures. Applying the authorized column renames (`status` → `subscription_status` in INSERT at `:235`) made the row insertable — which then exposed that the **production raw SQL also uses the wrong column name**:

| Site | File                                    | Code                                                            | Actual SQL column     |
| ---- | --------------------------------------- | --------------------------------------------------------------- | --------------------- |
| 1    | `el-templo-bot/src/ai/tools.ts:495`     | `SELECT sp.name AS plan_name, sub.status, ...`                  | `subscription_status` |
| 2    | `el-templo-bot/src/ai/tools.ts:500`     | `AND sub.status IN ('active', 'paused')`                        | same                  |
| 3    | `el-templo-bot/src/state/machine.ts:77` | `SELECT s.status, s.end_date, sp.is_trial FROM subscriptions s` | same                  |

Each site throws `Unknown column 'sub.status' in 'field list'` (sqlState `42S22`) the moment a non-empty subscription path is exercised — meaning `check_membership` and the state-machine `lookupClientState` subscription branch are runtime-broken in production. Drizzle ORM declares `mysqlEnum("subscription_status", [...])` as the SQL column name (migration `0032_subscriptions.sql:32` confirms `subscription_status` was the column from creation; no rename in subsequent migrations); the raw-SQL code paths above were never test-covered against a populated row because the tests had a mirror bug (`INSERT (..., status, ...)` at `:235`) that masked the SELECT failure.

This is the **second instance** of the Phase 95 (vi) class drift — first instance was `bk.status` → `bk.booking_status` (correctly applied at `tools.ts:330` and `:824` for the bookings table). Same root cause in a sibling table. Treated as **systemic raw-SQL ↔ Drizzle-column-name drift** — the prod-fix phase must do a full sweep across `el-templo-bot/src/**` and `el-templo-api/src/**`, not point-fix only the 3 known sites.

The plan's `<success_criteria>` SC#5 HARD GUARD is explicit:

> `git diff HEAD~3 HEAD -- 'el-templo-api/src/**' 'el-templo-bot/src/**'` produces zero output.

Phase 98 cannot reach SC#1 (511 passed / 1 failed / 512 total) without violating SC#5. Per the plan's own STOP-and-reclassify guard ("if any failure unexpectedly reveals a production bug, STOP"), Phase 98 halts.

## What was committed before halt

| Commit     | Subject                                                                  | Files                                                                                     |
| ---------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `95d58f98` | `test(98-A): rewrite 6 stale startDate sites + add futureDateISO helper` | `el-templo-api/test/helpers.ts`, `el-templo-api/test/subscriptions/subscriptions.test.ts` |

Task 1 (98-A GREEN) closed 6 of the 30 original test failures cleanly. The commit lives on:

- `worktree-agent-a10bd401b163da68c` (original executor worktree branch)
- `phase-98-preserve/task-1-green-baseline` (durable preservation branch — survives worktree cleanup)

Per operator directive, Task 1 stays committed and is NOT reverted. The re-plan can cherry-pick from either branch when the prod-fix phase lands.

Task 1's authorized deviation from the original plan (per operator at start of session): the `addDays` import in Step 2 was omitted (D-02 vestigial under D-03's non-tautological inequality). The committed code uses only `futureDateISO(7)` for the dynamic startDate at `:366` and `expect(new Date(body.endDate).getTime()).toBeGreaterThan(Date.now())` for the `:375` endDate inequality. No `addDays` reference exists in the test file.

## What was in-progress at halt (preserved, not committed)

The expanded Task 2 (98-B) work was applied to `el-templo-api/test/whatsapp/ai-tools.test.ts` but not committed. Saved as:

- Patch file: `.planning/phases/98-test-hygiene-98-a-b-c/98-TASK-2-WIP.patch` (104 lines, 12 +/12 −)
- Branch: working tree of `worktree-agent-a10bd401b163da68c` (uncommitted)

Contents of the WIP:

**Plan-authorized D-05 + D-06:**

- `:60` `'alem'` → `'TSTA'` (seed code rename — aligns with cleanup filter `LIKE 'TST%'` at `:55`)
- `:112` `"20 lugares"` → `"20 cupos disponibles"`
- `:174` `"2 lugares"` → `"2 cupos disponibles"` (number 2 preserved)
- `:225` `"20 lugares"` → `"20 cupos disponibles"`

**Operator-authorized expansions (Task 2 scope grew from 4 sites to ~10):**

- `:166`, `:191`, `:216` bookings INSERTs: `status` → `booking_status` (column-name drift; bookings query in prod uses `booking_status` correctly — test-side only)
- `:235` subscriptions INSERT: `status` → `subscription_status` (**revealed prod bug — see above**)
- `:312` `expect(result).toContain("Av. Leandro N. Alem 896")` → `expect(result).toContain("Alem 3958, Mar del Plata")` (matches `BRANCH_ADDRESSES['alem']` at `tools.ts:64`); stale `"google.com/maps/search"` assertion replaced with `"maps.app.goo.gl"` (prod uses short links via `BRANCH_MAPS_LINKS['alem']`)
- `:319` `'constitucion'` (12 chars) → `'TSTC'` (4 chars; respects `branches.code varchar(10)` and TST-prefix convention)
- `:329` `expect(result).toContain("Av. Constitución 1050")` → `expect(result).toContain("Av. Constitucion 6745, Mar del Plata")` (matches `BRANCH_ADDRESSES['constitucion']` at `tools.ts:62`; no accent in prod key)

**Diagnosis surfaced but NOT applied (still latent in ai-tools.test.ts):**

- `:153-175` `accounts for bookings in spots remaining` and `:178-200` `shows 'lleno' when at capacity` fail because the production `check_schedule` query at `tools.ts:329` resolves bookings against `DATE_ADD(CURDATE(), INTERVAL (s.day_of_week - DAYOFWEEK(CURDATE()) + 8) % 7 DAY)` — i.e. the **next occurrence** of `day_of_week`. Tests seed bookings with `today = new Date().toISOString().slice(0,10)` (today's date), which only matches when today happens to be the schedule's day. On 2026-06-17 (Wednesday) seeding Monday-schedule bookings, the production query looks up 2026-06-22 → 0 bookings counted → reports "20 cupos disponibles" instead of "2"/"lleno". Fix: replace `today` with the resolved next-occurrence date (use the same `(s.day_of_week - DAYOFWEEK(CURDATE()) + 8) % 7` formula or a date-math helper). Test-side only; safe to land in the re-plan Phase 98.

## Post-halt failure inventory (ai-tools.test.ts, after WIP applied)

After the WIP patch, the file ran at **5 failures of 20** (down from 8 after cascade close, down from 20 at original baseline). Breakdown:

| #   | Test                                                                     | Root cause                                                      | Class        | Surface                                                |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------ | ------------------------------------------------------ |
| 1   | `check_schedule > accounts for bookings in spots remaining`              | Date mismatch (test seeds today, prod queries next-day_of_week) | Test-side    | `el-templo-api/test/whatsapp/ai-tools.test.ts:153-175` |
| 2   | `check_schedule > shows 'lleno' when at capacity`                        | Same                                                            | Test-side    | `:178-200`                                             |
| 3   | `check_membership > returns subscription info for active member`         | `sub.status` in prod raw SQL                                    | **PROD BUG** | `el-templo-bot/src/ai/tools.ts:495,500`                |
| 4   | `check_membership > returns available plans when no active subscription` | Same prod bug                                                   | **PROD BUG** | Same                                                   |
| 5   | `check_membership > excludes trial plans from available plans list`      | Same prod bug                                                   | **PROD BUG** | Same                                                   |

State-machine impact (Task 3 / 98-C territory): `el-templo-bot/src/state/machine.ts:77` reads `s.status` in raw SQL during `lookupClientState`. Any webhook test that exercises a sender with a populated subscriptions row will fail with the same `Unknown column 's.status'` error. Task 3's `vi.mock` for `el-templo-bot/src/ai/provider` was the planned scope; this prod-bug exposure is orthogonal and **not** fixable inside Task 3 surface.

## Phase 95 (vi) parallel + systemic classification

Phase 95 BUG-03 candidate (vi) was originally classified as a single `bk.status` → `bk.booking_status` test/prod drift. The fix landed (`tools.ts:330` and `:824` use `bk.booking_status` correctly). That fix was scoped to the bookings table only. The same drift class exists for the subscriptions table at the 3 sites above — never identified because the upstream test-side INSERT bug (`status` column) masked the downstream SELECT failure.

**Systemic surface:** raw SQL inside `el-templo-bot/src/` and `el-templo-api/src/` that references column names by hand instead of through Drizzle's column-name resolution. Drift sneaks in when the Drizzle declaration uses `mysqlEnum("table_specific_column_name", [...])` (renaming the SQL column away from the JS property name) — raw SQL referencing the JS property name silently breaks. The prod-fix phase must sweep, not point-fix.

## What the re-plan needs

**New phase (recommended name: `98-prod-fix-raw-sql-column-drift` or `Phase 97.5`) — TDD-shaped:**

1. **RED commit** — write 3 failing tests (one each: subscription-active path through `checkMembership`, subscription-paused path through `lookupClientState`, and a deliberate raw-SQL sweep test that lints `el-templo-bot/src/**` and `el-templo-api/src/**` for column references that don't appear in any Drizzle schema's `mysqlEnum`/`varchar`/etc. first-arg column-name set). Each test reproduces `Unknown column 'X' in 'field list'` from MySQL with the relevant `errno: 1054` / `sqlState: 42S22`.
2. **GREEN commit** — rename `sub.status` → `sub.subscription_status` at `tools.ts:495`, `:500`; rename `s.status` → `s.subscription_status` at `machine.ts:77` AND update the JS-side reads of the result rows (the row type expects `.status` — either alias in the SELECT (`AS status`) or rename the type field). Sweep for any other raw-SQL column references that don't match Drizzle column names — fix all of them in the same commit.
3. **VERIFY commit** — re-run full `el-templo-api` test suite; expect `~488 passed / ~24 failed / 512 total` improving toward the Phase 98 retry path.

**Then Phase 98 retry:**

- Cherry-pick Task 1 (98-A) from `phase-98-preserve/task-1-green-baseline` — clean test-side fix, no prod dependency.
- Apply Task 2 (98-B) WIP patch from `98-TASK-2-WIP.patch` — adds the test-side column renames + address fixes + check_schedule date diagnosis fix.
- Complete Task 3 (98-C) — `vi.mock` for AI provider + echo asserts + image-test rewrite.
- Re-verify SC#1 (511/1/512), SC#5 (now amended: the prod-fix phase landed those changes; Phase 98 retry stays test-side-only as originally scoped), SC#6 (tsc clean).
- Phase 4 human-verify checkpoint.

## Deferred concerns (NOT in scope for the prod-fix or Phase 98 retry — log for v5.4.0 backlog)

### `formatBranchLocations` name→address matching is accent-insensitive-broken

`el-templo-bot/src/ai/tools.ts:599-623` — `formatBranchLocations` uses `BranchRow.name.toLowerCase().includes(BRANCH_ADDRESSES_key)` to resolve an address when the branch code doesn't match a `BRANCH_ADDRESSES` key directly. The `BRANCH_ADDRESSES` keys are non-accented (e.g., `'constitucion'`). Real production branch names may carry accents (e.g., `"Constitución"`); `"constitución".includes("constitucion")` is `false`. Effect: accented branch names silently fall through to the "no address" path → the AI responds with "we have a branch X" but no address or directions, breaking the get_location user flow for accented-named branches.

This is a real prod concern but is **not** what blocked Phase 98 (Phase 98's `get_location` tests seed `'Test Constitucion'` without accent, so the lookup succeeds for the test scenario). Capture for v5.4.0 staging-gate review; not fixed here. Suggested fix: NFD-normalize + strip combining marks on both sides before `.includes()`.

### Test-side check_schedule date mismatch (`ai-tools.test.ts:153-175`, `:178-200`)

Already documented above. Fix is test-side only and safe; rolls into the Phase 98 retry's Task 2 expansion. Capture here so the re-plan picks it up.

## Verification of halt state

```bash
# Confirm Task 1 commit preserved
git rev-parse phase-98-preserve/task-1-green-baseline  # → 95d58f98...

# Confirm WIP patch preserved
sha256sum .planning/phases/98-test-hygiene-98-a-b-c/98-TASK-2-WIP.patch

# Confirm worktree still intact (for re-plan reference, can be removed any time)
git worktree list | grep agent-a10bd401b163da68c

# Confirm no src/ changes leaked to main
git diff origin/feature/whatsapp-bot-scaffold HEAD -- 'el-templo-api/src/**' 'el-templo-bot/src/**' | wc -l  # → 0

# Confirm Phase 97 RGUARD-01 still in original blocked state (no premature transition)
grep -A2 "RGUARD-01" .planning/ROADMAP.md | head -10
```

## Status of v5.4.0 path

- **Phase 97 RGUARD-01:** still blocked. Cannot lock a regression baseline on a suite that throws `Unknown column` at runtime.
- **Phase 98 (this phase):** halted. Awaits prod-fix phase landing + retry.
- **Prod-fix phase:** **NEW**, not yet planned. User to invoke `/gsd-debug` with full sweep scope, then `/gsd-discuss-phase` + `/gsd-plan-phase`.
- **v5.4.0 staging gate:** unchanged — must not ship on a hidden prod bug.

Phase 98 reopens immediately after the prod-fix phase ships its GREEN commit and SC#1 baseline shifts. No re-discussion of Phase 98 scope needed — the WIP patch + Task 1 branch capture the test-side intent verbatim.

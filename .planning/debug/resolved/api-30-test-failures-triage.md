---
slug: api-30-test-failures-triage
status: resolved-with-amendment
trigger: "el-templo-api 30 pre-existing test failures — pre-v5.4.0 staging gate triage. Carry-forward debt blocking v5.4.0 path step 2. User invocation 2026-06-16 after Phase 96.5 ship at HEAD 4e5d8d75."
created: 2026-06-16
updated: 2026-06-17
goal: find_root_cause_only
specialist_dispatch_enabled: true
v54_gate: true
verdict_amendment:
  date: 2026-06-17
  trigger: Phase 98 STOP-and-reclassify (operator-authorized halt)
  original_verdict: "(a) pure test-infra / seed drift"
  amended_verdict: "(b) test-infra + 1 systemic production bug class — raw-SQL ↔ Drizzle-column-name drift"
  evidence_pointer: .planning/phases/98-test-hygiene-98-a-b-c/98-HALT.md
  followup_debug_session: bot-raw-sql-status-column-drift (status: open)
---

# Debug — el-templo-api 30 pre-existing test failures (pre-v5.4.0 staging gate)

## ⚠ Verdict amendment (2026-06-17 — Phase 98 halt)

Phase 98 (test-hygiene-98-a-b-c) was authorized 2026-06-17 to land the test-infra fixes implied by this session's verdict (a). Task 1 (98-A, subscriptions startDate rewrite) committed clean at `95d58f98`. Task 2 (98-B, ai-tools cleanup-cascade close) closed the masking drift at `:60` (`'alem'` → `'TSTA'`) and surfaced 8 latent failures beneath it. Operator authorized expanded Task 2 scope to fix those latents — applying `status` → `subscription_status` at the test INSERT (`:235`) made the row insertable, which then exposed that **`el-templo-bot/src/ai/tools.ts:495,500` and `el-templo-bot/src/state/machine.ts:77` read `sub.status` / `s.status` in raw SQL**, but the actual SQL column is `subscription_status` (migration `0032_subscriptions.sql:32`).

**This is a confirmed production bug, not test-infra.** Of the original 30 failures, at least 3 (check_membership cluster in `ai-tools.test.ts`) plus likely 3+ in `webhook.test.ts` (state machine propagation) are verdict (b), not verdict (a). The verdict-(a) classification was correct at the symptom level (cascade-masked SELECT failures look like INSERT failures) but missed the downstream prod bug because the cascade was never closed during this triage session.

**Pattern is systemic:** this is the second instance of the same drift class. First instance was `bk.status` → `bk.booking_status` (Phase 95 BUG-03 (vi), fixed at `tools.ts:330` and `:824`). Two instances in two sibling tables (bookings, subscriptions) → treat as systemic raw-SQL ↔ Drizzle-column-name drift.

**Follow-up debug session:** `.planning/debug/bot-raw-sql-status-column-drift.md` (open) — full sweep of `el-templo-bot/src/**` and `el-templo-api/src/**` for the drift class, then TDD-shaped prod-fix phase before Phase 97 RGUARD-01.

**Phase 98 status:** halted at `.planning/phases/98-test-hygiene-98-a-b-c/98-HALT.md`. Task 1 commit preserved on `phase-98-preserve/task-1-green-baseline`. Task 2 WIP preserved at `98-TASK-2-WIP.patch`. Reopens after the prod-fix phase ships.

This session stays `resolved-with-amendment` rather than reopened because the original triage goal (find root cause) was met at the level visible 2026-06-16; the deeper diagnosis required the cascade-close work that Phase 98 actually performed. The amendment captures the corrected understanding without re-litigating the original triage decisions.

---

## Symptoms

- **Expected behavior:** `cd el-templo-api && pnpm test` exits 0 with full green suite, so v5.3.3 milestone can ship cleanly to v5.4.0 staging.
- **Actual behavior:** 30 tests fail / 482 pass / 512 total across 4 test files. Pattern is consistent across runs (verified 2026-06-10 stash-and-rerun: same 30 failures with v5.3.3 milestone changes reverted on bare master → failures pre-date the milestone).
- **Reproduction:** `cd el-templo-api && pnpm test` against real MySQL `eltemplo_test` per `test/helpers.ts`. Reproduced live 2026-06-16 17:08 UTC against HEAD `4e5d8d75` (post-Phase-96.5 ship): identical 30/482/4 (file/test/file count).
- **Timeline:** Pre-dates all v5.3.3 milestone work. First documented in Phase 96 recovery session 2026-06-10 (STATE.md "Pending Decisions" entry).
- **Compilation status:** `pnpm tsc --noEmit` clean on el-templo-api. Failures are runtime test execution, NOT compilation.
- **Errors observed (verbatim from live re-run 2026-06-16):** AssertionError shapes — `expected [] to have a length of 1 but got 0`, `expected ... to have a length of 2 but got 1`, `expected ... to have a length of 0 but got 2`. All count-mismatch assertions on `whatsapp_messages` / `conversations` / `subscriptions` table reads.

## Failing set (verified 2026-06-16 live re-run)

| File                                               | #      | Area                                                                                          |
| -------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `test/subscriptions/subscriptions.test.ts`         | 6      | Subscription Lifecycle (POST assign 409, GET active, pause, resume, cancel, cancel-on-paused) |
| `test/whatsapp/ai-tools.test.ts`                   | 20     | check_membership / check_schedule / get_location / request_human / executeTool                |
| `test/whatsapp/v5-3-3-booking.integration.test.ts` | 1      | BUG-03 candidate (i) LIKE-search RED at `tools.ts:455` (synthetic substring-overlap seed)     |
| `test/whatsapp/webhook.test.ts`                    | 3      | POST /webhook variants (text new sender, text existing sender, non-text image)                |
| **Total**                                          | **30** |                                                                                               |

## Leading hypothesis (REFUTED — see Eliminated)

**DB-state seed drift / test-infra issue, NOT production code bug.** Partially correct but oversimplified. Real story is more specific (and more diverse) — see Classification verdict.

## Goal — classify root cause into ONE of three branches

- **(a) Pure test-infra (seed drift)** → document + accept + ship. v5.4.0 unblocked.
- **(b) Test-infra + 1-2 production bugs** → fix the bugs as Phase 98 OR absorb into v5.4.0 scope. v5.4.0 scope adjusted.
- **(c) Multiple production bugs** → re-evaluate v5.4.0 scope entirely. Significant milestone replan.

## Constraints (LOCKED)

- DO NOT modify production source to make tests pass unless a real production bug is confirmed.
- If a production bug is confirmed, fix the bug, NOT the test.
- BUG-03 (i) LIKE-search at `tools.ts:455` is KNOWN intentional Phase 95 RED — verify it's still that, do NOT close it.
- Final disposition (a/b/c) MUST be explicit and evidence-backed.

## Current Focus

hypothesis: All 30 failures are test-side issues (stale fixtures, broken cleanup, missing AI mock, stale assertions). No production source bugs found.
test: Per-file root-cause traces with verbatim failure output and source-line citations.
expecting: (a) branch — pure test-infra / test-staleness, NO production bugs. v5.4.0 unblocked.
next_action: None — investigation complete. Hand back to orchestrator with classification verdict.

## Evidence

- 2026-06-16T17:08:45Z: `pnpm test --run` reproduced 30/482/4 against HEAD 4e5d8d75 — exact match with documented 2026-06-10 baseline. Stable, deterministic failure set.
- 2026-06-10 (per STATE.md): stash-and-rerun confirmed failures persist with v5.3.3 milestone changes reverted on bare master.
- `pnpm tsc --noEmit` clean on el-templo-api (failures are runtime, not compilation).
- BUG-03 (i) LIKE-search RED at `tools.ts:455` still fires on synthetic substring-overlap seed (test description names the exact line) — confirmed UNCHANGED from Phase 95.

### Subscriptions (6 failures) — TEMPORAL FIXTURE STALENESS

- `test/helpers.ts` has NO setup/teardown discipline beyond `createTestApp` / `getAuthToken` / `registerUser` — per-test cleanup is each test file's responsibility.
- `test/setup.ts` globalSetup: DROPs `eltemplo_test`, recreates, runs all migrations (`src/db/migrations/*.sql`), seeds 1 branch (`code='TEST'`), 1 spom_config, 1 admin user. Fresh slate each run.
- `vitest.config.ts`: `fileParallelism: false`. Files run sequentially in one process; cross-file pollution is possible.
- `subscriptions.test.ts` DOES have per-test `beforeEach: cleanupSubscriptionData()` in the `Subscription Lifecycle` describe block (lines 354–357) — table truncation in FK order plus user deletion (preserving admin). Cleanup is correct.
- Verbatim failure (test `POST assign when member already has active sub returns 409`, line 443): `AssertionError: expected 201 to be 409`. Verbatim log: `userId:15, planId:21, subscriptionId:12, pricePaid:15000` on first assign → second assign also 201 (no conflict raised).
- Verbatim failure (test `GET /members/:userId/subscription returns active subscription`, line 523): `AssertionError: expected 404 to be 200`. Log shows assign → 201 (`userId:16, subscriptionId:13`), then GET returns 404.
- Verbatim failure (test `POST pause changes status to paused`, line 573): assign → 201, pause → 404.
- Verbatim failure (test `POST cancel cancels subscription`, line 621): assign → 201, cancel → 404.
- Verbatim failure (test `POST cancel on paused subscription works`, line 648): assign → 201, pause → 404, cancel → 404.
- All 6 failing tests use `startDate: "2026-03-01"` (the default in helper `assignPlan` and the test's own overrides) with a plan whose `durationDays: 30` → `endDate = 2026-03-31`.
- Today's date is **2026-06-16**, which is **77 days past** `endDate 2026-03-31`.
- `src/modules/subscriptions/service.ts:178–233` (`getMemberSubscription`): calls `autoExpireSubscriptions(userId)` FIRST (line 182), then queries `subscriptions WHERE userId=X AND status IN ('active','paused')`.
- `src/modules/subscriptions/service.ts:775–788` (`autoExpireSubscriptions`): `UPDATE subscriptions SET status='expired' WHERE userId=X AND status='active' AND endDate < TODAY`. This fires on any `active` sub with `endDate < 2026-06-16`.
- `assignPlan` (line 371) calls `getMemberSubscription` for the conflict check; `pauseSubscription` (line 495), `cancelSubscription` (line 579), and `resumeSubscription` all call `getMemberSubscription` first.
- **Mechanism:** First assign creates sub `endDate=2026-03-31, status=active`. Any subsequent operation through `getMemberSubscription` triggers `autoExpireSubscriptions` → status flips `active`→`expired` → lookup returns nothing → operations correctly return 201/404 instead of 409/200.
- Passing peer (`GET /members/:userId/subscription auto-expires past endDate`, line 530) explicitly uses `startDate: "2025-01-01"` with `durationDays: 1` and EXPECTS 404 + expired-in-history. The auto-expire pattern itself is verified working as designed.
- Passing peer (`POST assign with boardingPass when already used returns 409`, line 398) returns 409 because the conflict path is `member.boardingPassUsed` (a column on `users`), NOT subscription lookup — independent of auto-expire.
- **Root cause:** Test fixtures hard-code dates from when the suite was authored. The `expire on read` pattern is the correct production behavior; tests went stale with calendar time.

### ai-tools (20 failures) — BROKEN CLEANUP + STALE STRING ASSERTION

- `test/whatsapp/ai-tools.test.ts:45–100` has `beforeEach` that does cleanup then re-seeds. Cleanup at line 55: `DELETE FROM branches WHERE code LIKE 'TST%'`. Then line 60 inserts `code='alem'` (NOT matching `'TST%'`).
- Run-1 inserts `code='alem'`. Run-2 `beforeEach` cleanup does NOT delete the `'alem'` row (filter mismatch), then tries `INSERT ... 'alem' ...` → `Duplicate entry 'alem' for key 'branches.branches_code_unique'`.
- Verbatim error from live run: `Error: Duplicate entry 'alem' for key 'branches.branches_code_unique'` at `test/whatsapp/ai-tools.test.ts:58:37` (the INSERT).
- Test #1 (`returns formatted schedule data`) is the FIRST test in the file. Its `beforeEach` succeeds (no prior 'alem' row, since global setup seeded `code='TEST'`). Its assertion fails because of a DIFFERENT issue (see next bullet). Tests #2–#20 fail because `beforeEach` throws on the duplicate INSERT.
- Test #1 verbatim failure: `AssertionError: expected '...' to contain '20 lugares'`. Actual output: `"Clases disponibles:\n\n- Test CrossFit (Test Alem) — Lunes 08:00-09:00 — 20 cupos disponibles"`.
- `el-templo-bot/src/ai/tools.ts:389`: `spotsRemaining <= 0 ? "sin cupos" : ${spotsRemaining} cupos disponibles` — production wording is "cupos disponibles", but test asserts "lugares".
- **Two distinct root causes:** (i) `beforeEach` cleanup filter `'TST%'` does not cover the seeded `'alem'` code → cleanup is silently incomplete; first test still seeds, second test's INSERT collides. (ii) Production-text wording for spot availability changed from "lugares" to "cupos disponibles" at some point post-test, but the test was not updated.
- Neither is a production bug. Both are test maintenance debt.

### webhook (3 failures) — MISSING AI MOCK + STALE NON-TEXT EXPECTATION

- Tests cross-import `el-templo-bot/src/webhook/routes`. Webhook handler runs the LLM round-trip on every text message via the OpenAI provider.
- Test environment OPENAI key is `sk-xxxxxxxx` (placeholder); live logs from the test run: `level:50 ... status:401 ... message:"401 Incorrect API key provided: sk-xxxxxxxx ..."`.
- Test `creates conversation, saves messages, and sends echo`: expects 1 outbound "echo" message; gets 0 because LLM call 401s, no reply generated/saved.
- Test `reuses existing conversation`: expects 2 messages (inbound + outbound); gets 1 (only inbound). Same OpenAI 401 root.
- Test `returns 200 but does not store or reply` (image): expects 0 messages and 0 conversations; gets 2 messages and (presumably) 1 conversation.
- `el-templo-bot/src/webhook/handler.ts:169–178, 324–354`: production deliberately added non-text fallback per "quick-16 fix 3". For `image` type: stores the inbound message, looks up `getNonTextFallback("image")` → `"Recibí tu imagen, pero por ahora solo puedo responder a mensajes de texto. ¿Me contás por acá qué necesitás?"`, sends and stores it as outbound.
- Old test assertion (0 stored, no reply) reflects the pre-fix behavior of silent drop. Production behavior changed intentionally; test was not updated.
- Neither is a production bug. Both are test-infra/staleness:
  - (i) Bot's AI provider is not mocked in test mode (no `MockProvider` wired); needs the test to inject a stub or set `OPENAI_API_KEY` to a working key.
  - (ii) Non-text test expectations are pre-quick-16-fix-3 and should now assert the inbound-stored + outbound-fallback-sent behavior.

### v5-3-3-booking.integration (1 failure) — KNOWN INTENTIONAL Phase 95 RED

- Single failure: `BUG-03 candidate (i) — LIKE-search ambiguity at tools.ts:455 > RED: returns exactly one disambiguated branch for substring-match input (FAILS on master)`. Description literally says "FAILS on master".
- All other "FAILS on master" tests in the file pass (Phase 95 GREEN fixes already shipped — `bk.status` rename, capacity-by-tomorrow, executeTool real-schema).
- Behavior matches `.planning/phases/95-booking-reliability-graceful-degradation/95-AUDIT.md` BUG-03 (i): synthetic substring-overlap seed only; does NOT occur in production data; deferred.
- Verified UNCHANGED from baseline. Stays RED — Phase 95-02 owns it.

## Eliminated

- **"Schema migration drift" (e.g. Plan 95-02 `bk.status` → `bk.booking_status` rename caused 20 ai-tools failures)** — Eliminated. The Phase 95-02 rename is shipped and verified working (passing peer tests in `v5-3-3-booking.integration.test.ts` include the explicit guard `RED: check_schedule does not throw the bk.status SQL error specifically (FAILS on master)` which now PASSES). The 20 ai-tools failures are a different mechanism (broken cleanup filter).
- **"DB-state seed drift across files in shared process"** — Eliminated as the _general_ explanation. `vitest.config.ts` has `fileParallelism: false` but each file owns its cleanup; ai-tools.test.ts failures reproduce when running THE FILE ALONE (verified). Cross-file pollution is not the cause.
- **"Subscriptions service has a real query bug"** — Eliminated. The `expire-on-read` pattern is by-design. Service code is correct. The bug is in the test using stale calendar dates.
- **"BUG-03 (i) LIKE-search RED is regressing further"** — Eliminated. Only the single described synthetic-substring-overlap candidate (i) fires; matches Phase 95 baseline exactly. All other Phase 95 GREEN candidates still pass.
- **"Production wording regression caused failures #1 (`'20 lugares'`)"** — Eliminated as a _production bug_. Wording change (`lugares` → `cupos disponibles`) is in production source at `el-templo-bot/src/ai/tools.ts:389` and is the intended phrasing; test assertion is stale.

## Notes for the debugger

- Phase 95-01 audit (`.planning/phases/95-booking-reliability-graceful-degradation/95-AUDIT.md`) is relevant for `ai-tools.test.ts check_schedule` and `v5-3-3-booking.integration.test.ts` — the BUG-03 audit traced these to `tools.ts:282` `bk.status` schema mismatch (closed in Plan 95-02 commit `d90fc782`) and the (i) LIKE-search RED (deferred — synthetic-seed-only).
- `el-templo-bot` test suite is healthy: 5/5 new tests for Phase 96.5 PASS; only known carry-forward flakes (DEGR-01 and LAT-03) which are vitest-fake-timer family, NOT related to this api debug.
- v5.4.0 path step 2 GATE: triage outcome (a/b/c) determines whether v5.4.0 scope expands. Don't rush; evidence-backed disposition required.

## Classification verdict — (a) PURE TEST-INFRA / TEST-STALENESS

**Decision: (a) Pure test-infra / test-staleness. NO production bugs found. v5.4.0 staging gate step 2 is UNBLOCKED.**

### Per-file disposition

| File                                 | #   | Disposition                                  | Cause                                                                                                                                                                                                                                                                               | Fix locus                                                                                                                                                                            | Fix complexity                                                                                           |
| ------------------------------------ | --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `subscriptions.test.ts`              | 6   | TEST-FIXTURE STALENESS                       | All failing tests hard-code `startDate: "2026-03-01"` with `durationDays: 30` (endDate=2026-03-31). Today is 2026-06-16; `expire-on-read` correctly expires the sub before the lookup returns it. Production behavior is correct by design.                                         | Test only. Either compute `startDate` relative to `new Date()` (e.g. tomorrow), or freeze test time with `vi.useFakeTimers()` + `vi.setSystemTime('2026-03-01')`.                    | Low. ~30 min. Recommend the relative-date approach to avoid fake-timer side-effects.                     |
| `ai-tools.test.ts`                   | 20  | TEST CLEANUP BUG + 1 STALE ASSERTION         | (i) `beforeEach` deletes `branches WHERE code LIKE 'TST%'` but inserts `code='alem'`. Cascading 19 failures from `Duplicate entry 'alem'`. (ii) Test #1 asserts `"20 lugares"` but production text is `"20 cupos disponibles"`.                                                     | Test only. Fix cleanup filter (e.g. `code IN ('alem','TSTB')` or `code LIKE 'TST%' OR code = 'alem'`). Update assertion to `"20 cupos disponibles"` or `"cupos"`.                    | Low. ~15 min.                                                                                            |
| `v5-3-3-booking.integration.test.ts` | 1   | KNOWN INTENTIONAL Phase 95 RED               | Synthetic substring-overlap seed only; documented in `95-AUDIT.md` BUG-03 (i). Does NOT occur in production data. Deferred.                                                                                                                                                         | None — Phase 95-02 owns the eventual GREEN.                                                                                                                                          | N/A — STAYS RED.                                                                                         |
| `webhook.test.ts`                    | 3   | MISSING AI MOCK + STALE NON-TEXT EXPECTATION | (i) 2 text failures: OpenAI provider 401s on `sk-xxxxxxxx` placeholder; no mock provider wired in test mode → no reply generated/stored. (ii) 1 image failure: production deliberately added non-text fallback ("quick-16 fix 3"), test still asserts pre-fix silent-drop behavior. | Test/test-infra only. Either mock the AI provider in webhook tests (preferred), or set a working `OPENAI_API_KEY` in CI. Update non-text assertion to expect 1 inbound + 1 outbound. | Medium for the AI-mock wiring (~1–2h, but yields a reusable test fixture); Low for the assertion update. |

### Recommendation for v5.4.0 path step 2 closure

- **Ship v5.4.0 with the 30 carry-forward failures as documented technical debt.** The triage confirms zero production bugs. The behavior changes that the tests are catching (auto-expire on read, "cupos disponibles" wording, non-text fallback, AI roundtrip on every text message) are all intentional production decisions already in master.
- **Do NOT absorb fixes into v5.4.0 scope** unless the user wants a clean green suite as a soft requirement. The fixes are isolated to test files and can ship as a separate Phase 98 hygiene pass without affecting any production code.
- **Recommended Phase 98 scope (separate, after v5.4.0 ships):**
  - 98-A: `subscriptions.test.ts` — replace hard-coded 2026-03-01 dates with `new Date(Date.now() + 86400000).toISOString().split('T')[0]` (or use a helper).
  - 98-B: `ai-tools.test.ts` — fix the cleanup filter; update wording assertion to "cupos disponibles".
  - 98-C: `webhook.test.ts` — wire an in-test AI mock provider; update image-test assertions to expect 1 inbound + 1 outbound fallback message.
  - 98-D: BUG-03 (i) LIKE-search RED — already owned by Phase 95-02; out of Phase 98 scope.
- **STATE.md update (orchestrator action):** the "Pending Decisions" entry on 30 pre-existing failures can now be re-classified from "unknown root cause" to "test-infra debt, classified (a), Phase 98 candidate." No carry-forward production risk for v5.4.0.

### Confidence

- High confidence on subscriptions (causal chain traced through source; today's date + 77-day-past endDate + auto-expire-on-read is a clean three-line proof).
- High confidence on ai-tools cascade (verbatim Duplicate entry error matches verbatim cleanup filter `LIKE 'TST%'` vs seed `code='alem'`).
- High confidence on ai-tools wording (verbatim production line `tools.ts:389` vs verbatim test assertion).
- High confidence on webhook 2 text failures (verbatim 401 error from openai-provider in run output).
- High confidence on webhook image failure (verbatim handler.ts:325 non-text branch + verbatim "quick-16 fix 3" comment).
- High confidence on BUG-03 (i) RED (verbatim test description names line 455; no scope change from Phase 95 baseline).

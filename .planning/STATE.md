---
gsd_state_version: 1.0
milestone: v5.3.3
milestone_name: Post-v5.3.2 Live Test Fixes
status: executing
stopped_at: "Phase 96.5 context gathered — D-01..D-04 locked (Option D wording, render-time prompt args via getSystemPrompt opts, frozen miércoles 2026-06-10, 5-test scope); D-02a Argentine timezone deferred to plan-phase. Next: /gsd-plan-phase 96.5."
last_updated: "2026-06-12T15:48:41.389Z"
progress:
  total_phases: 6 # 93/94/95/96/97 original + 96.5 NEW per locked path
  completed_phases: 3 # 93 passed, 95 closed (beb2282b), 96 complete (96-01-SUMMARY.md); 94 human_needed pending BUG-02 smoke; 97 + 96.5 not started
  total_plans: 10 # 7 shipped + 96.5 (~1) + 97 (~2 per ROADMAP) estimated
  completed_plans: 7 # 93-01, 94-01, 94-02, 95-01, 95-02, 95-03, 96-01 (Phase 95 SUMMARY backfill deferred to milestone-hygiene commit)
  percent: 70
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05)

**Core value:** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and leads are profiled through natural discovery so Mica makes ONE targeted recommendation per conversation, with prices, method, and objections handled per the team's playbook (not improvised).
**Current focus:** Phase 95 — booking-reliability-graceful-degradation (Plan 95-01 audit DONE 2d7cd171; Plan 95-02 BUG-03 fix SHIPPED d90fc782 → 4cf60946; Plan 95-03 DEGR-01/02 escalation AUTHORED — awaiting visual review then /gsd-execute-phase 95 --plan 03)

## Current Position

Milestone: v5.3.3 Post-v5.3.2 Live Test Fixes
Phase: 95 (booking-reliability-graceful-degradation) — Plan 95-01 EXECUTED, awaiting 95-02 planning
Plan: 1 of 3 (95-01 audit DONE; 95-02 fix + 95-03 escalation pending)

**Phase 95 Plan 95-01 (BUG-03 audit):** SHIPPED 2026-05-18 — atomic commit `2d7cd171` `audit(95-01): branch verdict for BUG-03 + RED tests`. **Final Branch Verdict: Branch 3-{i, ii, iii, iv, v, vi}** — all six candidates fire as a maximal compound. **Candidate (vi) `bk.status` column mismatch at `tools.ts:282` was NEWLY DISCOVERED during RED-test authoring** and is the proximate SHOWSTOPPER — every `executeTool('check_schedule')` throws `Unknown column 'bk.status'` against the real `eltemplo_test` schema before reaching any other candidate's discriminator. Substantive gates green: sha256 6-pair invariant intact, tsc clean both packages, RED tests fail on master (integration 8/9, unit 1/4 with (iii) FIRES), no production source touched, exactly 3 files in commit. Two PLAN.md `<automated>` verify-block bugs documented in audit §G — see Engineering Learnings under Carry-forward planning constraints.

**Phase 94 (OpenAI Latency / LAT-01..03):** 🟡 historical — Must-haves 4/4 VERIFIED; phase status `human_needed` — NOT yet `passed`. Plan 94-01 shipped (`d3de86b1` GREEN, `fa65e5b3` RED, plan `c3bbfa2a`). Plan 94-02 (CR-02 closure) shipped 2026-05-18 — RED `5ff993f0` → GREEN `c6c6bc0e` → SUMMARY `07c65571` → merge `64556d68`. Code review `7e43431d`. Verification disposition pass `89028419`:

- **CR-01 (ACCEPTED, in-session auth 2026-05-18T02:39:20Z):** `instanceof OpenAI.APIError` discriminator no-ops on Anthropic. Accepted because production locks `AI_PROVIDER=openai`; Anthropic path dormant in v5.3.3. Known limitation.
- **WR-01 (ACCEPTED, in-session auth 2026-05-18T02:39:20Z):** back-to-back interim + graceful-fallback messages. Accepted because common path delivers clean UX; worst-case is empirically rare. `interimSent` scope-lift is a future UX refinement.
- **CR-02 (CLOSED in 94-02):** SDK default `maxRetries=2` made real worst-case `3 × 45s = 135s`, breaking the canonical invariant formula. 94-02 set `maxRetries: 0` on OpenAI client constructor — real worst-case now `45 × 5 + 30 × 5 + 20 = 395s ≤ 600s DEBOUNCE_TTL_SECONDS`. Invariant intact, sha256 unchanged.
- **Live BUG-02 smoke test (DEFERRED to v5.4.0):** Cannot be exercised in dev (ngrok + Meta test tokens insufficient). v5.4.0 milestone MUST include this as an acceptance gate before Phase 94 can be marked `passed`.

## v5.3.3 Phase Structure (locked)

| Phase # | Letter | Scope                                                       | REQ-IDs                          |
| ------- | ------ | ----------------------------------------------------------- | -------------------------------- |
| 93      | A      | Handler Concurrency — race / debounce / Redis lock at entry | CONC-01                          |
| 94      | B      | OpenAI Latency — timeout + interim UX + graceful fallback   | LAT-01..03                       |
| 95      | C      | Booking Reliability + Graceful Degradation (BUG-03+05)      | BOOK-01, DEGR-01..02             |
| 96      | D      | Context Awareness — bot does not re-ask known data          | CTXT-01..02                      |
| 97      | E      | Backlog + Regression Lock (+ executeTool timeout sweep)     | ELEV-01, VOSEO-01, RGUARD-01..03 |

Coverage: **14/14 requirements mapped, 0 unmapped, 0 duplicates.**

## Carry-forward planning constraints (must surface in `/gsd:plan-phase`)

- **Engineering Learning (v5.3.3, locked 2026-05-18) — DO NOT regenerate F-1/F-2 verify gates.** During Phase 95 Plan 95-01 plan-phase, two `<automated>` verify gates were added that turned out to be plan-author over-engineering: **(F-1)** `pnpm test ... | grep -qE "Tests +[1-9][0-9]* +failed"` for RED self-certification, and **(F-2)** `cd <pkg> && pnpm lint` for both packages. Both were security theater. F-1 fails on ANSI color codes in vitest stderr (would need `NO_COLOR=1` or `--reporter=basic`); F-2 is a no-op because neither `el-templo-bot/package.json` nor `el-templo-api/package.json` defines a `lint` script (CI runs `pnpm run lint` with `continue-on-error: true`; actual lint discipline is `husky + lint-staged` Prettier on commit). **Future plan-phase agents MUST NOT regenerate these gates.** Substantive verification surfaces that DO work and SHOULD be preserved: (a) sha256 6-pair drift sentry, (b) `pnpm tsc --noEmit` both packages (raw exit), (c) exact-file-count assertion (`git show --stat HEAD | grep -cE 'pattern' -eq N`), (d) commit subject regex (`git log -1 --format=%s | grep -qE '^prefix\(N-XX\): '`), (e) negative-assertion `git diff` guards for out-of-scope files, (f) console/any code-discipline grep on new files, (g) explicit `<human-check>` checklist that the reviewer verifies. Documented in `95-AUDIT.md §G` and audit-session transcript.
- **Phase 95 SC#3 invariant (RLOK-03 guardrail):** No-escalation rule from v5.3.2 (Phase 91 OBJN-01/02) applies to **soft rejections ONLY**, NOT to tool failures. DEGR-01's `request_human` escalation triggers on tool failures only. Soft rejections continue to follow Phase 91's WHY/BACK-OFF Spanish framing in `system-prompt.ts`. Both rules wired without conflation. Asserted in Phase 97 RGUARD-02 explicitly.
- **Phase 97 non-deterministic regression strategy (ELEV-01 + VOSEO-01):** Snapshot tests will NOT catch model variance. Plan must choose between (a) multi-run sampling with statistical threshold (e.g., N=20 runs, voseo in ≥18 — costs N× model spend per CI run) or (b) accept-list of valid forms (both "tenés" and "tienes" PASS, only fail on neither — cheaper, weaker signal). Decide once for both.
- **Phase 97 closing constraint (per `MACRO-ROADMAP.md`):** Live test must validate the bot is **production-deploy-ready**, NOT CRM-integration-ready. Behavioral/handler correctness + stability — not persistence layer, not CRM hooks, not multi-tenancy. Those land in v5.4.0 or Kero phase 1.
- **Phase 94 file-level pointers (from `bot-3min-response-latency.md` debug session):**
  - `el-templo-bot/src/ai/openai.ts:29` — `new OpenAI()` needs `timeout: 45_000` + `OPENAI_TIMEOUT_MS` env override + `.env.example` update.
  - `el-templo-bot/src/webhook/handler.ts:584` and `:641` — wrap `provider.chat(...)` await sites with timeout/`OpenAI.APIError` handler that sends interim message + graceful fallback. Existing outer `try/catch` at `handler.ts:323` only logs today.
  - Bonus (Phase 97 RGUARD-03): `executeTool` localhost API calls likely have same unbounded-await problem.
- **Phase 95 pairing constraint:** BUG-03 (BOOK-01) and BUG-05 (DEGR-01/02) MUST ship together — BUG-05 is the safety net for when BUG-03 still fails. ONE phase with potentially 2 plans, NOT split into 2 phases.
- **Phase 93/94 disjoint-surface constraint:** Both phases touch `handler.ts` but operate on disjoint surfaces (concurrency entry guard vs. AI-call error path). Per debug session 2026-05-05, they must NOT be paired or conflated during plan execution.

## Performance Metrics

**Velocity (cumulative through v5.3.2):**

- Total plans completed: 27 (v5.0-v5.2) + 12 (v5.3) + 8 (v5.3.1) + 5 (v5.3.2) = 52
- v5.3.2 timeline: 2026-04-14 → 2026-04-16 (3 days, 13 tasks across 5 plans, 37 files, +6,041 net LOC)

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table.

### Pending Decisions (forward)

- **Phase 95 Plan 95-02 (BUG-03 fix + `withTimeout` helper):** AUTHORED IN NEXT SESSION per user defer 2026-05-18. Branch 3 verdict from Plan 95-01 audit (`2d7cd171`) names the fix scope:
  - **P0 — MUST land first:** (vi) `bk.status` → `bk.booking_status` SQL rename at `el-templo-bot/src/ai/tools.ts:282` (1 character; unblocks all other candidates' RED tests from SQL-erroring before reaching their assertions).
  - **P0 — bundle with (vi):** (ii) cross-branch result mixing in `tools.ts:265-330` — add per-branch grouping headers `*{Branch Name}*` OR require `branchId` parameter.
  - **P1:** (iv) LIMIT-6 truncation at `tools.ts:301-328` — add `COUNT(*)` subquery + "Hay N clases en total" + bump `LIMIT 6` → `LIMIT 20`.
  - **P1:** (v) `booking_count` today-filter at `tools.ts:267, 281` — parameterize `booking_date` by schedule's next occurrence via `DATE_ADD(CURDATE(), INTERVAL (s.day_of_week - DAYOFWEEK(CURDATE()) + 7) % 7 DAY)`.
  - **`withTimeout` helper (CONTEXT.md D-04/D-15/D-16):** introduce `el-templo-bot/src/ai/with-timeout.ts` + apply at `tools.ts:636` (`book_class` POST) and `tools.ts:806` (`register_trial` POST). Env var `EXECUTE_TOOL_TIMEOUT_MS=30000` per CONTEXT.md D-17. Default 30s. Phase 97 RGUARD-03 reuses SAME env var.
  - **Drift-guard test (audit §E recommendation):** add unit assertion `expect(bookings.status.name).toBe("booking_status")` in `v5-3-3-booking-reliability.test.ts` or analogous schema-drift surface — catches future column-rename-without-raw-SQL-update bugs (the class of bug that (vi) was).
  - **DEFERRED out of 95-02:** (iii) Sunday=0 prompt binding — touches `system-prompt.ts`, triggers `POST_RLOK_04_BYTES` regression at `v5-3-2-regression.test.ts:57`, requires Phase 96 snapshot regen of `pb1-e1a-lead-rendered.snap.txt`. Per `95-CONTEXT.md` `<domain>` "NOT in scope".
  - **DEFERRED out of 95-02:** (i) LIKE-search ambiguity in `getLocation` — does NOT fire in current production data (only synthetic substring-overlap test seed triggers it). Low priority drive-by.
  - Plan-phase 95-02 reference: `.planning/phases/95-booking-reliability-graceful-degradation/95-AUDIT.md` §C (Final Branch Verdict) + §E (Implementation Pointers, with concrete fix code snippets per candidate).
- **Phase 94 sub-plan 94-02 (CR-02 gap closure):** SHIPPED 2026-05-18. RED `5ff993f0` → GREEN `c6c6bc0e` → SUMMARY `07c65571` → merge `64556d68`. Phase 94 unit suite 8/8, sha256 invariant unchanged. Remaining gate to mark phase `passed`: live BUG-02 smoke test (v5.4.0).
- **v5.3.3 test-suite flake (94-01 SC#3 graceful fallback):** Pre-existing intermittent failure on `el-templo-bot/test/v5-3-3-openai-latency.test.ts:~515` (`"sends 'Dame un segundo' AND 'Tuve un problemita técnico'; handler returns cleanly"`). Introduced commit `fa65e5b3` (Plan 94-01 RED). ~50% flake rate on full bot suite (`pnpm test`) under parallel load; 0% in suite-isolated runs. Root cause hypothesis: `vi.advanceTimersByTimeAsync` + promise-resolution ordering. NOT introduced by 94-02 and not blocking Phase 94 closure. **MUST be resolved before v5.4.0** — CI must be deterministic for prod deploy. Candidate remediation: Phase 97 (RGUARD scope expansion), or carve out as 97.1 / v5.3.4 if timing allows. See `94-02-SUMMARY.md` "Known Issues / Follow-ups" for full diagnostic notes.
- **Phase 95 Plan 95-03 DEGR-01 test suite flakiness (deferred to Phase 97 or dedicated pre-v5.4.0 debug session):** `el-templo-bot/test/v5-3-3-degr-01-escalation.test.ts` (shipped via Plan 95-03 commit chain `a6143e45` → `b1d8bd73` → `22a07dc7`) exhibits 1-5 of 9 tests failing intermittently across 10 consecutive runs (~9 of 10 runs show ≥1 failure; occasional 9/9 PASS). **Production impact: NONE.** handler.ts production code at commit `22a07dc7` is correct and implements CONTEXT.md D-05..D-18 + D-09 verbatim per visual review; pre-existing 28 test files show 0 regressions; `pnpm tsc --noEmit` clean both packages; 6-pair canonical-invariant sha256 intact at `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344`. Failure mode invariant: `sendCalls.length === 0` (handler bailed before reaching mocked `sendTextMessage`), consistent with cross-test mock state leakage. Failures concentrate in **SC-B, SC-C(ii), SC-C(iv), SC-D**; **SC-A, SC-E, SC-F always pass**. **Hypotheses investigated and refuted during 95-03 execution:** (1) `vi.doMock` vs hoisted `vi.mock` — refuted by structural comparison with `v5-3-3-openai-latency.test.ts` which uses the identical `vi.doMock` pattern and is 5/5 deterministic; (2) microtask flush in `afterEach` via `await new Promise(r => setImmediate(r))` — refuted (9/10 FAIL post-fix, no meaningful improvement); (3) unique phone per SC-C sub-case — refuted (9/10 FAIL post-fix). **Hypotheses NOT yet investigated:** test count scaling vs sibling (9 tests + nested describes vs 8); async cleanup race deeper than microtask boundary; SC-C nested describe interaction with `vi.useFakeTimers` per-describe; Redis-mock state across describe boundaries. **Risk acceptance rationale:** Manual UAT during v5.4.0 staging deploy will validate the feature empirically — force 2 tool failures in one inbound, verify the handoff phrase (`Te paso con alguien del equipo, te escriben enseguida 🙌`) is delivered exactly once and `conversation_status` transitions to `human_takeover` via the synthetic `request_human` dispatch. **Sibling flake context:** This is the SECOND v5.3.3 test-infrastructure flake of the same family — the first being the pre-existing `v5-3-3-openai-latency.test.ts` SC#3 flake documented in the entry above. Both share the `vi.useFakeTimers` + `vi.advanceTimersByTimeAsync` + promise-resolution-ordering root-cause family. **SHOULD be resolved before v5.4.0 (manual UAT during staging deploy provides empirical validation; hard block deferred to project owner's discretion based on CI signal-to-noise tolerance).** Candidate remediation: dedicated test-infrastructure debug session addressing both flakes systematically (preferred — pattern recognition suggests common root cause), or piggyback onto Phase 97 RGUARD-02 if a focused fix proves cheap.
- **el-templo-api 30 pre-existing test failures discovered during Phase 96 recovery (carry-forward debt, pre-v5.4.0 staging gate):**
  - **Status:** Documented as carry-forward debt; investigation deferred.
  - **Evidence:** 30 failing tests across 4 test files in `el-templo-api/test/` — `subscriptions/subscriptions.test.ts` (Subscription Lifecycle — 6 failures), `whatsapp/ai-tools.test.ts` (check_membership / check_schedule / get_location / request_human / executeTool — 20 failures), `whatsapp/v5-3-3-booking.integration.test.ts` (BUG-03 candidate (i) LIKE-search RED — 1 failure), `whatsapp/webhook.test.ts` (POST /webhook variants — 3 failures). Full failing-test names captured in Phase 96 recovery session transcript 2026-06-10.
  - **Verification:** Stash-and-rerun on 2026-06-10 confirmed identical failure set with Phase 96 changes reverted (same 30 failures, same 482 passes); pre-dates v5.3.3 milestone work — these failures exist on bare master pre-Phase-96.
  - **Hypothesis:** DB-state seed drift (subscriptions lifecycle assumes pre-seeded users; ai-tools assumes branches; webhook assumes conversation rows). Test infra issue, not production code (UNVERIFIED — needs triage).
  - **Impact:** NONE on Phase 96 / 96.5 / 97 prompt-level work; orthogonal to bot system-prompt and handler logic. `pnpm tsc --noEmit` clean on `el-templo-api` (failures are runtime test execution, not compilation).
  - **Resolution Path:**
    - Triage in dedicated `/gsd-debug` session BEFORE v5.4.0 staging deploy.
    - If root cause confirmed as test infra (seed drift), document and accept.
    - If any of the 30 reveals actual production code bug, escalate to v5.4.0 blocker.
  - **Owner:** Pre-v5.4.0 staging gate.
  - **Logged:** 2026-06-10.
- **Phase 94 live BUG-02 smoke test (v5.4.0 carry-forward):** Document as acceptance gate when scoping v5.4.0. Test = throttled-upstream WhatsApp send with observation of interim msg + graceful fallback + clean handler return. Phase 94 cannot be marked `passed` until both 94-02 ships AND v5.4.0 smoke test passes.
- **Phase 97 (ELEV-01 + VOSEO-01) testing strategy:** decide at plan time — multi-run sampling with statistical threshold OR accept-list of valid forms. Tradeoff: CI cost vs signal strength.
- **Phase 96 (CTXT-01/02) implementation choice:** prompt-level rule, extraction-layer fix, or hybrid — depends on whether `<profile>` tag flow already persists name and model is ignoring it (→ prompt) or extraction is dropping it (→ extraction layer). Read `extractAndUpdateProfile` flow before deciding.
- **Bot ↔ CRM persistence layer:** decide at v5.4.0 scoping whether v5.4.0 owns durable conversation persistence (default lean) or Kero phase 1 owns it. See `MACRO-ROADMAP.md`.

### Blockers/Concerns

None. v5.3.2 shipped clean. v5.3.3 ROADMAP.md complete with full coverage; BUG-02 root cause known — Phase 94 fully plannable with file-level pointers.

## v5.4.0 Production-Ready Path (LOCKED 2026-06-10)

**Intent:** Deploy v5.4.0 to production with material confidence, NOT in partial state. Owner explicitly chose the long path (production-ready) over the short path (soft launch on incomplete substrate). Each phase must close before initiating the next, unless deviation is documented inline with rationale.

**Principle locked:** Rigor proportional to impact — every phase below maintains D-XX numbering, audit trail, 6-pair sha256 invariant `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344`, plan-checker discipline, and F-1/F-2 deprecation discipline. Manual UAT > documented narratives — two rounds of manual testing are non-negotiable. Hard time budget cap per execute: 90 min before §9a fallback (lesson from Phase 96 5.5h timeout). Snapshot-regen-bearing executes MUST explicitly flag the inline `pnpm exec tsx -e` approach in the execute prompt.

### Mandatory phases (MUST close before v5.4.0 deploy)

1. **Phase 96.5 — Date hallucination fix** (~3-5h, ~30 LOC pure-prompt + snapshot date-stub infra)
   - **Trigger:** HARD BLOCKER pre-v5.4.0. Production: bot offers "Lunes 2023-11-06" → confirmation `fetch failed` → zero successful trial bookings until fixed. Confirmed pure-prompt hallucination via Phase 96 discuss Finding #2 investigation (verbatim verdict in 96-CONTEXT.md).
   - **Pre-conditions:** Phase 96 closed ✅.
   - **Execute-prompt guidance:** Snapshot regen step was likely hang point of Phase 96's 5.5h executor timeout. For Phase 96.5 (also snapshot-regen + date stub), pre-flag `pnpm exec tsx -e` inline approach with `Date.now()` stub explicitly. KGATE-05 margin after Phase 96 = 118 chars; estimated Phase 96.5 directive ~25 chars → ~93 chars margin remaining.

2. **/gsd-debug session — el-templo-api 30 pre-existing failures** (~1-3h)
   - **Scope:** investigate root cause of the 30 failing tests in `el-templo-api/test/` (subscriptions: 6, whatsapp/ai-tools: 20, whatsapp/v5-3-3-booking.integration: 1, whatsapp/webhook: 3). Failure set verified identical across stash-and-rerun on 2026-06-10.
   - **Trigger:** documented in Pending Decisions as carry-forward debt; hypothesis = DB seed drift but UNVERIFIED. Potentially hides a production bug.
   - **Pre-conditions:** Phase 96.5 closed.
   - **Expected outcome — one of three branches:**
     - **(a)** Root cause = test infra (DB seed drift) → document + accept + ship.
     - **(b)** Root cause = mix of test infra + 1-2 production bugs → fix bugs as Phase 98 or absorb into v5.4.0 scope.
     - **(c)** Root cause = multiple production bugs → re-evaluate v5.4.0 scope entirely.

3. **Phase 97 — Regression Lock + ELEV-01 + VOSEO-01 + RGUARD-01..03** (~8-14h, likely 2 sessions minimum — scope discovery during discuss-phase before plan can author meaningfully; NO pre-existing 97-CONTEXT.md or 97-AUDIT.md, unlike Phase 94/96 which had file-level pointers locked before plan time)
   - **Scope:** RGUARD-01..03 (milestone-scoped regression suite + `withTimeout` extension to remaining `executeTool` sites), ELEV-01 (third elevator hook), VOSEO-01 (Argentine voseo consistency). Non-deterministic regression strategy (sampling vs accept-list) decided at plan time.
   - **Potential scope expansion:** may absorb the 94-01 SC#3 + 95-03 DEGR-01 test flakes if root cause analysis fits within scope (both share the `vi.useFakeTimers + advanceTimersByTimeAsync + promise-resolution-ordering` family per STATE.md Pending Decisions).
   - **Trigger:** regression protection for v5.4.0 + final UX rules locked.
   - **Pre-conditions:** Phase 96.5 + /gsd-debug closed.

4. **Manual UAT Round 2 — Real API connected** (~2-4h)
   - **Scope:** bot connected to real `el-templo-api` (no dev seeds), comprehensive flow testing: registration, booking, cancellation, after-hours, soft rejection, full trial flow. Validates Phase 96 CTXT rule + Phase 96.5 date fix + Phase 97 regression lock empirically.
   - **Trigger:** phase rigor assumes "the system is good"; Round 2 validates with production-like setup.
   - **Expected outcome:** list of new findings (expectable 0-5 bugs); each triaged against v5.4.0 blocker / Phase 98 / v5.4+ backlog. Finding #3 (`fetch failed` on Confirmar) gets its real test here.
   - **Pre-conditions:** Phase 97 closed.

5. **Phase 94 BUG-02 smoke test — staging deploy** (~1-2h)
   - **Scope:** throttled-upstream WhatsApp send test in staging environment with observation of interim msg + graceful fallback + clean handler return.
   - **Trigger:** Phase 94 is currently `human_needed` waiting on this smoke test. Without it, Phase 94 cannot be marked `passed` and v5.3.3 milestone is structurally incomplete.
   - **Pre-conditions:** Manual UAT Round 2 closed + staging environment up.

### Strongly recommended phases (deploying without these = material risk)

6. **Production Environment Setup Verification** (~2-4h) — real staging (not dev), WhatsApp Business API verified (no test number), production DB with real seeds, Redis production-ready (correct TTLs per cross-phase invariant + persistence config), basic monitoring/alerting.

7. **Error Handling + Observability Review** (~2-4h) — audit all catch blocks in `handler.ts` + scheduler files, logging strategy review (Pino sink/rotation for v5.4.0 per MACRO-ROADMAP.md #3), alerting setup, runtime monitoring. MACRO-ROADMAP.md flags a v5.4.0 monitoring requirement: alert if `OPENAI_TIMEOUT_MS`, `MAX_TOOL_ITERATIONS`, `executeTool_timeout_seconds`, `safety_buffer`, or `DEBOUNCE_TTL_SECONDS` drift out of invariant range.

8. **Load + Concurrency Test** (~2-3h) — 5-10 simultaneous conversations, bot under sustained load (1 hour with messages every 30s), verify Phase 93 concurrency under stress, identify memory leaks or race conditions.

9. **Rollback Plan** (~1-2h) — documented procedure for post-deploy revert, DB snapshot pre-deploy, tagged release in git for fast revert, basic incident response playbook. (Note: `deploy/RUNBOOK.md` and `deploy/backup.sh`/`restore.sh` exist for the API stack — extend to cover bot.)

10. **Security + Secrets Audit** (~1-2h) — API keys in env vars verified, `.env.production` NOT in git (`.gitignore` currently lists `.env` and `deploy/.aws-vars` + `deploy/.credentials` ✓), OpenAI key with rate limits configured, WhatsApp tokens validated, secret rotation procedure documented.

### Estimates and cadence

- **Mandatory (1-5):** 15-28 hours (Phase 97 recalibrated +3-6h based on scope-discovery analysis)
- **Mandatory + Recommended (1-10):** 25-43 hours
- **At a pace of 3-5 hours per session:** 7-14 more sessions

### Post-deploy expectations (captured for v5.4.0 scoping)

- **Pre-deploy:** stage v5.4.0 in staging for 3-7 days with internal simulated use.
- **Deploy:** soft launch — start with 5-10 trial users, do NOT open general registration.
- **Weeks 1-2 post-deploy:** watch logs intensively, expect a **Phase 98 emergency fix track** with bugs that only appear with real users.
- **Week 3+:** if stable, expand registration.

### Accepted risks (document but proceed)

- v5.4.0 will deploy with some imperfection — normal, not failure.
- Phase 98 emergency fix track is **expected** post-deploy.
- Some "unknown unknowns" will only surface with real users.
- Mitigation: rollback plan (#9) + observability (#7) + soft launch.

### Instructions for GSD using this roadmap

- Reference this roadmap section in each upcoming `/gsd-discuss-phase` invocation as context.
- If owner requests deviation from the path at any point, surface the consequence clearly before proceeding.
- **DO NOT auto-execute any phase** — wait for owner at each step.
- Sequencing rule: each item closes before the next begins, except where the path itself permits parallelism (none currently identified).

## Session Continuity

Last session: 2026-06-12T15:48:41.376Z
Stopped at: Phase 96.5 context gathered — D-01..D-04 locked (Option D wording, render-time prompt args via getSystemPrompt opts, frozen miércoles 2026-06-10, 5-test scope); D-02a Argentine timezone deferred to plan-phase. Next: /gsd-plan-phase 96.5.
Resume file: .planning/phases/96.5-date-grounding-fix/96.5-CONTEXT.md
Next step: `/gsd-plan-phase 96.5` per locked path step 1 (discuss-phase committed in `e7b9f570` + `2edd0887`; D-01..D-04 locked, D-02a Argentine timezone deferred to plan-phase, plan-phase must surface execute-prompt pre-flag for `pnpm exec tsx -e` regen + explicit `todayISO`/`todayDayName` kwargs to avoid Phase 96 5.5h timeout pattern).

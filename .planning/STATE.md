---
gsd_state_version: 1.0
milestone: v5.3.3
milestone_name: Post-v5.3.2 Live Test Fixes
status: executing
stopped_at: Phase 95 Plan 95-02 AUTHORED + plan-checker PASSED (revision round 2 — :706 second site added via plan-checker discovery + user-authorized scope expansion 2026-05-18). Awaiting user visual review then /gsd-execute-phase 95 --plan 02.
last_updated: "2026-05-19T03:55:15.145Z"
last_activity: 2026-05-19 -- Phase 95 Plan 95-02 authored (TDD-make-green, 4 atomic commits, :282+:706 two-site (vi) coverage). Plan-checker round 2 PASSED with zero blockers / zero new warnings.
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 5
  completed_plans: 3
  percent: 40
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05)

**Core value:** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and leads are profiled through natural discovery so Mica makes ONE targeted recommendation per conversation, with prices, method, and objections handled per the team's playbook (not improvised).
**Current focus:** Phase 95 — booking-reliability-graceful-degradation (Plan 95-01 audit DONE 2d7cd171; Plan 95-02 fix pending next session)

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
- **Phase 94 live BUG-02 smoke test (v5.4.0 carry-forward):** Document as acceptance gate when scoping v5.4.0. Test = throttled-upstream WhatsApp send with observation of interim msg + graceful fallback + clean handler return. Phase 94 cannot be marked `passed` until both 94-02 ships AND v5.4.0 smoke test passes.
- **Phase 97 (ELEV-01 + VOSEO-01) testing strategy:** decide at plan time — multi-run sampling with statistical threshold OR accept-list of valid forms. Tradeoff: CI cost vs signal strength.
- **Phase 96 (CTXT-01/02) implementation choice:** prompt-level rule, extraction-layer fix, or hybrid — depends on whether `<profile>` tag flow already persists name and model is ignoring it (→ prompt) or extraction is dropping it (→ extraction layer). Read `extractAndUpdateProfile` flow before deciding.
- **Bot ↔ CRM persistence layer:** decide at v5.4.0 scoping whether v5.4.0 owns durable conversation persistence (default lean) or Kero phase 1 owns it. See `MACRO-ROADMAP.md`.

### Blockers/Concerns

None. v5.3.2 shipped clean. v5.3.3 ROADMAP.md complete with full coverage; BUG-02 root cause known — Phase 94 fully plannable with file-level pointers.

## Session Continuity

Last session: 2026-05-19T03:55:15Z
Stopped at: Phase 95 Plan 95-02 AUTHORED + plan-checker PASSED. Plan covers BUG-03 fix scope per audit verdict (candidates ii/iv/v/vi as P0/P1) + `withTimeout` helper + Drizzle drift-guard test. Revision round 2 added `tools.ts:706` second `bk.status` site (plan-checker discovery in `queryAlternativeSchedules`, user-authorized scope expansion 2026-05-18). Awaiting user visual review.
Resume file: `.planning/phases/95-booking-reliability-graceful-degradation/95-02-PLAN.md` (4 atomic-commit chain: rename `bk.status` → fix `checkSchedule` → `withTimeout` helper → drift-guard test)
Next step: User reviews `95-02-PLAN.md`. After approval, `/gsd-execute-phase 95 --plan 02` to run the 4-commit chain (do NOT auto-advance). After 95-02 GREEN-ships, follow up with: (a) `docs(95-02-amendment): note :706 second-site coverage` updating `95-AUDIT.md` §C/§E (deferred-post-execution per user directive to keep audit verdict record clean), (b) `/gsd-plan-phase 95` to author Plan 95-03 (BUG-05 retry counter + `request_human` escalation for DEGR-01/02 coverage — gated on 95-02 ship).

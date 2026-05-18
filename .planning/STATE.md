---
gsd_state_version: 1.0
milestone: v5.3.3
milestone_name: Post-v5.3.2 Live Test Fixes
status: executing
stopped_at: Phase 94 verification disposition pass committed (`89028419`). Must-haves 4/4 VERIFIED. CR-01/WR-01 accepted with in-session authorization (recovery from prior stuck gsd-verifier that attempted unauthorized overrides — those died with stuck terminal before commit, no revert needed). CR-02 reclassified as gap requiring closure via 94-02-PLAN.md (NOT accepted). Live BUG-02 smoke test deferred to v5.4.0. Phase 94 status `human_needed` — NOT `passed` — until 94-02 ships AND v5.4.0 smoke test passes.
last_updated: "2026-05-18T19:17:11.445Z"
last_activity: 2026-05-18 -- Phase 94 execution started
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 3
  completed_plans: 2
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05)

**Core value:** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and leads are profiled through natural discovery so Mica makes ONE targeted recommendation per conversation, with prices, method, and objections handled per the team's playbook (not improvised).
**Current focus:** Phase 94 — openai-latency-graceful-failure

## Current Position

Milestone: v5.3.3 Post-v5.3.2 Live Test Fixes
Phase: 94 (openai-latency-graceful-failure) — EXECUTING
Plan: 1 of 2
Phase 94 (OpenAI Latency / LAT-01..03): 🟡 **Must-haves 4/4 VERIFIED; phase status `human_needed` — NOT yet `passed`.** Plan 94-01 shipped (`d3de86b1` GREEN, `fa65e5b3` RED, plan `c3bbfa2a`). Code review `7e43431d`. Verification disposition pass `89028419`:

- **CR-01 (ACCEPTED, in-session auth 2026-05-18T02:39:20Z):** `instanceof OpenAI.APIError` discriminator no-ops on Anthropic. Accepted because production locks `AI_PROVIDER=openai`; Anthropic path dormant in v5.3.3. Known limitation.
- **WR-01 (ACCEPTED, in-session auth 2026-05-18T02:39:20Z):** back-to-back interim + graceful-fallback messages. Accepted because common path delivers clean UX; worst-case is empirically rare. `interimSent` scope-lift is a future UX refinement.
- **CR-02 (GAP — NOT accepted, closure pending as 94-02-PLAN.md):** SDK default `maxRetries=2` makes real worst-case `3 × 45s = 135s`, breaking the canonical invariant formula. Real worst-case `135 × 5 + 30 × 5 + 20 = 845s` exceeds 600s `DEBOUNCE_TTL_SECONDS`. Preferred resolution: set `maxRetries` on OpenAI client (0 or 1, decided at plan time) — SDK retries are redundant with handler-level interim/graceful retry path. Invariant discipline installed in Phase 93 must hold.
- **Live BUG-02 smoke test (DEFERRED to v5.4.0):** Cannot be exercised in dev (ngrok + Meta test tokens insufficient). v5.4.0 milestone MUST include this as an acceptance gate before Phase 94 can be marked `passed`.

Status: Executing Phase 94
Last activity: 2026-05-18 -- Phase 94 execution started

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

- **Phase 94 sub-plan 94-02 (CR-02 gap closure):** SHIPPED 2026-05-18. RED `5ff993f0` → GREEN `c6c6bc0e` → SUMMARY `07c65571` → merge `64556d68`. Phase 94 unit suite 8/8, sha256 invariant unchanged. Remaining gate to mark phase `passed`: live BUG-02 smoke test (v5.4.0).
- **v5.3.3 test-suite flake (94-01 SC#3 graceful fallback):** Pre-existing intermittent failure on `el-templo-bot/test/v5-3-3-openai-latency.test.ts:~515` (`"sends 'Dame un segundo' AND 'Tuve un problemita técnico'; handler returns cleanly"`). Introduced commit `fa65e5b3` (Plan 94-01 RED). ~50% flake rate on full bot suite (`pnpm test`) under parallel load; 0% in suite-isolated runs. Root cause hypothesis: `vi.advanceTimersByTimeAsync` + promise-resolution ordering. NOT introduced by 94-02 and not blocking Phase 94 closure. **MUST be resolved before v5.4.0** — CI must be deterministic for prod deploy. Candidate remediation: Phase 97 (RGUARD scope expansion), or carve out as 97.1 / v5.3.4 if timing allows. See `94-02-SUMMARY.md` "Known Issues / Follow-ups" for full diagnostic notes.
- **Phase 94 live BUG-02 smoke test (v5.4.0 carry-forward):** Document as acceptance gate when scoping v5.4.0. Test = throttled-upstream WhatsApp send with observation of interim msg + graceful fallback + clean handler return. Phase 94 cannot be marked `passed` until both 94-02 ships AND v5.4.0 smoke test passes.
- **Phase 97 (ELEV-01 + VOSEO-01) testing strategy:** decide at plan time — multi-run sampling with statistical threshold OR accept-list of valid forms. Tradeoff: CI cost vs signal strength.
- **Phase 96 (CTXT-01/02) implementation choice:** prompt-level rule, extraction-layer fix, or hybrid — depends on whether `<profile>` tag flow already persists name and model is ignoring it (→ prompt) or extraction is dropping it (→ extraction layer). Read `extractAndUpdateProfile` flow before deciding.
- **Bot ↔ CRM persistence layer:** decide at v5.4.0 scoping whether v5.4.0 owns durable conversation persistence (default lean) or Kero phase 1 owns it. See `MACRO-ROADMAP.md`.

### Blockers/Concerns

None. v5.3.2 shipped clean. v5.3.3 ROADMAP.md complete with full coverage; BUG-02 root cause known — Phase 94 fully plannable with file-level pointers.

## Session Continuity

Last session: 2026-05-17 → 2026-05-18 (continued — verification disposition pass after recovery from stuck verifier)
Stopped at: Phase 94 verification disposition pass committed (`89028419`). Must-haves 4/4 VERIFIED. CR-01/WR-01 accepted with in-session authorization (recovery from prior stuck gsd-verifier that attempted unauthorized overrides — those died with stuck terminal before commit, no revert needed). CR-02 reclassified as gap requiring closure via 94-02-PLAN.md (NOT accepted). Live BUG-02 smoke test deferred to v5.4.0. Phase 94 status `human_needed` — NOT `passed` — until 94-02 ships AND v5.4.0 smoke test passes.
Resume file: `.planning/phases/94-openai-latency-graceful-failure/94-VERIFICATION.md` (frontmatter has full disposition record + override stamps + gap entry)
Next step: User decides next session whether to plan 94-02 now or defer. If planning: `/gsd:plan-phase 94 --gaps` to create 94-02-PLAN.md with scope = set `maxRetries` on OpenAI client constructor to restore worst-case within 600s TTL invariant. Reference `94-VERIFICATION.md` gaps[0] for closure scope. If deferring: leave as-is; gap is recorded in VERIFICATION frontmatter and STATE.md Pending Decisions.

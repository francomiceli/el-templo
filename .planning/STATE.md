---
gsd_state_version: 1.0
milestone: v5.3.3
milestone_name: Post-v5.3.2 Live Test Fixes
status: roadmap_created
stopped_at: "v5.3.3 ROADMAP.md written 2026-05-05 — Phases 93-97 detailed with goals, depends-on, success criteria, requirements, and carry-forward planning constraints. Awaiting `/gsd:plan-phase 93` to begin execution."
last_updated: "2026-05-05T00:00:00Z"
last_activity: "2026-05-05 — ROADMAP.md created. 5 phases (93-97) encoding the pre-resolved A→E structure. 14/14 v5.3.3 requirements mapped (CONC-01, LAT-01..03, BOOK-01, DEGR-01..02, CTXT-01..02, ELEV-01, VOSEO-01, RGUARD-01..03). Carry-forward constraints surfaced for plan-phase pickup: Phase 95 SC#3 invariant, Phase 97 non-deterministic regression strategy, Phase 97 production-deploy-ready closing constraint, Phase 94 file-level pointers for openai.ts:29 + handler.ts:584/641."
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05)

**Core value:** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and leads are profiled through natural discovery so Mica makes ONE targeted recommendation per conversation, with prices, method, and objections handled per the team's playbook (not improvised).
**Current focus:** v5.3.3 Post-v5.3.2 Live Test Fixes — ROADMAP.md created, ready to plan Phase 93 (Handler Concurrency).

## Current Position

Milestone: v5.3.3 Post-v5.3.2 Live Test Fixes
Phase: Not started (ROADMAP.md created — Phases 93-97 defined)
Plan: —
Status: Roadmap created. Awaiting `/gsd:plan-phase 93` to begin execution.
Last activity: 2026-05-05 — ROADMAP.md written; 14/14 v5.3.3 requirements mapped to Phases 93-97.

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

- **Phase 97 (ELEV-01 + VOSEO-01) testing strategy:** decide at plan time — multi-run sampling with statistical threshold OR accept-list of valid forms. Tradeoff: CI cost vs signal strength.
- **Phase 96 (CTXT-01/02) implementation choice:** prompt-level rule, extraction-layer fix, or hybrid — depends on whether `<profile>` tag flow already persists name and model is ignoring it (→ prompt) or extraction is dropping it (→ extraction layer). Read `extractAndUpdateProfile` flow before deciding.
- **Bot ↔ CRM persistence layer:** decide at v5.4.0 scoping whether v5.4.0 owns durable conversation persistence (default lean) or Kero phase 1 owns it. See `MACRO-ROADMAP.md`.

### Blockers/Concerns

None. v5.3.2 shipped clean. v5.3.3 ROADMAP.md complete with full coverage; BUG-02 root cause known — Phase 94 fully plannable with file-level pointers.

## Session Continuity

Last session: 2026-05-05
Stopped at: v5.3.3 ROADMAP.md written — 5 phases (93-97), 14/14 requirements mapped, carry-forward constraints captured.
Resume file: `.planning/ROADMAP.md`
Next step: `/gsd:plan-phase 93` to begin execution of Phase 93 (Handler Concurrency / CONC-01).

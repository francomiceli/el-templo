---
gsd_state_version: 1.0
milestone: v5.3
milestone_name: Conversational Sales & Playbook Engine
status: milestone_complete
stopped_at: "Completed 85-02-PLAN.md (AVAT-03/AVAT-04 — v5.3 regression net: annotated QA lock + per-playbook flow coverage suite; bot suite 413/413 green). Phase 85 complete (2/2). v5.3 milestone COMPLETE."
last_updated: "2026-04-08T02:37:00Z"
last_activity: 2026-04-08 -- Plan 85-02 complete (AVAT-03/AVAT-04 closed; v5.3 milestone DONE). AVAT-03 locked via annotation on conversation-flows.test.ts 'QA questions answered correctly' describe block + 1 integrative it() rendering getSystemPrompt with PB1.E1A active + currentAvatar gym_crossover and asserting 11 canonical Q1..Q14 tokens still present — catches the failure mode where a future edit to system-prompt.ts accidentally suppresses base knowledge when a playbook section is injected; Q1..Q14 source unchanged. AVAT-04 locked via NEW playbook-flow-coverage.test.ts (~300 lines, 19 tests, 6 describe blocks): 5 per-PB blocks each with happy+objection paths walking advanceStageIfComplete AND asserting stageContent promptSection tokens (PB1 default E1A->E2A->E3->E4 + intermedio E1A->E2B + defer guard; PB2 E1A->E2->E3 + phase 84-03 priceObjection-alone-holds regression + 4-branch objection content; PB3 E1A->E2->E3 with PRE-vencimiento framing + userAccepted-only guard + upgrade anchor; PB4 E1A->E2 + terminal guard + TEAM-CORR-04 plan-conditional pause + request_human; PB5 E1->E2->E3 + sin-resistencia rule + userAccepted-only guard + TEAM-CORR-04 dual-guard + E3 escalation + buen termino) plus a cross-cutting block asserting intermedio tone keywords render alongside the 'Perfil detectado' header for every PB entry stage (seam between plan 85-01 tone guide and AVAT-04 coverage). AVATAR_KEYWORDS extracted to test/fixtures/avatar-keywords.ts (DRY — both avatar-tone-guide.test.ts and the new suite import from there). Purity invariant preserved: zero production-code imports of drizzle/prisma/mysql/redis/ioredis/webhook/vi.mock; runs in <200ms. Full bot suite 413/413 green (up from 393; +20 tests from this plan). Zero source code changes — pure test plan, git diff limited to el-templo-bot/test/**. Phase 85 complete 2/2. v5.3 milestone COMPLETE: 4 phases + 12 plans shipped.
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 12
  completed_plans: 12
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08)

**Core value:** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and leads are profiled through natural discovery so Mica makes ONE targeted recommendation per conversation.
**Current focus:** Planning next milestone (likely v5.4 Kero CRM Infrastructure)

## Current Position

Milestone: v5.3 Conversational Sales & Playbook Engine — **SHIPPED 2026-04-08**
Status: milestone_complete
Progress: ██████████ 100% (4/4 phases, 12/12 plans)
Next: `/gsd:new-milestone` to start v5.4
Last activity: 2026-04-08 — Plan 85-02 complete. v5.3 milestone DONE. Replaced phase 83-02 1-line "Perfil detectado" stub with `AVATAR_TONE_GUIDES: Record<AvatarProfile, string>` const in system-prompt.ts carrying 4 distinct Spanish tone blocks (cero_absoluto/gym_crossover/intermedio/retorna), each with a framing line, 3-4 tone rules, propuesta anchor (Foundation/Performance/Flex), and 2 unique keywords. Tone guide injection is unconditional on activePlaybook — renders for PB1-PB5, so returning leads who later enter PB2 (trial) still hear adapted tone (AVAT-01). Added resolver Rule 2.5 between session reuse (Rule 2) and fresh state mapping (Rule 3): when (clientState=lead && session.avatar set && no in-flight stage) the resolver routes to PB1.E4 (targeted recommendation), skipping E1A/E1B/E2A/E2B/E3 discovery questions the avatar has already answered (AVAT-02). Rule 2.5 uses a PLAYBOOKS.PB1.stages lookup over a bare literal so a future rename surfaces at test time. Resolver purity invariant preserved: zero new imports, zero IO, zero Date, zero console — verified by grep. New avatar-tone-guide.test.ts with 29 cases across 6 describe blocks (per-avatar keyword presence, 12 cross-avatar uniqueness pairs, PB1-PB5 applicability, absent-when-no-avatar, Perfil detectado header compat, 100x determinism). Extended playbook-resolver.test.ts with 11 new Rule 2.5 cases (4 avatars + 6 negative/edge + 1 cancellation-still-wins). handler.ts, definitions.ts, advance.ts empty diff vs pre-plan baseline — scope held. Full bot suite 393/393 green (was 353 baseline; +40 tests). AVAT-01/AVAT-02/AVAT-05 closed.

## Performance Metrics

**Velocity:**

- Total plans completed: 16 (v5.0) + 7 (v5.1) + 4 (v5.2) = 27

**By Phase (v5.2):**

| Phase        | Plans | Total   | Avg/Plan |
| ------------ | ----- | ------- | -------- |
| Phase 79 P01 | 16min | 2 tasks | 2 files  |
| Phase 79 P02 | 3min  | 2 tasks | 1 files  |
| Phase 80 P01 | 2min  | 2 tasks | 3 files  |
| Phase 80 P02 | 2min  | 1 tasks | 1 files  |
| Phase 81 P01 | 2min  | 2 tasks | 1 files  |
| Phase 82 P01 | 6min  | 2 tasks | 5 files  |
| Phase 82 P02 | 12min | 2 tasks | 6 files  |
| Phase 82 P03 | 3min  | 2 tasks | 2 files  |
| Phase 83 P01 | 15min | 1 tasks | 1 files  |
| Phase 83 P02 | 38min | 3 tasks | 6 files  |
| Phase 83 P03 | 25min | 3 tasks | 3 files  |
| Phase 83 P04 | 20min | 1 tasks | 1 files  |
| Phase 84 P01 | 12min | 2 tasks | 3 files  |
| Phase 84 P02 | 8min  | 2 tasks | 1 files  |
| Phase 84 P03 | 15min | 3 tasks | 3 files  |
| Phase 85 P01 | 18min | 3 tasks | 4 files  |
| Phase 85 P02 | 12min | 2 tasks | 4 files  |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v5.3 stays in the prompt + Redis layer. NO new DB tables, NO new schedulers, NO Meta templates, NO admin panel changes (all Kero CRM work is v5.4).
- Phase ordering: engine first, then PB1 discovery (highest revenue path), then PB2-PB5 state-driven prompts, then avatar polish + full regression.
- Only the active playbook section is injected into the system prompt — the other 4 are excluded per turn (avoids prompt bloat and conflicting instructions).
- Conversational profiling only: Mica detects avatar from natural discovery, never via quiz format ("si le enchufas una encuesta se va").
- 4 avatars (cero_absoluto, gym_crossover, intermedio, retorna) — simplified from the original 11-avatar quiz model.
- PB6 (long-term reactivation) and onboarding playbook are explicitly skipped in v5.3.
- Stage state lives in Redis session (6h TTL). Cross-session durability is a v5.4 concern.
- [Phase 82]: System prompt header format locked: '_Playbook activo: PBx (PBx.Ey)_' (uses playbook id, not name; WhatsApp bold not markdown headers)
- [Phase 82]: STATE_SECTIONS dual-framing decision deferred to phase 84 (TODO comment in place); both render together for now to preserve v5.2 AVAT-03 baseline
- [Phase 83]: Hybrid LLM + structured <profile> tag chosen for avatar detection (Strategy C): pure rules can't handle Spanish nuance, dedicated tool would burn an extra model turn
- [Phase 85]: Tone guide injection is unconditional on activePlaybook — renders for PB1-PB5 so returning leads keep adapted tone in trial/expired/inactive, not just during discovery
- [Phase 85]: Resolver Rule 2.5 (skip-to-recommendation) routes to PB1.E4 (not PB1.E5) so the recommendation itself is still delivered conversationally before the trial close; advance.ts E4→E5 transition from phase 83-03 handles the next turn
- [Phase 85]: AVAT-05 keyword source-of-truth lives in the test file (not an exported const) — the test IS the contract the prompt prose must honor
- [Phase 85-02]: AVAT-03 locked via annotation + 1 integrative engine-on test (not by rewriting Q1..Q14) — preserves the v5.2 acceptance contract as a historical reference while still proving the engine-on path doesn't regress the baseline
- [Phase 85-02]: AVATAR_KEYWORDS extracted to test/fixtures/avatar-keywords.ts as a shared test fixture imported by both avatar-tone-guide.test.ts and playbook-flow-coverage.test.ts — DRY per CLAUDE.md engineering preferences
- [Phase 85-02]: One combined playbook-flow-coverage.test.ts (not 5 per-PB files) — shared stageContent helper + describe blocks fit in ~300 lines with no duplication gain from splitting

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

### Quick Tasks Completed

| #   | Description                                                   | Date       | Commit   | Directory                                                                                         |
| --- | ------------------------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------- |
| 7   | Fix 4 Mica response quality issues (QUAL-08 to QUAL-11)       | 2026-03-27 | 88dd1731 | [7-fix-4-mica-response-quality-issues-from-](./quick/7-fix-4-mica-response-quality-issues-from-/) |
| 8   | Security dependency audit for el-templo-api and el-templo-bot | 2026-04-06 | 5f81a588 | [8-security-dependency-audit-for-el-templo-](./quick/8-security-dependency-audit-for-el-templo-/) |
| 9   | Kero full context synthesis and v5.3 phase plan               | 2026-04-06 | 6f9be3d4 | [9-kero-full-context-synthesis-and-v5-3-pha](./quick/9-kero-full-context-synthesis-and-v5-3-pha/) |

## Session Continuity

Last session: 2026-04-08
Stopped at: Completed 85-02-PLAN.md — AVAT-03 annotation lock + playbook-flow-coverage.test.ts per-PB flow suite + AVATAR_KEYWORDS fixture extraction (commits d3b7ed23 + 00444ab0). Phase 85 complete 2/2. v5.3 milestone COMPLETE (4 phases, 12 plans, bot suite 413/413 green). Zero source changes in this plan.
Resume file: .planning/ROADMAP.md (next milestone: v5.4 Kero CRM)
Next step: plan v5.4 scope — Kero CRM DB tables, schedulers, Meta templates, admin panel integration.

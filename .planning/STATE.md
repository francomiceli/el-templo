---
gsd_state_version: 1.0
milestone: v5.3
milestone_name: Conversational Sales & Playbook Engine
status: in_progress
stopped_at: "Completed 85-01-PLAN.md (AVAT-01/AVAT-02/AVAT-05 — per-avatar Tone Guides + resolver Rule 2.5 skip-to-recommendation; bot suite 393/393 green)"
last_updated: "2026-04-08T02:20:00Z"
last_activity: 2026-04-08 -- Plan 85-01 complete (AVATAR_TONE_GUIDES with 4 distinct Spanish blocks injected for ALL playbooks when currentAvatar is set; resolver Rule 2.5 routes lead + known avatar + no in-flight stage -> PB1.E4 skipping discovery; resolver purity preserved; new avatar-tone-guide.test.ts 29 cases + 11 new resolver tests; handler.ts/definitions.ts/advance.ts untouched; full bot suite 393/393 green, up from 353; AVAT-01/AVAT-02/AVAT-05 closed)
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 12
  completed_plans: 11
  percent: 92
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-06)

**Core value:** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and now leads are profiled through natural discovery so Mica makes ONE targeted recommendation per conversation.
**Current focus:** v5.3 Conversational Sales & Playbook Engine — Phase 82 (Playbook Engine) next.

## Current Position

Milestone: v5.3 Conversational Sales & Playbook Engine
Phase: 85 — Avatar Adaptation & Quality (IN PROGRESS, 1/? plans)
Plan: 85-01 (complete) — Per-avatar Tone Guides + resolver skip-to-recommendation
Status: Plan 85-01 complete (AVAT-01/AVAT-02/AVAT-05 closed). Next: remainder of phase 85 (full v5.3 regression, any end-to-end avatar flow tests).
Progress: ██████████ 92% (2/4 phases, 11/12 plans)
Last activity: 2026-04-08 — Plan 85-01 complete. Replaced phase 83-02 1-line "Perfil detectado" stub with `AVATAR_TONE_GUIDES: Record<AvatarProfile, string>` const in system-prompt.ts carrying 4 distinct Spanish tone blocks (cero_absoluto/gym_crossover/intermedio/retorna), each with a framing line, 3-4 tone rules, propuesta anchor (Foundation/Performance/Flex), and 2 unique keywords. Tone guide injection is unconditional on activePlaybook — renders for PB1-PB5, so returning leads who later enter PB2 (trial) still hear adapted tone (AVAT-01). Added resolver Rule 2.5 between session reuse (Rule 2) and fresh state mapping (Rule 3): when (clientState=lead && session.avatar set && no in-flight stage) the resolver routes to PB1.E4 (targeted recommendation), skipping E1A/E1B/E2A/E2B/E3 discovery questions the avatar has already answered (AVAT-02). Rule 2.5 uses a PLAYBOOKS.PB1.stages lookup over a bare literal so a future rename surfaces at test time. Resolver purity invariant preserved: zero new imports, zero IO, zero Date, zero console — verified by grep. New avatar-tone-guide.test.ts with 29 cases across 6 describe blocks (per-avatar keyword presence, 12 cross-avatar uniqueness pairs, PB1-PB5 applicability, absent-when-no-avatar, Perfil detectado header compat, 100x determinism). Extended playbook-resolver.test.ts with 11 new Rule 2.5 cases (4 avatars + 6 negative/edge + 1 cancellation-still-wins). handler.ts, definitions.ts, advance.ts empty diff vs pre-plan baseline — scope held. Full bot suite 393/393 green (was 353 baseline; +40 tests). AVAT-01/AVAT-02/AVAT-05 closed.

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
Stopped at: Completed 85-01-PLAN.md — AVATAR_TONE_GUIDES const + resolver Rule 2.5 skip-to-recommendation + avatar-tone-guide.test.ts (commits b5f16a72 + 09930ad6 + 293b7f31). handler.ts/definitions.ts/advance.ts untouched. Full bot suite 393/393 green (was 353). AVAT-01/AVAT-02/AVAT-05 closed.
Resume file: .planning/phases/85-avatar-adaptation-and-quality/
Next step: plan phase 85 remainder — full v5.3 end-to-end regression, any avatar-driven flow tests, and phase close-out.

---
phase: 83-discovery-mode-for-leads
plan: 01
subsystem: el-templo-bot / playbooks
tags: [playbook, PB1, discovery, prompt-engineering]
requires:
  - phase 82 playbook engine (resolver + system-prompt injection)
provides:
  - "PB1 stages PB1.E1A/E1B/E2A/E2B/E3/E4/E5 enriched with discovery rules, defer rule, insistence rule, hard no-plan/no-price CTA"
affects:
  - el-templo-bot/src/playbooks/definitions.ts (PB1 promptSections only)
tech-stack:
  added: []
  patterns:
    - "Self-contained per-stage behavioral blocks injected verbatim via getSystemPrompt"
key-files:
  created: []
  modified:
    - el-templo-bot/src/playbooks/definitions.ts
decisions:
  - "Each PB1 stage promptSection is a single self-contained Spanish instruction block (opener + meta rule + defer rule + insistence rule). The defer/insistence paragraphs are repeated across E1A/E1B/E2A/E2B/E3 so Mica sees them inline regardless of which stage resolves — no cross-stage state inference required."
  - "PB1.E4 uses *REGLA FUERTE:* as a bold marker (matches Mica's *bold* convention from system-prompt.ts) instead of a markdown header, to ride the existing style."
  - "PB2-PB5 stages left untouched — phase 84 owns those. The self-check loop and PB6 scope-guard comment are byte-identical."
metrics:
  tasks_completed: 1
  files_modified: 1
  duration: ~15min
  completed_date: 2026-04-07
requirements_closed: [DISC-01, DISC-02, DISC-03, DISC-04, DISC-06, DISC-07]
---

# Phase 83 Plan 01: PB1 Discovery PromptSection Enrichment Summary

Rewrote PB1 stage promptSections in `el-templo-bot/src/playbooks/definitions.ts` so the v5.3 discovery flow (warm intro, 2-3 adaptive woven questions, defer rule, insistence rule, no-plan/no-price targeted recommendation, soft free-trial close) is carried verbatim in the system prompt Mica receives each turn.

## What Changed

- **PB1.E1A / PB1.E1B** — Opener line preserved; added meta-rule paragraph with the verbatim phrase "Idealmente 2-3 preguntas, adaptándose al engagement del lead" (TEAM-CORR-01), a defer-rule paragraph for price/horario/sede questions asked before discovery finishes, and an insistence-rule paragraph.
- **PB1.E2A / PB1.E2B** — Second-question lines preserved; added a generic-language meta-rule explicitly banning skill names (TEAM-CORR-03) plus the same defer/insistence rules. Also authorizes skipping this question when the lead has already given rich info in the previous turn.
- **PB1.E3** — Third logistics question framed as the "última pregunta"; explicit cap at 3 discovery questions; defer/insistence rules present.
- **PB1.E4** — _REGLA FUERTE_ block at the top forbidding any specific plan recommendation or price mention (TEAM-CORR-02), example proposal template, direct-question handling ("Te paso los detalles después de la clase..."), and explicit soft-trial close instruction (no hard sell, no time-limited discount).
- **PB1.E5** — Existing schedule line preserved; added follow-up rule blocking plan-selling after scheduling (owned by PB2).
- **PB1.E6 / PB1.E7** — Untouched (phase 84/85 scope).
- **PB2-PB5** — Untouched.
- **Self-check loop + PB6 scope-guard comment** — Byte-identical.

## Verification

- `cd el-templo-bot && pnpm tsc --noEmit` — exit 0
- `cd el-templo-bot && pnpm test` — **243/243 passing** (including `playbook-resolver` and `system-prompt-playbook`)
- `grep -E "muscle up|front lever|planche|handstand|pistol squat" el-templo-bot/src/playbooks/definitions.ts` — 0 matches
- `grep "REGLA FUERTE" el-templo-bot/src/playbooks/definitions.ts` — 1 match (PB1.E4)
- `grep "Idealmente 2-3 preguntas" el-templo-bot/src/playbooks/definitions.ts` — 2 matches (PB1.E1A, PB1.E1B)
- `system-prompt-playbook.test.ts` distinctive-phrase check passed — PB1's 25-char unique window against PB2-PB5 still resolves without collision.

## Requirements Closed

| ID      | Description                                                  | Evidence                                                               |
| ------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| DISC-01 | Warm intro opener (never "¿en qué puedo ayudarte?")          | PB1.E1A/E1B meta-rule paragraphs explicitly ban the phrase             |
| DISC-02 | Cap discovery at 2-3 adaptive questions                      | "Idealmente 2-3 preguntas" in E1A/E1B; "ÚLTIMA pregunta" in E3         |
| DISC-03 | Defer rule for direct questions before discovery done        | Defer-rule paragraph present in E1A/E1B/E2A/E2B/E3                     |
| DISC-04 | No plan recommendation / no price in PB1.E4                  | _REGLA FUERTE_ block at top of PB1.E4 promptSection                    |
| DISC-06 | Soft trial close (no hard sell)                              | PB1.E4 closing instruction forbids hard sell and time-limited discount |
| DISC-07 | Insistence rule — respect lead who insists on direct answers | Insistence-rule paragraph present in E1A/E1B/E2A/E2B/E3                |

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `9f321905` — feat(83-01): enrich PB1 promptSections with discovery rules

## Self-Check: PASSED

- FOUND: el-templo-bot/src/playbooks/definitions.ts (modified, committed)
- FOUND: commit 9f321905
- FOUND: .planning/phases/83-discovery-mode-for-leads/83-01-SUMMARY.md (this file)
- grep assertions: all pass (no banned skill names, REGLA FUERTE x1, Idealmente 2-3 preguntas x2)
- Test suite: 243/243 green

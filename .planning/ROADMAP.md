# Roadmap: El Templo

## Milestones

- **v2.0 Admin App** — Phases 13-28 (in progress, phases 13-19 + 26-27 complete)
- **v3.0 Landing Page** — Phases 29-36 (planned)
- **v4.0 Ecosystem Foundation** — Phases 45-52 (planned)
- **v4.1 Admin Consolidation & Data Migration** — Phases 58-66 (planned)
- ✅ **v5.0 WhatsApp AI Chatbot** — Phases 67-73 (shipped 2026-03-26)
- ✅ **v5.1 Production Readiness & Business Data** — Phases 74-78 (shipped 2026-03-27)
- ✅ **v5.2 Mica Persona & Bot Refinement** — Phases 79-81 (shipped 2026-04-06)
- ✅ **v5.3 Conversational Sales & Playbook Engine** — Phases 82-85 (shipped 2026-04-08)
- **v5.3.1 Prompt Architecture Refactor** — Phases 86-88 (in progress)

---

## v5.3.1 Prompt Architecture Refactor (Phases 86-88)

**Milestone Goal:** Fix the structural cause of price leakage and prompt dilution by gating business knowledge per client state, consolidating the Boarding Pass definition, and integrating the team's method description.

**Hard Constraints:**

- Do NOT touch: resolver.ts, advance.ts, definitions.ts, handler.ts (beyond getSystemPrompt call site), debounce, non-text handling, markdown normalization
- Do NOT add or rename playbook stages
- knowledge.ts is the PRIMARY target file
- system-prompt.ts gets ONE change: pass clientState to getBusinessKnowledge
- Phase 88 is test-only — zero source changes

### Phases

- [ ] **Phase 86: Knowledge Gating** - State-gated knowledge injection so PB1 leads see only discovery-relevant sections
- [ ] **Phase 87: Boarding Pass + Method Description** - Consolidate Boarding Pass to one definition, add team method description with deflection rule
- [ ] **Phase 88: Quality Regression Lock** - Full test suite green + new state-gated and prompt-size regression tests

### Phase Details

#### Phase 86: Knowledge Gating

**Goal**: PB1 leads receive a focused, smaller prompt with only discovery-relevant knowledge — eliminating structural price leakage and attention dilution
**Depends on**: Nothing (first phase in v5.3.1)
**Requirements**: KGATE-01, KGATE-02, KGATE-03, KGATE-04, KGATE-05, KGATE-06
**Success Criteria** (what must be TRUE):

1. A PB1 lead at E1A receives classes, locations, trial info, and Boarding Pass knowledge — but NOT retention strategies, upgrade paths, app help, or member policies
2. A trial/active/inactive/expired contact receives the full 12-section knowledge set (zero regression from v5.2 behavior)
3. Calling `getBusinessKnowledge()` with no argument returns the full knowledge set (backward compat)
4. The PB1.E1A rendered prompt is at least 35% smaller (in characters) than the pre-refactor baseline

**Plans:** 2/3 plans executed

Plans:

- [x] 86-01-PLAN.md — Capture pre-refactor PB1.E1A baseline fixture + BASELINE_CHARS constant
- [ ] 86-02-PLAN.md — Refactor knowledge.ts to tagged sections with state gating + wire system-prompt call site
- [ ] 86-03-PLAN.md — Add prompt-size regression test (KGATE-05) and per-state content gating tests

#### Phase 87: Boarding Pass + Method Description

**Goal**: Leads hear a single, consistent explanation of the Boarding Pass and can learn about the training method without Mica exposing internal methodology details
**Depends on**: Phase 86 (knowledge gating infra must exist so the new method section can be tagged as discovery-relevant)
**Requirements**: BPASS-01, BPASS-02, BPASS-03, METHOD-01, METHOD-02, METHOD-03, METHOD-04
**Success Criteria** (what must be TRUE):

1. knowledge.ts contains exactly ONE canonical Boarding Pass definition, and all other mentions reference it without re-explaining
2. knowledge.ts contains the team-provided method description (verbatim long-form) plus a 2-sentence elevator pitch
3. When a lead asks about method internals (progressions, periodization), the prompt instructs Mica to deflect with "lo sentis cuando llegas" and re-anchor the trial CTA
4. The method section is tagged as discovery-relevant and included in the PB1 lead knowledge gate
   **Plans**: TBD

#### Phase 88: Quality Regression Lock

**Goal**: Prove that all content changes are safe — existing tests stay green, and new tests lock the state-gating behavior and prompt-size gains
**Depends on**: Phase 86, Phase 87 (tests validate the combined output of both content phases)
**Requirements**: QREG-01, QREG-02, QREG-03
**Success Criteria** (what must be TRUE):

1. All 502 existing bot tests pass with zero modifications to test assertions
2. New tests verify that lead state gets discovery-relevant sections only and active/trial/inactive/expired states get the full knowledge set
3. A prompt-size regression test measures PB1.E1A rendered prompt and asserts >= 35% reduction vs the documented pre-refactor baseline
   **Plans**: TBD

### Progress

| Phase                                  | Plans Complete | Status      | Completed |
| -------------------------------------- | -------------- | ----------- | --------- |
| 86. Knowledge Gating                   | 2/3            | In Progress |           |
| 87. Boarding Pass + Method Description | 0/TBD          | Not started | -         |
| 88. Quality Regression Lock            | 0/TBD          | Not started | -         |

---

<details>
<summary>✅ v5.3 Conversational Sales & Playbook Engine (Phases 82-85) — SHIPPED 2026-04-08</summary>

- [x] Phase 82: Playbook Engine (3/3 plans)
- [x] Phase 83: Discovery Mode for Leads — PB1 (4/4 plans)
- [x] Phase 84: State-Adaptive Playbook Prompts — PB2-PB5 (3/3 plans)
- [x] Phase 85: Avatar Adaptation & Quality (2/2 plans)

See: `.planning/milestones/v5.3-ROADMAP.md`

</details>

_v5.3 shipped 2026-04-08 — see `.planning/milestones/v5.3-ROADMAP.md` for full details._

<details>
<summary>v2.0 Admin App (Phases 13-28)</summary>

See `.planning/milestones/v2.0-ROADMAP.md` for archived details. Phases 20-25 deferred.

</details>

<details>
<summary>v4.1 Admin Consolidation (Phases 58-66)</summary>

See `.planning/milestones/v4.1-ROADMAP.md` for archived details. Phases 60-66 deferred to a future milestone.

</details>

<details>
<summary>✅ v5.0 WhatsApp AI Chatbot (Phases 67-73) — SHIPPED 2026-03-26</summary>

- [x] Phase 67: WhatsApp Cloud API Webhook + Echo Bot (2/2 plans)
- [x] Phase 68: AI Integration + Info Tools (3/3 plans)
- [x] Phase 69: Redis Memory Layer + Client State Machine (2/2 plans)
- [x] Phase 70: Action Tools (2/2 plans)
- [x] Phase 71: Proactive Schedulers (2/2 plans)
- [x] Phase 72: Admin Panel — Conversations UI (2/2 plans)
- [x] Phase 73: Admin Panel — Human Takeover (2/2 plans)

See: `.planning/milestones/v5.0-ROADMAP.md`

</details>

<details>
<summary>✅ v5.1 Production Readiness & Business Data (Phases 74-78) — SHIPPED 2026-03-27</summary>

- [x] Phase 74: Business Data Integration (2/2 plans)
- [x] Phase 75: Database Seeding (1/1 plans)
- [x] Phase 76: Known Issues Fix (1/1 plans)
- [x] Phase 77: GitHub Actions Deployment (2/2 plans)
- [x] Phase 78: WhatsApp Production Setup (1/1 plans)

See: `.planning/milestones/v5.1-ROADMAP.md`

</details>

<details>
<summary>✅ v5.2 Mica Persona & Bot Refinement (Phases 79-81) — SHIPPED 2026-04-06</summary>

- [x] Phase 79: Mica System Prompt & Knowledge Rewrite (2/2 plans)
- [x] Phase 80: Response Quality & Data Fixes (2/2 plans)
- [x] Phase 81: Conversation Flow Testing (1/1 plan)

See: `.planning/milestones/v5.2-ROADMAP.md`

</details>

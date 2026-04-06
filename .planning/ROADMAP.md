# Roadmap: El Templo

## Milestones

- **v2.0 Admin App** — Phases 13-28 (in progress, phases 13-19 + 26-27 complete)
- **v3.0 Landing Page** — Phases 29-36 (planned)
- **v4.0 Ecosystem Foundation** — Phases 45-52 (planned)
- **v4.1 Admin Consolidation & Data Migration** — Phases 58-66 (planned)
- ✅ **v5.0 WhatsApp AI Chatbot** — Phases 67-73 (shipped 2026-03-26)
- ✅ **v5.1 Production Readiness & Business Data** — Phases 74-78 (shipped 2026-03-27)
- ✅ **v5.2 Mica Persona & Bot Refinement** — Phases 79-81 (shipped 2026-04-06)
- 🚧 **v5.3 Conversational Sales & Playbook Engine** — Phases 82-85 (active)

---

## v5.3 Conversational Sales & Playbook Engine

**Goal:** Transform Mica from a database-like responder into a conversational salesperson that profiles leads through natural discovery, follows structured playbooks per client state, and adapts proposals based on detected profile.

**Scope discipline:** v5.3 stays in the **prompt + Redis layer**. NO new DB tables, NO new schedulers, NO Meta templates, NO admin panel changes. All Kero CRM persistence/automation work is deferred to v5.4.

**Requirements:** 24 total (PBENG ×6, DISC ×7, PBPR ×6, AVAT ×5)

### Phases

- [ ] **Phase 82: Playbook Engine** — Active-playbook + stage resolver, Redis persistence, prompt injection of only the active PB
- [ ] **Phase 83: Discovery Mode for Leads (PB1)** — Warm intro, max 3 qualifying questions, profile detection, ONE targeted recommendation, soft trial offer
- [ ] **Phase 84: State-Adaptive Playbook Prompts (PB2-PB5)** — Trial follow-up, vencimiento, inactivo, cancelacion playbook prompts with stages, objections, escalation
- [ ] **Phase 85: Avatar Adaptation & Quality** — Tone adapts to detected avatar, profile reuse across sessions, full QA + per-playbook flow tests

### Execution Order

Phase 82 (Engine) → Phase 83 (PB1 Discovery) → Phase 84 (PB2-PB5 prompts) → Phase 85 (Avatar polish + full tests)

**Why this order:** The engine must exist before any playbook can be selected. PB1 (lead discovery) is the highest-revenue path and the only flow that requires conversational profiling, so it ships before the simpler state-driven PB2-PB5. Avatar adaptation polishes the lead experience and is the natural place to lock in regression tests across all playbooks.

---

## v5.3 Phase Details

### Phase 82: Playbook Engine

**Goal:** A pure resolver picks the right playbook + stage for any contact, persists progression in Redis, and the system prompt injects only the active playbook section.
**Depends on:** Nothing (first phase of v5.3; builds on existing Mica prompt + state machine from v5.2)
**Requirements:** PBENG-01, PBENG-02, PBENG-03, PBENG-04, PBENG-05, PBENG-06
**Success Criteria** (what must be TRUE):

1. Given any contact `clientState` (lead/trial/active/inactive/expired), `resolvePlaybook(contact, session)` returns exactly one `{playbookId, stageId}` pair, covered by unit tests for every state.
2. The active playbook id and current stage id are written to and read from the Redis session under a stable key (no MySQL writes).
3. When Mica replies, the system prompt contains exactly ONE playbook section — the active one — and the other four playbooks are absent from the rendered prompt.
4. When stage completion criteria are met (e.g., discovery answered, trial proposed), the stage advances on the next turn and the new stage id is reflected in Redis.
5. Stage state survives across turns within a 6h Redis session and resets cleanly when the session expires.

**Plans:** TBD

---

### Phase 83: Discovery Mode for Leads (PB1)

**Goal:** When a lead first messages Mica, she runs a natural discovery flow — warm intro, max 3 woven questions, profile detection — and closes with ONE targeted recommendation plus a soft trial offer.
**Depends on:** Phase 82 (engine must select PB1 for lead state and inject the discovery prompt)
**Requirements:** DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06, DISC-07
**Success Criteria** (what must be TRUE):

1. A first inbound message from a `clientState=lead` contact is met with a warm intro plus the first qualifying question — never the generic "¿en qué puedo ayudarte?".
2. Across a discovery conversation, Mica asks at most 3 qualifying questions, one per message, woven into the conversation rather than listed quiz-style.
3. When a lead asks a direct question (price, schedule, location) before discovery is complete, Mica answers briefly first, then asks one qualifying question on the same turn.
4. After 2-3 qualifying answers, Mica makes ONE targeted recommendation matched to the detected profile — not a menu of options.
5. A profile value (`cero_absoluto | gym_crossover | intermedio | retorna`) is detected from lead responses and stored in the Redis session for later turns.
6. Discovery closes with a soft trial offer ("¿Querés probar con una clase gratis?") rather than a hard sell.
7. When a lead explicitly insists on direct answers, Mica defers profiling gracefully — she answers the question and does not push another discovery question that turn.

**Plans:** TBD

---

### Phase 84: State-Adaptive Playbook Prompts (PB2-PB5)

**Goal:** Each non-lead client state has a dedicated playbook prompt with stage variants, objection handling, and explicit escalation triggers — loaded only when that playbook is active.
**Depends on:** Phase 82 (engine selects PB2-PB5 by state and injects only the active section)
**Requirements:** PBPR-01, PBPR-02, PBPR-03, PBPR-04, PBPR-05, PBPR-06
**Success Criteria** (what must be TRUE):

1. PB2 (trial no convertido) prompt drives Mica through check-in → listen → handle objection → soft urgency proposal, with at least two stage variants (A/B), and is the only PB injected when `clientState=trial`.
2. PB3 (vencimiento) prompt drives warm reminder → price-anchor upgrade → facilitate payment with A/B stage variants when `clientState=expired` (or near-expiry active).
3. PB4 (inactivo 30+ días) prompt drives empathy → listen → soft solution → no-pressure exit with A/B stage variants when `clientState=inactive_member`.
4. PB5 (cancelacion) prompt drives listen-without-resistance → real-reason → alternative → escalate, and Mica visibly hands off to a human when no alternative is accepted.
5. Objection-handling scripts for each playbook only appear in the rendered prompt when that playbook is active (verified by inspecting prompt output across all 5 states).
6. Each playbook defines explicit escalation triggers, and when a trigger fires Mica produces the v5.2 escalation phrase and the conversation is flagged for human takeover.

**Plans:** TBD

---

### Phase 85: Avatar Adaptation & Quality

**Goal:** Mica's tone adapts to the detected avatar, profile data is reused across sessions, and a full regression suite proves nothing from v5.2 broke while every playbook gets end-to-end coverage.
**Depends on:** Phase 83 (profile detection writes avatar) and Phase 84 (PB2-PB5 prompts in place to test)
**Requirements:** AVAT-01, AVAT-02, AVAT-03, AVAT-04, AVAT-05
**Success Criteria** (what must be TRUE):

1. With a profile set in Redis, Mica's responses use distinguishable tone/framing for each of the 4 avatars (cero_absoluto, gym_crossover, intermedio, retorna) — verified by per-avatar keyword tests.
2. When a returning contact already has a profile in Redis, Mica skips qualifying questions whose answers are already known and proceeds directly to recommendation/trial flow.
3. All 14 existing v5.2 QA test questions still pass with the playbook engine active.
4. A new test suite covers each playbook (PB1-PB5) end-to-end with at least one happy path and one objection path per playbook.
5. New tests assert that avatar-specific tone keywords appear in Mica's responses when the corresponding profile is set.

**Plans:** TBD

---

## v5.3 Progress

| Phase                                       | Plans Complete | Status      | Completed |
| ------------------------------------------- | -------------- | ----------- | --------- |
| 82. Playbook Engine                         | 0/?            | Not started | -         |
| 83. Discovery Mode for Leads (PB1)          | 0/?            | Not started | -         |
| 84. State-Adaptive Playbook Prompts PB2-PB5 | 0/?            | Not started | -         |
| 85. Avatar Adaptation & Quality             | 0/?            | Not started | -         |

**Coverage:** 24/24 v5.3 requirements mapped ✓

---

_v5.3 phases added: 2026-04-06 — 4 phases (82-85), 24 requirements mapped_

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

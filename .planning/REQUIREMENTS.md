# Requirements: El Templo

**Defined:** 2026-04-06
**Current Milestone:** v5.3 Conversational Sales & Playbook Engine
**Core Value (v5.x):** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and now, leads are profiled through natural discovery so Mica makes ONE targeted recommendation per conversation.

## v5.3 Requirements

Requirements for the Conversational Sales & Playbook Engine milestone. Each maps to one phase in `.planning/ROADMAP.md`.

### Playbook Engine

- [x] **PBENG-01**: Engine selects active playbook (PB1-PB5) based on contact's clientState (lead/trial/active/inactive/expired)
- [x] **PBENG-02**: Engine tracks current stage within active playbook (e.g., `PB1.E2A`)
- [x] **PBENG-03**: Engine persists `{activePlaybook, currentStage}` in Redis session (no MySQL writes in v5.3)
- [x] **PBENG-04**: Engine advances stage when stage completion criteria are met
- [x] **PBENG-05**: Only the active playbook section is injected into the system prompt (other 4 playbooks excluded)
- [x] **PBENG-06**: Engine exposes a pure function `resolvePlaybook(contact, session) → {playbookId, stageId}` covered by unit tests

### Discovery Mode for Leads (PB1)

- [x] **DISC-01**: When `clientState=lead`, Mica's first message is a warm intro + first qualifying question (never "¿en qué puedo ayudarte?")
- [x] **DISC-02**: Mica asks max 3 qualifying questions, one at a time, woven naturally into conversation
- [x] **DISC-03**: When a lead asks a direct question (price/schedule/location) before discovery is complete, Mica answers briefly then asks one qualifying question
- [x] **DISC-04**: After 2-3 answers, Mica makes ONE targeted recommendation matched to the detected profile
- [ ] **DISC-05**: Mica detects and stores a profile (`cero_absoluto | gym_crossover | intermedio | retorna`) in Redis session based on lead responses
- [x] **DISC-06**: Discovery flow closes with a soft trial offer ("¿Querés probar con una clase gratis?")
- [x] **DISC-07**: If a lead insists on direct answers, discovery defers gracefully — answer first, defer profiling

### State-Adaptive Playbook Prompts (PB2-PB5)

- [ ] **PBPR-01**: PB2 (trial no convertido) prompt sections: check-in → listen → handle objection → soft urgency proposal, with stage variants A/B
- [ ] **PBPR-02**: PB3 (vencimiento) prompt sections: warm reminder → price-anchor upgrade → facilitate payment, with stage variants A/B
- [ ] **PBPR-03**: PB4 (inactivo 30+ días) prompt sections: empathy → listen → soft solution → no-pressure exit, with stage variants A/B
- [ ] **PBPR-04**: PB5 (cancelación) prompt sections: listen without resistance → understand real reason → offer alternative → escalate if no solution
- [ ] **PBPR-05**: Each playbook ships objection-handling scripts loaded into the prompt only when that playbook is active
- [ ] **PBPR-06**: Each playbook defines explicit escalation triggers (Mica hands off to human when matched)

### Avatar Adaptation & Quality

- [ ] **AVAT-01**: Mica adapts tone/framing to detected avatar profile (4 distinct voices: cero_absoluto, gym_crossover, intermedio, retorna)
- [ ] **AVAT-02**: When Redis session already has a profile, Mica skips already-answered discovery questions
- [ ] **AVAT-03**: All 14 existing QA test questions still pass with playbook engine active
- [ ] **AVAT-04**: New conversation flow tests cover each playbook (PB1-PB5) end-to-end with at least one happy path and one objection path
- [ ] **AVAT-05**: New tests verify avatar-specific tone keywords appear when profile is set

## v5.4+ Requirements (Deferred — Kero CRM)

Tracked but explicitly out of scope for v5.3. Will be addressed in the v5.4 Kero CRM milestone.

### Persistence & Data Model

- **KERO-01**: New DB tables for sub_states, tags, score, events
- **KERO-02**: Promote stage transitions from Redis to MySQL for cross-session durability
- **KERO-03**: Lead scoring system (engagement + intent + recency)

### Automation

- **KERO-04**: 10 schedulers (cron jobs) for proactive outreach across playbook stages
- **KERO-05**: 19 Meta WhatsApp templates submitted for approval
- **KERO-06**: Anti-spam rate-limiting rules per contact

### Admin Surface

- **KERO-07**: Kero CRM dashboard in admin panel (lead pipeline, scoring, manual intervention)

### Coverage

- **KERO-08**: PB6 (long-term reactivation) playbook

## Out of Scope

Explicitly excluded from v5.3 to keep the milestone focused on prompt-layer behavior.

| Feature                                           | Reason                                             |
| ------------------------------------------------- | -------------------------------------------------- |
| New DB tables (sub_states, tags, score, events)   | Kero CRM scope (v5.4) — v5.3 stays in Redis        |
| New schedulers (10 cron jobs)                     | Kero CRM scope (v5.4) — needs DB persistence first |
| Meta WhatsApp templates submission (19 templates) | Requires CRM triggers — v5.4                       |
| Admin panel changes (Kero dashboard)              | Kero CRM scope (v5.4)                              |
| Lead scoring system                               | Kero CRM scope (v5.4)                              |
| Anti-spam rate-limiting rules                     | Kero CRM scope (v5.4)                              |
| MySQL persistence of stage transitions            | v5.3 uses Redis only — promote in v5.4             |
| PB6 (long-term reactivation)                      | Skipped in v5.3 brief; revisit in v5.4             |

## Traceability

| Requirement | Phase    | Status   |
| ----------- | -------- | -------- |
| PBENG-01    | Phase 82 | Complete |
| PBENG-02    | Phase 82 | Complete |
| PBENG-03    | Phase 82 | Complete |
| PBENG-04    | Phase 82 | Complete |
| PBENG-05    | Phase 82 | Complete |
| PBENG-06    | Phase 82 | Complete |
| DISC-01     | Phase 83 | Complete |
| DISC-02     | Phase 83 | Complete |
| DISC-03     | Phase 83 | Complete |
| DISC-04     | Phase 83 | Complete |
| DISC-05     | Phase 83 | Pending  |
| DISC-06     | Phase 83 | Complete |
| DISC-07     | Phase 83 | Complete |
| PBPR-01     | Phase 84 | Pending  |
| PBPR-02     | Phase 84 | Pending  |
| PBPR-03     | Phase 84 | Pending  |
| PBPR-04     | Phase 84 | Pending  |
| PBPR-05     | Phase 84 | Pending  |
| PBPR-06     | Phase 84 | Pending  |
| AVAT-01     | Phase 85 | Pending  |
| AVAT-02     | Phase 85 | Pending  |
| AVAT-03     | Phase 85 | Pending  |
| AVAT-04     | Phase 85 | Pending  |
| AVAT-05     | Phase 85 | Pending  |

**Coverage:**

- v5.3 requirements: 24 total
- Mapped to phases: 24 ✓
- Unmapped: 0

---

_Requirements defined: 2026-04-06_
_Last updated: 2026-04-06 after roadmapper mapped 24 requirements to phases 82-85_

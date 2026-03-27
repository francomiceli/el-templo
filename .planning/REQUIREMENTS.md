# Requirements: El Templo v5.2 — Mica Persona & Bot Refinement

**Defined:** 2026-03-27
**Core Value:** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and can book classes and register for trials without human intervention.

## v5.2 Requirements

Requirements for Mica persona and bot refinement milestone. Each maps to roadmap phases.

### Persona & Prompt

- [ ] **MICA-01**: System prompt implements Mica identity with Argentine tuteo, warm concise tone, and 1-2 emoji max per message
- [ ] **MICA-02**: System prompt defines state-adaptive objectives (lead→trial, active→retain, inactive→reactivate)
- [ ] **MICA-03**: System prompt includes tool usage rules (schedule max 5, book_class silence after buttons, trial asks only name+preference, escalation message)

### Knowledge

- [ ] **KNOW-01**: Knowledge file contains complete plan/pricing data (Flex, Foundation, Performance, credit card, single class) with Zero rules
- [ ] **KNOW-02**: Knowledge file contains schedules per branch with correct addresses (including Mogotes/Mario Bravo fix)
- [ ] **KNOW-03**: Knowledge file contains ROM description, trial class rules, app instructions, and business policies (pause, transfer, shift changes)
- [ ] **KNOW-04**: Knowledge file contains sales techniques (urgency, anchoring, upselling, soft close)
- [ ] **KNOW-05**: Knowledge file contains objection handling for 7 common objections
- [ ] **KNOW-06**: Knowledge file contains retention strategies (inactive, expiring, cancellation, returning)
- [ ] **KNOW-07**: Knowledge file contains 12 golden rules for Mica behavior

### Response Quality

- [ ] **QUAL-01**: Bot uses WhatsApp formatting only (bold, bullets) — no markdown headers (###)
- [ ] **QUAL-02**: Pricing responses show Flex plans first, offer Foundation/Performance on request
- [ ] **QUAL-03**: Schedule responses show max 5 results, then offer to filter
- [ ] **QUAL-04**: Bot says "cupos disponibles" instead of "lugares" for availability
- [ ] **QUAL-05**: After book_class returns [BUTTONS_SENT], bot sends no additional text
- [ ] **QUAL-06**: Trial registration only asks for name and class preference (phone already known)
- [ ] **QUAL-07**: Escalation uses "Te paso con alguien del equipo, te escriben enseguida 🙌" then silence

### Testing

- [ ] **TEST-01**: All 14 QA questions answered correctly by the bot
- [ ] **TEST-02**: Key conversation flows tested against real examples (lead→trial, renewal, objections, escalation, reactivation)
- [ ] **TEST-03**: Mica's tone verified: short, warm, one question at a time, matches real team style

## Future Requirements (v5.3+)

### Scheduler Expansion

- **SCHED-03**: Membership renewal nudge X days before expiration
- **SCHED-04**: Re-engagement message to lapsed members
- **SCHED-05**: Google review request after N classes attended
- **SCHED-06**: Birthday/milestone personalized messages

### Advanced Features

- **ADV-01**: Media message support (images, documents, audio)
- **ADV-02**: WebSocket real-time updates for admin panel (replace polling)
- **ADV-03**: Scheduler monitoring/config UI in admin panel
- **ADV-04**: Auto-generate system prompt from DB data (schedules, pricing)

## Out of Scope

| Feature                         | Reason                                                             |
| ------------------------------- | ------------------------------------------------------------------ |
| WebSocket admin updates         | v5.3+ — polling works for current scale                            |
| Media message handling          | v5.3+ — text-only sufficient for launch                            |
| Scheduler admin UI              | v5.3+ — cron config via env vars for now                           |
| Auto-prompt from DB             | v5.3+ — structured knowledge file is simpler and more controllable |
| Multi-language                  | Spanish only — all branches are Spanish-speaking                   |
| Payment processing via WhatsApp | v7.0+ scope                                                        |
| Voice message transcription     | Adds complexity, defer to v5.3+                                    |

## Traceability

| Requirement | Phase    | Status  |
| ----------- | -------- | ------- |
| MICA-01     | Phase 79 | Pending |
| MICA-02     | Phase 79 | Pending |
| MICA-03     | Phase 79 | Pending |
| KNOW-01     | Phase 79 | Pending |
| KNOW-02     | Phase 79 | Pending |
| KNOW-03     | Phase 79 | Pending |
| KNOW-04     | Phase 79 | Pending |
| KNOW-05     | Phase 79 | Pending |
| KNOW-06     | Phase 79 | Pending |
| KNOW-07     | Phase 79 | Pending |
| QUAL-01     | Phase 80 | Pending |
| QUAL-02     | Phase 80 | Pending |
| QUAL-03     | Phase 80 | Pending |
| QUAL-04     | Phase 80 | Pending |
| QUAL-05     | Phase 80 | Pending |
| QUAL-06     | Phase 80 | Pending |
| QUAL-07     | Phase 80 | Pending |
| TEST-01     | Phase 81 | Pending |
| TEST-02     | Phase 81 | Pending |
| TEST-03     | Phase 81 | Pending |

**Coverage:**

- v5.2 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---

_Requirements defined: 2026-03-27_

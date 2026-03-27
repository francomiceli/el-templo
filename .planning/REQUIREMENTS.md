# Requirements: El Templo v5.1 — Production Readiness & Business Data

**Defined:** 2026-03-26
**Core Value:** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and can book classes and register for trials without human intervention.

## v5.1 Requirements

Requirements for production readiness milestone. Each maps to roadmap phases.

### Business Data

- [x] **BIZ-01**: Bot answers accurately about pricing for all plan types (Flex, Foundation, Performance, credit card)
- [x] **BIZ-02**: Bot answers accurately about all branch locations with addresses and Google Maps links
- [x] **BIZ-03**: Bot answers accurately about class schedules per branch
- [x] **BIZ-04**: Bot answers about Zero pricing rules, Boarding Pass, and plan upgrade paths
- [x] **BIZ-05**: Bot answers about ROM (Rango Orgánico de Movilidad) and what it includes
- [x] **BIZ-06**: Bot answers about trial class rules (free first class, booking flow, what to bring)
- [x] **BIZ-07**: Bot answers about app troubleshooting (download, login, session access)
- [x] **BIZ-08**: System prompt references structured business knowledge file instead of hardcoded data

### Database Seeding

- [x] **SEED-01**: Branches table populated with 5 real El Templo locations (addresses, coordinates, phone)
- [x] **SEED-02**: Activities table populated with real activity types (Calistenia, ROM)
- [x] **SEED-03**: Schedules table populated with real class times per branch
- [x] **SEED-04**: Subscription plans table populated with real plan data (Flex, Foundation, Performance)
- [x] **SEED-05**: Seed script is idempotent (can be re-run safely without duplicates)

### Bug Fixes

- [x] **FIX-01**: Scheduler queries use correct column names matching actual DB schema
- [x] **FIX-02**: Session message history validated before sending to AI (prevents OpenAI tool context corruption)
- [x] **FIX-03**: Argentine phone normalization applied in sendInteractiveMessage and sendTemplateMessage (not just sendTextMessage)

### Deployment

- [ ] **DEPLOY-01**: GitHub Actions workflow builds, deploys, and restarts el-templo-bot alongside el-templo-api
- [ ] **DEPLOY-02**: PM2 ecosystem file configured for bot process in production
- [x] **DEPLOY-03**: All bot-related env vars documented as GitHub Secrets
- [x] **DEPLOY-04**: Permanent WhatsApp System User token generation documented

### WhatsApp Production

- [ ] **WA-01**: Meta template messages documented and ready for submission (class_reminder, trial_followup)
- [ ] **WA-02**: WhatsApp phone number registration process documented
- [ ] **WA-03**: MySQL timezone tables populated for CONVERT_TZ in scheduler queries

## Future Requirements (v5.2+)

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
| WebSocket admin updates         | v5.2+ — polling works for current scale                            |
| Media message handling          | v5.2+ — text-only sufficient for launch                            |
| Scheduler admin UI              | v5.2+ — cron config via env vars for now                           |
| Auto-prompt from DB             | v5.2+ — structured knowledge file is simpler and more controllable |
| Multi-language                  | Spanish only — all branches are Spanish-speaking                   |
| Payment processing via WhatsApp | v7.0+ scope                                                        |

## Traceability

| Requirement | Phase    | Status   |
| ----------- | -------- | -------- |
| BIZ-01      | Phase 74 | Complete |
| BIZ-02      | Phase 74 | Complete |
| BIZ-03      | Phase 74 | Complete |
| BIZ-04      | Phase 74 | Complete |
| BIZ-05      | Phase 74 | Complete |
| BIZ-06      | Phase 74 | Complete |
| BIZ-07      | Phase 74 | Complete |
| BIZ-08      | Phase 74 | Complete |
| SEED-01     | Phase 75 | Complete |
| SEED-02     | Phase 75 | Complete |
| SEED-03     | Phase 75 | Complete |
| SEED-04     | Phase 75 | Complete |
| SEED-05     | Phase 75 | Complete |
| FIX-01      | Phase 76 | Complete |
| FIX-02      | Phase 76 | Complete |
| FIX-03      | Phase 76 | Complete |
| DEPLOY-01   | Phase 77 | Pending  |
| DEPLOY-02   | Phase 77 | Pending  |
| DEPLOY-03   | Phase 77 | Complete |
| DEPLOY-04   | Phase 77 | Complete |
| WA-01       | Phase 78 | Pending  |
| WA-02       | Phase 78 | Pending  |
| WA-03       | Phase 78 | Pending  |

**Coverage:**

- v5.1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---

_Requirements defined: 2026-03-26_

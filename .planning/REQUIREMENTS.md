# Requirements: El Templo v5.0 — WhatsApp AI Chatbot

**Defined:** 2026-03-17
**Core Value:** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and can book classes and register for trials without human intervention.

## v5.0 Requirements

Requirements for WhatsApp AI chatbot milestone. Each maps to roadmap phases.

### Webhook & Infrastructure

- [x] **HOOK-01**: Bot receives incoming WhatsApp messages via Cloud API webhook (GET verify + POST handler)
- [x] **HOOK-02**: Bot sends text replies and template messages via Cloud API
- [x] **HOOK-03**: DB schema: whatsapp_conversations and whatsapp_messages tables with indexes (Drizzle migration)
- [x] **HOOK-04**: Bot process runs under PM2 alongside el-templo-api with auto-restart

### AI Processing

- [x] **AI-01**: Model-agnostic AiProvider interface with OpenAI and Anthropic implementations, selectable via env var
- [x] **AI-02**: System prompt with El Templo business context (schedules, pricing, locations, FAQ)
- [x] **AI-03**: check_schedule tool returns available classes for a given day/branch
- [x] **AI-04**: check_membership tool returns member subscription status and pricing info
- [x] **AI-05**: get_location tool returns branch address and Google Maps link
- [x] **AI-06**: request_human tool escalates conversation to human agent (sets status to human_takeover)
- [ ] **AI-07**: book_class tool reserves a class spot via el-templo-api localhost call with confirmation step
- [ ] **AI-08**: register_trial tool creates trial user via el-templo-api localhost call with confirmation step

### Memory & State

- [ ] **MEM-01**: Redis connection (ioredis) with fallback handling
- [ ] **MEM-02**: Session context stores last N messages + conversation facts in Redis (6h TTL), injected into AI context
- [ ] **MEM-03**: Customer profile persists data across conversations in Redis (90d TTL) — member status, preferences, injury notes
- [ ] **MEM-04**: Client state machine (LEAD → TRIAL → ACTIVE_MEMBER → INACTIVE_MEMBER → EXPIRED_MEMBER) auto-detected from DB

### Proactive Schedulers

- [ ] **SCHED-01**: Class reminder sends WhatsApp template message N hours before booked class (node-cron + Redis distributed lock)
- [ ] **SCHED-02**: Trial follow-up sends message 24-48h after trial attendance asking how it went + offering membership

### Admin Panel

- [ ] **ADMIN-01**: ConversacionesPage lists all conversations with search, status/state filters, and pagination
- [ ] **ADMIN-02**: ConversacionDetailPage shows chat bubble UI with full message history and member link
- [ ] **ADMIN-03**: Admin can take over a conversation (bot pauses) and send messages manually via Cloud API
- [ ] **ADMIN-04**: Admin can resume bot processing for a conversation after takeover
- [ ] **ADMIN-05**: WhatsApp sidebar menu item in AdminLayout with unread conversation badge

## Future Requirements (v5.1+)

### Proactive Schedulers Expansion

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

| Feature                             | Reason                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Baileys/BuilderBot                  | Reverse-engineered, unstable. Cloud API is official and production-proven |
| Message queue (BullMQ/RabbitMQ)     | Over-engineered at ~100 convs/day. Node.js async sufficient               |
| RAG/vector search for business info | System prompt sufficient — all business context fits in prompt            |
| Multi-language support              | Spanish only for now, all branches are Spanish-speaking                   |
| Voice message transcription         | Adds complexity, defer to v5.1+                                           |
| Payment processing via WhatsApp     | Payment gateway is v7.0+ scope                                            |

## Traceability

| Requirement | Phase    | Status   |
| ----------- | -------- | -------- |
| HOOK-01     | Phase 67 | Complete |
| HOOK-02     | Phase 67 | Complete |
| HOOK-03     | Phase 67 | Complete |
| HOOK-04     | Phase 67 | Complete |
| AI-01       | Phase 68 | Complete |
| AI-02       | Phase 68 | Complete |
| AI-03       | Phase 68 | Complete |
| AI-04       | Phase 68 | Complete |
| AI-05       | Phase 68 | Complete |
| AI-06       | Phase 68 | Complete |
| AI-07       | Phase 70 | Pending  |
| AI-08       | Phase 70 | Pending  |
| MEM-01      | Phase 69 | Pending  |
| MEM-02      | Phase 69 | Pending  |
| MEM-03      | Phase 69 | Pending  |
| MEM-04      | Phase 69 | Pending  |
| SCHED-01    | Phase 71 | Pending  |
| SCHED-02    | Phase 71 | Pending  |
| ADMIN-01    | Phase 72 | Pending  |
| ADMIN-02    | Phase 72 | Pending  |
| ADMIN-03    | Phase 73 | Pending  |
| ADMIN-04    | Phase 73 | Pending  |
| ADMIN-05    | Phase 72 | Pending  |

**Coverage:**

- v5.0 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---

_Requirements defined: 2026-03-17_
_Last updated: 2026-03-18 after Phase 69 planning — MEM-04 enum updated per CONTEXT.md decisions_

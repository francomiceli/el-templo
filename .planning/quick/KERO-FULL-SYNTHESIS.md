# Kero Full Context Synthesis & v5.3 Phase Plan

**Purpose:** Single reference document mapping all Kero context to actionable phases. Eliminates the need to re-read 9+ context files when planning v5.3 milestone.

**Date:** 2026-04-06
**Context files synthesized:** 9 sources + bot codebase + DB schema

---

## 1. What Exists Today

### Bot Infrastructure (el-templo-bot/src/)

| Component | File(s) | Status |
|-----------|---------|--------|
| Webhook | `webhook/handler.ts`, `webhook/routes.ts` | Working. Fastify server receives Meta webhook (GET verify + POST messages) |
| AI Providers | `ai/openai.ts`, `ai/anthropic.ts`, `ai/provider.ts` | Model-agnostic. OpenAI GPT-4o mini or Anthropic Haiku via `AI_PROVIDER` env var |
| System Prompt | `ai/system-prompt.ts` | Mica persona with Argentine tuteo. State-specific additive sections for 5 client states |
| Knowledge Base | `ai/knowledge.ts` | 12 sections: pricing, schedules, ROM, trial, app, policies, sales techniques, objections, retention, golden rules |
| Tools | `ai/tools.ts` | 6 tools: `check_schedule`, `check_membership`, `get_location`, `request_human`, `book_class`, `register_trial` |
| State Machine | `state/machine.ts` | 5 main states: lead, trial, active_member, inactive_member, expired_member. Determined by DB lookups (users + subscriptions + attendance). NO sub-states. |
| Session Memory | `memory/session.ts` | Redis, 6h TTL. Conversation facts for AI context. |
| Profile Memory | `memory/profile.ts` | Redis, 90d TTL. Persistent data across conversations. |
| Schedulers | `schedulers/class-reminder.ts`, `schedulers/trial-followup.ts` | 2 schedulers with distributed lock (`distributed-lock.ts`). Redis-based locking. |
| WhatsApp Client | `whatsapp/client.ts`, `whatsapp/types.ts` | Cloud API send message, send interactive (buttons), verify webhook. |
| DB Connection | `db.ts` | Drizzle ORM, shares MySQL with el-templo-api. |
| Redis | `redis.ts` | ioredis singleton. |

### DB Schema (el-templo-api/src/db/schema/whatsapp.ts)

**Existing tables:**

- `whatsapp_conversations`: id, phone (unique), contactName, status (active/human_takeover/closed), clientState (lead/trial/active_member/inactive_member/expired_member), assignedAdminId, linkedMemberId, lastMessageAt, createdAt, updatedAt
- `whatsapp_messages`: id, conversationId, direction (inbound/outbound_bot/outbound_human), content, messageType (text/image/audio/document/template), whatsappMessageId, metadata, rawPayload, createdAt

**Existing indexes:** status, linkedMemberId, lastMessageAt on conversations; (conversationId, createdAt) and whatsappMessageId on messages.

### Conversation Rules (added in v5.2)

Mica's system prompt includes conversation flow rules: max 3 questions before proposing, no quiz-style profiling, handle objections with empathy, escalate when stuck. State sections have sales-specific objectives per client state.

---

## 2. What Needs to Be Built (from context files)

### A) Sub-state Machine (kero-arquitectura.md Section 1)

**26 sub-states across 5 main states:**

| Main State | Sub-states |
|------------|------------|
| lead | lead_new, lead_in_discovery, lead_proposed, lead_warm, lead_cold, lead_dead |
| trial | trial_scheduled, trial_no_show, trial_attended, trial_proposed, trial_unconverted |
| active_member | onboarding_w1, onboarding_w3, onboarding_m1, active_regular, active_declining, active_renewing |
| inactive_member | inactive_recent, inactive_extended, inactive_paused |
| expired_member | expired_recent, expired_extended, expired_dormant |

**Transition table:** 30+ valid transitions with specific triggers (e.g., lead_new -> lead_in_discovery when Mica sends first discovery question). Invalid transitions are rejected.

**Implementation:**
- New column: `sub_status varchar(32)` on whatsapp_conversations (or a new contacts table -- decision pending)
- Migration script for existing contacts: map status to default sub-state (lead -> lead_new, trial -> trial_attended, active_member -> calculate from inscription_date, etc.)

### B) Tags System (kero-arquitectura.md Section 2)

**Three categories of tags:**

1. **Automatic tags (Mica assigns):** 16 tags
   - `perfil:*` (principiante, intermedio, gym_crossover, retorna)
   - `motivacion:*` (forma_fisica, skills, comunidad)
   - `skill_goal:X` (specific skill)
   - `objecion:*` (precio, tiempo, identidad, distancia)
   - `riesgo_churn_temprano`, `escalado_a_humano`, `refiere_activo`

2. **Manual tags (human team):** 5 tags
   - vip, influencer, problema_resuelto, problema_no_resuelto, no_contactar

3. **Origin tags:** 7 tags
   - `origen:*` (instagram, facebook, whatsapp_organico, meta_ads, referido, walk_in, reactivacion)

**New table:** `contact_tags` (N:N relationship: id, contact_id, tag, source, created_at)

**Dynamic segments:** Calculated queries on demand (not stored as tags). 7 segments defined: leads calientes, leads para reactivar, trials sin convertir, en riesgo de churn, renovacion pendiente, onboarding activo, churn temprano risk.

### C) Lead Scoring (kero-arquitectura.md Section 3)

**Acquisition score (0-100):**
- Point model: +10 first message, +15 completes discovery, +20 accepts trial, -5 per 24h silence, -30 "no me interesa"
- Thresholds: 0-15 frio, 16-35 tibio, 36-55 caliente, 56-75 muy caliente, 76-100 urgente (escalate to human)
- Decay: score * 0.9 every 7d without interaction, score * 0.7 every 30d, frozen at 90d

**Retention score (separate, for active members):**
- Factors: attendance frequency (+5/week for 3+x, -5/week for 0x), tenure bonuses, skill-goal bonus, referral bonus, downgrade penalty
- Thresholds: <20 alto riesgo, 20-40 riesgo medio, 41-60 estable, 61-80 fiel, 81-100 embajador

**New columns:** `score int default 10`, `retention_score int null` on contacts
**New table:** `scoring_events` (id, contact_id, event, points_delta, score_before, score_after, created_at)

### D) 6 Playbooks in System Prompt (kero-playbooks-completos.md)

All 6 playbooks fully documented with etapas, variants, conditional logic, objection handling, follow-up sequences, KPIs, and escalation rules:

| PB | Name | Pattern | Stages | Key KPIs |
|----|------|---------|--------|----------|
| 1 | Lead Nuevo | Discovery -> Framing -> Dolor -> Propuesta -> Trial -> Cierre | 7 etapas + 3 FU + objection handlers | Lead -> trial 40%+, lead -> active_member 15%+ |
| 2 | Trial No Convertido | Check-in -> Objecion -> Urgencia suave | 3 etapas + 2 FU | Trial -> active_member 40%+ |
| 3 | Vencimiento Membresia | Recordatorio -> Ancla -> Facilitar pago | 3 etapas + 3 FU (7d, 3d, dia, post-3d) | Renueva antes 80%+, renueva despues 35%+ |
| 4 | Miembro Inactivo | Empatia -> Escuchar -> Solucion suave | 2 etapas + 1 FU | Retoma 30%+ |
| 5 | Cancelacion | Escuchar -> Motivo real -> Alternativa -> Escalar | 3 etapas | Retencion 35%+ |
| 6 | Onboarding Nuevo Miembro | Dia1 -> Dia3 -> Dia7 -> Dia21 -> Dia30 | 5 etapas condicionales | Retencion 90d 65%+ |

**Key playbook features:**
- Each playbook has variant messages (A/B testing ready)
- Conditional logic based on DB queries (attendance, subscription status)
- Escalation rules for each etapa
- Max 3 discovery questions before proposing (lead PB)
- Conversational profiling, NOT quiz-style (per team decision in conversacion-team-sales-approach.md)

### E) 10 New Schedulers (kero-arquitectura.md Section 5)

| Scheduler | Cron | Action | Template(s) Used |
|-----------|------|--------|-----------------|
| lead_followup | Every 1h | Send FU per sequence | follow_up_24h/72h/cierre |
| trial_sequence | Every 1h | Post-trial sequence | post_trial_48h/contenido/cierre |
| renewal_reminder | Daily 10:00 | Renewal reminders | recordatorio_vencimiento_* |
| post_expiry | Daily 10:00 | Post-expiry follow-up | post_vencimiento_3d |
| inactivity_check | Daily 10:00 | State change + check-in | checkin_inactivo_30d |
| inactivity_followup | Daily 10:00 | Second check-in | checkin_inactivo_45d |
| onboarding_sequence | Every 1h | Onboarding messages by day | onboarding_semana1/3/mes1 |
| score_decay | Daily 03:00 | Apply score decay | -- (internal) |
| frequency_check | Daily 03:00 | Detect frequency drops | -- (internal) |
| reactivation_campaign | Manual (admin) | Template reactivation | reactivacion_*/estacionales |

**scheduled_actions queue:** When Mica completes a stage and next step is temporal, creates a row in scheduled_actions. Schedulers execute at scheduled time. Critical rule: if contact responds before scheduled action executes, ALL pending actions for that contact are auto-cancelled.

### F) 19 WhatsApp Templates (kero-templates-meta.md)

| # | Name | Category | Playbook | Trigger |
|---|------|----------|----------|---------|
| 1 | follow_up_24h | MARKETING | 1 | 24h no response |
| 2 | follow_up_72h | MARKETING | 1 | 72h no response |
| 3 | follow_up_cierre | MARKETING | 1 | 7d no response |
| 4 | reactivacion_60d | MARKETING | Reactivation | 60d cold lead |
| 5 | reactivacion_masiva | MARKETING | Reactivation | 120+d cold lead |
| 6 | post_trial_48h | MARKETING | 2 | 48h post trial |
| 7 | trial_contenido_valor | MARKETING | 2 | 5d post trial |
| 8 | trial_cierre_14d | MARKETING | 2 | 14d post trial |
| 9 | recordatorio_vencimiento_7d | UTILITY | 3 | 7d before expiry |
| 10 | recordatorio_vencimiento_dia | UTILITY | 3 | Day of expiry |
| 11 | post_vencimiento_3d | UTILITY | 3 | 3d after expiry |
| 12 | checkin_inactivo_30d | UTILITY | 4 | 30d inactive |
| 13 | checkin_inactivo_45d | UTILITY | 4 | 45d inactive |
| 14 | campana_enero | MARKETING | Seasonal | 1st week Jan |
| 15 | campana_preverano | MARKETING | Seasonal | 1st week Oct |
| 16 | campana_marzo | MARKETING | Seasonal | 1st week Mar |
| 17 | onboarding_semana1 | UTILITY | 6 | 7d post inscription |
| 18 | onboarding_semana3 | UTILITY | 6 | 21d post inscription |
| 19 | onboarding_mes1 | UTILITY | 6 | 30d post inscription |

**Category split:** 10 MARKETING, 9 UTILITY. UTILITY templates don't impact WhatsApp quality score.
**All templates include variables** ({{1}} = name, {{2}} = date/gym where applicable) and quick-reply buttons.
**Meta approval takes 24-48h.** Submit all at once. If rejected, adjust copy tone or change category.

### G) Anti-spam Rules (kero-arquitectura.md Section 6)

**Rate limiting (Redis):**
- Max 1 template/day per contact (Redis INCR + TTL 24h)
- Max 3 templates/week per contact (Redis INCR + TTL 7d)
- Max 3 consecutive reactive messages without response
- 60d cooldown between funnels post-no-conversion
- Max 2 reactivation campaigns per cold lead

**Allowed hours (Argentina timezone UTC-3):**
- Reactive: any time (immediate response)
- Proactive: Mon-Fri 9:00-21:00, Sat 10:00-18:00, Sun only UTILITY
- Outside window: reschedule for 10:00 next day

**WhatsApp Quality Score protection:**
- "No gracias" rate >3%: pause campaign
- Block/report rate >1%: pause ALL MARKETING for 7d
- Meta drops to YELLOW: max 1 template/week
- Meta drops to RED: stop all proactive, reactive only

### H) Dashboard/Admin Panel (kero-arquitectura.md Section 7)

**5 views needed (el-templo-admin uses Quasar + Vue 3, NOT Angular as doc states):**

1. **Dashboard:** Funnel visual, active alerts, 30d trend graph
2. **Conversations (enhance existing):** Add sub-state column, score column with color coding, filter by playbook/tags, escalation badge
3. **Pipeline (new):** Kanban by sub-state, cards with name/score/last message, drag & drop with audit log
4. **Campaigns (new):** Template metrics (sent/delivered/read/responded), create campaign (segment + template + date), WA quality score
5. **Metrics (new):** Tabs by section (acquisition, conversion, onboarding, retention, Mica performance), period selector, comparison, CSV export

**Metrics defined:** 35+ metrics across 5 categories (acquisition, conversion, onboarding, retention, Mica performance) with calculation formulas and frequencies.

### I) Avatar Profiling (onboarding-quiz-avatars.md + conversacion-team-sales-approach.md)

**Original:** 11 avatars (A-K) with detailed resolution logic from 5 quiz questions.

**Team decision (per conversacion-team-sales-approach.md):** Conversational profiling, NOT quiz. Mica profiles through natural discovery questions during PB1. "Si le enchufas una encuesta se va."

**Simplified for Mica:** 4 avatar profiles:

| Avatar | Description | Detection |
|--------|-------------|-----------|
| cero_absoluto | Never trained | Discovery: "nunca entrene", principiante signals |
| gym_crossover | Comes from another sport/gym | Discovery: gym/running/other experience |
| intermedio | Already does calisthenics | Discovery: mentions skills, experience |
| retorna | Returning after pause | Existing profile in Redis/MySQL |

**New column:** `avatar varchar(32)` on contacts table

**Quiz-avatar mapping still useful** for the mobile app onboarding (separate from WhatsApp bot), but Mica doesn't use quiz format.

### J) DB Migrations (kero-arquitectura.md Section 8)

See Section 4 below for complete list.

---

## 3. Suggested v5.3 Phase Breakdown (Ordered by Impact)

### Phase 1: DB Schema + Sub-state Machine + Tags

**Complexity:** MEDIUM (3-4 plans)
**Revenue impact:** Foundation for all revenue-generating features
**What gets built:**
- 6 new tables: scheduled_actions, state_transitions, playbook_executions, scoring_events, templates_sent, contact_tags
- ~12 new columns on whatsapp_conversations (or new contacts table)
- Sub-state transition logic in state/machine.ts
- Migration script for existing contacts (map current status to default sub-state)
- Tag CRUD operations
- Tests for transitions and tag operations

**Dependencies:** None (foundation)
**Key risk:** Deciding whether sub_status goes on whatsapp_conversations or a new contacts table

---

### Phase 2: Playbook System Prompt + Conversational Discovery

**Complexity:** MEDIUM (2-3 plans)
**Revenue impact:** HIGH -- directly improves lead conversion and retention
**What gets built:**
- Expand system-prompt.ts with 6 playbook-specific behavior sections
- Playbook-aware state sections (replace current 5 generic state sections)
- Conversational profiling logic (avatar detection during discovery)
- Tag assignment during conversation (auto-tags from discovery responses)
- Update knowledge.ts with playbook-specific data (follow-up rules, escalation triggers)
- Playbook execution tracking (playbook_executions table writes)

**Dependencies:** Phase 1 (sub-states, tags)
**Key risk:** Prompt engineering complexity -- 6 playbooks with conditional logic in a single system prompt may need careful testing

---

### Phase 3: Lead Scoring Engine

**Complexity:** MEDIUM (2-3 plans)
**Revenue impact:** MEDIUM -- enables prioritization but not direct revenue
**What gets built:**
- Score calculation on events (incoming message, discovery completed, trial accepted, etc.)
- Score decay scheduler (daily 03:00 cron)
- Retention score for active members (separate calculation)
- scoring_events table writes for audit
- Score thresholds triggering actions (notify team at 76+, auto-escalate at urgente)
- Frequency check scheduler (detect declining attendance)

**Dependencies:** Phase 1 (scoring_events table, score columns)
**Key risk:** Tuning score thresholds -- will need real-world data to calibrate

---

### Phase 4: Scheduler Suite (Templates + Follow-ups)

**Complexity:** HIGH (4-5 plans)
**Revenue impact:** HIGH -- automates the entire follow-up funnel
**What gets built:**
- Submit 19 templates to Meta for approval (human action checkpoint)
- Template sending via WhatsApp Cloud API (template message format)
- 10 new schedulers with scheduled_actions queue
- Anti-spam rate limiting in Redis (daily/weekly counters, cooldowns)
- Cooldown management (60d between funnels, 30d post-cancellation)
- Auto-cancel pending actions when contact responds
- Timezone-aware scheduling (Argentina UTC-3, allowed hours)
- WhatsApp quality score monitoring

**Dependencies:** Phase 1 (scheduled_actions table, templates_sent table), Phase 2 (playbook awareness for correct template selection)
**Key risk:** Meta template approval (24-48h per batch, may need copy adjustments). Anti-spam complexity.

---

### Phase 5: Onboarding Sequence (PB6)

**Complexity:** MEDIUM (2-3 plans)
**Revenue impact:** HIGH -- reduces churn in critical first 30 days
**What gets built:**
- Onboarding scheduler (day 1, 3, 7, 21, 30 messages)
- Attendance-based conditional messaging (different message for 2+ vs 1 vs 0 classes)
- Churn risk detection (riesgo_churn_temprano tag at day 21)
- Escalation to human for high-risk cases
- 3 onboarding templates (semana1, semana3, mes1)
- Sub-state transitions (onboarding_w1 -> onboarding_w3 -> onboarding_m1 -> active_regular)

**Dependencies:** Phase 1 (sub-states), Phase 2 (playbook prompt), Phase 4 (scheduler infrastructure, template sending)
**Key risk:** Attendance data accuracy -- requires reliable check-in integration

---

### Phase 6: Admin Panel -- Pipeline + Campaigns + Metrics

**Complexity:** HIGH (4-5 plans)
**Revenue impact:** MEDIUM -- operational visibility, not direct revenue
**What gets built:**
- Pipeline kanban view (new page in el-templo-admin)
- Campaign management (template sending with dynamic segments)
- Enhanced conversation list (sub-state, score, tags columns)
- Metrics dashboard (35+ metrics across 5 categories)
- API endpoints for all new admin features
- CSV export for metrics

**Dependencies:** Phase 1 (sub-states, tags, scoring), Phase 4 (templates_sent data for campaign metrics)
**Key risk:** Scope creep -- admin panel features can expand indefinitely. Keep v5.3 focused on pipeline + basic metrics.

---

## 4. DB Migrations Needed (Complete List)

### New Tables

| Table | Purpose | Key Columns | Indexes |
|-------|---------|-------------|---------|
| scheduled_actions | Queue for temporal actions | id, contact_id, type, playbook, stage, template_name, scheduled_at, sent, sent_at, cancelled, cancelled_reason, created_at | (scheduled_at, sent, cancelled) |
| state_transitions | Audit log of state changes | id, contact_id, from_status, from_sub_status, to_status, to_sub_status, trigger, playbook, metadata (JSON), created_at | (contact_id, created_at) |
| playbook_executions | Playbook run tracking | id, contact_id, playbook, started_at, completed_at, result (converted/no_response/escalated/opted_out), stages_completed (JSON), metadata (JSON) | (playbook, started_at) |
| scoring_events | Score change log | id, contact_id, event, points_delta, score_before, score_after, created_at | (contact_id, created_at) |
| templates_sent | Meta template send log | id, contact_id, template_name, playbook, stage, sent_at, delivered, read, responded, responded_at, opted_out | (template_name, sent_at) |
| contact_tags | N:N contact-tag | id, contact_id, tag, source (mica/admin/system), created_at | UNIQUE(contact_id, tag), (tag) |

### New Columns on Existing Table

Target table: `whatsapp_conversations` (or new `contacts` table -- decision pending).

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| sub_status | varchar(32) | 'lead_new' | Sub-state of the contact |
| score | int | 10 | Acquisition score (0-100) |
| retention_score | int | null | Retention score (active members only) |
| avatar | varchar(32) | null | cero_absoluto, gym_crossover, intermedio, retorna |
| origin_channel | varchar(32) | null | Source channel |
| referred_by | varchar(64) | null | Referrer contact_id |
| inscription_date | datetime | null | When became active_member |
| trial_date | datetime | null | Trial class date |
| last_attendance | datetime | null | Last attendance check-in |
| weekly_frequency | float | null | Avg classes/week (calculated) |
| reactivation_attempts | int | 0 | Reactivation attempt count |
| last_reactivation_at | datetime | null | Last reactivation attempt |

### Indexes on New Columns

| Index Name | Table | Columns | Purpose |
|------------|-------|---------|---------|
| idx_contacts_status | contacts | status, sub_status | Dynamic segments |
| idx_contacts_score | contacts | status, score | Dynamic segments |
| idx_contacts_last_int | contacts | last_interaction | Dynamic segments |
| idx_contacts_memb_end | contacts | membership_end_date | Renewal scheduler |
| idx_contacts_last_att | contacts | last_attendance | Inactivity scheduler |

---

## 5. New Schedulers Needed (Complete List)

| Scheduler | Cron | Action | Template(s) Used | Dependencies |
|-----------|------|--------|-----------------|--------------|
| lead_followup | Every 1h | Check scheduled_actions for pending lead FUs, send per sequence | follow_up_24h, follow_up_72h, follow_up_cierre | scheduled_actions table, template approval |
| trial_sequence | Every 1h | Post-trial follow-up sequence | post_trial_48h, trial_contenido_valor, trial_cierre_14d | scheduled_actions, template approval |
| renewal_reminder | Daily 10:00 | Find members in 7d/3d/day-of renewal window | recordatorio_vencimiento_7d, recordatorio_vencimiento_dia | membership_end_date column |
| post_expiry | Daily 10:00 | Find expired members (3d post) | post_vencimiento_3d | membership_end_date column |
| inactivity_check | Daily 10:00 | Find 30d inactive, change sub_status, send check-in | checkin_inactivo_30d | last_attendance column, sub_status |
| inactivity_followup | Daily 10:00 | Find 45d inactive (15d after first check-in) | checkin_inactivo_45d | inactivity_check must have run |
| onboarding_sequence | Every 1h | Send day-based messages (d1, d3, d7, d21, d30) with attendance logic | onboarding_semana1, onboarding_semana3, onboarding_mes1 | inscription_date, attendance data |
| score_decay | Daily 03:00 | Recalculate scores with decay (* 0.9 per 7d, * 0.7 per 30d) | -- (internal) | score column |
| frequency_check | Daily 03:00 | Detect attendance frequency drops, update active_declining | -- (internal) | weekly_frequency, last_attendance |
| reactivation_campaign | Manual trigger from admin | Send template to selected segment | reactivacion_60d, reactivacion_masiva, campana_* | Admin panel campaign UI |

**All schedulers share:** Distributed Redis lock (existing pattern in distributed-lock.ts), anti-spam rate limiting checks, timezone-aware sending (Argentina UTC-3).

---

## 6. System Prompt Changes Needed

### system-prompt.ts Changes

**Current:** Single system prompt with 5 state-specific additive sections (one paragraph each for lead, trial, active_member, inactive_member, expired_member).

**Needed:** Expand state sections to be playbook-aware:

1. **Replace STATE_SECTIONS** with playbook-driven sections that include:
   - Current playbook and stage awareness (e.g., "You are in PB1 Etapa 2A -- ask about motivation")
   - Stage-specific objectives and response templates
   - Conditional logic instructions based on sub-state
   - Objection handling scripts per playbook
   - Escalation triggers per stage
   - Follow-up sequencing instructions

2. **Add conversational profiling instructions:**
   - Profile through natural conversation (max 3 questions)
   - Map responses to 4 avatar profiles
   - Assign tags based on detected profile/motivation/objection
   - Adapt framing per avatar (cero_absoluto = aspiracional, gym_crossover = desafio, etc.)

3. **Add anti-spam awareness:**
   - Check if within follow-up limits before sending
   - Respect cooldown periods
   - Don't send proactive outside allowed hours

### knowledge.ts Changes

**Current:** 12 sections of business data.

**Needed additions:**
- Playbook-specific sales scripts (variants A/B for each stage)
- Avatar-specific framing guidance
- Follow-up timing rules
- Escalation trigger list with priority levels
- Onboarding milestone benchmarks (attendance targets per week)
- KPI targets for self-evaluation

---

## 7. Templates to Submit to Meta

| # | Name | Category | Body (Spanish) | Variables | Buttons | Playbook | Trigger |
|---|------|----------|---------------|-----------|---------|----------|---------|
| 1 | follow_up_24h | MARKETING | "[name]! Llegaste a ver el mensaje? Si tenes alguna duda sobre las clases de calistenia, consultame" | {{1}}=name | "Si, contame mas" / "Ahora no, gracias" | PB1 | 24h no response |
| 2 | follow_up_72h | MARKETING | "Ey [name], solo queria saber si seguis con ganas de probar calistenia..." | {{1}}=name | "Si, quiero probar!" / "Por ahora no" | PB1 | 72h no response |
| 3 | follow_up_cierre | MARKETING | "[name], te dejo la puerta abierta..." | {{1}}=name | None (closure) | PB1 | 7d no response |
| 4 | reactivacion_60d | MARKETING | "Hola [name]! Hace un tiempo nos consultaste por calistenia..." | {{1}}=name | "Si, quiero probar" / "No, gracias" | Reactivation | 60d cold lead |
| 5 | reactivacion_masiva | MARKETING | "[name], en [gym] estamos arrancando grupos nuevos..." | {{1}}=name, {{2}}=gym | "Contame mas" / "No me interesa" | Reactivation | 120+d cold |
| 6 | post_trial_48h | MARKETING | "[name], te cuento que esta semana arranca un grupo nuevo..." | {{1}}=name | "Si, me interesa" / "Todavia no" | PB2 | 48h post trial |
| 7 | trial_contenido_valor | MARKETING | "Ey [name], te comparto un tip para arrancar con calistenia..." | {{1}}=name | "Quiero arrancar" / "Tengo una duda" | PB2 | 5d post trial |
| 8 | trial_cierre_14d | MARKETING | "[name], fue un gusto que vinieras a probar..." | {{1}}=name | None (closure) | PB2 | 14d post trial |
| 9 | recordatorio_vencimiento_7d | UTILITY | "[name]! Se te viene la renovacion el [date]..." | {{1}}=name, {{2}}=date | "Renuevo el mismo" / "Quiero ver opciones" | PB3 | 7d before expiry |
| 10 | recordatorio_vencimiento_dia | UTILITY | "[name], tu plan vence hoy..." | {{1}}=name | "Si, renuevo" / "Tengo una duda" | PB3 | Day of expiry |
| 11 | post_vencimiento_3d | UTILITY | "Ey [name], se vencio tu plan hace unos dias..." | {{1}}=name | "Quiero reactivar" / "Por ahora no" | PB3 | 3d post expiry |
| 12 | checkin_inactivo_30d | UTILITY | "[name]! Todo bien? Hace rato que no te vemos por el gym..." | {{1}}=name | "Estoy bien, ya vuelvo" / "Necesito hablar" | PB4 | 30d inactive |
| 13 | checkin_inactivo_45d | UTILITY | "[name], te extranamos por aca..." | {{1}}=name | "Si, agendame" / "Ahora no puedo" | PB4 | 45d inactive |
| 14 | campana_enero | MARKETING | "[name]! Ano nuevo, desafio nuevo..." | {{1}}=name, {{2}}=gym | "Quiero probar" / "No, gracias" | Seasonal | 1st week Jan |
| 15 | campana_preverano | MARKETING | "[name], se viene el verano y en [gym] hay lugar..." | {{1}}=name, {{2}}=gym | "Me interesa" / "No, gracias" | Seasonal | 1st week Oct |
| 16 | campana_marzo | MARKETING | "[name]! Volvieron las clases y hay cupos nuevos..." | {{1}}=name | "Si, agendame" / "Todavia no" | Seasonal | 1st week Mar |
| 17 | onboarding_semana1 | UTILITY | "[name]! Primera semana completada. Ya viniste [count] veces..." | {{1}}=name, {{2}}=count | "Muy bien" / "Tengo una duda" | PB6 | 7d post inscription |
| 18 | onboarding_semana3 | UTILITY | "Tres semanas [name]! Ya sos parte del equipo..." | {{1}}=name | "Si, tengo un objetivo" / "Estoy bien asi" | PB6 | 21d post inscription |
| 19 | onboarding_mes1 | UTILITY | "[name]! Un mes entrenando calistenia..." | {{1}}=name | "Si, quiero un objetivo" / "Seguir como vengo" | PB6 | 30d post inscription |

**Submission recommendation:** Submit all 19 together. Meta typically takes 24-48h. If any are rejected, usually due to UTILITY copy being too promotional -- adjust tone or switch to MARKETING category.

---

## 8. Estimated Complexity Summary

| Phase | Plans Est. | Key Risk | Dependencies | Revenue Impact |
|-------|-----------|----------|--------------|----------------|
| Phase 1: DB + Sub-states + Tags | 3-4 | Table design decision (contacts vs conversations) | None | Foundation |
| Phase 2: Playbook Prompt + Discovery | 2-3 | Prompt engineering complexity | Phase 1 | HIGH |
| Phase 3: Lead Scoring | 2-3 | Threshold calibration | Phase 1 | MEDIUM |
| Phase 4: Scheduler Suite | 4-5 | Meta template approval, anti-spam complexity | Phase 1, 2 | HIGH |
| Phase 5: Onboarding (PB6) | 2-3 | Attendance data reliability | Phase 1, 2, 4 | HIGH |
| Phase 6: Admin Panel | 4-5 | Scope creep | Phase 1, 4 | MEDIUM |

**Total estimated plans:** 17-23
**Critical path:** Phase 1 -> Phase 2 -> Phase 4 -> Phase 5
**Parallelizable:** Phase 3 can run alongside Phase 2. Phase 6 can start partially after Phase 1.

---

## 9. Key Design Decisions Pending

### Decision 1: contacts table vs whatsapp_conversations for sub_status

**Context:** kero-arquitectura.md references a `contacts` table. The current codebase uses `whatsapp_conversations` with phone as unique key. The architecture doc adds 12 columns to a `contacts` table.

**Options:**
- **A) Add columns to whatsapp_conversations:** Simpler, no new table, but overloads the conversations table with CRM data.
- **B) Create new contacts table:** Clean separation of CRM data from conversation data. whatsapp_conversations links to contacts. Closer to kero-arquitectura design.
- **C) Use existing users table:** Members already have a users row. Add CRM columns there and create a contacts row only for non-user leads.

**Recommendation:** Option B. A contacts table is the natural CRM entity. It separates conversation state (active/closed/takeover) from client lifecycle state (sub-status, score, avatar). whatsapp_conversations gets a FK to contacts.

### Decision 2: Admin panel scope for v5.3

**Context:** The architecture doc defines 5 admin views. Building all 5 is a large effort.

**Options:**
- **A) All 5 views:** Full Kero admin experience. 4-5 plans, significant frontend work.
- **B) Pipeline + Enhanced Conversations only:** Most impactful for daily operations. 2-3 plans.
- **C) Pipeline + Conversations + Basic Metrics:** Middle ground. 3-4 plans.

**Recommendation:** Option B for v5.3, defer campaigns and metrics to v5.4. Pipeline kanban is the killer feature for the sales team.

### Decision 3: Playbook in prompt vs structured playbook engine

**Context:** Current system prompt is a single string with state sections. Adding 6 playbooks with conditional logic, variants, and stage tracking to a single prompt may get unwieldy.

**Options:**
- **A) Everything in system prompt:** Simpler to implement. AI handles all logic. May degrade with prompt length.
- **B) Structured playbook engine:** Code determines current playbook and stage, injects only relevant prompt section. More reliable state management.

**Recommendation:** Option B. A playbook engine in code selects the active playbook and stage, then injects only the relevant section into the system prompt. This keeps the prompt focused and enables reliable stage tracking with DB persistence.

### Decision 4: Template integration architecture

**Context:** WhatsApp Cloud API template messages have a different format than free-form messages. Need to decide how templates integrate with the bot flow.

**Options:**
- **A) Bot sends templates directly:** Bot process handles template API calls alongside regular messages.
- **B) Templates via API:** Bot calls el-templo-api which handles template sending, logging to templates_sent table.

**Recommendation:** Option A. Templates are part of the bot's outbound messaging. Keep template sending in el-templo-bot alongside regular Cloud API calls. Log to templates_sent table directly.

### Decision 5: Score thresholds -- ship with defaults or wait for data?

**Recommendation:** Ship with documented defaults from kero-arquitectura.md. Calibrate after 2-4 weeks of real data. Make thresholds configurable (env vars or config table).

---

## 10. Reference: dolores/ PDFs

The `contexto/dolores/` directory contains 9 creative asset PDFs for avatar-specific marketing:

### Avatar Creative Assets (3 PDFs)
- **CREATIVOS-EL-TEMPLO-ABC.pdf** -- Avatars A, B, C (Cero absoluto, Gym crossover, Mujer hostil al gym)
- **CREATIVOS-EL-TEMPLO-DEFG.pdf** -- Avatars D, E, F, G (Yogui, Cardio addict, Gym advanced, Comunidad)
- **CREATIVOS-EL-TEMPLO-HIJK.pdf** -- Avatars H, I, J, K (Longevity, Intermediate calisthenics, Piernas/gluteos, Young woman)

### Program-Specific Creative Assets (4 PDFs)
- **CREATIVOS-P1-CREA-EL-HABITO.pdf** -- Step 0: "Crea el habito" program (for beginners, avatar A)
- **CREATIVOS-P2-PIERNAS-GLUTEOS.pdf** -- Step 2A: Piernas y gluteos program (avatar J)
- **CREATIVOS-P3-CERO-A-ATLETA.pdf** -- Step 2B: "De cero a atleta" program (avatar B/F)
- **CREATIVOS-P4-FRONT-LEVER.pdf** -- Step 2C: Front lever program (advanced)

### Pain Point Research (2 PDFs)
- **dolores_psicologicos.pdf** -- Psychological pain points by avatar (fear of judgment, lack of motivation, identity friction, time anxiety)
- **dolores_extras.pdf** -- Additional pain points (logistical barriers, past failure trauma, social anxiety)

**Relevance to Mica:** These PDFs inform the conversational profiling and framing logic. Mica uses avatar-specific pain point knowledge to frame proposals. The 11 original avatars are simplified to 4 profiles for the bot (cero_absoluto, gym_crossover, intermedio, retorna), but the underlying pain point intelligence drives how Mica frames each proposal.

**No code changes required** from these PDFs -- they are marketing/content reference material that feeds into knowledge.ts and system-prompt.ts framing logic.

---

## Context Source Index

| # | Source File | Key Content | Used In Sections |
|---|------------|-------------|-----------------|
| 1 | contexto/kero-arquitectura.md (.docx) | Full CRM architecture: sub-states, tags, scoring, schedulers, anti-spam, admin panel, DB schema | 2A-2H, 3-8 |
| 2 | contexto/kero-playbooks-completos.md | 6 playbooks with full scripts, objection handling, KPIs, escalation rules | 2D |
| 3 | contexto/kero-templates-meta.md | 19 WhatsApp templates for Meta approval | 2F, 7 |
| 4 | contexto/onboarding-quiz-avatars.md | 11 avatars, quiz logic, avatar resolution table | 2I |
| 5 | contexto/conversacion-team-sales-approach.md | Team decision: conversational profiling over quiz | 2I |
| 6 | contexto/conversaciones-reales-referencia.md | Real conversation examples (successful + failed) | 2D (playbook validation) |
| 7 | contexto/whatsapp-bot-developer-handoff.md | Bot architecture, patterns, development phases | 1 |
| 8 | contexto/el-templo-business-data.md | Pricing, bot scripts, procedures, policies | 1 (knowledge.ts) |
| 9 | contexto/dolores/*.pdf | Creative assets, pain points by avatar | 10 |
| 10 | el-templo-bot/src/ | Existing bot codebase | 1 |
| 11 | el-templo-api/src/db/schema/whatsapp.ts | Existing DB schema | 1 |

---
phase: quick-9
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/KERO-FULL-SYNTHESIS.md
autonomous: true
requirements: [SYNTH-01]

must_haves:
  truths:
    - "Comprehensive synthesis document exists mapping all Kero context to actionable phases"
    - "Every context file is accounted for in the synthesis"
    - "Phase breakdown is ordered by business impact with estimated complexity"
  artifacts:
    - path: ".planning/quick/KERO-FULL-SYNTHESIS.md"
      provides: "Unified Kero analysis and v5.3 phase plan"
      min_lines: 200
  key_links: []
---

<objective>
Read and synthesize ALL Kero-related context files into a unified analysis document that maps what exists today vs what needs to be built, with a suggested v5.3 phase breakdown.

Purpose: Create a single reference document that eliminates the need to re-read 9+ context files when planning v5.3 milestone.
Output: `.planning/quick/KERO-FULL-SYNTHESIS.md`
</objective>

<execution_context>
@/Users/bores/.claude/get-shit-done/workflows/execute-plan.md
@/Users/bores/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@contexto/kero-playbooks-completos.md
@contexto/kero-templates-meta.md
@contexto/kero-arquitectura.md (NOTE: this is a .docx file despite .md extension — extract with zipfile+xml)
@contexto/onboarding-quiz-avatars.md
@contexto/conversacion-team-sales-approach.md
@contexto/conversaciones-reales-referencia.md
@contexto/whatsapp-bot-developer-handoff.md
@contexto/el-templo-business-data.md
@contexto/dolores/*.pdf (business model creative assets — read for pain point/avatar data)
@el-templo-bot/src/ (existing bot codebase)
@el-templo-api/src/db/schema/whatsapp.ts (existing DB schema)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Synthesize all Kero context into unified analysis and v5.3 phase plan</name>
  <files>.planning/quick/KERO-FULL-SYNTHESIS.md</files>
  <action>
Read ALL context files listed below. For kero-arquitectura.md, use python3 zipfile extraction (it is a .docx). For PDFs in dolores/, attempt python3 extraction or note them as creative asset references.

Create `.planning/quick/KERO-FULL-SYNTHESIS.md` with these sections:

## 1. What Exists Today
Map the current codebase state from el-templo-bot/src/:
- Bot infrastructure: webhook, AI providers (OpenAI + Anthropic), system prompt with Mica persona
- State machine: 5 states (lead, trial, active_member, inactive_member, expired_member) — NO sub-states
- Memory: Redis session (6h TTL) + profile (90d TTL)
- Tools: check_schedule, check_membership, get_location, request_human, book_class, register_trial
- Schedulers: class_reminder, trial_followup (+ distributed lock)
- DB schema: whatsapp_conversations + whatsapp_messages tables
- Knowledge: 12 sections of business data in knowledge.ts
- System prompt: Mica persona with state-specific sections, conversation rules

## 2. What Needs to Be Built (from context files)
Map the gap between current state and kero-arquitectura.md:

A) **Sub-state machine** (kero-arquitectura.md Section 1):
   - 26 sub-states across 5 main states
   - New column: sub_status varchar(32) on contacts/conversations table
   - State transitions table with valid transitions
   - Migration script for existing contacts

B) **Tags system** (kero-arquitectura.md Section 2):
   - Automatic tags (perfil:*, motivacion:*, objecion:*, etc.)
   - Manual tags (vip, influencer, etc.)
   - Origin tags (origen:instagram, etc.)
   - New table: contact_tags (N:N)
   - Dynamic segments (calculated queries, not stored)

C) **Lead scoring** (kero-arquitectura.md Section 3):
   - Acquisition score (0-100) with point model
   - Retention score (separate, for active members)
   - Score decay (cron: daily at 03:00)
   - Action thresholds (cold/warm/hot/urgent)
   - New columns: score, retention_score on contacts
   - New table: scoring_events

D) **6 Playbooks in system prompt** (kero-playbooks-completos.md):
   - PB1: Lead nuevo (discovery -> framing -> dolor -> propuesta -> trial -> cierre)
   - PB2: Trial no convertido (check-in -> objecion -> urgencia suave)
   - PB3: Vencimiento membresia (recordatorio -> ancla -> facilitar pago)
   - PB4: Miembro inactivo (empatia -> escuchar -> solucion suave)
   - PB5: Cancelacion (escuchar -> motivo real -> alternativa -> escalar)
   - PB6: Onboarding nuevo miembro (dia1 -> dia3 -> dia7 -> dia21 -> dia30)

E) **10 new schedulers** (kero-arquitectura.md Section 5):
   - lead_followup, trial_sequence, renewal_reminder, post_expiry
   - inactivity_check, inactivity_followup, onboarding_sequence
   - score_decay, frequency_check
   - reactivation_campaign (manual trigger from admin)
   - Scheduled actions queue table

F) **19 WhatsApp templates** (kero-templates-meta.md):
   - 5 lead templates, 3 trial templates, 3 vencimiento templates
   - 2 inactivity templates, 3 seasonal templates, 3 onboarding templates
   - Must be submitted to Meta for approval

G) **Anti-spam rules** (kero-arquitectura.md Section 6):
   - Rate limiting (Redis): 1 template/day, 3/week per contact
   - Cooldowns between funnels (60d)
   - Allowed hours (9-21 Argentina)
   - WhatsApp quality score protection

H) **Dashboard/Admin panel** (kero-arquitectura.md Section 7):
   - 5 new views: Dashboard, Conversations (enhance), Pipeline (kanban), Campaigns, Metrics
   - Metrics: acquisition, conversion, onboarding, retention, Mica performance
   - NOTE: Admin panel uses Quasar + Vue 3, not Angular as mentioned in doc

I) **Avatar profiling** (onboarding-quiz-avatars.md + conversacion-team-sales-approach.md):
   - 11 avatars simplified to 4 profiles for Mica
   - Conversational profiling (NOT quiz-style) per team decision
   - Profile detection during discovery questions
   - New column: avatar varchar(32) on contacts

J) **DB migrations** (kero-arquitectura.md Section 8):
   - 6 new tables: scheduled_actions, state_transitions, playbook_executions, scoring_events, templates_sent, contact_tags
   - ~12 new columns on contacts/conversations table
   - Recommended indexes for all new tables

## 3. Suggested v5.3 Phase Breakdown (ordered by impact)
Create phases ordered by: revenue impact first, infrastructure second, nice-to-haves last.

Phase 1: DB Schema + Sub-state Machine + Tags
- Complexity: MEDIUM (3-4 plans)
- New tables, migrations, sub-state column, contact_tags
- State transition logic + migration script for existing data
- Foundation for everything else

Phase 2: Playbook System Prompt + Conversational Discovery
- Complexity: MEDIUM (2-3 plans)
- Expand system prompt with 6 playbook behaviors
- Conversational profiling (avatar detection)
- Tag assignment during conversation
- Update knowledge.ts with playbook-specific data

Phase 3: Lead Scoring Engine
- Complexity: MEDIUM (2-3 plans)
- Score calculation on events
- Score decay scheduler
- Retention score for members
- scoring_events table + score columns

Phase 4: Scheduler Suite (Templates + Follow-ups)
- Complexity: HIGH (4-5 plans)
- Submit 19 templates to Meta (human action)
- Implement template sending via Cloud API
- 10 new schedulers with scheduled_actions queue
- Anti-spam rate limiting in Redis
- Cooldown management

Phase 5: Onboarding Sequence (PB6)
- Complexity: MEDIUM (2-3 plans)
- Onboarding scheduler (day 1, 3, 7, 21, 30)
- Attendance-based conditional messaging
- Churn risk detection (riesgo_churn_temprano tag)
- 3 onboarding templates

Phase 6: Admin Panel — Pipeline + Campaigns
- Complexity: HIGH (4-5 plans)
- Pipeline kanban view (new page)
- Campaign management (template sending with segments)
- Enhanced conversation list (sub-state, score columns)
- Metrics dashboard (acquisition, conversion, retention, Mica performance)

## 4. DB Migrations Needed (complete list)
List every table and column change with Drizzle migration details.

## 5. New Schedulers Needed (complete list)
Table with: name, cron expression, action, template used, dependencies.

## 6. System Prompt Changes Needed
Detail what changes to system-prompt.ts and knowledge.ts for playbook support.

## 7. Templates to Submit to Meta
Table of all 19 templates with: name, category, playbook, trigger.

## 8. Estimated Complexity Summary
Table with: phase, plans estimate, key risk, dependencies.

## 9. Key Design Decisions Pending
List decisions that need user input before building (e.g., contacts table vs whatsapp_conversations for sub_status, admin panel scope for v5.3).

## 10. Reference: dolores/ PDFs
Note these are creative asset PDFs for avatar-specific marketing. Summarize avatar pain points from filenames (A-K avatars, P1-P4 programs). These inform Mica's conversational profiling but don't require code changes.
  </action>
  <verify>
    <automated>test -f .planning/quick/KERO-FULL-SYNTHESIS.md && wc -l .planning/quick/KERO-FULL-SYNTHESIS.md | awk '{if ($1 >= 200) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
    <manual>Review that all 10 sections are present and all context files are accounted for</manual>
  </verify>
  <done>KERO-FULL-SYNTHESIS.md exists with 200+ lines covering all 10 sections, every context file is referenced, phase breakdown includes complexity estimates, and all DB/scheduler/template changes are enumerated</done>
</task>

</tasks>

<verification>
- File exists at .planning/quick/KERO-FULL-SYNTHESIS.md
- All 9 context sources are referenced in the document
- Phase breakdown has 6 phases with complexity estimates
- DB migrations section lists all 6 new tables and ~12 new columns
- Schedulers section lists all 10 new schedulers
- Templates section lists all 19 templates
</verification>

<success_criteria>
Single comprehensive document that a developer can use to plan v5.3 without re-reading any of the 9+ context files. Every delta between current codebase and Kero architecture is mapped.
</success_criteria>

<output>
After completion, create `.planning/quick/9-kero-full-context-synthesis-and-v5-3-pha/9-SUMMARY.md`
</output>

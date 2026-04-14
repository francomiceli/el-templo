# El Templo

## What This Is

A multi-app platform for El Templo Calistenia, a calisthenics gym chain with 8 locations (7 Mar del Plata, 1 Barcelona). The monorepo contains: a Fastify API (el-templo-api), a member mobile app (el-templo-app), a coach/admin web app (el-templo-admin), a public-facing marketing site (el-templo-web), and a WhatsApp AI chatbot (el-templo-bot). v1 delivered the Training module, v2 the Admin app, v3 the landing page and public web presence, v4 began ecosystem integration (admin consolidation, attendance/scheduling, data migration), and v5 adds the WhatsApp AI chatbot for automated customer service and class booking.

## Current State

**Latest shipped:** v5.3.1 Prompt Architecture Refactor (2026-04-14)
**Bot status:** Mica runs a 5-playbook engine with avatar adaptation, 537 tests, state-gated knowledge injection (PB1 leads see only discovery-relevant sections — 20.25% total / 42.30% knowledge-block prompt reduction), canonical Boarding Pass definition, team method description with universal "lo sentis cuando llegas" deflection rule, stage-specific discovery gates, Argentine tuteo enforcement, debounce, non-text fallback, off-topic handling, and zone-to-branch recommendations.

## Current Milestone: (none active — next milestone TBD)

## Core Value

Members know exactly what to train today, complete guided sessions with block structure and timers, see their progress accumulate, and advance through levels — transforming daily training into visible progression toward mastery.

**v5.0 core value (shipped):** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and can book classes and register for trials without human intervention.

## Requirements

### Validated

<!-- Shipped and confirmed valuable in v1.0, v2.0, and v3.0 -->

- ✓ Authentication, SPOM engine, session generation (v1.0)
- ✓ Admin session review/editing, PDF generation (v2.0)
- ✓ Per-member journeys, video integration (v2.0)
- ✓ CI/CD, staging, Sentry monitoring, deploy pipeline (v2.0)
- ✓ Landing page, franchise forms, blog, Gladius showcase (v3.0)
- ✓ Brand alignment, Day Player redesign (v3.0)
- ✓ Academy and App landing pages (v3.0)
- ✓ Architecture foundation, virtual branch, AURA tables, module boundaries (v4.0)
- ✓ Lifestyle content extraction from arete-web (v4.0)
- ✓ Member management CRUD, subscriptions, payments, attendance, scheduling, analytics (v4.0)
- ✓ QR check-in, class booking, dashboard analytics (v4.0)
- ✓ Registration flow fixes, codebase health, god object decomposition (v4.0)
- ✓ Production deployment of v4.0 staging work (v4.1)
- ✓ Schema extensions (documentType, address), CSV data import for 5 branches (v4.1)
- ✓ WhatsApp Cloud API webhook + echo bot, AI with function calling tools, Redis memory, action tools, proactive schedulers, admin conversations UI, human takeover (v5.0)
- ✓ Business data integration, production seed, bug fixes, CI/CD pipeline, WhatsApp production setup docs (v5.1)
- ✓ Mica persona with Argentine tuteo, 12-section knowledge base, state-adaptive sales behavior (v5.2)
- ✓ Response quality fixes: WhatsApp formatting, markdown stripping, escalation, pricing order (v5.2)
- ✓ Conversation flow testing: 14 QA questions, 7 flows, 6 tone rules (v5.2)
- ✓ Pure playbook engine: PB1-PB5 registry, Redis-only persistence (6h TTL), single-section prompt injection, pure resolver (v5.3)
- ✓ PB1 conversational discovery: warm intro, 2-3 adaptive questions, ONE targeted recommendation, soft trial offer, hybrid `<profile>` tag detection (v5.3)
- ✓ State-adaptive playbooks PB2-PB5: trial follow-up, pre-expiry renewal, inactive reactivation (Foundation/Flex pause conditional), cancellation handling with `request_human` escalation (v5.3)
- ✓ Avatar adaptation across all playbooks: 4 distinct tone guides, resolver Rule 2.5 skip-to-recommendation, per-playbook flow coverage suite (v5.3)
- ✓ State-gated knowledge injection: `getBusinessKnowledge(clientState?)` returns only discovery-relevant sections for PB1 leads (8 of 14); full set for trial/active/inactive/expired — KGATE-01, KGATE-02, KGATE-03, KGATE-04, KGATE-06 — v5.3.1
- ✓ PB1.E1A rendered prompt >=20% smaller than pre-refactor baseline (23,646 → 18,858 chars = 20.25% total, 42.30% on knowledge block); dual-threshold regression lock in `test/ai/prompt-size.test.ts` — KGATE-05 — v5.3.1
- ✓ Boarding Pass consolidation: ONE canonical definition in _Reglas Zero_, all other mentions reference it without re-explanation, zero contradictory framings — BPASS-01, BPASS-02, BPASS-03 — v5.3.1
- ✓ Team method description in knowledge.ts: verbatim long-form `Metodo (detalle)` (full-only) + compressed 95-char `Metodo (elevator)` (discovery-gated) — METHOD-01, METHOD-02, METHOD-04 — v5.3.1
- ✓ Method-internals deflection rule ("lo sentis cuando llegas") in `system-prompt.ts` _Reglas de conversacion_ framing — universal reach, re-anchors trial CTA — METHOD-03 — v5.3.1
- ✓ Quality regression lock: 537/537 tests green, per-state content gating assertions, BP consolidation / method sections / deflection rule locks, PB1.E1A snapshot tripwire, boundary cases (unknown ClientState, null/undefined backward compat) — QREG-01, QREG-02, QREG-03 — v5.3.1

### Active

(none — v5.3.1 shipped; next milestone TBD)

### Out of Scope

- **APK Signing / Play Store** — Deferred from v2.0 (Phase 21), pick up post-v5.0
- **v4.1 remaining phases (60-66)** — Deferred: plan config, access control, payments, cash box, member mgmt, reports, roles. Pick up in a future milestone.
- **Lifestyle / Mi Camino** — v6.0+ (habits, journal, challenges, philosophical tools)
- **AURA Economy (milestones, store)** — v6.0+ (foundation tables in v4.0, but economy features later)
- **Social / Agora** — v6.0+ (feed, missions, reactions, career path)
- **Online model + Payment gateway** — v7.0+ (freemium, premium gate, Mercado Pago/Stripe)
- **Multi-tenancy / SaaS** — Not a goal. El Templo only.
- **DeportNet import** — One-time migration, already done
- **Zero Pricing Engine (full)** — Over-engineered. Simpler AURA-discount pricing when needed.
- **Baileys/BuilderBot** — Rejected in favor of official WhatsApp Cloud API (stability, no QR/session headaches)
- **Message queue (BullMQ/RabbitMQ)** — Over-engineered at ~100 convs/day. Node.js async sufficient.

## Context

**Ecosystem architecture discovery (complete):** 10-phase discovery process defining unified ecosystem vision. Full decisions in memory file `ecosystem-architecture-discovery.md`. Key decisions: one currency (AURA), one level system (Alfa→Spartan), modular monolith, virtual "Templo Online" branch, freemium online model.

**El-Templo-Net (reference codebase):** Next.js/Hono/PostgreSQL admin panel with members CRUD, subscriptions, payments, class scheduling, analytics, attendance. 16 tables, multi-tenant. Code used as reference only — features rebuilt in Vue/Quasar + Fastify/MySQL.

**Arete App (reference codebase):** React Native/Expo lifestyle app with 39 habits, journal, challenges, philosophical tools, AURUM economy. Code used as reference only — features rebuilt in Vue/Capacitor when lifestyle module is built.

**RenovaFacil (reference implementation):** Python/Flask WhatsApp bot for e-commerce (digital-initiatives/whatsapp-agent-renovafacil). Production bot using Cloud API, two-layer memory, client state machine, distributed lock schedulers. Used as architecture pattern reference — code translated to TypeScript, not copied.

**Build sequence (milestones):**

1. ✓ Light restructure (v4.0)
2. ✱ Admin consolidation (v4.0 started, v4.1 partial — phases 60-66 deferred)
3. ✓ Attendance & scheduling (v4.0)
4. ✓ WhatsApp AI Chatbot (v5.0)
5. Lifestyle / Mi Camino (v6.0+)
6. AURA economy (v6.0+)
7. Social / Agora (v6.0+)
8. Online model + Payment gateway (v7.0+)

**Key execution principle:** Ship each phase to production before starting the next. Don't let "building the ecosystem" become a never-ending staging branch.

## Constraints

- **Stack**: Vue 3/Quasar/Capacitor (frontend) + Fastify/Drizzle/MySQL (backend). All new code on this stack.
- **Architecture**: Modular monolith — one Fastify API with explicit module boundaries. Each module owns its routes, services, schemas, and tables.
- **DB design**: Users table stays lean (auth, profile, branchId, level). Module-specific data in dedicated tables (aura_balances, subscriptions, habit_streaks, etc.).
- **Admin**: Extend existing el-templo-admin. Current "Alumnos" section absorbs Net's member management.
- **Frontend**: One member app (el-templo-app) with lazy-loaded modules.
- **Reference code**: Net and Arete codebases are reference only — not imported directly.
- **Infrastructure**: Same EC2/Nginx/PM2 deployment as existing apps.
- **Bot process**: el-templo-bot is a separate Node.js/TypeScript process alongside el-templo-api. Crash isolation — bot doesn't take down the API. Calls API via localhost HTTP for actions.
- **WhatsApp**: Official Cloud API (Meta) only. No Baileys/reverse-engineered libraries.
- **AI**: Model-agnostic (OpenAI GPT-4o mini or Anthropic Haiku). Abstracted behind AiProvider interface.
- **State**: Redis for ephemeral state (context windows, locks, caching). MySQL for permanent records (conversations, messages).

## Key Decisions

| Decision                                  | Rationale                                                                                                                                                                                                                 | Outcome   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Training module first                     | Highest daily value, foundation for progression system                                                                                                                                                                    | ✓ Good    |
| Algorithmic session generation            | SPOM rules exist, coaches shouldn't manually build programs                                                                                                                                                               | ✓ Good    |
| Shell + module architecture               | Future modules need clean integration points                                                                                                                                                                              | ✓ Good    |
| Gym-wide SPOM (not per-member)            | Simplifies generation, matches gym operational model                                                                                                                                                                      | ✓ Good    |
| Multi-branch from start                   | Avoid architectural rework when scaling to more locations                                                                                                                                                                 | ✓ Good    |
| Nuxt 3 for landing                        | Purpose-built for SSR/SSG, lighter for marketing site                                                                                                                                                                     | ✓ Good    |
| Brand alignment in v3.0                   | Unified visual identity before ecosystem expansion                                                                                                                                                                        | ✓ Good    |
| Unified AURA currency                     | Single currency (not AURA + AURUM). Simpler UX, one wallet                                                                                                                                                                | — Pending |
| Single level system (Alfa→Spartan)        | Multiple progression ladders confuse users                                                                                                                                                                                | — Pending |
| Virtual "Templo Online" branch            | Avoids making branchId nullable everywhere. Clean code path for online users                                                                                                                                              | — Pending |
| Modular monolith                          | Formalizes existing src/modules/ pattern. Prevents tangling as features grow                                                                                                                                              | — Pending |
| Modular DB (lean users table)             | Prevents god table. Each module owns its data in dedicated tables                                                                                                                                                         | — Pending |
| Merge admin apps                          | One admin for training content + business ops. Net features rebuilt in Vue/Quasar                                                                                                                                         | — Pending |
| Auto-generated missions first             | Social works without coach effort. Coach-created missions as enhancement                                                                                                                                                  | — Pending |
| AURA tracking from day 1                  | Foundation tables track activity early so early adopters aren't penalized                                                                                                                                                 | — Pending |
| Payment gateway with online model         | Don't delay revenue — online premium conversion requires payment processing                                                                                                                                               | — Pending |
| Separate bot process                      | Crash isolation — bot shouldn't take down production API                                                                                                                                                                  | ✓ Good    |
| WhatsApp Cloud API (not Baileys)          | Stable, officially supported, no QR/session issues. RenovaFacil validates approach                                                                                                                                        | ✓ Good    |
| AI-primary (no keyword flows)             | Every message to AI with tools. Natural language > rigid menus. RenovaFacil proves this works                                                                                                                             | ✓ Good    |
| Redis for ephemeral state                 | Context windows, locks, caching in Redis. Permanent records in MySQL                                                                                                                                                      | ✓ Good    |
| Model-agnostic AI abstraction             | Easy swap between OpenAI/Anthropic via config. Test both, pick best for gym context                                                                                                                                       | ✓ Good    |
| Mica persona (Argentine tuteo)            | Matches real team WhatsApp communication style. Users expect warm, concise Argentine Spanish                                                                                                                              | ✓ Good    |
| 12-section knowledge architecture         | Separates business data from prompt logic. Each section independently testable                                                                                                                                            | ✓ Good    |
| Defense-in-depth markdown stripping       | Post-processes AI output even though prompt instructs against markdown. AI compliance varies                                                                                                                              | ✓ Good    |
| State-adaptive sales objectives           | Different goals per client lifecycle state (lead→trial, active→retain, inactive→reactivate)                                                                                                                               | ✓ Good    |
| Pure playbook resolver                    | Side-effect-free `resolvePlaybook(contact, session)`; no IO/Redis/Date imports — trivially unit-testable. Enforces PB6 absence at the type level                                                                          | ✓ Good    |
| Single-section playbook injection         | `getSystemPrompt` does single-key `PLAYBOOKS[activePlaybook]` lookup — never iterates. Other 4 playbooks impossible to leak (5×5 isolation matrix proves it)                                                              | ✓ Good    |
| Redis-only stage state in v5.3            | Stage transitions stored under `wa:playbook:<phone>` with 6h TTL matching session. MySQL persistence deferred to v5.4 to keep v5.3 scope tight                                                                            | ✓ Good    |
| Hybrid `<profile>` tag detection          | LLM emits `<profile>X</profile>` at end of reply; handler extracts → persists to Redis → strips before send. Deterministic, testable, no extra model turn                                                                 | ✓ Good    |
| 4 simplified avatar profiles              | cero_absoluto / gym_crossover / intermedio / retorna — collapsed from the 11-avatar quiz model. Conversational profiling, never quiz-style                                                                                | ✓ Good    |
| Conversational profiling not surveys      | Mica detects avatar from natural discovery rather than asking explicit quiz questions. Aligns with team WhatsApp style and real conversation references                                                                   | ✓ Good    |
| Resolver Rule 2.5 skip-to-recommendation  | Returning lead with known avatar bypasses discovery and goes straight to PB1.E4. Rule order: in-flight session > skip rule > fresh state mapping                                                                          | ✓ Good    |
| AVATAR_TONE_GUIDES in system-prompt       | Per-avatar tone guides live in `system-prompt.ts`, not `definitions.ts`. Single source of truth covers all 5 playbooks; zero churn to playbook content                                                                    | ✓ Good    |
| Escalation reuse over rebuild             | PB5 invokes existing v5.2 `request_human` tool; phrase `"Te paso con alguien del equipo, te escriben enseguida 🙌"` stays owned by tool description                                                                       | ✓ Good    |
| TEAM-CORR-04 Flex pause exclusion         | Foundation/Foundation+/Performance allow membership pause; Flex uses "los créditos no vencen" alternative. Asserted in both PB4.E2 and PB5.E2                                                                             | ✓ Good    |
| TEAM-CORR-02 PB1.E4 REGLA FUERTE          | PB1 targeted recommendation NEVER mentions a specific plan or price — only the free trial class CTA. Grep-enforced in regression tests                                                                                    | ✓ Good    |
| Defer/insistence as engine guards         | Direct-question and insistence detection emit signals that hold the discovery stage at the engine level, reinforcing prompt-level rules                                                                                   | ✓ Good    |
| State-gated knowledge via tagged SECTIONS | `knowledge.ts` SECTIONS is a module-private tagged array; `getBusinessKnowledge(clientState?)` filters in-place (not reorder) by `discovery` tag. Tag vocabulary starts narrow, extensible without renaming               | ✓ Good    |
| KGATE-05 dual-threshold revision          | Threshold revised 35%→20% on full rendered prompt; 35% retained on knowledge-block-only. Framing in system-prompt.ts (QT11-18 fixes, tuteo, off-topic) is universal and cannot be state-gated without regression          | ✓ Good    |
| Canonical-definition + pointer pattern    | Recurring concepts (Boarding Pass) live ONCE in a canonical section; other sites reference by name without re-explanation. Reduces drift and prompt-token cost; grep-enforced in regression tests                         | ✓ Good    |
| Universal deflection rules in framing     | Method-internals "lo sentis cuando llegas" deflection lives in `system-prompt.ts` _Reglas de conversacion_ (universal reach) rather than `knowledge.ts` (gated). Reaches all client states without bloating the lead gate | ✓ Good    |
| Method elevator/detalle split             | Method content split into 95-char discovery-gated elevator + verbatim long-form detalle (full-only). Preserves team voice while respecting KGATE-05 budget                                                                | ✓ Good    |
| Surgical snapshot tripwire                | PB1.E1A lead rendered-prompt locked as single committed fixture + byte-equal test (NOT auto-generated vitest `__snapshots__`). Explicit update discipline; surfaces unintentional drift in PR review                      | ✓ Good    |

---

_Last updated: 2026-04-14 after v5.3.1 milestone_

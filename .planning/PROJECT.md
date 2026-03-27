# El Templo

## What This Is

A multi-app platform for El Templo Calistenia, a calisthenics gym chain with 8 locations (7 Mar del Plata, 1 Barcelona). The monorepo contains: a Fastify API (el-templo-api), a member mobile app (el-templo-app), a coach/admin web app (el-templo-admin), a public-facing marketing site (el-templo-web), and a WhatsApp AI chatbot (el-templo-bot). v1 delivered the Training module, v2 the Admin app, v3 the landing page and public web presence, v4 began ecosystem integration (admin consolidation, attendance/scheduling, data migration), and v5 adds the WhatsApp AI chatbot for automated customer service and class booking.

## Current Milestone: v5.2 Mica Persona & Bot Refinement

**Goal:** Replace the generic bot personality with "Mica" — a warm, concise, sales-aware assistant that matches how the real El Templo team communicates on WhatsApp. Includes sales techniques, objection handling, retention strategies, response quality fixes, and conversation flow testing.

**Target features:**

- Mica persona: warm Argentine tuteo, concise WhatsApp-native responses, state-adaptive sales behavior
- Complete knowledge rewrite: plans, pricing, schedules, ROM, policies, sales techniques, objection handling, retention playbook
- Response quality fixes: WhatsApp formatting, pricing presentation order, schedule limits, escalation behavior
- Conversation flow testing: 14 QA questions + real conversation example flows

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

### Active

See: .planning/REQUIREMENTS.md (v5.2 scope)

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

| Decision                           | Rationale                                                                                     | Outcome   |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | --------- |
| Training module first              | Highest daily value, foundation for progression system                                        | ✓ Good    |
| Algorithmic session generation     | SPOM rules exist, coaches shouldn't manually build programs                                   | ✓ Good    |
| Shell + module architecture        | Future modules need clean integration points                                                  | ✓ Good    |
| Gym-wide SPOM (not per-member)     | Simplifies generation, matches gym operational model                                          | ✓ Good    |
| Multi-branch from start            | Avoid architectural rework when scaling to more locations                                     | ✓ Good    |
| Nuxt 3 for landing                 | Purpose-built for SSR/SSG, lighter for marketing site                                         | ✓ Good    |
| Brand alignment in v3.0            | Unified visual identity before ecosystem expansion                                            | ✓ Good    |
| Unified AURA currency              | Single currency (not AURA + AURUM). Simpler UX, one wallet                                    | — Pending |
| Single level system (Alfa→Spartan) | Multiple progression ladders confuse users                                                    | — Pending |
| Virtual "Templo Online" branch     | Avoids making branchId nullable everywhere. Clean code path for online users                  | — Pending |
| Modular monolith                   | Formalizes existing src/modules/ pattern. Prevents tangling as features grow                  | — Pending |
| Modular DB (lean users table)      | Prevents god table. Each module owns its data in dedicated tables                             | — Pending |
| Merge admin apps                   | One admin for training content + business ops. Net features rebuilt in Vue/Quasar             | — Pending |
| Auto-generated missions first      | Social works without coach effort. Coach-created missions as enhancement                      | — Pending |
| AURA tracking from day 1           | Foundation tables track activity early so early adopters aren't penalized                     | — Pending |
| Payment gateway with online model  | Don't delay revenue — online premium conversion requires payment processing                   | — Pending |
| Separate bot process               | Crash isolation — bot shouldn't take down production API                                      | ✓ Good    |
| WhatsApp Cloud API (not Baileys)   | Stable, officially supported, no QR/session issues. RenovaFacil validates approach            | ✓ Good    |
| AI-primary (no keyword flows)      | Every message to AI with tools. Natural language > rigid menus. RenovaFacil proves this works | ✓ Good    |
| Redis for ephemeral state          | Context windows, locks, caching in Redis. Permanent records in MySQL                          | ✓ Good    |
| Model-agnostic AI abstraction      | Easy swap between OpenAI/Anthropic via config. Test both, pick best for gym context           | ✓ Good    |

---

_Last updated: 2026-03-27 after v5.2 milestone initialization_

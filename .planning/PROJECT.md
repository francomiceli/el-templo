# El Templo

## What This Is

A multi-app platform for El Templo Calistenia, a calisthenics gym chain with 8 locations (7 Mar del Plata, 1 Barcelona). The monorepo contains: a Fastify API (el-templo-api), a member mobile app (el-templo-app), a coach/admin web app (el-templo-admin), and a public-facing marketing site (el-templo-web). v1 delivered the Training module, v2 the Admin app, v3 the landing page and public web presence, v4 begins ecosystem integration — consolidating admin operations, adding attendance/scheduling, and laying the foundation for AURA economy and lifestyle features.

## Current Milestone: v4.2 Clases Personalizadas Launch

**Goal:** Ship the "Journeys" feature to production as "Clases Personalizadas" — full rename across DB/API/frontend, subscription gating via standalone Personalizadas plan type, AURA rewards on completion, and member app module activation.

**Target features:**

- Full backend rename: DB migration (tables + columns), API module/routes/types/constants from journey → personalizada
- Full frontend rename: Admin and member app types, composables, pages, components, routes from journey → personalizada
- Subscription gate: `isPersonalizada` flag on plans, 403 enforcement in service layer
- AURA rewards: 10 points on personalizada session completion (same as QR check-in)
- Member app module enable: uncomment personalizada module registration
- Cycle progress: week-based progress bars, duration breakdown, cycle completion wrap-up card

## Core Value

Members know exactly what to train today, complete guided sessions with block structure and timers, see their progress accumulate, and advance through levels — transforming daily training into visible progression toward mastery.

**v4.2 core value:** Members with a Personalizadas subscription can access personalized training sessions (body-zone focused programs), complete them for AURA rewards, and see their progress — fully branded as "Clases Personalizadas" throughout the platform.

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
- ✓ Production deployment, data import, plan config, QR access, cash box, reports, roles (v4.1)

### Active

See: .planning/REQUIREMENTS-v4.2.md (v4.2 scope)

### Out of Scope

- **APK Signing / Play Store** — Deferred from v2.0 (Phase 21), pick up post-v4.0
- **Lifestyle / Mi Camino** — v5.0 (habits, journal, challenges, philosophical tools)
- **AURA Economy (milestones, store)** — v5.0 (foundation tables in v4.0, but economy features later)
- **Social / Agora** — v5.0+ (feed, missions, reactions, career path)
- **Online model + Payment gateway** — v6.0+ (freemium, premium gate, Mercado Pago/Stripe)
- **Multi-tenancy / SaaS** — Not a goal. El Templo only.
- **DeportNet import** — One-time migration, already done
- **Zero Pricing Engine (full)** — Over-engineered. Simpler AURA-discount pricing when needed.

## Context

**Ecosystem architecture discovery (complete):** 10-phase discovery process defining unified ecosystem vision. Full decisions in memory file `ecosystem-architecture-discovery.md`. Key decisions: one currency (AURA), one level system (Alfa→Spartan), modular monolith, virtual "Templo Online" branch, freemium online model.

**El-Templo-Net (reference codebase):** Next.js/Hono/PostgreSQL admin panel with members CRUD, subscriptions, payments, class scheduling, analytics, attendance. 16 tables, multi-tenant. Code used as reference only — features rebuilt in Vue/Quasar + Fastify/MySQL.

**Arete App (reference codebase):** React Native/Expo lifestyle app with 39 habits, journal, challenges, philosophical tools, AURUM economy. Code used as reference only — features rebuilt in Vue/Capacitor when lifestyle module is built.

**Build sequence (7 phases across multiple milestones):**

1. ✓ Light restructure (v4.0)
2. ✱ Admin consolidation (v4.0 started, v4.1 completes)
3. ✓ Attendance & scheduling (v4.0)
4. Lifestyle / Mi Camino (v5.0)
5. AURA economy (v5.0)
6. Social / Agora (v5.0+)
7. Online model + Payment gateway (v6.0+)

**Key execution principle:** Ship each phase to production before starting the next. Don't let "building the ecosystem" become a never-ending staging branch.

## Constraints

- **Stack**: Vue 3/Quasar/Capacitor (frontend) + Fastify/Drizzle/MySQL (backend). All new code on this stack.
- **Architecture**: Modular monolith — one Fastify API with explicit module boundaries. Each module owns its routes, services, schemas, and tables.
- **DB design**: Users table stays lean (auth, profile, branchId, level). Module-specific data in dedicated tables (aura_balances, subscriptions, habit_streaks, etc.).
- **Admin**: Extend existing el-templo-admin. Current "Alumnos" section absorbs Net's member management.
- **Frontend**: One member app (el-templo-app) with lazy-loaded modules.
- **Reference code**: Net and Arete codebases are reference only — not imported directly.
- **Infrastructure**: Same EC2/Nginx/PM2 deployment as existing apps.

## Key Decisions

| Decision                           | Rationale                                                                         | Outcome   |
| ---------------------------------- | --------------------------------------------------------------------------------- | --------- |
| Training module first              | Highest daily value, foundation for progression system                            | ✓ Good    |
| Algorithmic session generation     | SPOM rules exist, coaches shouldn't manually build programs                       | ✓ Good    |
| Shell + module architecture        | Future modules need clean integration points                                      | ✓ Good    |
| Gym-wide SPOM (not per-member)     | Simplifies generation, matches gym operational model                              | ✓ Good    |
| Multi-branch from start            | Avoid architectural rework when scaling to more locations                         | ✓ Good    |
| Nuxt 3 for landing                 | Purpose-built for SSR/SSG, lighter for marketing site                             | ✓ Good    |
| Brand alignment in v3.0            | Unified visual identity before ecosystem expansion                                | ✓ Good    |
| Unified AURA currency              | Single currency (not AURA + AURUM). Simpler UX, one wallet                        | — Pending |
| Single level system (Alfa→Spartan) | Multiple progression ladders confuse users                                        | — Pending |
| Virtual "Templo Online" branch     | Avoids making branchId nullable everywhere. Clean code path for online users      | — Pending |
| Modular monolith                   | Formalizes existing src/modules/ pattern. Prevents tangling as features grow      | — Pending |
| Modular DB (lean users table)      | Prevents god table. Each module owns its data in dedicated tables                 | — Pending |
| Merge admin apps                   | One admin for training content + business ops. Net features rebuilt in Vue/Quasar | — Pending |
| Auto-generated missions first      | Social works without coach effort. Coach-created missions as enhancement          | — Pending |
| AURA tracking from day 1           | Foundation tables track activity early so early adopters aren't penalized         | — Pending |
| Payment gateway with online model  | Don't delay revenue — online premium conversion requires payment processing       | — Pending |

---

_Last updated: 2026-03-19 after Phase 70 (Personalizadas Cycle Config) completion — all v4.2 phases complete_

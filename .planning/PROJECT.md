# El Templo

## What This Is

A multi-app platform for El Templo Calistenia, a calisthenics gym chain with 8 locations (7 Mar del Plata, 1 Barcelona). The monorepo contains: a Fastify API (el-templo-api), a member mobile app (el-templo-app), a coach/admin web app (el-templo-admin), and a public-facing marketing site (el-templo-web). v1 delivered the Training module, v2 the Admin app, v3 the landing page and public web presence, v4 begins ecosystem integration — consolidating admin operations, adding attendance/scheduling, and laying the foundation for AURA economy and lifestyle features.

## Current Milestone: v4.85 Enrollment Service + Admin Add-ons

**Goal:** Centralizar el lifecycle de `programEnrollments` en un `EnrollmentService` único (eliminando 6 inserts duplicados en `subscriptions/service.ts`) y, sobre esa base, habilitar que el admin asigne programas adicionales (add-ons) con precio opcional sobre la suscripción activa de un miembro.

**Target features:**

- Refactor: `EnrollmentService` centraliza creación/teardown/transferencia/lectura de `programEnrollments`. Reemplaza los 6 inserts dispersos en `subscriptions/service.ts` y absorbe `tearDownBundleEnrollments` (fase 111) generalizándolo.
- Schema: nuevas columnas en `program_enrollments` (`source` enum `plan_linked` | `plan_bundle` | `admin_addon`, `pricePaid` nullable int, `assignedBy` FK users, `subscriptionId` FK subscriptions). Migration con backfill.
- Endpoint admin: `POST /admin/users/:userId/program-addons` con `{ programId, pricePaid?, notes? }`. Bloquea duplicado activo del mismo programa. Genera `financial_transaction` si `pricePaid > 0`. Requiere sub activa.
- Hook en `changePlan`: transferencia automática de add-ons activos al `subscriptionId` de la sub nueva (decisión A).
- Hook en cancel/expire: teardown extendido a add-ons (decisión C: `status = cancelled` cuando muere la sub).
- UI admin: sección "Programas" en detalle del miembro con lista de enrollments activas (badge `plan` / `add-on`), botón "Asignar programa adicional", cancelar add-on individual.
- UI member: verificación de que el dropdown de programas en home muestra todas las enrollments activas (probablemente sin cambios de código, reutiliza patrón bundle).

**Decisiones clave:**

- Add-on vive mientras viva la sub principal — al cancelar/expirar la sub, los add-ons también se cancelan (decisión C).
- `pricePaid` se cobra como `financial_transaction` independiente al asignar; puede ser 0 (regalo).
- Programa duplicado activo → bloqueo (no alerta), forzar a cancelar el viejo primero.
- Asignación de add-on como acción aparte (no flow combinado con renovación).

**Out of scope this milestone:**

- Flow combinado "renovar + regalar programa" en un solo botón (deferred — el endpoint suelto cubre el caso de uso por ahora).
- Add-ons sin sub activa (no se puede asignar ni usar sin sub).
- Splits mecánicos de archivos largos (corresponde a v4.9).
- Transferencia de add-ons cuando la sub principal se pausa (no contemplado — los add-ons siguen el ciclo de la sub).

**Reference:** Conversación 2026-05-04 con decisiones A/C/A registradas en transcripts `.docs/WhatsApp Ptt 2026-05-04 at 14.28.21.txt` y `.docs/WhatsApp Ptt 2026-05-04 at 14.29.51.txt` + análisis arquitectural en chat (spaghetti subscriptions/programas, 6 inserts duplicados, precede a v4.9).

## Previous Milestone: v4.8 Modelo Financiero

**Phases 105-109.** Completed 2026-04-29. Modelo transaccional unificado (`financial_transactions` + `transaction_links`) reemplazando `payments` + `debts`. CajaPage v2 con summary por kind, reporte aging de deudas, export Excel.

## Earlier Milestone: v4.7 Full Body & ROM — Coach Session Requests

**Phases 96-104** (96-97 plus ad hoc 98-104). Completed 2026-04-27.

## Earlier Milestone: v4.3 Android Play Store Launch

**Goal:** Publish the member app (el-templo-app) on Google Play Store — Capacitor version alignment, release signing with upload keystore, production AAB build workflow, Play Store listing with all compliance forms, and launch through testing tracks to production.

**Target features:**

- Capacitor version alignment (CLI v8 ↔ native plugins) and version management strategy
- Upload keystore generation with secure storage (GitHub Secrets) and backup documentation
- Production signed AAB build via GitHub Actions (`build-android-production.yml`)
- Play Store listing: descriptions, screenshots, feature graphic, privacy policy
- Compliance: data safety form, content rating (IARC), target audience declaration
- Internal testing → production track promotion → live on Play Store

## Core Value

Members know exactly what to train today, complete guided sessions with block structure and timers, see their progress accumulate, and advance through levels — transforming daily training into visible progression toward mastery.

**v4.3 core value:** Members can install El Templo from Google Play Store like any real app — no sideloading, no APK files, just search and install.

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
- ✓ Clases Personalizadas: full rename, subscription gating, AURA rewards, cycle config, plan-driven assignment, unified training UX, plan catalog (v4.2)

### Active

See: .planning/REQUIREMENTS.md (v4.85 scope — Enrollment Service + Admin Add-ons)

### Out of Scope

- ~~**APK Signing / Play Store**~~ — Now active as v4.3 (Phases 74-77)
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

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-05-04 — Milestone v4.85 (Enrollment Service + Admin Add-ons) initialized. Phase 112+ to come. v4.8 (Modelo Financiero, phases 105-109) marked complete; v4.9 (Refactor Splits) remains queued after v4.85._

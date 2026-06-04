# El Templo

## What This Is

A multi-app platform for El Templo Calistenia, a calisthenics gym chain with 8 locations (7 Mar del Plata, 1 Barcelona). The monorepo contains: a Fastify API (el-templo-api), a member mobile app (el-templo-app), a coach/admin web app (el-templo-admin), and a public-facing marketing site (el-templo-web). v1 delivered the Training module, v2 the Admin app, v3 the landing page and public web presence, v4 begins ecosystem integration — consolidating admin operations, adding attendance/scheduling, and laying the foundation for AURA economy and lifestyle features.

## Current Milestone: v5.0 Métricas de Gestión

**Goal:** Reemplazar y ampliar las métricas del panel de gestión con 6 bloques nuevos/mejorados (churn person-based, renovación, funnel de sesiones de prueba, frecuencia de asistencia, LTV con Kaplan-Meier, ticket promedio), backend-first, con aislamiento de moneda ARS/EUR y breakdowns comparables por sucursal/país/plan.

**Target features (6 bloques):**

- **Fundación transversal:** flag `duration_tier` (monthly | long_term) en planes + helpers comunes (nominal + % + n siempre juntos; motor de breakdowns comparables; vista semanal/mensual respetando el rango del panel; aislamiento de moneda).
- **Bloque 1 — Churn no-renovación:** person-based, cohorte por `end_date ∈ [from,to)`, "churn maduro" (vencidos hace ≥N días), N configurable/multi-N. Reemplaza el `churnedMembers` frágil (basado en `updated_at`).
- **Bloque 2 — Tasa de renovación:** mismo motor de cohorte que B1, renovados÷vencidos, corte renovación/reactivación a 15 días (configurable). Formaliza `retentionRate`.
- **Bloque 3 — Funnel de prueba (cascada):** reserva→asistencia→compra con tasa de cada escalón; `tasa_cierre = compraron÷asistieron`; ventana de atribución ~21d; solo leads sin sub paga previa; cohorte por fecha de sesión agendada.
- **Bloque 4 — Frecuencia de asistencia:** visitas/sem por miembro (4 sem rodantes), bandas Inactivo/Bajo/Medio/Alto, lista "enfriándose", adopción de check-in al lado. Incluye propuesta de recálculo batch nocturno de segmentación.
- **Bloque 5 — LTV:** headline `1/churn mensual` + robusto Kaplan-Meier (mediana de supervivencia, maneja censura). LTV monetario desde pagos reales (no ARPU). Por moneda. Depende del churn del B1.
- **Bloque 6 — Ticket promedio:** promedio ponderado de `price_paid` por plan/global; bonus descuento vs `priceRegular` y mediana ante outliers. Por moneda.

**Decisiones clave:**

- Backend-first: servicios + endpoints + tests + migraciones primero; la UI del admin viene en fase posterior.
- `duration_tier` por flag, NO hardcodeando nombres de plan ("Flex"/"Flex+").
- El Bloque 3 (funnel de prueba) es prioritario: línea base para medir el impacto del futuro nivel Kairos (milestone Nuevo Sistema de Entrenamiento, v5.1+).
- Reemplaza churn/retención viejos; `renewalRate` 7/14/30 y ARPU "a decidir" en discuss-phase.

**Out of scope this milestone:**

- UI del admin para los 6 bloques (fase de frontend posterior; este milestone es backend-first).
- Reactivación, activación temprana, MRR con componentes (mencionados en el spec pero fuera de alcance).
- Splits mecánicos de archivos largos (corresponde a v4.9 Refactor Splits, en cola).

**Reference:** `BRIEF-METRICAS-GESTION.md` (inventario de métricas actuales) + `ESPECIFICACION-METRICAS-GESTION.md` (spec de negocio, fuente de verdad) + `METRICAS_GESTION_HANDOFF_2026-06-02.md` (estructura de fases y hallazgos de código).

## Previous Milestone: v4.85 Enrollment Service + Admin Add-ons

**Phases 112-114.** `EnrollmentService` centraliza el lifecycle de `programEnrollments`; endpoint admin de program add-ons con precio opcional; transferencia automática de add-ons en cambio de plan; teardown en cancel/expire. (Fases sueltas posteriores sin milestone formal: 116 refresh tokens, 117-118 analytics, 119 campaña freemium.)

## Earlier Milestone: v4.8 Modelo Financiero

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

See: .planning/REQUIREMENTS.md (v5.0 scope — Métricas de Gestión)

### Out of Scope

- ~~**APK Signing / Play Store**~~ — Now active as v4.3 (Phases 74-77)
- **Nuevo Sistema de Entrenamiento** — v5.1+ (nivel Kairos + árbol de habilidades + ajuste de dificultad in-session; diseño en `.planning/research/new-training-system-design.md`)
- **Lifestyle / Mi Camino** — v5.x/v6.0 (habits, journal, challenges, philosophical tools)
- **AURA Economy (milestones, store)** — v5.x/v6.0 (foundation tables in v4.0, but economy features later)
- **Social / Agora** — v6.0+ (feed, missions, reactions, career path)
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

_Last updated: 2026-06-03 — Milestone v5.0 (Métricas de Gestión) initialized. Phases 120+ to come (continues from phase 119). Backend-first; 6 bloques de métricas. Fases sueltas 116-119 shipeadas sin milestone formal. v4.9 (Refactor Splits) y Nuevo Sistema de Entrenamiento (v5.1+) quedan en cola._

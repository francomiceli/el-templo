# El Templo

## What This Is

A multi-app platform for El Templo Calistenia, a calisthenics gym chain with 8 locations (7 Mar del Plata, 1 Barcelona). The monorepo contains: a Fastify API (el-templo-api), a member mobile app (el-templo-app), a coach/admin web app (el-templo-admin), and now a public-facing marketing site (el-templo-web). v1 delivered the Training module, v2 the Admin app, v3 adds the landing page and public web presence.

## Current Milestone: v3.0 Landing Page (el-templo-web)

**Goal:** Build a premium, SEO-optimized public website at eltemplo.org that communicates brand identity, drives trial session conversions, supports franchise acquisition, and establishes web presence for sub-brands (Gladius equipment, Academy certification, Aura Club events).

**Target features:**

- Nuxt 3 SSR/SSG app with full production infrastructure (CI/CD, staging, Sentry, deploy pipeline)
- 11-section home page with hybrid scroll (100vh snap + fluid)
- /franquicias standalone landing page (franchise acquisition)
- /gladius standalone page (equipment brand, e-commerce direction)
- /blog with Nuxt Content (SEO content strategy)
- Complete design system based on 38 spec documents in .docs/brand-landing/
- Future standalone pages when specs arrive: /filosofia, /academy, /app, /aura-club

## Core Value

Members know exactly what to train today, complete guided sessions with block structure and timers, see their progress accumulate, and advance through levels — transforming daily training into visible progression toward mastery.

**v3.0 core value:** A visitor lands on eltemplo.org and within 10 seconds understands that El Templo is not a gym — it's a school of movement. They can book a trial session, explore franchise opportunities, or discover the ecosystem (app, academy, equipment, events).

## Requirements

### Validated

<!-- Shipped and confirmed valuable in v1.0 and v2.0 -->

- ✓ Authentication, SPOM engine, session generation (v1.0)
- ✓ Admin session review/editing, PDF generation (v2.0)
- ✓ Per-member journeys, video integration (v2.0)
- ✓ CI/CD, staging, Sentry monitoring, deploy pipeline (v2.0)

### Active

See: .planning/REQUIREMENTS.md (v3.0 scope)

### Out of Scope

- **Branch Attendance System** — Deferred from v2.0 (Phases 21-24), pick up post-v3.0
- **APK Signing / Play Store** — Deferred from v2.0 (Phase 21), pick up post-v3.0
- **CMS / Admin panel for landing content** — Content managed via code/config for now, CMS later if needed
- **E-commerce checkout for Gladius** — v3.0 builds the product showcase page, not a full store
- **Member login on landing site** — Landing site is public-only, login redirects to app.eltemplo.org
- **/filosofia, /academy, /app, /aura-club pages** — Specs not yet written, will be added as future phases when docs arrive

## Context

**Brand specs:** 38 documents in `.docs/brand-landing/` define every section (copy, typography, colors, CSS, HTML, responsive breakpoints, assets). Authored by "Hefesto" (project director).

**Design system (resolved):** See memory file `landing-design-decisions.md` for canonical :root variables, resolved conflicts (spacing naming, radius values, shadow definitions), and standardizations.

**Competitive landscape:** SomosCore.fit is the main competitor — terrible SEO (zero keyword optimization, no structured data, no blog), abandoned app, WordPress/Elementor stack. Massive SEO opportunity in "calistenia" + "entrenamiento peso corporal" + city-specific keywords.

**Existing infrastructure:** EC2-based deployment with Nginx reverse proxy. Subdomains: app.eltemplo.org, admin.eltemplo.org, api.eltemplo.org. The new landing takes the root domain eltemplo.org.

**Pending assets:** Hero video, sede photos, level photos, community gallery, founder photo, icons (SVG), testimonials — all marked PENDIENTE in specs. Development can proceed with placeholders.

## Constraints

- **Framework**: Nuxt 3 (SSR/SSG) — purpose-built for SEO marketing sites with Vue 3 ecosystem consistency
- **Design system**: Custom BEM, NOT Quasar UI — specs define their own typography, palette, and components
- **No pure black/white**: Never #000000 or #FFFFFF anywhere in CSS. Deep Charcoal (#3D3732) and Marble Cream (#F2EDE5) instead.
- **Brand voice**: 3 registers (Ceremonial/Narrativo/Funcional). Never "clase" (use "sesion"), never "tribu" (use "comunidad"), no promos/discounts/urgency. CTA invites, never shouts.
- **Infrastructure parity**: Same CI/CD, staging/production, Sentry, deploy pipeline quality as el-templo-api/app/admin
- **Self-hosted**: Deploys to existing EC2 infrastructure
- **SEO-first**: SSR/SSG rendering, structured data, sitemap, semantic HTML, meta tags per page
- **Content workflow**: User provides raw info, dev shapes into brand-voice copy for approval

## Key Decisions

| Decision                            | Rationale                                                                     | Outcome   |
| ----------------------------------- | ----------------------------------------------------------------------------- | --------- |
| Training module first               | Highest daily value, foundation for progression system                        | ✓ Good    |
| Algorithmic session generation      | SPOM rules exist, coaches shouldn't manually build programs                   | ✓ Good    |
| Shell + module architecture         | Future Academy/Agora modules need clean integration points                    | ✓ Good    |
| Gym-wide SPOM (not per-member)      | Simplifies generation, matches gym operational model                          | ✓ Good    |
| Multi-branch from start             | Avoid architectural rework when scaling to more locations                     | ✓ Good    |
| Nuxt 3 for landing (not Quasar SSR) | Purpose-built for SSR/SSG, lighter for marketing site, @nuxt/content for blog | — Pending |
| Semantic spacing names              | Readable, matches majority of specs (--space-comfortable vs --space-lg)       | — Pending |
| --radius-base: 6px                  | Spec 1 majority rule over Franquicias' 4px                                    | — Pending |
| Hero CTA scrolls to S6              | Descubrí Tu Nivel is the conversion section, not a separate form              | — Pending |
| Archive v2.0 with deferrals         | Phases 21-24 deferred to post-v3.0, clean milestone boundary                  | — Pending |

---

_Last updated: 2026-02-28 after v3.0 milestone initialization_

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** A visitor lands on eltemplo.org and within 10 seconds understands that El Templo is not a gym.
**Current focus:** v3.0 Landing Page — Defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Milestone v3.0 initialized, requirements and roadmap pending
Last activity: 2026-02-28 — Milestone v3.0 started, PROJECT.md and MILESTONES.md updated

## Milestone v3.0 Context

**What we're building:** el-templo-web — Nuxt 3 SSR/SSG marketing site at root eltemplo.org
**Specs:** 38 documents in .docs/brand-landing/ (all sections fully specced)
**Design decisions resolved:** See memory file landing-design-decisions.md

**Remaining workflow steps:**

1. ~~Load context~~ ✓
2. ~~Gather milestone goals~~ ✓ (extensive discussion in conversation)
3. ~~Determine version~~ ✓ (v3.0)
4. ~~Update PROJECT.md~~ ✓
5. ~~Update STATE.md~~ ✓
6. Commit docs — NEXT
7. Research decision — Skip (we already did competitor analysis + spec analysis)
8. Define REQUIREMENTS.md — TODO (scope categories from specs, generate REQ-IDs)
9. Spawn roadmapper — TODO (phases start at 29)
10. Approve roadmap — TODO

**Key scope summary for requirements:**

- Home page: Nav, Hero, Qué es El Templo, Nuestro Método, Sistema de Niveles, Los 5 Enfoques, Descubrí Tu Nivel, Sedes, Comunidad + Aura Club, Ecosistema, FAQ, Footer
- Standalone pages: /franquicias, /gladius, /blog
- Future pages (specs coming): /filosofia, /academy, /app, /aura-club
- Infrastructure: Nuxt 3 scaffolding, design system, CI/CD, staging/production, Sentry, deploy pipeline
- SEO: structured data, sitemap, meta tags, performance optimization

## Accumulated Context

### v2.0 Deferrals

- Phase 21: APK signing / Play Store
- Phase 22-24: Branch Attendance system
- Pick up post-v3.0

### Infrastructure Reference

- EC2 deployment with Nginx reverse proxy
- Subdomains: app/admin/api.eltemplo.org
- Landing takes root domain eltemplo.org
- CI: .github/workflows/ (ci.yml, deploy.yml, deploy-staging.yml)

---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Landing Page
status: in-progress
stopped_at: Completed 30-03-PLAN.md (Footer)
last_updated: "2026-03-01T04:13:04.433Z"
progress:
  total_phases: 28
  completed_phases: 19
  total_plans: 132
  completed_plans: 127
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** A visitor lands on eltemplo.org and within 10 seconds understands that El Templo is not a gym.
**Current focus:** v3.0 Landing Page — Phase 30 in progress

## Current Position

Phase: 30 of 36 (Design System, Navigation & Footer)
Plan: 3 of 4 complete
Status: Phase 30 plan 03 complete, ready for plan 04
Last activity: 2026-03-01 — Plan 03 complete (Footer)

Progress: [████████--] 75% (3/4 plans)

## Milestone v3.0 Context

**What we're building:** el-templo-web — Nuxt 3 SSR/SSG marketing site at root eltemplo.org
**Specs:** 38 documents in .docs/brand-landing/ (all sections fully specced)
**Design decisions resolved:** See memory file landing-design-decisions.md

**Remaining workflow steps:**

1. ~~Load context~~ done
2. ~~Gather milestone goals~~ done
3. ~~Determine version~~ done (v3.0)
4. ~~Update PROJECT.md~~ done
5. ~~Update STATE.md~~ done
6. ~~Commit docs~~ done (71476cc)
7. ~~Research decision~~ done (skip)
8. ~~Define REQUIREMENTS.md~~ done (113 requirements across 19 categories)
9. ~~Spawn roadmapper~~ done (8 phases: 29-36)
10. Approve roadmap — CURRENT
11. Plan Phase 29 — NEXT (`/gsd:plan-phase 29`)

## Accumulated Context

### v2.0 Deferrals

- Phase 21: APK signing / Play Store
- Phase 22-24: Branch Attendance system
- Pick up post-v3.0

### Phase 29 Decisions

- Used Nuxt 4.3.1 (latest stable) — plan specified Nuxt 3 but 4.x is current release
- Added better-sqlite3 as @nuxt/content v3 dependency for local SQLite storage
- Scoped lint-staged to Nuxt source dirs to avoid ESLint mismatch on root config files
- Reuse VITE*API_URL and VITE_SENTRY_DSN secrets as NUXT_PUBLIC* env vars (no duplicate secrets)
- SSG deploy pattern: nuxt generate -> rsync static files -> no PM2 restart needed
- SSG Nginx try_files: $uri $uri/index.html $uri.html /index.html =404
- Root domain eltemplo.org serves el-templo-web (landing takes priority)
- www.eltemplo.org 301-redirects to eltemplo.org (canonical non-www)
- Individual Certbot certs per domain (not wildcard)

### Infrastructure Reference

- EC2 deployment with Nginx reverse proxy
- Subdomains: app/admin/api.eltemplo.org
- Landing takes root domain eltemplo.org
- CI: .github/workflows/ (ci.yml, deploy.yml, deploy-staging.yml)
- Web Nginx configs: deploy/nginx/eltemplo.org, web-staging.eltemplo.org, www-redirect.eltemplo.org

### Phase 30 Decisions

- Fixed lint-staged eslint command for el-templo-web to use `pnpm --filter` for correct cwd resolution (Nuxt-generated ESLint config uses relative imports)
- Gladius active nav state uses Aged Gold (consistent with hover) rather than default Terracotta
- Staggered drawer link animation uses inline transition-delay via :style binding for data-driven simplicity
- Narrow desktop breakpoint (769-1024px) reduces nav link gap and font size to prevent overflow
- Coming-soon links rendered as `<span>` not `<a>` to prevent navigation, with Olive Stone color and no hover/cursor
- Social media icons use inline SVGs (Instagram, YouTube, TikTok) -- all disabled per CONTEXT.md

### Last Session

- **Stopped at:** Completed 30-03-PLAN.md (Footer), 30-02 re-executed
- **Timestamp:** 2026-03-01T04:13:04Z

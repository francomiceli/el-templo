# Phase 29: Nuxt Scaffold + Infrastructure - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

A deployable Nuxt 3 app exists in the monorepo with full CI/CD parity — staging and production pipelines, Sentry monitoring, environment config — so that all subsequent content phases build on a stable, deployable foundation.

</domain>

<decisions>
## Implementation Decisions

### Rendering Strategy

- **SSG** (Static Site Generation) — pre-render all pages at build time
- Nginx serves static files directly, same pattern as el-templo-app and el-templo-admin
- No PM2 process needed — no Node server running in production
- Forms (franchise application, Gladius inquiry) submit client-side directly to el-templo-api

### API Integration

- Nuxt `runtimeConfig` with `NUXT_PUBLIC_API_URL` env var for API URL per environment
- Staging points to api-staging.eltemplo.org, production to api.eltemplo.org
- el-templo-api is the single backend — no separate backend for the landing page

### Blog Approach

- API-backed blog, NOT markdown files in repo
- Phase 35 will build: DB table for posts + API routes in el-templo-api + blog editor in el-templo-admin
- el-templo-web fetches blog posts from el-templo-api at build time during `nuxt generate`
- For Phase 29: just set up the Nuxt Content module as placeholder infrastructure; actual API-backed content comes in Phase 35

### CI/CD

- Extend existing workflow files (ci.yml, deploy.yml, deploy-staging.yml) — do NOT create separate files
- Add web build/deploy jobs following the existing pattern (dorny/paths-filter for change detection)
- SSG build output: `.output/public/` rsync'd to deploy path

### Deploy

- Deploy path: `/var/www/el-templo-web` (production), `/var/www/staging/el-templo-web` (staging)
- Rsync static files + smoke test (curl root URL, check HTTP 200)
- Auto-rollback from `.previous` backup if smoke test fails
- Same backup → deploy → verify → rollback pattern as other apps

### Domain & DNS

- Root domain eltemplo.org — currently "Parked" in GoDaddy, unused
- DNS changes (manual checkpoint in GoDaddy):
  - Change `@` A record from "Parked" → `54.21.0.171`
  - Add `web-staging` A record → `54.21.0.171`
  - Add `www` A record → `54.21.0.171`
- www.eltemplo.org 301-redirects to eltemplo.org (Nginx redirect block)

### Staging

- Subdomain: `web-staging.eltemplo.org`
- Follows `{app}-staging` pattern (app-staging, admin-staging, api-staging, web-staging)
- Separate deploy path, same EC2 server

### SSL

- Certbot / Let's Encrypt — same pattern as other subdomains
- Individual certs for eltemplo.org and web-staging.eltemplo.org
- Manual step after DNS propagation (documented as checkpoint)

### Sentry

- Share the existing frontend Sentry project (same VITE_SENTRY_DSN as app and admin)
- Add `app_name: 'web'` tag to distinguish landing page errors
- Only production errors sent to Sentry alerts (staging filtered via environment tag)
- Client-side only (SSG = no server process)

### Claude's Discretion

- Node/Nuxt version (use latest stable, currently Node 22 in CI)
- Internal folder structure (pages/, components/, layouts/, etc.)
- ESLint + Prettier config (follow existing Vue patterns, adapt for Nuxt)
- Exact Nginx config details

</decisions>

<specifics>
## Specific Ideas

- Phase 29 should include a DNS/SSL setup checkpoint — manual steps the user performs in GoDaddy and on the EC2 server
- The franchise/Gladius form API routes in el-templo-api are NOT part of Phase 29 — they come with their respective content phases (34, 35)
- Blog editor in el-templo-admin is Phase 35 scope, not Phase 29

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `deploy/nginx/app.eltemplo.org`: SPA Nginx config template — adapt for SSG (try_files, cache headers)
- `.github/workflows/ci.yml`: CI pattern with parallel jobs per app — add web-check job
- `.github/workflows/deploy.yml`: Deploy with dorny/paths-filter, rsync, backup, smoke test, rollback — add web section
- `.github/workflows/deploy-staging.yml`: Same pattern with STAGING\_ prefix secrets
- `el-templo-app/src/boot/sentry.ts`: Frontend Sentry init with error filtering — adapt for Nuxt plugin
- `el-templo-api/ecosystem.config.cjs`: PM2 config — NOT needed for SSG

### Established Patterns

- Each app is independent (no pnpm workspace), separate lockfiles and build cycles
- CI: Node 22, pnpm 10, each app caches independently via pnpm-lock.yaml path
- Deploy: dorny/paths-filter detects changes → conditional build → rsync → smoke test → rollback
- Sentry: Guarded by env var, VITE_SENTRY_DSN for frontends, environment tag for staging filtering
- Env vars: `.env.example` documents all vars, VITE\_ prefix for client-side exposure

### Integration Points

- Nginx: New server blocks for eltemplo.org (static) and www redirect
- Nginx staging: New server block for web-staging.eltemplo.org
- CI: Additional jobs in existing workflow files
- GitHub Secrets: WEB_DEPLOY_PATH, STAGING_WEB_DEPLOY_PATH, STAGING_VITE_SENTRY_DSN (shared)
- GoDaddy DNS: 3 new A records (manual)
- Certbot: 2 new certificates (manual)

</code_context>

<deferred>
## Deferred Ideas

- Blog editor in el-templo-admin — Phase 35
- API routes for form submissions (franchise, Gladius) — Phases 34, 35
- Actual page content and design system — Phases 30+

</deferred>

---

_Phase: 29-nuxt-scaffold-infrastructure_
_Context gathered: 2026-02-28_

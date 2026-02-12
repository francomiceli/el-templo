# Phase 18: Domain/Subdomain Deployment - Context

**Gathered:** 2026-02-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Configure eltemplo.org subdomains pointing to EC2, set up SSL with Let's Encrypt, reconfigure Nginx for multi-subdomain serving, update CORS and environment config, extend GitHub Actions deploy pipeline for admin app. Web deployment only — APK handling is a separate phase.

</domain>

<decisions>
## Implementation Decisions

### Infrastructure Layout
- Root domain (eltemplo.org) stays on Vercel — landing page, no changes
- Three subdomains on EC2: app.eltemplo.org (member SPA), admin.eltemplo.org (admin SPA), api.eltemplo.org (Fastify API)
- Single EC2 instance serves everything — both apps are static files, API is the only running process
- academy.eltemplo.org skipped entirely for now
- www.eltemplo.org not needed

### DNS Configuration
- Domain registered at GoDaddy, user has delegated access to DNS panel
- Add 3 A records pointing app/admin/api subdomains to EC2 Elastic IP (54.21.0.171)
- Root domain A/CNAME record stays as-is (Vercel)
- Plan must include step-by-step GoDaddy DNS instructions (user unfamiliar with subdomain DNS setup)

### SSL & HTTPS
- Let's Encrypt via certbot on EC2
- Auto-redirect HTTP → HTTPS on all subdomains
- Strict HTTPS only — no self-signed or development cert exceptions

### Nginx Configuration
- Expand from current single-site config to multi-subdomain server blocks
- app.eltemplo.org serves member SPA static files from /var/www/member-app/
- admin.eltemplo.org serves admin SPA static files from /var/www/admin-app/
- api.eltemplo.org proxies to Fastify on port 3000
- Each subdomain gets its own server block with SSL

### CORS Updates
- API CORS origins updated from localhost:9000/9100 to production subdomain URLs
- Both app.eltemplo.org and admin.eltemplo.org need CORS access to api.eltemplo.org
- Keep localhost origins for development

### Deploy Pipeline
- Extend existing deploy.yml to build admin app as parallel job alongside API and member app
- Admin app build artifact rsynced to /var/www/admin-app/ on EC2
- Auto-deploy on push to master (current behavior preserved)
- Manual trigger also available (current behavior preserved)
- APK builds remain manual, not in CI

### Environment Config
- Update VITE_API_URL secrets in GitHub to https://api.eltemplo.org/api
- Update FRONTEND_URL in API env to https://app.eltemplo.org
- Update .env.production templates and examples

### Access Control
- Admin app publicly accessible — login screen provides sufficient protection
- No IP whitelist or basic auth needed

### Claude's Discretion
- DNS provider choice (keep at GoDaddy vs move to Route 53)
- Exact Nginx config structure and optimization
- Certbot installation method and renewal scheduling
- Deploy directory structure on EC2
- SPA fallback routing (history mode) configuration

</decisions>

<specifics>
## Specific Ideas

- User has an existing deploy guide at deploy/DEPLOYMENT-GUIDE.md that should be updated with subdomain info
- Current Nginx config (deploy/nginx.conf) only handles /api and /health — needs full rewrite for subdomains
- User needs clear DNS instructions for GoDaddy panel (not a power user)
- EC2 already has Nginx, PM2, MySQL, Node.js 22 installed (setup-ec2.sh was run)
- Elastic IP: 54.21.0.171, Region: sa-east-1 (São Paulo)

</specifics>

<deferred>
## Deferred Ideas

- **Technical Debt Audit** — Moved to Phase 19 (was originally combined with deployment)
- **APK Handling** — Moved to Phase 20 (keystore creation, signing, Play Store submission)
- **academy.eltemplo.org** — Set up when academy feature is built
- **www.eltemplo.org redirect** — Not needed now, add later if desired

</deferred>

---

*Phase: 18-domain-subdomain-deployment*
*Context gathered: 2026-02-12*

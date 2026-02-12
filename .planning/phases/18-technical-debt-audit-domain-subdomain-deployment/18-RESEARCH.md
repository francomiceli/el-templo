# Phase 18: Domain/Subdomain Deployment - Research

**Researched:** 2026-02-12
**Domain:** DNS configuration, SSL/TLS, Nginx reverse proxy, CI/CD pipeline, SPA deployment
**Confidence:** HIGH

## Summary

Phase 18 transitions El Templo from IP-based HTTP access to production-ready HTTPS subdomain access. The infrastructure is already in place: EC2 (t3.small, Ubuntu 22.04, sa-east-1) running Nginx, PM2, MySQL, and Node.js 22 with an Elastic IP (54.21.0.171). A GitHub Actions CI/CD pipeline already builds and deploys the API and member app. The domain is registered at GoDaddy (eltemplo.org), with the root domain pointing at Vercel for a landing page.

The work involves: (1) adding 3 A records in GoDaddy DNS for app/admin/api subdomains, (2) rewriting the single-block Nginx config into 3 subdomain server blocks, (3) installing certbot via snap and obtaining SSL certificates, (4) updating CORS origins and environment variables from `eltemplo.com` to `eltemplo.org`, and (5) extending the deploy pipeline to build and deploy the admin app alongside the existing API and member app.

**Primary recommendation:** Keep DNS at GoDaddy (simplest path), use certbot's `--nginx` plugin with a single multi-domain certificate, and structure Nginx as 3 separate server block files under `sites-available/`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Root domain (eltemplo.org) stays on Vercel -- landing page, no changes
- Three subdomains on EC2: app.eltemplo.org (member SPA), admin.eltemplo.org (admin SPA), api.eltemplo.org (Fastify API)
- Single EC2 instance serves everything -- both apps are static files, API is the only running process
- academy.eltemplo.org skipped entirely for now
- www.eltemplo.org not needed
- Domain registered at GoDaddy, user has delegated access to DNS panel
- Add 3 A records pointing app/admin/api subdomains to EC2 Elastic IP (54.21.0.171)
- Root domain A/CNAME record stays as-is (Vercel)
- Plan must include step-by-step GoDaddy DNS instructions (user unfamiliar with subdomain DNS setup)
- Let's Encrypt via certbot on EC2
- Auto-redirect HTTP to HTTPS on all subdomains
- Strict HTTPS only -- no self-signed or development cert exceptions
- Expand from current single-site config to multi-subdomain server blocks
- app.eltemplo.org serves member SPA static files from /var/www/member-app/
- admin.eltemplo.org serves admin SPA static files from /var/www/admin-app/
- api.eltemplo.org proxies to Fastify on port 3000
- Each subdomain gets its own server block with SSL
- API CORS origins updated from localhost:9000/9100 to production subdomain URLs
- Both app.eltemplo.org and admin.eltemplo.org need CORS access to api.eltemplo.org
- Keep localhost origins for development
- Extend existing deploy.yml to build admin app as parallel job alongside API and member app
- Admin app build artifact rsynced to /var/www/admin-app/ on EC2
- Auto-deploy on push to master (current behavior preserved)
- Manual trigger also available (current behavior preserved)
- APK builds remain manual, not in CI
- Update VITE_API_URL secrets in GitHub to https://api.eltemplo.org/api
- Update FRONTEND_URL in API env to https://app.eltemplo.org
- Update .env.production templates and examples
- Admin app publicly accessible -- login screen provides sufficient protection
- No IP whitelist or basic auth needed

### Claude's Discretion
- DNS provider choice (keep at GoDaddy vs move to Route 53)
- Exact Nginx config structure and optimization
- Certbot installation method and renewal scheduling
- Deploy directory structure on EC2
- SPA fallback routing (history mode) configuration

### Deferred Ideas (OUT OF SCOPE)
- Technical Debt Audit -- Moved to Phase 19
- APK Handling -- Moved to Phase 20
- academy.eltemplo.org -- Set up when academy feature is built
- www.eltemplo.org redirect -- Not needed now
</user_constraints>

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Nginx | 1.18+ (Ubuntu 22.04 default) | Reverse proxy, static file serving, SSL termination | Already installed on EC2 via setup-ec2.sh |
| Certbot (snap) | Latest (auto-updates) | SSL certificate provisioning and renewal | Official Let's Encrypt client, EFF recommended |
| Let's Encrypt | N/A | Free SSL certificates | Industry standard for free DV certs, 90-day validity |
| GoDaddy DNS | N/A | DNS A record management | Domain already registered here, simplest path |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| GitHub Actions | v4 actions | CI/CD pipeline for build + deploy | On push to master or manual trigger |
| rsync | System | File transfer to EC2 | Deploy static app builds to /var/www/ directories |
| PM2 | Installed | Process manager for Fastify API | Already running eltemplo-api, no changes needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GoDaddy DNS | Route 53 | Route 53 offers tighter AWS integration and advanced routing, but costs $0.50/month per hosted zone plus query fees. For 3 simple A records that rarely change, GoDaddy is free and sufficient. Moving DNS adds complexity with no benefit for this use case. |
| Per-subdomain certs | Single multi-domain cert | Certbot can issue one certificate covering all 3 subdomains (`-d app.eltemplo.org -d admin.eltemplo.org -d api.eltemplo.org`). Simpler renewal, single cert file. No reason to use separate certs. |
| Wildcard cert (`*.eltemplo.org`) | Multi-domain cert | Wildcard requires DNS-01 challenge (GoDaddy API or manual DNS TXT records). HTTP-01 challenge (automatic with --nginx plugin) is far simpler. Only 3 subdomains, no benefit from wildcard. |

## Architecture Patterns

### Recommended DNS Layout

```
eltemplo.org          -> Vercel (no change)
app.eltemplo.org      -> A record -> 54.21.0.171 (EC2)
admin.eltemplo.org    -> A record -> 54.21.0.171 (EC2)
api.eltemplo.org      -> A record -> 54.21.0.171 (EC2)
```

### Recommended EC2 Directory Structure

```
/var/www/
  member-app/          # Built member SPA (static files from el-templo-app)
    index.html
    css/
    js/
    ...
  admin-app/           # Built admin SPA (static files from el-templo-admin)
    index.html
    css/
    js/
    ...
  el-templo-api/       # API deployment (existing, stays as-is from deploy.yml)
    dist/
    package.json
    pnpm-lock.yaml
    node_modules/
    .env.production
```

Note: The deploy.yml currently uses `secrets.API_DEPLOY_PATH` (example: `/var/www/el-templo-api`) and `secrets.APP_DEPLOY_PATH` (example: `/var/www/el-templo-app`). The CONTEXT.md specifies `/var/www/member-app/` and `/var/www/admin-app/`. The planner must decide whether to update the existing `APP_DEPLOY_PATH` secret to `/var/www/member-app/` or keep the old path. Using the CONTEXT.md names is cleaner.

### Recommended Nginx Config Structure

```
/etc/nginx/
  nginx.conf                    # Main config (default, no changes)
  sites-available/
    app.eltemplo.org            # Member SPA server block
    admin.eltemplo.org          # Admin SPA server block
    api.eltemplo.org            # API proxy server block
  sites-enabled/
    app.eltemplo.org -> ../sites-available/app.eltemplo.org
    admin.eltemplo.org -> ../sites-available/admin.eltemplo.org
    api.eltemplo.org -> ../sites-available/api.eltemplo.org
```

One file per subdomain is the Nginx best practice for multi-site configs. The existing single `eltemplo` config under `sites-available/` should be replaced by these three files. The old single config must be removed from `sites-enabled/`.

### Pattern 1: SPA Server Block (History Mode)

**What:** Nginx server block for an SPA using HTML5 history mode routing
**When to use:** Admin app (uses `vueRouterMode: 'history'` in quasar.config.js)
**Example:**

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name admin.eltemplo.org;

    ssl_certificate /etc/letsencrypt/live/app.eltemplo.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.eltemplo.org/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/admin-app;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Critical detail:** The `try_files $uri $uri/ /index.html;` directive is essential for history mode SPAs. Without it, direct URL access (e.g., `admin.eltemplo.org/sessions/123`) returns 404 because Nginx looks for a literal file at that path.

### Pattern 2: SPA Server Block (Hash Mode)

**What:** Nginx server block for an SPA using hash mode routing
**When to use:** Member app (uses `vueRouterMode: 'hash'` in quasar.config.js)

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name app.eltemplo.org;

    ssl_certificate /etc/letsencrypt/live/app.eltemplo.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.eltemplo.org/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/member-app;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Note:** Hash mode technically does not require `try_files` fallback because all routes are after the `#` (e.g., `app.eltemplo.org/#/training`), which the browser handles client-side. However, including `try_files $uri $uri/ /index.html;` is harmless and provides defense-in-depth if the routing mode ever changes.

### Pattern 3: API Proxy Server Block

**What:** Nginx server block that proxies all requests to Fastify
**When to use:** api.eltemplo.org

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.eltemplo.org;

    ssl_certificate /etc/letsencrypt/live/app.eltemplo.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.eltemplo.org/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_buffering off;
    }
}
```

**Key difference from current config:** The current nginx.conf proxies only `/api` and `/health` paths. With the subdomain approach, `api.eltemplo.org` proxies ALL paths to Fastify (the API routes are already prefixed with `/api/` in the Fastify route registration). The `/health` endpoint is registered at root in Fastify, so `api.eltemplo.org/health` will work.

### Pattern 4: HTTP to HTTPS Redirect

**What:** Redirect block that certbot typically auto-generates
**When to use:** All 3 subdomains need HTTP->HTTPS redirect

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.eltemplo.org admin.eltemplo.org api.eltemplo.org;
    return 301 https://$host$request_uri;
}
```

This can be a single server block covering all 3 subdomains, or certbot may create individual redirect blocks. Either approach works.

### Anti-Patterns to Avoid

- **Editing nginx.conf directly:** Always use `sites-available/` + symlinks in `sites-enabled/`. Never put server blocks in the main `nginx.conf`.
- **Forgetting to remove the old config:** The existing `/etc/nginx/sites-enabled/eltemplo` config uses `server_name _;` which catches ALL requests. It MUST be removed before adding subdomain configs, or it will intercept subdomain traffic.
- **Using `certbot certonly` instead of `certbot --nginx`:** The `--nginx` plugin automatically configures SSL directives in server blocks, sets up redirects, and manages renewal. `certonly` requires manual Nginx config, which is error-prone.
- **Running certbot before DNS propagation:** Certbot's HTTP-01 challenge requires the domain to resolve to the EC2 IP. Running certbot before DNS propagates will fail.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSL certificates | Self-signed certs or manual renewal | certbot `--nginx` with Let's Encrypt | Automatic issuance, renewal, Nginx config insertion. Manual renewal means cert expiry outages. |
| HTTP redirect | Custom Nginx redirect blocks | certbot `--nginx` auto-redirect | Certbot adds the redirect server block automatically when you answer "yes" to redirect. |
| DNS verification | Polling scripts | Manual check + `dig` command | DNS propagation for A records is typically fast (minutes to hours). Just verify with `dig app.eltemplo.org` before running certbot. |
| Static file caching | Custom cache headers per file | Nginx `location ~*` block with `expires` | Nginx handles this efficiently with a single regex location block matching static asset extensions. |

**Key insight:** Certbot's `--nginx` plugin handles the hardest parts (SSL config, redirect blocks, renewal hooks). Use it rather than manual certificate management.

## Common Pitfalls

### Pitfall 1: Domain Mismatch (eltemplo.com vs eltemplo.org)

**What goes wrong:** The codebase currently references `eltemplo.com` in multiple places (CORS fallback origins, commented nginx config, .env examples, SECRETS.md). The actual domain is `eltemplo.org`.
**Why it happens:** The codebase was initially written with `.com` as a placeholder before the actual domain was registered.
**How to avoid:** The plan MUST include a comprehensive find-and-replace updating ALL references from `eltemplo.com` to `eltemplo.org`. This affects:
- `el-templo-api/src/app.ts` lines 19-20: fallback CORS origins
- `deploy/nginx.conf` line 9: commented server_name
- `.github/SECRETS.md` lines 38-39: example URLs
- `deploy/.env.production.template` line 16: FRONTEND_URL comment
- `el-templo-admin/.env.example` line 8: example URL comment
**Warning signs:** CORS errors in production where the API rejects requests from the `.org` domain because fallback origins say `.com`.

### Pitfall 2: Running Certbot Before DNS Propagation

**What goes wrong:** Certbot's HTTP-01 challenge fails because the domain doesn't resolve to the server yet.
**Why it happens:** DNS A records can take minutes to hours to propagate. GoDaddy typically propagates within 10-30 minutes for new A records but can take up to 48 hours.
**How to avoid:** After adding A records in GoDaddy, verify with `dig app.eltemplo.org +short` from a machine other than the EC2 (or use an online dig tool). Wait until the IP shows `54.21.0.171` before running certbot.
**Warning signs:** Certbot error message mentioning "DNS problem" or "unauthorized" during the ACME challenge.

### Pitfall 3: Old Nginx Config Catching All Traffic

**What goes wrong:** The existing `/etc/nginx/sites-enabled/eltemplo` has `server_name _;` which is a catch-all. If it remains active alongside subdomain configs, it may intercept requests before they reach the correct server block.
**Why it happens:** Nginx selects server blocks by matching `server_name`. The `_` pattern matches any hostname that doesn't match a more specific server block.
**How to avoid:** Remove the old config from `sites-enabled/` before or when adding the new subdomain configs. The deployment plan should explicitly handle this transition.
**Warning signs:** Requests to subdomains returning 404 or proxying to the wrong backend.

### Pitfall 4: Certbot Certificate Path with Multi-Domain Cert

**What goes wrong:** When issuing a single certificate for multiple domains, certbot names the certificate directory after the first `-d` argument. If you run `certbot --nginx -d app.eltemplo.org -d admin.eltemplo.org -d api.eltemplo.org`, the cert lives at `/etc/letsencrypt/live/app.eltemplo.org/`. All 3 server blocks must reference this same path.
**Why it happens:** Certbot creates one certificate covering all specified domains, stored under one directory name.
**How to avoid:** Use the same cert path in all 3 Nginx server blocks. Certbot's `--nginx` plugin handles this automatically if all server blocks exist before running certbot.
**Warning signs:** Nginx failing to start with "SSL certificate not found" errors.

### Pitfall 5: ADMIN_URL Not in .env.production Template

**What goes wrong:** The API code reads `process.env.ADMIN_URL` for CORS (line 20 of app.ts), but the `.env.production.template` and the deploy.yml `.env.production` creation step do NOT include `ADMIN_URL`. It falls back to `https://admin.eltemplo.com` (wrong domain).
**Why it happens:** `ADMIN_URL` was added to the code but not to the deployment configuration.
**How to avoid:** Add `ADMIN_URL` to the deploy.yml env creation step AND add a corresponding GitHub secret. Or alternatively, refactor CORS to use a single comma-separated `ALLOWED_ORIGINS` env var.
**Warning signs:** Admin app getting CORS errors when making API requests in production.

### Pitfall 6: PM2 Ecosystem Config Path Mismatch

**What goes wrong:** The PM2 `ecosystem.config.cjs` hardcodes `cwd: '/var/www/el-templo/el-templo-api'`, but the deploy.yml deploys to `secrets.API_DEPLOY_PATH` (example: `/var/www/el-templo-api`). If the deploy path changes for the subdomain setup, PM2 may look in the wrong directory.
**Why it happens:** PM2 config was written for the manual deployment path (`/var/www/el-templo/el-templo-api`) but CI deploys to a different path.
**How to avoid:** Ensure the PM2 startup command in deploy.yml uses the correct path, or update ecosystem.config.cjs to use a relative path. The deploy.yml currently uses `pm2 restart eltemplo-api || pm2 start dist/index.js --name eltemplo-api` which doesn't reference the ecosystem file.
**Warning signs:** PM2 failing to find `dist/index.js` after deployment.

## Code Examples

### Current CORS Configuration (needs updating)

```typescript
// Source: el-templo-api/src/app.ts (lines 15-25)
await app.register(cors, {
  origin: process.env.NODE_ENV === 'development'
    ? ['http://localhost:9000', 'http://localhost:9100', 'http://localhost:9101', 'capacitor://localhost', 'http://localhost']
    : [
        process.env.FRONTEND_URL || 'https://app.eltemplo.com',  // BUG: .com should be .org
        process.env.ADMIN_URL || 'https://admin.eltemplo.com',    // BUG: .com should be .org
        'capacitor://localhost',
        'http://localhost',
      ],
  methods: ['GET', 'HEAD', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
});
```

**Required changes:**
1. Update fallback origins from `.com` to `.org`
2. Add `ADMIN_URL` to `.env.production.template`
3. Add `ADMIN_URL` to deploy.yml env creation step
4. Add `ADMIN_URL` GitHub secret

### Current Deploy Pipeline Structure (needs extending)

```yaml
# Source: .github/workflows/deploy.yml
# Current jobs: build-api, build-app, deploy
# Need to add: build-admin job
# Deploy job needs: [build-api, build-app, build-admin]
```

The `build-admin` job should mirror `build-app` but:
- Working directory: `el-templo-admin` instead of `el-templo-app`
- Artifact name: `admin-dist` instead of `app-dist`
- Build command: `pnpm run build` (same)
- Env vars: `VITE_API_URL` (same secret, same value)
- No `VITE_APP_NAME` needed (admin app doesn't use it)

The deploy job adds a new step:
```yaml
- name: Download Admin artifact
  uses: actions/download-artifact@v4
  with:
    name: admin-dist
    path: admin-build

- name: Deploy Admin to server
  run: |
    rsync -avz --delete \
      admin-build/ \
      ${{ secrets.SSH_USER }}@${{ secrets.SERVER_HOST }}:${{ secrets.ADMIN_DEPLOY_PATH }}
```

### New GitHub Secrets Needed

| Secret | Value | Purpose |
|--------|-------|---------|
| `ADMIN_DEPLOY_PATH` | `/var/www/admin-app` | Admin app deploy directory |
| `ADMIN_URL` | `https://admin.eltemplo.org` | CORS origin for admin app |
| `VITE_API_URL` | `https://api.eltemplo.org/api` | Updated API URL (replace old value) |
| `FRONTEND_URL` | `https://app.eltemplo.org` | Updated CORS origin (replace old value) |

**Note:** `APP_DEPLOY_PATH` should be updated to `/var/www/member-app` to match the CONTEXT.md directory names.

### Certbot Installation and Certificate Issuance

```bash
# Install certbot via snap (recommended method)
sudo snap install core && sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Obtain certificate for all 3 subdomains (after DNS propagates)
# The --nginx plugin will:
#   1. Read existing server blocks to find matching server_names
#   2. Obtain the certificate via HTTP-01 challenge
#   3. Modify server blocks to add SSL directives
#   4. Add HTTP->HTTPS redirect blocks
sudo certbot --nginx \
  -d app.eltemplo.org \
  -d admin.eltemplo.org \
  -d api.eltemplo.org \
  --non-interactive \
  --agree-tos \
  --email admin@eltemplo.org

# Verify auto-renewal timer is active
sudo systemctl status certbot.timer

# Test renewal process
sudo certbot renew --dry-run
```

### GoDaddy DNS Configuration Steps

```
1. Log in to GoDaddy at https://dcc.godaddy.com
2. Click "My Products" or "Domain Portfolio"
3. Find eltemplo.org and click "DNS" (or "Manage DNS")
4. You'll see the existing DNS records (A record for root, possibly CNAME for Vercel)

For EACH subdomain (app, admin, api), repeat:
5. Click "Add New Record"
6. Type: A
7. Name: app (or admin, or api) -- NOT the full domain, just the prefix
8. Value: 54.21.0.171
9. TTL: 1 Hour (default)
10. Click "Save"

After all 3 are added, verify from your terminal:
  dig app.eltemplo.org +short    # Should return 54.21.0.171
  dig admin.eltemplo.org +short  # Should return 54.21.0.171
  dig api.eltemplo.org +short    # Should return 54.21.0.171

If dig doesn't return the IP yet, wait 10-30 minutes and try again.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `apt install certbot` | `snap install --classic certbot` | 2021+ | Snap version auto-updates, gets latest features, EFF-recommended |
| Separate cert per domain | Single multi-domain cert | Always available | Simpler management, single renewal |
| Manual SSL config | `certbot --nginx` plugin | Certbot 0.9+ | Auto-configures Nginx SSL directives and redirects |
| `ssl on;` directive | `listen 443 ssl;` | Nginx 1.15+ | `ssl on` deprecated, use `ssl` parameter on `listen` |
| Manual cron for renewal | systemd timer (automatic with snap) | Snap certbot | Timer runs `certbot renew` twice daily, no manual setup |

**Deprecated/outdated:**
- `ssl on;` directive in Nginx: deprecated since 1.15, replaced by `listen 443 ssl`
- `certbot-auto`: deprecated, replaced by snap installation
- `--standalone` mode for certbot when Nginx is running: use `--nginx` plugin instead

## Discretion Recommendations

### DNS Provider: Keep at GoDaddy

**Recommendation: Stay with GoDaddy** (HIGH confidence)

Route 53 offers advanced routing features (latency-based, geolocation, health checks) but none are needed for this project. The setup requires exactly 3 static A records that will rarely change. GoDaddy DNS is free (included with domain registration) while Route 53 costs $0.50/month per hosted zone plus query fees. Moving DNS adds a migration step with zero benefit. The user is already familiar with GoDaddy's interface.

### Nginx Config Structure: Separate Files Per Subdomain

**Recommendation: One file per subdomain in sites-available/** (HIGH confidence)

Three separate files (`app.eltemplo.org`, `admin.eltemplo.org`, `api.eltemplo.org`) in `/etc/nginx/sites-available/` with symlinks in `sites-enabled/`. This is the standard Nginx multi-site pattern. Each file is independently manageable. Certbot's `--nginx` plugin works correctly with this structure. The deploy repo should contain templates of these files (in `deploy/nginx/`) so they can be version-controlled and deployed.

### Certbot Installation: Snap

**Recommendation: Install via snap** (HIGH confidence)

Snap is the EFF-recommended installation method. Auto-updates ensure the latest version. The `--nginx` plugin is included. Systemd timer for auto-renewal is set up automatically. No manual cron job needed.

### Deploy Directory Structure

**Recommendation: Use CONTEXT.md paths** (HIGH confidence)

```
/var/www/member-app/    # Member SPA static files
/var/www/admin-app/     # Admin SPA static files
/var/www/el-templo-api/ # API deployment (keep existing path if already configured)
```

Update GitHub secrets `APP_DEPLOY_PATH` to `/var/www/member-app` and add `ADMIN_DEPLOY_PATH` as `/var/www/admin-app`. Create these directories on EC2 with correct ownership (`ubuntu:ubuntu`).

### SPA Fallback Routing

**Recommendation: Use `try_files $uri $uri/ /index.html;` for both apps** (HIGH confidence)

The admin app uses history mode (`vueRouterMode: 'history'` in quasar.config.js, confirmed by `createWebHistory()` in router/index.ts) -- it REQUIRES `try_files` fallback. The member app uses hash mode (`vueRouterMode: 'hash'`, confirmed by `createWebHashHistory()` in router/index.ts) -- it does NOT strictly require `try_files` fallback, but including it is harmless and future-proofs in case routing mode changes.

## Open Questions

1. **Current EC2 deploy path for API**
   - What we know: `ecosystem.config.cjs` says `cwd: '/var/www/el-templo/el-templo-api'`, but `SECRETS.md` example says `/var/www/el-templo-api`. These are different paths.
   - What's unclear: Which path is actually configured in the GitHub secrets on the live server?
   - Recommendation: The plan should document checking/updating the `API_DEPLOY_PATH` secret. The PM2 restart in deploy.yml uses `cd ${{ secrets.API_DEPLOY_PATH }}` so as long as the secret matches reality, it works. The ecosystem.config.cjs `cwd` is only used when starting PM2 via `pm2 start ecosystem.config.cjs` (manual path), not via the deploy pipeline.

2. **Existing Nginx config on server**
   - What we know: `deploy/nginx.conf` is the repo version. But the actual server config may have been modified manually.
   - What's unclear: Whether the live server's `/etc/nginx/sites-enabled/eltemplo` exactly matches the repo version.
   - Recommendation: The plan should include verifying the live config before replacing it. A backup step (`sudo cp /etc/nginx/sites-enabled/eltemplo /etc/nginx/sites-enabled/eltemplo.bak`) is prudent.

3. **Server directories**
   - What we know: The CONTEXT specifies `/var/www/member-app/` and `/var/www/admin-app/`
   - What's unclear: Whether `/var/www/member-app/` already exists on the server (the deploy.yml uses `secrets.APP_DEPLOY_PATH` which may be `/var/www/el-templo-app`).
   - Recommendation: The plan should include creating the directories on EC2 and updating the GitHub secrets.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `el-templo-api/src/app.ts` -- CORS configuration with .com fallbacks
- Codebase inspection: `deploy/nginx.conf` -- Current single-block HTTP-only config
- Codebase inspection: `.github/workflows/deploy.yml` -- Current CI/CD pipeline structure
- Codebase inspection: `el-templo-admin/quasar.config.js` -- History mode routing confirmed
- Codebase inspection: `el-templo-app/quasar.config.js` -- Hash mode routing confirmed
- Codebase inspection: `deploy/setup-ec2.sh` -- Certbot NOT included in EC2 setup
- [Certbot official instructions for Nginx](https://certbot.eff.org/instructions?ws=nginx&os=snap) -- Snap installation, --nginx plugin
- [GoDaddy: Add an A record](https://www.godaddy.com/help/add-an-a-record-19238) -- Step-by-step DNS instructions

### Secondary (MEDIUM confidence)
- [DigitalOcean: Secure Nginx with Let's Encrypt on Ubuntu 22.04](https://www.digitalocean.com/community/tutorials/how-to-secure-nginx-with-let-s-encrypt-on-ubuntu-22-04) -- Verified certbot installation and multi-domain cert process
- [Let's Encrypt Community: Multi-subdomain setup](https://community.letsencrypt.org/t/with-multiple-projects-on-their-own-subdomain-how-best-to-structure-letsencrypt-nginx-set-up/155127) -- Separate server blocks vs single cert approach

### Tertiary (LOW confidence)
- None. All findings verified through codebase inspection or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All tools are already installed or well-documented for Ubuntu 22.04
- Architecture: HIGH -- Nginx multi-subdomain and certbot patterns are well-established
- Pitfalls: HIGH -- Identified through direct codebase inspection (domain mismatch, missing env vars)
- CI/CD extension: HIGH -- Existing pipeline clearly structured, admin job mirrors app job

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (stable domain -- DNS, SSL, Nginx patterns change very slowly)

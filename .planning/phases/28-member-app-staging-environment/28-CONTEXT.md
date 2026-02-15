# Phase 28: Member App Staging Environment - Context

**Gathered:** 2026-02-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Full staging environment for all 3 apps (member app, admin app, API) on the same EC2 instance as production. Includes staging web deployment, staging mobile builds (Android APK + iOS TestFlight), separate database with fake data, and a staging-first deployment workflow. Production APK signing and Play Store submission are Phase 20 scope.

</domain>

<decisions>
## Implementation Decisions

### Staging scope

- All 3 apps get staging: member app, admin app, API
- Same EC2 instance as production — different ports, Nginx routes by subdomain
- Subdomains: app-staging.eltemplo.org, admin-staging.eltemplo.org, api-staging.eltemplo.org
- Staging API runs as separate PM2 process (e.g., port 4001 alongside production port 4000)
- Separate build output directories: /opt/el-templo-staging/app/, /opt/el-templo-staging/admin/
- Separate Sentry projects for staging vs production
- Use case: pre-release testing AND client demos

### Data strategy (REVISED)

- Fake/generated data only — NO production data copy
- Same schema as production, populated with scripted fake users and sample sessions
- Weekly cron resets staging DB: drop -> create -> migrate -> seed fake data (ensures new tables get populated)
- Two known test users: test-member@eltemplo.org and test-admin@eltemplo.org with fixed passwords
- Shares production media (R2/S3 video files) — no separate media bucket
- Separate MySQL database on same server: eltemplo_staging
- Auto-migrate after seeding to apply any pending schema changes

### Deployment flow

- Branch-based: push to `staging` branch auto-deploys to staging environment via CI/CD
- Staging-first promotion: staging branch -> test on staging -> merge to master -> production deploy
- Same safety pipeline as production: backup, deploy, migrate, smoke test, auto-rollback on failure
- Mobile builds (APK + iOS) are manual trigger only (workflow_dispatch), not on every push

### Mobile builds

- Android: direct APK file distribution (sideload, no Play Store). Check if keystore exists during research; create if needed
- iOS: TestFlight distribution. Initial Capacitor iOS project setup required (Info.plist, provisioning, etc.)
- iOS builds via GitHub Actions macOS runners with manual workflow_dispatch trigger (conserve runner minutes)
- No Mac available locally — all iOS builds are CI-based
- Staging apps have different app name: "El Templo (Staging)" for device coexistence
- Staging apps look identical to production (no staging banner/ribbon) — distinguished by app name only
- Separate bundle IDs for staging apps to coexist with production on same device

### Access control

- Staging web apps are publicly accessible (no HTTP basic auth, no IP whitelist)
- Separate JWT secrets for staging and production (tokens don't cross environments)
- No external communications to suppress (app doesn't send emails/push notifications currently)

### Claude's Discretion

- APK storage location for staging builds (GitHub Actions artifact, S3, or server)
- Exact fake data generation approach (seed script structure, how many fake users/sessions)
- Nginx configuration details for subdomain routing
- PM2 ecosystem config structure for staging processes
- Staging .env file management and variable naming conventions

</decisions>

<specifics>
## Specific Ideas

- User emphasized: staging must not contain any real user data — only test/fake data
- Demo use case means staging should look clean and stable (representative of production quality)
- iOS build setup is from scratch — no existing Capacitor iOS project
- Android keystore state unknown — needs verification during research

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 28-member-app-staging-environment_
_Context gathered: 2026-02-15_

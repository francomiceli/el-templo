# External Integrations

**Analysis Date:** 2026-03-10

## APIs & External Services

**Email Notifications (Resend):**

- Service: Resend (transactional email)
- SDK: `resend` v6.9.3
- Auth: `RESEND_API_KEY` env var
- Used by:
  - `el-templo-api/src/modules/franchise/service.ts` - Franchise inquiry notifications
  - `el-templo-api/src/modules/academy/service.ts` - Academy enrollment inquiries
  - `el-templo-api/src/modules/gladius/service.ts` - Product inquiries
  - `el-templo-api/src/modules/app-landing/service.ts` - Waitlist and labs inquiries
- Notification emails (env vars): FRANCHISE_NOTIFICATION_EMAIL, ACADEMY_NOTIFICATION_EMAIL, GLADIUS_NOTIFICATION_EMAIL, APP_NOTIFICATION_EMAIL
- Default sender: noreply@eltemplo.org

**AI Agent (Anthropic Claude):**

- Service: Anthropic Claude API
- SDK: `@anthropic-ai/sdk` v0.78.0
- Auth: `ANTHROPIC_API_KEY` env var (read automatically by SDK)
- Location: `el-templo-api/src/modules/franchise/ai-agent-service.ts`
- Purpose: Franchise application analysis and conversion strategies
- Agent types: strategy, outreach, followup, negotiation (4 specialized prompts)
- Language: Spanish (system prompts in Spanish)

**File Storage (Cloudflare R2):**

- Service: Cloudflare R2 (S3-compatible object storage)
- SDKs: `@aws-sdk/client-s3` v3.994.0, `@aws-sdk/s3-request-presigner` v3.994.0
- Auth: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (env vars)
- Location: `el-templo-api/src/plugins/r2.ts`
- Configuration:
  - Endpoint: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  - Bucket: R2_BUCKET_NAME (env var)
  - Public URL: R2_PUBLIC_URL (env var)
  - Checksum validation: enabled (WHEN_REQUIRED)
- Used by:
  - `el-templo-api/src/modules/blog/image-service.ts` - Blog image uploads (presigned URLs, 15min expiry)
  - `el-templo-api/src/modules/admin/video-service.ts` - Video uploads (presigned URLs)
- File structure: blog/images/, videos/, media/ prefixes

**Google Analytics 4:**

- Service: Google Analytics 4
- Location: `el-templo-web/` (landing page)
- Configuration: NUXT_PUBLIC_GA4_ID env var
- Purpose: Traffic and conversion tracking (landing page only)

**Meta Pixel (Facebook Pixel):**

- Service: Meta Pixel for conversion tracking
- Location: `el-templo-web/` (landing page)
- Configuration: NUXT_PUBLIC_META_PIXEL_ID env var
- Purpose: Conversion and audience tracking

## Data Storage

**Primary Database:**

- Type: MySQL 8.0+
- Client: mysql2 (promise pool, 10 concurrent connections)
- ORM: Drizzle ORM 0.45.1
- Location: `el-templo-api/src/db/schema/` (42 tables across modules)
- Connection config: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (env vars)
- Pool settings: 60s idle timeout, keep-alive enabled
- Test database: `eltemplo_test` (separate instance for integration tests)

**Schema Modules:**

- Users and authentication: `users.ts`
- Training: `sessions.ts`, `session-blocks.ts`, `session-prescriptions.ts`, `session-traces.ts`, `completed-sessions.ts`, `saved-blocks.ts`, `evaluation-requests.ts`
- Members: `member-journeys.ts`, `member-notes.ts`
- Attendance: `attendance.ts`, `schedules.ts`, `bookings.ts`
- Subscriptions: `subscription-plans.ts`, `subscriptions.ts`, `payments.ts`
- AURA Economy: `aura-transactions.ts`, `aura-balances.ts`, `aura-config.ts`
- Content: `blog-posts.ts`, `blog-tags.ts`
- External forms: `franchise-applications.ts`, `academy-inquiries.ts`, `gladius-inquiries.ts`, `app-waitlist.ts`, `labs-inquiries.ts`
- Branch/location: `branches.ts`, `holidays.ts`
- Training rules: `routes.ts`, `spom-rules.ts`, `intensity-rules.ts`, `contraction-rules.ts`, `weekly-rotator.ts`, `formats.ts`, `format-compatibility.ts`, `exercises.ts`, `spom-config.ts`
- Activities: `activities.ts`

**File Storage:**

- Cloudflare R2 (S3-compatible) - See File Storage section above
- Types: Blog images, videos, PDFs, media assets
- No local filesystem storage for user content (R2 is required)

**Caching:**

- No Redis, Memcached, or in-memory caching layer configured
- All data loaded from MySQL on request

## Authentication & Identity

**Auth Provider:**

- Custom JWT-based authentication
- Location: `el-templo-api/src/plugins/auth.ts`
- Library: @fastify/jwt v10.0.0
- Secret: JWT_SECRET env var (required)
- Token expiry: JWT_EXPIRES_IN (default: 7d)
- Signature algorithm: HS256
- Payload: { userId, email, role }

**Password Management:**

- Algorithm: Argon2 (OWASP recommended)
- Library: `argon2` v0.44.0
- Locations: auth module, member service password updates

**Role-Based Access Control:**

- Roles: member, coach, admin, superadmin
- Schema: `el-templo-api/src/db/schema/users.ts`
- Enforcement: Route-level guards checking request.user.role

**Frontend Auth Storage:**

- JWT token stored in client-side Pinia store (both apps)
- Admin/member app: Pinia store with axios interceptor
- Landing page: No auth (public access only)
- Capacitor local storage (member app): Preferences plugin for persistence

## Monitoring & Observability

**Error Tracking (Sentry):**

- Libraries:
  - API: `@sentry/node` v10.38.0
  - Admin: `@sentry/vue` v10.38.0
  - Member app: `@sentry/vue` v10.38.0
  - Landing: `@sentry/vue` v10.40.0
- Configuration:
  - API: `el-templo-api/src/instrument.ts` (loaded first in index.ts)
  - Admin: `el-templo-admin/src/boot/sentry.ts`
  - Member app: `el-templo-app/src/boot/sentry.ts`
  - Landing: `el-templo-web/plugins/sentry.ts` (if exists)
- Activation: Guarded by SENTRY_DSN env var (optional)
- Environment: APP_ENVIRONMENT or NODE_ENV
- Sample rate: 20% (production), 100% (development)
- Sensitive scrubbing:
  - API: password, currentPassword, newPassword fields redacted
  - Frontend: Ignores certain browser extension errors and network errors

**Application Logging:**

- Structured logging: Pino v10.3.0 (API only)
- Logger instances:
  - Fastify built-in: request.log, app.log (via Pino)
  - Manual: src/modules/sessions/trace/logger.ts, src/jobs/auto-approve.ts
- Development: pino-pretty v13.1.3 (colorized console output)
- Frontend: createLogger() utility (see CONVENTIONS.md for implementation)
- Production: JSON-structured logs to PM2 files (/var/log/pm2/)

## CI/CD & Deployment

**Hosting:**

- EC2 instance (AWS, inferred from deployment config)
- All 4 apps deployed to same server via rsync

**Process Management (API):**

- PM2 (production process manager)
- Config: `el-templo-api/ecosystem.config.cjs`
- App name: eltemplo-api
- Script: dist/index.js
- Working dir: /var/www/el-templo/el-templo-api
- Instances: 1 (single process)
- Memory limit: 500MB (auto-restart on exceed)
- Graceful shutdown: 5s kill timeout, 10s listen timeout
- Log files: /var/log/pm2/eltemplo-api-error.log, eltemplo-api-out.log

**CI/CD Pipeline:**

- GitHub Actions (triggered on every push)
- Stages: Type check, lint, security audit, tests, build all 4 apps
- Pre-commit: Husky + lint-staged (Prettier formatting auto-fix)
- Test: Vitest integration tests (API database + member app)
- Build: TypeScript compilation, Vite bundling (Quasar), Nuxt generate
- Deployment: rsync to EC2, database migrations, service restart, smoke tests, auto-rollback on failure

## Environment Configuration

**Required Environment Variables (All apps):**

API:

- Database: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, NODE_ENV (defaults: localhost:3306, eltemplo, development)
- Auth: JWT_SECRET (required), JWT_EXPIRES_IN (default: 7d)
- Server: PORT (default: 3000)
- CORS: FRONTEND_URL, ADMIN_URL
- R2: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
- Email: RESEND_API_KEY, FRANCHISE_NOTIFICATION_EMAIL, GLADIUS_NOTIFICATION_EMAIL, ACADEMY_NOTIFICATION_EMAIL, APP_NOTIFICATION_EMAIL
- AI: ANTHROPIC_API_KEY
- Optional: SENTRY_DSN, APP_ENVIRONMENT

Admin Panel:

- VITE_API_URL (default: http://localhost:3000/api)
- Optional: VITE_SENTRY_DSN, VITE_APP_ENVIRONMENT

Member App:

- VITE_API_URL (default: http://localhost:3000/api)
- VITE_APP_NAME (default: El Templo)
- Optional: VITE_SENTRY_DSN

Landing Page:

- NUXT_PUBLIC_API_URL (default: http://localhost:3000/api)
- Optional: NUXT_PUBLIC_SENTRY_DSN, NUXT_PUBLIC_APP_ENVIRONMENT, NUXT_PUBLIC_GA4_ID, NUXT_PUBLIC_META_PIXEL_ID

Seed Variables (dev/test only):

- SEED_ADMIN_PASSWORD
- SEED_DEFAULT_PASSWORD

**Secrets Location:**

- `.env.development` - Local development (gitignored)
- `.env.production` - Production settings (gitignored)
- `.env` - Local overrides (gitignored)
- `.env.example` - Templates (committed, public reference)

## Webhooks & Callbacks

**Incoming Webhooks:**

- Not configured (no webhook endpoints detected)

**Outgoing Webhooks:**

- Email callbacks: Resend API (fire-and-forget, no webhook handling)
- No payment gateway webhooks (manual payment records via admin API)

## Session Management & Security

**JWT Token Lifecycle:**

- Issued: login endpoint (`el-templo-api/src/modules/auth/routes.ts`)
- Verified: Protected routes via fastify.authenticate middleware
- Stored: Client-side in Pinia store (both frontend apps)
- Expiry: JWT_EXPIRES_IN env var (default 7d)
- Refresh: No refresh token mechanism detected (full re-login required)

**CORS Policy:**

- Development origins (localhost): 9000 (member app), 9100 (admin), 9101 (?), 9200 (landing), capacitor://localhost, http://localhost
- Production origins: FRONTEND_URL, ADMIN_URL, https://eltemplo.org, capacitor://localhost
- Methods: GET, HEAD, PUT, POST, PATCH, DELETE, OPTIONS
- Config: `el-templo-api/src/app.ts`

## Scheduled Jobs

**Cron Jobs (API only):**

- Auto-approve pending sessions
  - Implementation: `el-templo-api/src/jobs/auto-approve.ts`
  - Library: node-cron v4.2.1
  - Schedule: Daily at 23:59 (America/Argentina/Buenos_Aires timezone)
  - Purpose: Auto-approves sessions pending admin review (next day availability)
  - Started: On app boot via startAutoApproveJob()

---

_Integration audit: 2026-03-10_

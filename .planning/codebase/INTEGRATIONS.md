# External Integrations

**Analysis Date:** 2026-03-17

## APIs & External Services

**Messaging:**
- WhatsApp Cloud API (Meta Graph API)
  - Used by: `el-templo-bot/` (incoming webhook receiver, send messages) and `el-templo-api/` (admin conversation management at `src/modules/whatsapp/`)
  - Webhook receiver: `GET /webhook` (verification) + `POST /webhook` (inbound messages) — planned in bot, not yet implemented
  - Admin send endpoint: `POST /api/admin/whatsapp/conversations/:id/send` — implemented in API
  - Auth env vars: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`
  - Client stub: `el-templo-bot/src/whatsapp/client.ts` (sendTextMessage, sendTemplate, verifyWebhook, parseWebhookPayload — all TODO)
  - Schema tables: `whatsapp_conversations`, `whatsapp_messages` in `el-templo-api/src/db/schema/whatsapp.ts`

**AI Providers:**
- Anthropic Claude
  - Active usage: franchise AI agent in `el-templo-api/src/modules/franchise/ai-agent-service.ts`
  - Model: `claude-sonnet-4-20250514`
  - SDK: `@anthropic-ai/sdk` (reads `ANTHROPIC_API_KEY` from env automatically)
  - Use case: generates franchise applicant strategy, outreach messages, followup messages, and negotiation material
  - Planned usage: WhatsApp bot (`el-templo-bot/src/ai/anthropic.ts` stub — `AnthropicProvider implements AiProvider`)

- OpenAI GPT
  - Not active yet — planned for WhatsApp bot
  - SDK: `openai` 4.85 in `el-templo-bot/`
  - Planned model: `gpt-4o-mini` (configurable via `AI_MODEL` env var)
  - Auth env var: `OPENAI_API_KEY`
  - Provider stub: `el-templo-bot/src/ai/openai.ts` (OpenAiProvider — TODO)
  - Note: `AI_PROVIDER` env var selects between `openai` and `anthropic`; factory in `el-templo-bot/src/ai/provider.ts`

## Data Storage

**Databases:**
- MySQL 8
  - Primary data store for all business data
  - Connection: env vars `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
  - Client: Drizzle ORM (`drizzle-orm/mysql2`) with `mysql2/promise` pool (connection limit: 10)
  - API plugin: `el-templo-api/src/plugins/database.ts` — decorates `fastify.db`
  - Bot: `el-templo-bot/src/db.ts` stub — imports shared schema from API via relative path
  - Schema location: `el-templo-api/src/db/schema/` (42 schema files, includes whatsapp tables)
  - Migrations: `el-templo-api/src/db/migrations/` — Drizzle Kit generates and runs
  - Test DB: `eltemplo_test` — used by Vitest integration tests in `el-templo-api/test/`

**File Storage:**
- Cloudflare R2 (S3-compatible object storage)
  - Auth env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
  - Public URL: `R2_PUBLIC_URL` (e.g., `https://pub-xxxxx.r2.dev`)
  - Default bucket: `el-templo-videos`
  - Client: `@aws-sdk/client-s3` with endpoint `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  - API plugin: `el-templo-api/src/plugins/r2.ts` — decorates `fastify.r2` (S3Client) and `fastify.r2Bucket`
  - Key patterns: `exercises/{id}.mp4` (videos), `thumbnails/{id}.jpg` (thumbnails)
  - Post-processing pipeline: `el-templo-api/src/modules/admin/video-service.ts` — downloads, probes with ffprobe, conditionally compresses with ffmpeg (H.264, CRF 28, max 720p), extracts thumbnail, re-uploads
  - Note: AWS SDK v3.729+ checksum fix applied (`requestChecksumCalculation: "WHEN_REQUIRED"`)

**Caching / Ephemeral State:**
- Redis
  - Used by: `el-templo-bot/` for conversation context, customer profiles, distributed locks, bot state
  - Status: planned, not yet active — requires install on EC2
  - Client: ioredis 5.6 (`el-templo-bot/src/redis.ts` — stub, all TODO)
  - Connection: `REDIS_URL` env var (e.g., `redis://localhost:6379`)
  - Key patterns (designed, not yet implemented):
    - `wa:context:{phone}` — last N messages for AI context (TTL: 6h)
    - `wa:profile:{phone}` — persistent customer profile (TTL: 90d)
    - `wa:lock:{scheduler}` — distributed lock for cron schedulers
    - `wa:bot_state:{phone}` — `active` | `human_takeover`

## Authentication & Identity

**Auth Provider:**
- Custom JWT (no external identity provider)
  - Implementation: `el-templo-api/src/plugins/auth.ts` using `@fastify/jwt`
  - JWT payload: `{ userId: number, email: string, role: string }`
  - Roles: `member`, `coach`, `admin`, `superadmin`
  - Password hashing: argon2 (`argon2` package)
  - Token storage on native: `@capacitor/preferences` (secure key-value)
  - Token storage on web: `localStorage`
  - Required env vars: `JWT_SECRET`, `JWT_EXPIRES_IN` (default: `7d`)

## Monitoring & Observability

**Error Tracking:**
- Sentry
  - API: `@sentry/node` initialized in `el-templo-api/src/instrument.ts` (imported first in `src/index.ts`). Fastify error handler wired in `src/app.ts` via `Sentry.setupFastifyErrorHandler(app)`. User context set per authenticated request. Password fields scrubbed via `beforeSend`.
  - Member app: `@sentry/vue` in `el-templo-app/src/boot/sentry.ts` (first boot file). Browser tracing with router integration. Noisy errors (network, extension, ResizeObserver) filtered.
  - Admin app: `@sentry/vue` in `el-templo-admin/src/boot/sentry.ts` — same pattern.
  - Landing site: `@sentry/vue` in `el-templo-web/` — same pattern.
  - All guarded by DSN env var: `SENTRY_DSN` (API) / `VITE_SENTRY_DSN` (frontends)
  - Traces sample rate: `0.2` in production, `1.0` in development

**Logging:**
- Pino (via Fastify's built-in logger) — structured JSON logs in API and bot
- API logger: accessed via `request.log` or `app.log`
- Standalone cron jobs use `pino({ name: '...' })` directly (e.g., `el-templo-api/src/jobs/auto-approve.ts`)
- Frontend: `createLogger()` from `src/utils/logger.ts` (per CLAUDE.md — auto-sends errors to Sentry)

## CI/CD & Deployment

**Hosting:**
- AWS EC2 — API process, bot process, MySQL, Nginx reverse proxy
- Deployment scripts: `deploy/update-server.sh`, `deploy/backup.sh`, `deploy/restore.sh`
- Nginx config: `deploy/nginx.conf`

**CI Pipeline:**
- GitHub Actions (`.github/workflows/ci.yml`) — runs on every push
  - Steps: type check, lint, security audit, integration tests, build
- Deployment workflow: `deploy.yml` — build all 3 apps → backup current → rsync to EC2 → migrate → restart → smoke test → auto-rollback on failure
- Staging deploy: `deploy-staging.yml`
- Android APK build: `.github/workflows/build-android-staging.yml` — manual trigger, Java 21, Gradle `assembleStagingDebug`
- iOS TestFlight build: `.github/workflows/build-ios-staging.yml` — manual trigger (expensive macOS runner)

## Webhooks & Callbacks

**Incoming:**
- `POST /webhook` — WhatsApp Cloud API sends message events to bot (`el-templo-bot/`, port 3001). Not yet implemented.
- `GET /webhook` — WhatsApp webhook verification (Meta sends `hub.verify_token` challenge). Not yet implemented.

**Outgoing:**
- WhatsApp Cloud API — bot sends text messages and templates via Meta Graph API. Not yet implemented (`el-templo-bot/src/whatsapp/client.ts` stub).
- Resend — API sends transactional emails outbound via `el-templo-api/src/modules/email/service.ts`. Currently: password-set email for new members.

## Scheduled Jobs

**API (`el-templo-api/src/jobs/`):**
- `auto-approve.ts` — runs at 23:59 daily (Argentina/Buenos_Aires timezone) to auto-approve pending sessions for the next day. Uses `node-cron`.
- `mark-no-shows.ts` — marks unattended bookings as no-shows. Uses `node-cron`.

**Bot (`el-templo-bot/src/schedulers/`) — planned, not implemented:**
- `class-reminder.ts` — send class reminders before scheduled slots
- `trial-followup.ts` — follow up with trial attendees
- Both will use Redis distributed locks (`wa:lock:{scheduler}`) to prevent duplicate runs

## Internal Service Communication

**Bot → API:**
- For data-modifying actions (book class, register trial user), the bot calls `el-templo-api` via localhost HTTP
- Base URL env var: `API_BASE_URL` (default: `http://localhost:3000`)
- This avoids duplicating business logic in the bot

**Bot → MySQL:**
- Direct Drizzle ORM access for read queries (check schedule, check membership, look up conversation)
- Shared schema imported from `el-templo-api/src/db/schema/` via relative path

---

*Integration audit: 2026-03-17*

# Technology Stack

**Analysis Date:** 2026-03-17

## Languages

**Primary:**
- TypeScript 5.9 — all apps and services (strict mode in `el-templo-bot/`)
- JavaScript (ES Modules) — Quasar/Vite build tooling internals

**Secondary:**
- SQL — MySQL schema via Drizzle migrations in `el-templo-api/src/db/migrations/`

## Runtime

**Environment:**
- Node.js 22 — API (`el-templo-api/`) and bot (`el-templo-bot/`)
- Browser + Android/iOS native — member app (`el-templo-app/`) via Capacitor

**Package Manager:**
- pnpm 10.28.1
- Lockfiles: present per app, workspace managed from root `package.json`

## Frameworks

**Backend API (`el-templo-api/`):**
- Fastify 5.7 — HTTP server, plugin architecture, Pino logger built in
- Drizzle ORM 0.45 — type-safe MySQL query builder and schema manager
- `@fastify/jwt` 10 — JWT authentication plugin
- `@fastify/cors` 11 — CORS plugin

**Member App (`el-templo-app/`):**
- Quasar 2.16 + `@quasar/app-vite` 2.4 — Vue 3 SPA builder with Vite
- Vue 3.5 — UI framework
- Vue Router 4 — client-side routing
- Pinia 3 — state management (composition API `defineStore`)
- Capacitor 8 — native iOS/Android wrapper

**Admin App (`el-templo-admin/`):**
- Quasar 2.16 + `@quasar/app-vite` 2.4 — Vue 3 SPA (web-only, no Capacitor)
- Vue 3.5 / Vue Router 4 / Pinia 3 — same as member app

**Landing/Franchise Site (`el-templo-web/`):**
- Nuxt 4.3 — SSR/SSG framework
- `@nuxt/content` 3.12 — file-based content (blog/docs)
- `@nuxt/image` 2 — image optimization
- `@nuxtjs/sitemap` 7 — SEO sitemap generation
- `nuxt-schema-org` 5 — structured data

**WhatsApp Bot (`el-templo-bot/`):**
- Fastify 5.7 — webhook receiver (planned, not yet wired in `src/index.ts`)
- Drizzle ORM 0.45 — shared schema with API (imported via relative path)
- ioredis 5.6 — Redis client for conversation context/state (stub)
- node-cron 4 — proactive scheduler (stub)

**Testing (`el-templo-api/`):**
- Vitest 4 — test runner for both integration and unit tests
- Two configs: `vitest.config.ts` (integration) and `vitest.config.unit.ts` (unit)
- Tests run against real `eltemplo_test` MySQL database

**Build/Dev:**
- tsx 4 — TypeScript execution for development (`tsx watch`) and scripts
- tsc — TypeScript compiler for production builds (`dist/`)
- Vite (via Quasar/Nuxt) — frontend bundler

## Key Dependencies

**Critical:**
- `drizzle-orm` 0.45 + `mysql2` 3.16 — database layer; shared between API and bot
- `argon2` 0.44 — password hashing (API only)
- `@fastify/jwt` 10 — stateless auth, JWT payload: `{ userId, email, role }`
- `fastify-plugin` 5 — Fastify plugin encapsulation (database, r2, auth, spom, sessions, progression)

**Infrastructure:**
- `@aws-sdk/client-s3` 3.994 + `@aws-sdk/s3-request-presigner` 3.994 — Cloudflare R2 via S3-compatible API
- `resend` 6.9 — transactional email
- `@anthropic-ai/sdk` 0.78 — Anthropic Claude (API: franchise agent; bot: planned)
- `openai` 4.85 — OpenAI GPT (bot: planned)
- `@sentry/node` 10.38 — error monitoring (API)
- `@sentry/vue` 10.38/10.40 — error monitoring (all three frontend apps)
- `node-cron` 4 — cron jobs (API: auto-approve + mark-no-shows; bot: class reminders + trial followups)
- `pino` 10 + `pino-pretty` 13 — structured logging (API and bot)
- `csv-parse` 6 — CSV member import (API)
- `@faker-js/faker` 10 — seed data generation

**Frontend Utilities:**
- `axios` 1.13 — HTTP client (app + admin), with JWT interceptor and 401 redirect
- `chart.js` 4.5 + `vue-chartjs` / `vue-chart-3` — analytics charts
- `html5-qrcode` 2.3 — QR scanner (member app)
- `qrcode` 1.5 — QR generation (admin app)
- `pdfmake` 0.2 + `@types/pdfmake` — PDF export (admin app)
- `dompurify` 3 + `marked` 17 — Markdown rendering with XSS sanitization (admin app)
- `@capacitor/preferences` 8 — native secure key-value storage for JWT token
- `@capacitor-community/keep-awake` 8 — prevents screen sleep during workouts
- `leaflet` 1.9 — map component (landing site)

## Configuration

**Environment:**
- API: `.env.development` / `.env.production` loaded in `el-templo-api/src/index.ts` with dotenv fallback to `.env`
- Bot: `.env` loaded via `import "dotenv/config"` in `el-templo-bot/src/index.ts`
- Frontend apps: `VITE_*` prefix vars consumed at build time
- Example files: `el-templo-api/.env.example`, `el-templo-bot/.env.example`, `el-templo-app/.env.example`

**Build:**
- API: `tsconfig.json` + `tsc` → `dist/`
- Bot: `tsconfig.json` + `tsc` → `dist/`
- Frontends: Quasar CLI / Nuxt CLI → `dist/spa/` (app, admin) / `.output/` (web)
- Database: `el-templo-api/drizzle.config.ts` — schema at `src/db/schema/`, migrations at `src/db/migrations/`, dialect: mysql

## Platform Requirements

**Development:**
- Node.js 22, pnpm 10
- MySQL 8 running locally (`eltemplo` database for dev, `eltemplo_test` for tests)
- Redis not required for dev (bot stubs; API doesn't use Redis yet)
- ffmpeg + ffprobe installed on host for video post-processing (R2 pipeline)

**Production:**
- AWS EC2 — hosts API process (`node dist/index.js` on port 3000) and bot process (port 3001)
- MySQL 8 on EC2 (shared by API and bot)
- Redis on EC2 — required for bot (not yet deployed)
- Cloudflare R2 — video/file object storage
- Nginx — reverse proxy (config at `deploy/nginx.conf`)
- Android/iOS via Capacitor — member app builds via GitHub Actions (CI workflows in `.github/workflows/`)

---

*Stack analysis: 2026-03-17*

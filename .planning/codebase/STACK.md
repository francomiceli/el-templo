# Technology Stack

**Analysis Date:** 2026-03-10

## Languages

**Primary:**

- TypeScript 5.9.3 - All 4 apps (API, admin, member app, landing page)
- Vue 3.5.22 - Admin panel and member app frontend
- HTML - Page templates (Nuxt landing page)
- SCSS/SASS - Styling (Quasar apps and landing)
- CSS - Base styles (landing page)

**Secondary:**

- SQL - MySQL schema via Drizzle ORM

## Runtime

**Environment:**

- Node.js 20-28 (supports multiple LTS versions per package.json)
- Fastify 5.7.4 - HTTP server (API backend)

**Package Manager:**

- pnpm 10.28.1 - Monorepo workspace manager
- Lockfile: pnpm-lock.yaml (committed)

## Frameworks

**Backend:**

- Fastify 5.7.4 - HTTP server framework (`el-templo-api/`)
- Drizzle ORM 0.45.1 - Type-safe database layer with migrations

**Frontend (Admin & Member App):**

- Quasar 2.16.0 - UI framework (builds both admin and member apps)
- Vue 3.5.22 - Core UI library
- Vue Router 4.0.0 - Routing (admin and member app)

**Landing Page:**

- Nuxt 4.3.1 - SSR/Static site generator (`el-templo-web/`)
- Vue Router 5.0.3 - Routing
- @nuxt/content 3.12.0 - File-based blog CMS
- @nuxt/image 2.0.0 - Image optimization
- @nuxtjs/sitemap 7.6.0 - SEO sitemap
- nuxt-schema-org 5.0.10 - JSON-LD schema generation
- leaflet 1.9.4 - Maps (franchise locations)

**Mobile Bridge:**

- Capacitor 8.0.1 - iOS/Android bridge for member app
- @capacitor/core 8.0.1 - Core APIs
- @capacitor/cli 8.1.0 - Build tooling
- @capacitor/app 8.0.0 - App lifecycle
- @capacitor/preferences 8.0.0 - Local storage
- @capacitor/haptics 8.0.0 - Haptic feedback
- @capacitor-community/keep-awake 8.0.0 - Screen management

**Testing:**

- Vitest 4.0.18 - Unit/integration test runner (API and member app)
- @vitest/ui 4.0.18 - Test dashboard (optional)

**Build & Development:**

- @quasar/app-vite 2.4.1 - Quasar build toolchain (Vite-based)
- Vite - Bundler (Quasar and Nuxt)
- vite-plugin-checker 0.11.0 - Real-time ESLint checking
- TypeScript 5.9.3 - Type checking and compilation
- tsx 4.21.0 - TypeScript execution (dev scripts, migrations)
- drizzle-kit 0.31.9 - Schema generation and migrations

## Key Dependencies

**Critical (All Apps):**

- @fastify/jwt 10.0.0 - JWT auth plugin (API)
- @fastify/cors 11.2.0 - CORS handling
- argon2 0.44.0 - Password hashing
- axios 1.13.5 - HTTP client (frontend apps)
- pinia 3.0.4 - State management (admin and member app)
- vue-router (4.0.0, 5.0.3) - Routing

**API-Specific:**

- mysql2 3.16.1 - MySQL driver
- dotenv 17.2.3 - Environment configuration
- fastify-plugin 5.1.0 - Plugin utilities

**File Storage:**

- @aws-sdk/client-s3 3.994.0 - Cloudflare R2 client
- @aws-sdk/s3-request-presigner 3.994.0 - Presigned URLs

**Email & Messaging:**

- resend 6.9.3 - Email notifications

**AI:**

- @anthropic-ai/sdk 0.78.0 - Claude AI for franchise management

**Observability:**

- @sentry/node 10.38.0 - Error tracking (API)
- @sentry/vue 10.38.0 & 10.40.0 - Error tracking (frontend apps)
- pino 10.3.0 - Structured logging (API)
- pino-pretty 13.1.3 - Pretty-print logger

**Scheduling:**

- node-cron 4.2.1 - Cron job execution

**UI Components & Visualization:**

- chart.js 4.5.1 - Analytics charts
- vue-chartjs 5.3.3 - Vue wrapper for Chart.js (admin and member app)
- vue-chart-3 4.0.1 - Alternative chart wrapper (member app)
- qrcode 1.5.4 - QR code generation (attendance)
- html5-qrcode 2.3.8 - QR code scanning (check-in)
- qrcode (admin) - QR generation for attendance codes
- pdfmake 0.2.15 - PDF generation (admin reports)
- marked 17.0.3 - Markdown parsing (blog and landing)

**Fonts (Monorepo-wide):**

- @fontsource/montserrat 5.2.8 - Primary sans-serif
- @fontsource/geologica 5.2.8 - Modern variable font
- @fontsource/cormorant-garamond 5.2.11 - Serif accent
- @fontsource/cinzel 5.2.8 - Headline font (member app)

**Development Tools:**

- ESLint 9.39.2+ - Linting (all apps)
- Prettier 3.8.1+ - Code formatting
- @eslint/js 9.14.0 - ESLint JS rules
- eslint-plugin-vue 10.4.0 - Vue linting
- @vue/eslint-config-prettier 10.1.0 - Prettier integration
- typescript-eslint 8.54.0 - TypeScript ESLint
- vue-eslint-parser 10.2.0 - Vue template parsing
- @types/node 25.0.10 - Node type definitions
- autoprefixer 10.4.2 - CSS vendor prefixes
- postcss 8.4.14 - CSS transformation
- sass 1.89.1 - SCSS compilation
- vue-tsc 3.2.5 - Vue TypeScript type checking

**Utilities:**

- @faker-js/faker 10.3.0 - Test data generation
- csv-parse 6.1.0 - CSV parsing (data import)

## Configuration

**Environment Variables:**

API (`el-templo-api/.env.example`):

- Database: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
- Auth: JWT_SECRET, JWT_EXPIRES_IN
- Server: PORT, NODE_ENV
- CORS: FRONTEND_URL, ADMIN_URL
- R2: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
- Email: RESEND_API_KEY, FRANCHISE_NOTIFICATION_EMAIL, GLADIUS_NOTIFICATION_EMAIL, ACADEMY_NOTIFICATION_EMAIL, APP_NOTIFICATION_EMAIL
- AI: ANTHROPIC_API_KEY
- Monitoring: SENTRY_DSN (optional)
- Seed: SEED_ADMIN_PASSWORD, SEED_DEFAULT_PASSWORD

Admin Panel (`el-templo-admin/.env.example`):

- VITE_API_URL - API endpoint
- VITE_SENTRY_DSN - Error tracking (optional)
- VITE_APP_ENVIRONMENT - staging/production flag

Member App (`el-templo-app/.env.example`):

- VITE_API_URL - API endpoint
- VITE_APP_NAME - App display name
- VITE_SENTRY_DSN - Error tracking (optional)

Landing Page (`el-templo-web/.env.example`):

- NUXT_PUBLIC_API_URL - API endpoint
- NUXT_PUBLIC_SENTRY_DSN - Error tracking (optional)
- NUXT_PUBLIC_APP_ENVIRONMENT - Environment identifier
- NUXT_PUBLIC_GA4_ID - Google Analytics 4
- NUXT_PUBLIC_META_PIXEL_ID - Meta Pixel ID

**Database:**

- Config: `el-templo-api/drizzle.config.ts` (MySQL dialect)
- Schema: `el-templo-api/src/db/schema/` (modular table definitions)
- Migrations: `el-templo-api/src/db/migrations/` (auto-generated)
- Test DB: `eltemplo_test` (separate instance)
- Seeding: `el-templo-api/src/db/seed.ts`, `seed-staging.ts`, `seed-spom.ts`

**Build Configuration:**

- API: `tsconfig.json` (strict mode, ES2022 target)
- Admin: `tsconfig.json` + `quasar.conf.js` (Vite-based)
- Member app: `tsconfig.json` + `quasar.config.js` (Vite-based, Capacitor)
- Landing: `tsconfig.json` (strict mode)
- All: `.prettierrc`, ESLint configs

**Test Configuration:**

- API: `el-templo-api/vitest.config.ts` (sequential execution, 30s timeout)
- Member app: `el-templo-app/` (Vitest with UI option)

**Process Management:**

- API: `ecosystem.config.cjs` (PM2 config for production)

**Mobile:**

- `el-templo-app/capacitor.config.ts` - Capacitor configuration
- Package ID: com.eltemplo.app (staging: com.eltemplo.app.staging)

## Platform Requirements

**Development:**

- Node.js 20+ (pnpm 10.28.1)
- MySQL 8+ (local for API development)
- iOS/Android emulator or device (Capacitor)
- Git (monorepo)

**Production (All 4 Apps):**

- Node.js 20+ runtime
- EC2 instance (AWS) for all backend/frontend services
- MySQL 8+ managed database
- Cloudflare R2 (S3-compatible object storage)
- Resend account (email notifications)
- Anthropic API key (franchise AI agent)
- Sentry projects (optional error monitoring)
- Google Analytics 4 (landing page)
- Meta Pixel (landing page conversion tracking)

**CI/CD:**

- GitHub Actions (automated on push)
- Husky + lint-staged (pre-commit hooks)
- Build: TypeScript compilation + Vite bundling
- Test: Vitest integration tests (API and member app)
- Deployment: rsync to EC2 + process restart

**Mobile Distribution:**

- Apple App Store (iOS)
- Google Play Store (Android)
- TestFlight (beta testing)
- Firebase App Distribution (internal testing)

---

_Stack analysis: 2026-03-10_

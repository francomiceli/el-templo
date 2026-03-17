# Codebase Structure

**Analysis Date:** 2026-03-17

## Directory Layout

```
el-templo/                          # Monorepo root
├── el-templo-api/                  # Backend API (Fastify + Drizzle + MySQL)
│   ├── src/
│   │   ├── index.ts                # Server entry point
│   │   ├── app.ts                  # App assembly (plugins + routes)
│   │   ├── instrument.ts           # Sentry initialization
│   │   ├── plugins/                # Fastify plugins (db, auth, r2, etc.)
│   │   ├── modules/                # Domain modules (routes + services)
│   │   ├── db/                     # Database schema, migrations, seeds
│   │   └── jobs/                   # Cron jobs (node-cron)
│   ├── test/                       # Integration tests (vitest)
│   ├── ecosystem.config.cjs        # PM2 config (api + bot processes)
│   ├── drizzle.config.ts           # Drizzle Kit config
│   ├── vitest.config.ts            # Integration test config
│   ├── vitest.config.unit.ts       # Unit test config
│   └── package.json
├── el-templo-admin/                # Admin/coach web app (Quasar + Vue 3)
│   └── src/
│       ├── boot/                   # Boot files (axios, sentry, modules)
│       ├── layouts/                # AdminLayout.vue (app shell)
│       ├── pages/                  # One page per feature
│       ├── composables/            # useXxxApi.ts — API call composables
│       ├── stores/                 # Pinia stores (auth, admin)
│       ├── components/             # Reusable Vue components
│       ├── constants/              # Static config values
│       ├── types/                  # Shared TypeScript types
│       ├── utils/                  # Helpers (pdf/, logger, etc.)
│       ├── css/                    # Global styles
│       └── router/                 # Vue Router routes
├── el-templo-app/                  # Member mobile app (Quasar + Vue 3 + Capacitor)
│   └── src/
│       ├── boot/                   # Boot files (axios, sentry, modules)
│       ├── layouts/                # App shell layout
│       ├── pages/                  # Top-level pages
│       ├── modules/                # Feature modules (training, journey, progression)
│       │   ├── training/           # Session player, week view, day player
│       │   │   ├── components/     # Including player/ subdir
│       │   │   ├── composables/
│       │   │   ├── data/
│       │   │   ├── pages/
│       │   │   ├── stores/
│       │   │   ├── types/
│       │   │   └── utils/
│       │   ├── journey/            # Member journey lifecycle
│       │   │   ├── components/
│       │   │   ├── composables/
│       │   │   ├── pages/
│       │   │   └── stores/
│       │   └── progression/        # Stats, evaluations
│       │       ├── components/
│       │       ├── composables/
│       │       ├── pages/
│       │       └── stores/
│       ├── composables/            # Shared composables
│       ├── stores/                 # Global Pinia stores (auth, user)
│       ├── types/                  # Shared types
│       ├── utils/                  # Shared utilities
│       ├── css/                    # Global styles
│       └── router/                 # Vue Router routes
├── el-templo-bot/                  # WhatsApp AI chatbot (scaffold)
│   └── src/
│       ├── index.ts                # Entry point (webhook server + schedulers)
│       ├── ai/                     # AI provider interface + implementations
│       │   ├── provider.ts         # AiProvider interface + factory
│       │   ├── openai.ts           # OpenAI implementation (stub)
│       │   ├── anthropic.ts        # Anthropic implementation (stub)
│       │   └── tools.ts            # Tool definitions for function calling
│       ├── whatsapp/               # WhatsApp Cloud API client
│       │   ├── client.ts           # Send/verify functions (stub)
│       │   └── types.ts            # Meta webhook payload types
│       ├── memory/                 # Redis-backed customer memory
│       │   ├── session.ts          # Session context (6h TTL, stub)
│       │   └── profile.ts          # Customer profile (90d TTL, stub)
│       ├── state/                  # Client state machine
│       │   └── machine.ts          # LEAD → TRIAL → ACTIVE_MEMBER → LAPSED → RETURNING
│       ├── schedulers/             # Proactive message schedulers
│       │   ├── class-reminder.ts   # Pre-class reminder (stub)
│       │   └── trial-followup.ts   # Post-trial follow-up (stub)
│       ├── db.ts                   # Drizzle connection (shares schema with API)
│       └── redis.ts                # ioredis singleton (stub)
├── el-templo-web/                  # Public website (Nuxt 3, SSR)
│   └── (standard Nuxt directory structure)
├── contexto/                       # Context files for bot development
│   ├── whatsapp-bot-architecture.txt     # Architecture decisions document
│   ├── whatsapp-bot-developer-handoff.md # Full developer handoff guide
│   ├── contexto-whatsapp-meta.txt        # Meta Cloud API notes
│   └── whatsapp-agent-renovafacil/       # Reference bot (Python/Flask)
│       ├── app.py                  # Flask entry point
│       ├── message_processor.py    # AI message processing + tool dispatch
│       ├── client_state.py         # State machine with Lua atomic transitions
│       ├── customer_memory.py      # Two-layer Redis memory system
│       ├── whatsapp_client.py      # WhatsApp Cloud API client
│       ├── webhook_whatsapp.py     # Webhook handler
│       ├── human_handoff.py        # Human takeover logic
│       ├── config.py               # System prompt + business config
│       ├── redis_client.py         # Redis singleton
│       ├── abandoned_carts.py      # Scheduler with distributed locks
│       └── (40+ other .py files)
├── deploy/                         # Deployment infrastructure
│   ├── setup-ec2.sh               # EC2 provisioning script
│   ├── update-server.sh           # Deployment script
│   ├── backup.sh / restore.sh     # Database backup/restore
│   ├── nginx.conf                 # Nginx reverse proxy config
│   ├── nginx/                     # Additional nginx configs
│   └── staging/                   # Staging environment configs
├── .github/workflows/             # CI/CD (GitHub Actions)
├── .planning/                     # GSD planning system
│   ├── codebase/                  # Codebase analysis docs (this file)
│   ├── phases/                    # Phase plans (01 through 59)
│   ├── quick/                     # Quick fix plans
│   ├── debug/                     # Debug session notes
│   └── research/                  # Research notes
├── docs/                          # Project documentation
├── .husky/                        # Git hooks (pre-commit: lint-staged)
├── package.json                   # Root: husky + lint-staged + prettier
├── CLAUDE.md                      # AI development guidelines
└── README.md                      # Project overview
```

---

## Directory Purposes

**`el-templo-api/src/plugins/`:**
- Purpose: Fastify plugins that decorate the instance with shared services
- Contains: `database.ts`, `auth.ts`, `r2.ts`, `spom.ts`, `sessions.ts`, `progression.ts`
- Key files: `database.ts` (provides `fastify.db`), `auth.ts` (provides `fastify.authenticate`)

**`el-templo-api/src/modules/<name>/`:**
- Purpose: One directory per business domain; each module is self-contained
- Contains: `index.ts` (barrel), `routes.ts` (FastifyPluginAsync), `service.ts` (class), `types.ts`, `schemas.ts`
- Key files: `shared/error-handler.ts` (used by all route handlers), `shared/errors.ts` (AppError hierarchy)

**`el-templo-api/src/db/schema/`:**
- Purpose: Drizzle ORM table definitions — one file per table or closely related table group
- Contains: 30+ schema files (users, bookings, sessions, whatsapp, etc.)
- Key files: `index.ts` (re-exports all schemas), `whatsapp.ts` (conversations + messages tables)

**`el-templo-api/src/db/migrations/`:**
- Purpose: SQL migration files managed by Drizzle Kit
- Contains: Numbered `.sql` files + `meta/` directory with migration metadata

**`el-templo-api/test/`:**
- Purpose: Integration tests organized by module
- Contains: One subdirectory per module (e.g., `test/attendance/`, `test/scheduling/`)
- Key files: `helpers.ts` (test app factory, auth token helpers), `setup.ts` (global test setup)

**`el-templo-admin/src/composables/`:**
- Purpose: API call composables — one per domain
- Contains: `useXxxApi.ts` files (e.g., `useAttendanceApi.ts`, `useMembersApi.ts`, `useSchedulingApi.ts`)
- Pattern: Each exposes `loading: Ref<boolean>`, `error: Ref<string | null>`, named async methods, `cleanup()`

**`el-templo-admin/src/pages/`:**
- Purpose: One Vue SFC per admin feature page
- Contains: `AlumnosPage.vue`, `HorariosPage.vue`, `PagosPage.vue`, `SessionEditPage.vue`, etc.
- Key files: `LoginPage.vue` (public, no layout), all others under `AdminLayout.vue`

**`el-templo-app/src/modules/`:**
- Purpose: Feature modules with their own components, composables, pages, stores
- Contains: `training/`, `journey/`, `progression/`
- Pattern: Each module mirrors the app-level structure (components/, composables/, pages/, stores/)

**`el-templo-bot/src/ai/`:**
- Purpose: Model-agnostic AI integration
- Contains: Provider interface, OpenAI/Anthropic implementations, tool definitions
- Key files: `provider.ts` (interface + factory), `tools.ts` (6 tool definitions for function calling)

**`contexto/whatsapp-agent-renovafacil/`:**
- Purpose: Reference implementation of a production WhatsApp bot (Python/Flask)
- Contains: 50+ Python files covering all bot patterns (AI, state, memory, scheduling, webhooks)
- Key files: `message_processor.py`, `client_state.py`, `customer_memory.py`, `whatsapp_client.py`
- Note: Use for architecture patterns only — code cannot be copied (Python → TypeScript)

---

## Key File Locations

**Entry Points:**
- `el-templo-api/src/index.ts`: API server startup
- `el-templo-api/src/app.ts`: App assembly (all plugins + routes registered here)
- `el-templo-bot/src/index.ts`: Bot process startup
- `el-templo-admin/src/boot/axios.ts`: Admin API client setup
- `el-templo-app/src/boot/axios.ts`: Member app API client setup

**Configuration:**
- `el-templo-api/ecosystem.config.cjs`: PM2 process definitions (api + bot)
- `el-templo-api/drizzle.config.ts`: Drizzle Kit migration config
- `el-templo-api/vitest.config.ts`: Integration test config
- `el-templo-admin/src/router/routes.ts`: Admin route definitions (role guards in `meta`)
- `el-templo-app/src/router/routes.ts`: Member app route definitions
- `package.json` (root): husky + lint-staged + prettier

**Core Logic:**
- `el-templo-api/src/modules/scheduling/service.ts`: Schedule/booking business logic
- `el-templo-api/src/modules/attendance/service.ts`: QR check-in, attendance tracking
- `el-templo-api/src/modules/subscriptions/service.ts`: Subscription lifecycle
- `el-templo-api/src/modules/members/service.ts`: Member CRUD
- `el-templo-api/src/modules/whatsapp/service.ts`: WhatsApp conversation management
- `el-templo-api/src/modules/admin/edit-service.ts`: Session editing facade

**Database:**
- `el-templo-api/src/db/schema/index.ts`: Schema barrel export
- `el-templo-api/src/db/schema/whatsapp.ts`: WhatsApp tables (conversations + messages)
- `el-templo-api/src/db/schema/users.ts`: Users table
- `el-templo-api/src/db/schema/bookings.ts`: Bookings table
- `el-templo-api/src/db/schema/schedules.ts`: Class schedules
- `el-templo-api/src/db/schema/subscriptions.ts`: Subscriptions table
- `el-templo-api/src/db/schema/attendance.ts`: Attendance records

**Shared Utilities:**
- `el-templo-api/src/modules/shared/error-handler.ts`: `handleServiceError()`
- `el-templo-api/src/modules/shared/errors.ts`: `AppError`, `BadRequestError`, `NotFoundError`, `ConflictError`
- `el-templo-api/src/modules/shared/date-utils.ts`: Date helpers
- `el-templo-api/src/modules/shared/qr-token.ts`: QR token generation/validation

**Testing:**
- `el-templo-api/test/helpers.ts`: `createTestApp()`, `getAuthToken()`, request utilities
- `el-templo-api/test/setup.ts`: Global test setup (database)

**Bot Context Documents:**
- `contexto/whatsapp-bot-architecture.txt`: All architecture decisions with rationale
- `contexto/whatsapp-bot-developer-handoff.md`: Complete developer guide with code patterns

---

## Naming Conventions

**Files:**
- API modules: `kebab-case.ts` (e.g., `edit-service.ts`, `exercise-swap-service.ts`, `error-handler.ts`)
- DB schema: `kebab-case.ts` matching table group (e.g., `blog-tags.ts`, `aura-balances.ts`, `whatsapp.ts`)
- Admin/App pages: `PascalCase.vue` with `Page` suffix (e.g., `AlumnosPage.vue`, `HorariosPage.vue`)
- Admin composables: `camelCase.ts` with `use` prefix (e.g., `useAttendanceApi.ts`, `useMembersApi.ts`)
- App module files: `camelCase.ts` (e.g., `sessionPlayerStore.ts`, `weekStore.ts`)
- Tests: Mirror source structure, no `.test.` or `.spec.` suffix — tests live in `test/<module>/` dirs

**Directories:**
- API modules: `kebab-case` matching domain (e.g., `app-landing/`, `whatsapp/`)
- App feature modules: `kebab-case` (e.g., `training/`, `journey/`, `progression/`)
- Admin components: `kebab-case` topic dirs (e.g., `components/analytics/`, `components/scheduling/`)

---

## Where to Add New Code

**New API Module:**
1. Create directory: `el-templo-api/src/modules/<name>/`
2. Add files: `index.ts`, `routes.ts`, `service.ts`, `types.ts`, `schemas.ts`
3. Register in `el-templo-api/src/app.ts`: `await app.register(xxxRoutes, { prefix: "/api/..." })`
4. Add tests: `el-templo-api/test/<name>/`
5. Follow `modules/attendance/` as the canonical example for the route→service→types pattern

**New Database Table:**
1. Create schema file: `el-templo-api/src/db/schema/<name>.ts`
2. Export from: `el-templo-api/src/db/schema/index.ts`
3. Generate migration: `pnpm drizzle-kit generate`
4. Run migration: `pnpm drizzle-kit push` or run the migration script

**New Admin Page:**
1. Create page: `el-templo-admin/src/pages/<Name>Page.vue`
2. Create composable: `el-templo-admin/src/composables/use<Name>Api.ts`
3. Add route: `el-templo-admin/src/router/routes.ts` (under AdminLayout children)
4. Add sidebar link in `el-templo-admin/src/layouts/AdminLayout.vue`
5. Follow `AlumnosPage.vue` + `useMembersApi.ts` as reference

**New Admin Component:**
- Reusable components: `el-templo-admin/src/components/` (in topic subdirectory if needed)
- Page-specific components: Keep in the same page file unless extracting for reuse

**New Member App Feature:**
1. Create module directory: `el-templo-app/src/modules/<name>/`
2. Add subdirs: `components/`, `composables/`, `pages/`, `stores/`
3. Follow `modules/training/` as reference
4. Register routes in `el-templo-app/src/router/routes.ts`

**New Bot Feature:**
1. Follow the existing scaffold structure in `el-templo-bot/src/`
2. AI tools: add to `BOT_TOOLS` array in `el-templo-bot/src/ai/tools.ts`
3. New scheduler: `el-templo-bot/src/schedulers/<name>.ts`
4. For DB actions: call `el-templo-api` via localhost HTTP (do not duplicate business logic)
5. For DB reads: query directly via Drizzle (shared schema from `el-templo-api/src/db/schema`)

**New Cron Job (API):**
1. Create: `el-templo-api/src/jobs/<name>.ts`
2. Export a `startXxxJob(db)` function
3. Call from `el-templo-api/src/index.ts` after server is ready

**Shared Utilities (API):**
- Add to `el-templo-api/src/modules/shared/`
- Export from `el-templo-api/src/modules/shared/index.ts`

---

## Special Directories

**`contexto/`:**
- Purpose: Context documents and reference implementations for bot development
- Generated: No — manually curated
- Committed: Yes
- Note: `whatsapp-agent-renovafacil/` is a full cloned repo (has its own `.git/`); use as read-only reference

**`.planning/`:**
- Purpose: GSD planning system — phase plans, codebase analysis, research
- Generated: By GSD commands (`/gsd:map-codebase`, `/gsd:plan-phase`, etc.)
- Committed: Yes

**`deploy/`:**
- Purpose: Deployment scripts, nginx config, runbook
- Key files: `setup-ec2.sh` (provisioning), `update-server.sh` (deploys), `nginx.conf` (reverse proxy)
- Committed: Yes

**`docs/`:**
- Purpose: Project documentation
- Committed: Yes

**`.github/workflows/`:**
- Purpose: CI/CD pipeline (type check, lint, audit, test, build)
- Committed: Yes

---

*Structure analysis: 2026-03-17*

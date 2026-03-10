# Codebase Structure

**Analysis Date:** 2026-03-10

## Directory Layout

```
/home/franco/projects/el-templo/
├── el-templo-api/          # Fastify backend REST API
├── el-templo-admin/        # Quasar admin panel (coaches/admins)
├── el-templo-app/          # Quasar member app (training + mobile)
├── el-templo-web/          # Nuxt 3 landing page (public marketing)
├── .planning/              # GSD planning documents and phases
│   └── codebase/          # This file and related codebase maps
├── .github/               # GitHub workflows (CI/CD)
└── [legacy codebases]     # arete-app/, arete-web/, El-Templo-Net/ — reference only, not active
```

## Directory Purposes

**el-templo-api/ — Backend API:**

- **Purpose:** REST API serving all client applications
- **Contains:** Fastify routes, service layer, database schema, plugins, jobs, database migrations
- **Key files:**
  - `src/index.ts` - Server entry point
  - `src/app.ts` - Fastify app factory, registers plugins and routes
  - `src/instrument.ts` - Sentry initialization
  - `src/modules/` - 21 feature modules (auth, members, scheduling, payments, etc.)
  - `src/db/schema/` - Drizzle ORM table definitions (30+ schema files)
  - `src/db/migrations/` - SQL migration files
  - `src/plugins/` - Fastify plugins (database, auth, R2, sessions, progression, SPOM)

**el-templo-admin/ — Admin Panel:**

- **Purpose:** Quasar web app for coaches/admins to manage gym operations
- **Contains:** Vue 3 components, pages, composables, stores, router
- **Key files:**
  - `src/pages/` - Admin pages (Sessions, Members, Analytics, Payments, Scheduling, etc.)
  - `src/layouts/AdminLayout.vue` - Main layout with sidebar navigation
  - `src/composables/` - API client composables (useMembersApi, useSchedulingApi, etc.)
  - `src/stores/` - Pinia stores (useAuthStore, useAdminStore)
  - `src/router/index.ts` - Route guard and role-based access control
  - `src/types/` - TypeScript types for admin domain

**el-templo-app/ — Member App:**

- **Purpose:** Quasar app for members to train, check in, reserve classes, view subscriptions
- **Contains:** Vue 3 components, pages, composables, stores, router, Capacitor integration
- **Key files:**
  - `src/pages/` - Member pages (Login, Register, CheckIn, Reservas/Scheduling, Profile, Index)
  - `src/layouts/MainLayout.vue` - Member layout with bottom navigation
  - `src/composables/` - API client composables (useAttendanceApi, useSchedulingApi)
  - `src/stores/` - Pinia stores (useAuthStore, useUserStore)
  - `src/router/index.ts` - Route guard checking authentication
  - `src/modules/` - Feature-specific sub-modules
  - `src-capacitor/` - Capacitor native app config (iOS/Android)

**el-templo-web/ — Landing Page:**

- **Purpose:** Nuxt 3 SSR/SSG application for public marketing
- **Contains:** Nuxt pages, components, content, server routes, blog
- **Key files:**
  - `pages/` - Nuxt pages (index, academy, franquicias, gladius, app.vue, blog/)
  - `components/` - Vue components reused across pages
  - `content/` - Blog posts and markdown content
  - `server/api/` - Server-side API routes
  - `composables/` - Utilities for analytics, scroll tracking, UI interactions
  - `nuxt.config.ts` - Nuxt configuration (SSR, modules, routes)

## Key File Locations

**Entry Points:**

- API server: `/home/franco/projects/el-templo/el-templo-api/src/index.ts` (loads env, starts server)
- API app factory: `/home/franco/projects/el-templo/el-templo-api/src/app.ts` (registers plugins, routes)
- Admin app: `/home/franco/projects/el-templo/el-templo-admin/src/` (Quasar handles entry)
- Member app: `/home/franco/projects/el-templo/el-templo-app/src/` (Quasar handles entry)
- Web app: `/home/franco/projects/el-templo/el-templo-web/nuxt.config.ts` (Nuxt configuration)

**Configuration:**

- API: `.env`, `.env.development`, `.env.production` (database, JWT, Sentry, AWS)
- Admin: `.env.example` (VITE_API_URL, VITE_SENTRY_DSN)
- Member: `.env.example` (VITE_API_URL, VITE_SENTRY_DSN)
- Web: `.env.example` (NUXT_PUBLIC_API_URL)

**Core Backend Logic:**

- Authentication: `/home/franco/projects/el-templo/el-templo-api/src/modules/auth/` (routes, service, schemas)
- Members: `/home/franco/projects/el-templo/el-templo-api/src/modules/members/` (CRUD, notes)
- Sessions: `/home/franco/projects/el-templo/el-templo-api/src/modules/sessions/` (session generation, retrieval)
- Scheduling: `/home/franco/projects/el-templo/el-templo-api/src/modules/scheduling/` (activities, bookings, holidays)
- Attendance: `/home/franco/projects/el-templo/el-templo-api/src/modules/attendance/` (QR check-in, history)
- Payments: `/home/franco/projects/el-templo/el-templo-api/src/modules/payments/` (record, void, balance)
- Subscriptions: `/home/franco/projects/el-templo/el-templo-api/src/modules/subscriptions/` (plans, member subs)
- Analytics: `/home/franco/projects/el-templo/el-templo-api/src/modules/analytics/` (KPIs, member stats, financial)

**Database:**

- Schema definitions: `/home/franco/projects/el-templo/el-templo-api/src/db/schema/` (30+ Drizzle tables)
- Migrations: `/home/franco/projects/el-templo/el-templo-api/src/db/migrations/`
- Seed scripts: `/home/franco/projects/el-templo/el-templo-api/src/db/seed.ts`, `seed-spom.ts`, `seed-staging.ts`

**Plugins (Backend):**

- Database: `/home/franco/projects/el-templo/el-templo-api/src/plugins/database.ts` (Drizzle ORM, MySQL pool)
- Auth: `/home/franco/projects/el-templo/el-templo-api/src/plugins/auth.ts` (JWT verification)
- R2 (S3): `/home/franco/projects/el-templo/el-templo-api/src/plugins/r2.ts` (AWS file uploads)
- Sessions: `/home/franco/projects/el-templo/el-templo-api/src/plugins/sessions.ts` (session data access)
- Progression: `/home/franco/projects/el-templo/el-templo-api/src/plugins/progression.ts` (member evaluation)
- SPOM: `/home/franco/projects/el-templo/el-templo-api/src/plugins/spom.ts` (training data)

**Testing (Backend):**

- Test directory: `/home/franco/projects/el-templo/el-templo-api/test/`
- Helpers: `/home/franco/projects/el-templo/el-templo-api/test/helpers.ts` (createApp, authenticated requests)
- Config: `/home/franco/projects/el-templo/el-templo-api/vitest.config.ts`

**Testing (Frontend):**

- Member app: `/home/franco/projects/el-templo/el-templo-app/` (Vitest + @vitest/ui)
- Config: `vitest.config.ts` in each app root

## Naming Conventions

**Files:**

- Routes: `modules/[feature]/routes.ts` (HTTP handlers)
- Services: `modules/[feature]/service.ts` (business logic, class-based)
- Schemas: `modules/[feature]/schemas.ts` (Zod validation schemas)
- Types: `modules/[feature]/types.ts` (TypeScript interfaces)
- Index: `modules/[feature]/index.ts` (public exports)
- Composables: `useApiFeature.ts` or `useFeatureName.ts` (camelCase, use prefix)
- Stores: `useFeatureStore.ts` (Pinia, camelCase with Store suffix)
- Components: `ComponentName.vue` (PascalCase)
- Pages: `PageNamePage.vue` (PascalCase, Page suffix)
- Layouts: `LayoutName.vue` (PascalCase)
- Database tables: `kebab-case.ts` (e.g., `blog-posts.ts`, `member-journeys.ts`)
- Database columns: `camelCase` in TypeScript definitions
- API routes: `/api/[feature]` or `/api/[role]/[feature]` (lowercase)

**Directories:**

- Feature modules: `modules/[feature-name]/` (kebab-case)
- Composables: `composables/` (flat, no subdirs)
- Pages: `pages/` (flat, no subdirs unless nested routes)
- Components: `components/` (flat or `components/[category]/` for organization)
- Stores: `stores/` (flat)
- Utils: `utils/` (flat or `utils/[category]/` for organization)
- Types: `types/` (flat)

## Where to Add New Code

**New Backend Feature:**

1. Create module directory: `/home/franco/projects/el-templo/el-templo-api/src/modules/[feature-name]/`
2. Create files: `index.ts`, `types.ts`, `schemas.ts`, `service.ts`, `routes.ts`
3. Export routes from `index.ts`, import and register in `/home/franco/projects/el-templo/el-templo-api/src/app.ts`
4. Create schema tables in `/home/franco/projects/el-templo/el-templo-api/src/db/schema/[feature-name].ts`
5. Create migration: `drizzle-kit generate` and commit migration file

**New Admin Page/Feature:**

- Pages: `/home/franco/projects/el-templo/el-templo-admin/src/pages/[FeatureName]Page.vue`
- API composable: `/home/franco/projects/el-templo/el-templo-admin/src/composables/use[Feature]Api.ts`
- Add route in `/home/franco/projects/el-templo/el-templo-admin/src/router/routes.ts`
- Add layout if needed: `/home/franco/projects/el-templo/el-templo-admin/src/layouts/[LayoutName].vue`

**New Member App Page/Feature:**

- Pages: `/home/franco/projects/el-templo/el-templo-app/src/pages/[FeatureName]Page.vue`
- API composable: `/home/franco/projects/el-templo/el-templo-app/src/composables/use[Feature]Api.ts`
- Store if needed: `/home/franco/projects/el-templo/el-templo-app/src/stores/use[Feature]Store.ts`
- Add route in `/home/franco/projects/el-templo/el-templo-app/src/router/routes.ts`

**New Landing Page:**

- Pages: `/home/franco/projects/el-templo/el-templo-web/pages/[page-name].vue`
- Content (blog): `/home/franco/projects/el-templo/el-templo-web/content/blog/[slug].md`
- Components: `/home/franco/projects/el-templo/el-templo-web/components/[ComponentName].vue`

**Shared Utilities (Backend):**

- Helpers: `/home/franco/projects/el-templo/el-templo-api/src/shared/utils/` (create file as needed)

**Shared Utilities (Frontend):**

- Admin utilities: `/home/franco/projects/el-templo/el-templo-admin/src/utils/`
- Member app utilities: `/home/franco/projects/el-templo/el-templo-app/src/utils/`

## Special Directories

**Backend Modules:**

- Purpose: Feature-based organization — each module handles one business domain
- Generated: No (hand-written routes, services, schemas)
- Committed: Yes (all source code)
- List (21 modules): academy, admin, analytics, app-landing, attendance, aura, auth, blog, franchise, gladius, journeys, lifestyle, members, payments, progression, scheduling, sessions, shared, spom, subscriptions
- Module structure: Each has `index.ts` (exports), `types.ts` (interfaces), `schemas.ts` (Zod validation), `service.ts` (business logic), `routes.ts` (HTTP handlers)

**Backend Database:**

- Schema files: `/home/franco/projects/el-templo/el-templo-api/src/db/schema/` (30+ tables, one file per table)
- Migrations: `/home/franco/projects/el-templo/el-templo-api/src/db/migrations/` (auto-generated by `drizzle-kit generate`)
- Generated: Migrations auto-generated by drizzle-kit, schema files hand-written
- Committed: Yes (schema and migrations)

**Frontend Composables:**

- Purpose: Reusable API client and state logic for components
- Generated: No
- Committed: Yes
- Admin app: 12 API composables (useAnalyticsApi, useMembersApi, useSchedulingApi, etc.)
- Member app: 3 API composables (useAttendanceApi, useSchedulingApi, useTokenStorage)

**Frontend Assets:**

- Admin: `/home/franco/projects/el-templo/el-templo-admin/public/icons/` (favicon, SVGs)
- Member: `/home/franco/projects/el-templo/el-templo-app/public/icons/` (same)
- Member: `/home/franco/projects/el-templo/el-templo-app/src/assets/` (images, icons)
- Web: `/home/franco/projects/el-templo/el-templo-web/public/` (static assets, fonts)
- Generated: No
- Committed: Yes

**Frontend Dist/Build:**

- Admin: `el-templo-admin/dist/` (generated by `quasar build`)
- Member: `el-templo-app/dist/` (generated by `quasar build`)
- Web: `el-templo-web/.output/` and `el-templo-web/dist/` (generated by `nuxt build`)
- Generated: Yes
- Committed: No (ignored in .gitignore)

**Jobs (Backend):**

- Location: `/home/franco/projects/el-templo/el-templo-api/src/jobs/`
- Purpose: Cron jobs and background tasks
- Example: `auto-approve.ts` (runs daily to auto-approve pending subscriptions)
- Started in: `src/index.ts` after server starts

---

_Structure analysis: 2026-03-10_

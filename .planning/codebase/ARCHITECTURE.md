# Architecture

**Analysis Date:** 2026-03-10

## Pattern Overview

**Overall:** Modular monolith with distributed client-server architecture.

**Key Characteristics:**

- 4 independent applications sharing a single backend API
- Feature-based module organization in backend (21 modules)
- Separated data layers: backend Fastify + Drizzle ORM, frontend Quasar + Pinia
- Admin and member clients as separate frontend apps with different feature sets
- Nuxt landing page as static SSR application
- JWT-based stateless authentication across all apps

## Layers

**Backend (el-templo-api):**

- **Purpose:** REST API serving three client apps (admin, member app, landing page)
- **Location:** `/home/franco/projects/el-templo/el-templo-api/src/`
- **Contains:** Fastify server, Drizzle ORM database access, 21 feature modules, plugins, database schema
- **Depends on:** MySQL database, AWS S3 (R2), JWT auth, Sentry
- **Used by:** el-templo-admin, el-templo-app, el-templo-web frontend apps

**Admin Frontend (el-templo-admin):**

- **Purpose:** Quasar web app for coaches and admins to manage sessions, members, payments, attendance, analytics
- **Location:** `/home/franco/projects/el-templo/el-templo-admin/src/`
- **Contains:** Vue 3 components, pages, composables, Pinia store, router, type definitions
- **Depends on:** el-templo-api, Axios
- **Used by:** Coaches, admins accessing admin.eltemplo.org

**Member App (el-templo-app):**

- **Purpose:** Quasar mobile-responsive web app for members to view training, check in, reserve classes, view subscriptions
- **Location:** `/home/franco/projects/el-templo/el-templo-app/src/`
- **Contains:** Vue 3 components, pages, composables, Pinia stores, router, Capacitor integration for mobile
- **Depends on:** el-templo-api, Axios, Capacitor (for native features)
- **Used by:** Members accessing app.eltemplo.org or native mobile app

**Landing Page (el-templo-web):**

- **Purpose:** Nuxt 3 SSR application for public-facing marketing pages (home, academy, franchise, blog, Gladius)
- **Location:** `/home/franco/projects/el-templo/el-templo-web/`
- **Contains:** Nuxt pages, components, composables, content (via @nuxt/content), server routes
- **Depends on:** el-templo-api (for form submissions and blog content), Nuxt ecosystem
- **Used by:** Public users accessing eltemplo.org

## Data Flow

**Authentication Flow:**

1. Client POSTs credentials to `/api/auth/login` or `/api/auth/register`
2. Backend validates, hashes password with Argon2, creates JWT token
3. Client stores token (localStorage for web, Capacitor Preferences for mobile)
4. Axios interceptors automatically attach token to all requests as `Authorization: Bearer <token>`
5. Backend authenticates every route via `fastify.authenticate` hook
6. Token expires (default 7 days) — client redirects to login on 401 response

**Member/Admin Separation:**

- Backend uses role-based access control: checks user.role (member/coach/admin/superadmin)
- Admin app: Router guard checks `auth/me` endpoint, verifies role is admin/coach/superadmin, blocks members
- Member app: Router guard checks isAuthenticated flag, allows only members
- Both apps have axios 401 interceptor that clears token and redirects to login

**Session/Training Data Flow:**

1. Admin app: Admin creates/edits sessions (POST/PATCH `/api/admin/sessions`)
2. Backend: Service layer validates, saves to database
3. Member app: Fetches session data (GET `/api/sessions`)
4. Member checks in via QR scan (POST `/api/members/attendance/checkin`)
5. Analytics: Admin views aggregated stats (GET `/api/admin/analytics/*`)

**Scheduling Data Flow:**

1. Admin creates activities and schedules (POST `/api/admin/scheduling/activities`)
2. Admin sets branch holidays (POST `/api/admin/scheduling/holidays`)
3. Members view weekly grid with available bookings (GET `/api/members/scheduling/grid`)
4. Members reserve/cancel bookings (POST/DELETE `/api/members/scheduling/bookings`)
5. Admin confirms attendance (PATCH `/api/admin/attendance/batch-confirm`)

**Payment & Subscription Flow:**

1. Admin creates subscription plan (POST `/api/admin/subscriptions/plans`)
2. Admin creates member subscription (POST `/api/admin/subscriptions`)
3. Admin records payment (POST `/api/admin/payments/record`)
4. System tracks overdue subscriptions (endDate < today and payment < price)
5. Admin can void payments (PATCH `/api/admin/payments/:paymentId/void`)

**State Management (Frontend):**

- Admin: `useAuthStore` (token, user, login, logout) + individual composable APIs
- Member: `useAuthStore` + `useUserStore` (profile, preferences) + composable APIs
- Both use Pinia `defineStore` with setup function pattern
- Composables expose `cleanup()` method for resource cleanup, never use `onUnmounted` inside

**Landing Page Data Fetch:**

- Nuxt `useFetch` for API calls (e.g., fetching blog posts from `/api/blog`)
- Server routes in `/server/api` for sitemap generation
- Static content via @nuxt/content from `/content` directory

## Key Abstractions

**Module Pattern (Backend):**

- **Purpose:** Organize features into isolated units with clear contracts
- **Examples:** `modules/members/`, `modules/scheduling/`, `modules/payments/`
- **Pattern:** Each module exports `index.ts` (public interface) with routes, service, types. Routes delegate to service layer.

**Service Layer (Backend):**

- **Purpose:** Business logic isolated from HTTP concerns
- **Examples:** `modules/members/service.ts` (MemberService class), `modules/scheduling/service.ts` (SchedulingService)
- **Pattern:** Class-based with injected dependencies (db, logger). Public methods correspond to use cases (listMembers, createMember, etc.)

**Plugin System (Backend):**

- **Purpose:** Decorate Fastify instance with reusable features
- **Examples:** `plugins/database.ts` (decorates `fastify.db`), `plugins/auth.ts` (decorates `fastify.authenticate`)
- **Pattern:** Fastify plugin + module declaration for type safety. Loaded in `app.ts` before routes.

**Composable Pattern (Frontend):**

- **Purpose:** Reusable stateful logic for data fetching and API calls
- **Examples:** `useAttendanceApi.ts`, `useSchedulingApi.ts`, `useMembersApi.ts`
- **Pattern:** Function that returns object with { loading, data, error, methods }. Methods call API via axios. Expose `cleanup()` for teardown.

**Route Guards (Frontend):**

- **Purpose:** Enforce authentication and role-based access before page render
- **Examples:** Admin router blocks non-admin roles. Member router checks isAuthenticated.
- **Pattern:** Vue Router `beforeEach` hook. Public routes marked with `meta.public: true`. Protected routes check auth state or redirect.

## Entry Points

**API Server:**

- Location: `/home/franco/projects/el-templo/el-templo-api/src/index.ts`
- Triggers: `npm run dev` (dev) or `pnpm start` (production)
- Responsibilities: Loads .env, initializes Sentry, builds Fastify app, starts server on port 3000

**Admin App:**

- Location: `/home/franco/projects/el-templo/el-templo-admin/src/` (Quasar entry point)
- Triggers: `npm run dev` (port 9100, web-only)
- Responsibilities: Authenticates, renders router, loads admin pages and layouts

**Member App:**

- Location: `/home/franco/projects/el-templo/el-templo-app/src/` (Quasar entry point)
- Triggers: `npm run dev` (port 9000, web) or `npm run build` (Capacitor mobile)
- Responsibilities: Authenticates, renders router, loads member pages, handles Capacitor native bridge

**Landing Page:**

- Location: `/home/franco/projects/el-templo/el-templo-web/`
- Triggers: `npm run dev` (port 9200) or `npm run build` (static SSG)
- Responsibilities: Renders Nuxt app, pre-renders static pages, serves blog content via @nuxt/content

## Error Handling

**Strategy:**

- Backend: Service layer throws errors (descriptive messages). Routes catch and transform to HTTP responses (4xx client, 5xx server). Sentry captures unhandled errors.
- Frontend: Composables return `{ error }` ref. Components display error messages or retry. 401 responses trigger logout redirect.

**Patterns:**

**Backend Error Handling:**

```typescript
// Service throws domain errors
if (!member) throw new Error("Member not found");

// Routes catch and respond
try {
  const result = await memberService.getMember(id);
  reply.send(result);
} catch (err: unknown) {
  if (err instanceof Error && err.message.includes("not found")) {
    reply.code(404).send({ error: "Not found" });
  } else {
    reply.code(500).send({ error: "Internal error" });
  }
}
```

**Frontend Error Handling:**

```typescript
// Composables expose error state
const { loading, data, error } = await useMembersApi().listMembers(params);
if (error.value) {
  createLogger().error('Failed to load members', error.value);
  // Sentry auto-captures via createLogger().error()
}

// Components check error before rendering
v-if="error" - display error message
v-if="!loading" - show data or skeleton
```

**Special Error Cases:**

- **Duplicate key errors:** Routes inspect `err.cause.sqlMessage` to detect duplicates (e.g., DNI already exists), return 409 Conflict
- **Authentication errors:** Routes reply(401) with "Unauthorized, Invalid or missing token" — interceptors clear token and redirect to login
- **Authorization errors:** Routes check role, reply(403) with "Access denied"
- **Validation errors:** Schema validation happens before route handler; Fastify replies 400 with schema validation errors

## Cross-Cutting Concerns

**Logging:**

- Backend: Fastify Pino logger. Use `app.log.info()`, `app.log.error()`, `request.log.debug()`. Never `console.log`.
- Frontend: `createLogger()` from `src/utils/logger.ts`. Use `logger.info()`, `logger.error()`, `logger.warn()`. Auto-sends errors to Sentry.

**Validation:**

- Backend: Zod schemas in `modules/*/schemas.ts`. Fastify validates request body/query/params before handler.
- Frontend: Composables validate before API call (e.g., required fields, format). Axios validation on response shape.

**Authentication:**

- JWT token stored in localStorage (web) or Capacitor Preferences (mobile)
- Axios interceptor adds `Authorization: Bearer <token>` to every request
- Backend verifies JWT signature, extracts userId/email/role, attaches to `request.user`
- Fastify `authenticate` hook enforces JWT before route handler

**Sentry Error Monitoring:**

- Backend: Initialized in `src/instrument.ts` (first import in `index.ts`). Guarded by `SENTRY_DSN` env var. `beforeSend` hook scrubs password fields.
- Frontend: Initialized in `boot/sentry.ts` (Quasar boot file, runs first). Guarded by `VITE_SENTRY_DSN` env var. `createLogger().error()` auto-sends to Sentry.
- Tracked: Unhandled exceptions, API errors (5xx), validation failures. User context added on authenticated requests.

**CORS:**

- Configured in `app.ts`. Development: allows localhost:9000 (admin), :9100 (member), :9200 (web), capacitor://localhost. Production: allows app.eltemplo.org, admin.eltemplo.org, eltemplo.org.

---

_Architecture analysis: 2026-03-10_

# Phase 19: Technical Debt Audit - Research

**Researched:** 2026-02-14
**Domain:** Production hardening, error monitoring, testing infrastructure, code quality, deploy safety, database backups
**Confidence:** HIGH

## Summary

Phase 19 is a multi-domain technical debt remediation phase spanning security fixes, Sentry error monitoring, test infrastructure with real database integration tests, CI/CD hardening with rollback, pre-commit hooks, refactoring of two god objects (DayPlayer.vue at 900 LOC and edit-service.ts at 1232 LOC), replacing 278+ console statements with structured logging, eliminating `any` types, and setting up automated database backups with cloud archival. The scope is well-defined by the INVENTORY-REPORT.md (42 items) and SPRINT-WORK-ITEMS.md.

The codebase is a 3-app monorepo (el-templo-app, el-templo-admin, el-templo-api) without a workspace root package.json -- each app has independent dependencies and build pipelines. The existing deploy.yml already builds all 3 apps, uploads artifacts, deploys via rsync+SSH, and hits a /health endpoint. The API already uses Pino logger (via `Fastify({ logger: true })`), has a `buildApp()` factory function ideal for testing, and uses Drizzle ORM with MySQL. These existing patterns provide solid foundations for the work ahead.

**Primary recommendation:** Work in dependency order -- security fixes and Sentry setup first (they provide immediate production value), then test infrastructure (requires database setup before tests can be written), then CI gates (require tests to exist), then refactoring (safer with tests in place), then logging/backup (independent work).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Full sprint 1-2 scope from audit: security, monitoring, CI gates, test infrastructure + API tests, pre-commit hooks, README, refactoring, console.log replacement, `any` type elimination
- Refactoring: split DayPlayer.vue (900 LOC) and edit-service.ts (1232 LOC) NOW, not deferred
- Replace all 279 console.log/warn/error statements with structured logger
- Fix all 45 `any` types in the API with proper types
- CI lint gate: block on ESLint ERRORS only (warnings allowed through)
- Pre-commit hooks: yes -- Husky + lint-staged for ESLint --fix + Prettier on staged files
- Comprehensive root README.md: project overview, architecture, setup instructions, dev workflow, contribution guidelines
- Path aliases: Claude's discretion (not explicitly prioritized)
- Rotate all JWT secrets, database passwords, API keys in production
- Add .env\* to .gitignore, create .env.example templates
- NO git history rewrite (private repo, old secrets will be invalidated)
- Sentry for error tracking (free tier -- 5,000 errors/month, sufficient for <100 users)
- Sentry + GitHub Issues integration: auto-create GitHub issues for new errors so Claude can read them via gh CLI
- Full error context: capture user ID, route, request body (minus passwords) in Sentry
- No dedicated uptime monitoring -- Sentry + PM2 sufficient at current scale
- Automated rollback: CI keeps previous build, one command reverts to last working version
- Post-deploy smoke test: CI hits /health endpoint after deploy, auto-rollback on failure
- Deploy gates: build + tests must pass (lint warnings allowed)
- No staging environment -- single server, tests + smoke test are protection enough
- Production incident runbook: document common scenarios (API down, DB connection lost, app not loading)
- Automated daily backups: cron job at 3 AM Argentina time, mysqldump compressed
- Keep last 7 days on server for quick restore
- Archive older backups to AWS S3 cloud storage instead of deleting
- Priority: API endpoint integration tests (auth, sessions, admin, member routes)
- Real test database (not mocks) -- spin up test MySQL, seed data, run real queries
- Existing 12 validation scripts: keep as-is, don't convert to formal tests
- CI hard gate: tests must pass, no exceptions. Fix or delete bad tests.
- E2E tests (Playwright): deferred to a later phase

### Claude's Discretion

- Path aliases (replace deep imports with @/\* aliases) -- do if natural during refactoring
- Frontend Sentry setup -- all 3 projects vs API-only, based on effort vs value
- Logging standardization approach -- whatever makes Sentry integration most useful
- Vue store unit tests -- include if time permits and risk warrants it
- Specific cloud storage provider for backup archives (decided: AWS S3)
- DayPlayer.vue split strategy (exact component boundaries)
- edit-service.ts split strategy (exact service boundaries)

### Deferred Ideas (OUT OF SCOPE)

- E2E tests with Playwright -- separate phase when UI is more stable
- Staging environment -- not needed at current scale
- API documentation with @fastify/swagger -- useful but not production-critical
- Dead code elimination (ts-prune, depcheck) -- backlog item
- Architecture Decision Records -- backlog item
- Performance baselines and load testing -- backlog item
- Visual regression testing -- after UI stable
- Mutation testing -- after base coverage > 80%
  </user_constraints>

## Standard Stack

### Core

| Library      | Version | Purpose                          | Why Standard                                                                         |
| ------------ | ------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| @sentry/node | ^10.38  | API error tracking + performance | Official Sentry SDK with native Fastify integration via `setupFastifyErrorHandler()` |
| @sentry/vue  | ^10.38  | Frontend error tracking          | Official Sentry SDK for Vue 3 with `browserTracingIntegration({ router })`           |
| vitest       | ^4.0    | Test runner for all 3 projects   | Already installed in el-templo-app, fast, native TypeScript, Vite-compatible         |
| husky        | ^9      | Git hooks manager                | De facto standard for pre-commit hooks, works with pnpm                              |
| lint-staged  | ^16     | Run linters on staged files      | Pairs with Husky, runs ESLint --fix + Prettier only on changed files                 |

### Supporting

| Library          | Version | Purpose                  | When to Use                                                    |
| ---------------- | ------- | ------------------------ | -------------------------------------------------------------- |
| @vitest/ui       | ^4.0    | Visual test report UI    | Already in el-templo-app devDeps, use during local development |
| pino             | ^10.3   | API structured logging   | Already installed, Fastify uses it natively via `logger: true` |
| aws-cli (system) | v2      | Upload backups to AWS S3 | Standard aws s3 cp for cloud backup archival                   |

### Alternatives Considered

| Instead of            | Could Use                     | Tradeoff                                                                          |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| Sentry free tier      | Self-hosted Sentry, GlitchTip | More control but significant ops burden for solo dev                              |
| vitest                | jest                          | vitest already installed, native ESM+Vite support, jest requires transform config |
| AWS S3                | Backblaze B2                  | User already on AWS, simpler ops with single cloud provider                       |
| Custom logger wrapper | consola, loglevel             | Simple wrapper is sufficient for frontends, no extra dependency needed            |

**Installation (API):**

```bash
cd el-templo-api && pnpm add @sentry/node && pnpm add -D vitest
```

**Installation (App):**

```bash
cd el-templo-app && pnpm add @sentry/vue
```

**Installation (Admin):**

```bash
cd el-templo-admin && pnpm add @sentry/vue && pnpm add -D vitest @vitest/ui
```

**Installation (Root -- for pre-commit hooks):**

```bash
# Husky + lint-staged must be installed at root level in a monorepo
# Since there is no root package.json, create a minimal one first
cd /root && pnpm init && pnpm add -D husky lint-staged
```

## Architecture Patterns

### Recommended Project Structure Additions

```
el-templo/                     # Monorepo root (no workspace config)
├── package.json               # NEW: minimal root for husky + lint-staged
├── .husky/
│   └── pre-commit             # NEW: runs lint-staged
├── .lintstagedrc.json         # NEW: per-app lint-staged config
├── README.md                  # NEW: comprehensive project README
│
├── el-templo-api/
│   ├── src/
│   │   ├── instrument.ts      # NEW: Sentry init (must load first)
│   │   ├── index.ts           # Modified: import instrument.ts first
│   │   ├── shared/
│   │   │   └── logger.ts      # NEW: Pino logger re-export with context
│   │   └── modules/
│   │       └── admin/
│   │           ├── edit-service.ts          # REFACTORED: orchestrator only (<300 LOC)
│   │           ├── session-mutation.ts      # NEW: extracted from edit-service
│   │           ├── exercise-swap.ts         # NEW: extracted from edit-service
│   │           └── format-params-service.ts # Existing, may need adjustment
│   ├── test/
│   │   ├── setup.ts           # NEW: test db setup/teardown
│   │   ├── helpers.ts         # NEW: buildTestApp(), auth helpers
│   │   ├── auth/
│   │   │   └── auth.test.ts   # NEW: auth route integration tests
│   │   ├── sessions/
│   │   │   └── sessions.test.ts
│   │   └── admin/
│   │       └── admin.test.ts
│   └── vitest.config.ts       # NEW: vitest config with globalSetup
│
├── el-templo-app/
│   ├── src/
│   │   ├── boot/
│   │   │   └── sentry.ts      # NEW: Sentry boot file
│   │   ├── utils/
│   │   │   └── logger.ts      # NEW: frontend logger wrapper
│   │   └── modules/training/pages/
│   │       ├── DayPlayer.vue             # REFACTORED: container only (<300 LOC)
│   │       ├── DeuterosSelector.vue      # NEW: extracted from DayPlayer
│   │       ├── BlockProgressionView.vue  # NEW: extracted from DayPlayer
│   │       └── composables/
│   │           ├── useSessionTimer.ts    # NEW or extracted
│   │           └── useExerciseCompletion.ts  # Existing, may expand
│   └── vitest.config.ts       # Already partially configured
│
├── el-templo-admin/
│   ├── src/
│   │   ├── boot/
│   │   │   └── sentry.ts      # NEW: Sentry boot file
│   │   └── utils/
│   │       └── logger.ts      # NEW: frontend logger wrapper
│   └── vitest.config.ts       # NEW
│
├── deploy/
│   ├── backup.sh              # NEW: mysqldump backup script
│   ├── restore.sh             # NEW: database restore script
│   └── RUNBOOK.md             # NEW: incident runbook
│
└── .github/workflows/
    ├── ci.yml                 # MODIFIED: add test stage, fix lint gate
    └── deploy.yml             # MODIFIED: add rollback, smoke test, backup previous
```

### Pattern 1: Fastify Testing with `inject()`

**What:** Use Fastify's built-in `inject()` method to test API routes without starting a server.
**When to use:** All API integration tests.
**Example:**

```typescript
// Source: https://fastify.dev/docs/latest/Guides/Testing/
// test/helpers.ts
import { buildApp } from "../src/app";

export async function buildTestApp() {
  const app = await buildApp();
  // Don't call listen() -- inject() works without it
  return app;
}

// test/auth/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildTestApp } from "../helpers";

describe("POST /api/auth/login", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close(); // Important: closes DB pool
  });

  it("returns 200 with valid credentials", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@example.com", password: "password123" },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toHaveProperty("token");
  });
});
```

### Pattern 2: Test Database Setup with Vitest globalSetup

**What:** Create a dedicated test database, run migrations, seed minimal data before tests, teardown after.
**When to use:** API integration tests that need real MySQL.
**Example:**

```typescript
// Source: https://vitest.dev/config/globalsetup
// el-templo-api/test/setup.ts
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../src/db/schema";

export async function setup() {
  // Connect to MySQL, create test database
  const rootConn = await mysql.createConnection({
    host: process.env.TEST_DB_HOST || "localhost",
    user: process.env.TEST_DB_USER || "root",
    password: process.env.TEST_DB_PASSWORD || "",
  });
  await rootConn.execute("CREATE DATABASE IF NOT EXISTS eltemplo_test");
  await rootConn.end();

  // Run migrations on test database using drizzle-kit push
  // Or use drizzle push programmatically
}

export async function teardown() {
  const rootConn = await mysql.createConnection({
    host: process.env.TEST_DB_HOST || "localhost",
    user: process.env.TEST_DB_USER || "root",
    password: process.env.TEST_DB_PASSWORD || "",
  });
  await rootConn.execute("DROP DATABASE IF EXISTS eltemplo_test");
  await rootConn.end();
}
```

### Pattern 3: Sentry Fastify Integration

**What:** Initialize Sentry before any other imports, then attach error handler.
**When to use:** API error monitoring.
**Example:**

```typescript
// Source: https://docs.sentry.io/platforms/javascript/guides/fastify/
// el-templo-api/src/instrument.ts
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  sendDefaultPii: true, // Capture user IP, request headers
});

// el-templo-api/src/index.ts (modified)
import "./instrument"; // MUST be first import
import * as Sentry from "@sentry/node";
// ... rest of imports
// After buildApp():
Sentry.setupFastifyErrorHandler(app);
```

### Pattern 4: Sentry Vue 3 Boot File

**What:** Initialize Sentry in a Quasar boot file with Vue Router integration.
**When to use:** Frontend error monitoring in app and admin.
**Example:**

```typescript
// Source: https://docs.sentry.io/platforms/javascript/guides/vue/
// el-templo-app/src/boot/sentry.ts
import { boot } from "quasar/wrappers";
import * as Sentry from "@sentry/vue";

export default boot(({ app, router }) => {
  if (process.env.NODE_ENV === "production") {
    Sentry.init({
      app,
      dsn: import.meta.env.VITE_SENTRY_DSN,
      integrations: [Sentry.browserTracingIntegration({ router })],
      tracesSampleRate: 0.2,
      // Scrub sensitive data from request body
      beforeSend(event) {
        if (event.request?.data) {
          const data = { ...event.request.data };
          delete data.password;
          delete data.currentPassword;
          delete data.newPassword;
          event.request.data = data;
        }
        return event;
      },
    });
  }
});
```

### Pattern 5: Frontend Logger Wrapper

**What:** Lightweight logger that replaces console.\* calls, integrates with Sentry for errors.
**When to use:** All frontend console.log/warn/error replacements.
**Example:**

```typescript
// el-templo-app/src/utils/logger.ts
import * as Sentry from "@sentry/vue";

type LogLevel = "debug" | "info" | "warn" | "error";

const isProduction = process.env.NODE_ENV === "production";

function createLogger(context: string) {
  const log = (
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ) => {
    if (!isProduction || level === "error" || level === "warn") {
      const method = level === "debug" ? "log" : level;
      console[method](`[${context}]`, message, data || "");
    }
    if (level === "error") {
      Sentry.captureMessage(message, {
        level: "error",
        extra: { context, ...data },
      });
    }
  };

  return {
    debug: (msg: string, data?: Record<string, unknown>) =>
      log("debug", msg, data),
    info: (msg: string, data?: Record<string, unknown>) =>
      log("info", msg, data),
    warn: (msg: string, data?: Record<string, unknown>) =>
      log("warn", msg, data),
    error: (msg: string, data?: Record<string, unknown>) =>
      log("error", msg, data),
  };
}

export { createLogger };
// Usage: const log = createLogger('DayPlayer');
//        log.info('Session started', { sessionId: '123' });
```

### Pattern 6: CI Rollback with Previous Build Preservation

**What:** Before deploying new build, backup current build on server. Smoke test after deploy, rollback on failure.
**When to use:** deploy.yml workflow.
**Example:**

```yaml
# In deploy.yml, before rsync deploy steps:
- name: Backup current deployment
  run: |
    ssh ${{ secrets.SSH_USER }}@${{ secrets.SERVER_HOST }} << 'ENDSSH'
      # Backup API
      if [ -d "${{ secrets.API_DEPLOY_PATH }}" ]; then
        cp -r ${{ secrets.API_DEPLOY_PATH }} ${{ secrets.API_DEPLOY_PATH }}.previous
      fi
      # Backup App
      if [ -d "${{ secrets.APP_DEPLOY_PATH }}" ]; then
        cp -r ${{ secrets.APP_DEPLOY_PATH }} ${{ secrets.APP_DEPLOY_PATH }}.previous
      fi
      # Backup Admin
      if [ -d "${{ secrets.ADMIN_DEPLOY_PATH }}" ]; then
        cp -r ${{ secrets.ADMIN_DEPLOY_PATH }} ${{ secrets.ADMIN_DEPLOY_PATH }}.previous
      fi
    ENDSSH

# After deploy + restart, add proper health check with rollback:
- name: Post-deploy smoke test
  run: |
    sleep 10
    API_BASE=$(echo "${{ secrets.VITE_API_URL }}" | sed 's|/api$||')
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" ${API_BASE}/health || echo "000")
    if [ "$HTTP_CODE" != "200" ]; then
      echo "Health check FAILED (HTTP $HTTP_CODE). Rolling back..."
      ssh ${{ secrets.SSH_USER }}@${{ secrets.SERVER_HOST }} << 'ENDSSH'
        # Restore previous versions
        rm -rf ${{ secrets.API_DEPLOY_PATH }}
        mv ${{ secrets.API_DEPLOY_PATH }}.previous ${{ secrets.API_DEPLOY_PATH }}
        rm -rf ${{ secrets.APP_DEPLOY_PATH }}
        mv ${{ secrets.APP_DEPLOY_PATH }}.previous ${{ secrets.APP_DEPLOY_PATH }}
        rm -rf ${{ secrets.ADMIN_DEPLOY_PATH }}
        mv ${{ secrets.ADMIN_DEPLOY_PATH }}.previous ${{ secrets.ADMIN_DEPLOY_PATH }}
        cd ${{ secrets.API_DEPLOY_PATH }}
        pnpm install --prod --frozen-lockfile
        pm2 restart eltemplo-api --update-env
      ENDSSH
      exit 1
    fi
    echo "Health check PASSED (HTTP $HTTP_CODE)"
```

### Pattern 7: Database Backup Script

**What:** Automated mysqldump with compression, 7-day rotation, cloud archival.
**When to use:** Daily cron at 3 AM Argentina time (ART = UTC-3, so 06:00 UTC).
**Example:**

```bash
#!/bin/bash
# deploy/backup.sh - Automated MySQL backup with rotation and cloud archival
set -euo pipefail

DB_NAME="${DB_NAME:-eltemplo}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD}"
BACKUP_DIR="/var/backups/mysql"
RETENTION_DAYS=7
BUCKET="s3://eltemplo-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Create compressed backup
mysqldump -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  --single-transaction --quick --lock-tables=false | gzip > "$BACKUP_FILE"

echo "Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Delete local backups older than retention period
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

# Upload to cloud storage (AWS S3)
if command -v aws &> /dev/null && aws sts get-caller-identity &> /dev/null; then
  aws s3 cp "$BACKUP_FILE" "${BUCKET}/" --quiet
  echo "Uploaded to cloud storage"
fi
```

### Anti-Patterns to Avoid

- **Testing with mocks instead of real database:** The decision explicitly calls for real MySQL tests. Mocking Drizzle ORM hides real query issues, schema drift, and constraint violations. Use a real `eltemplo_test` database.
- **Initializing Sentry after other imports:** Sentry must be the first import in index.ts. If imported after Fastify/plugins, it cannot instrument them properly.
- **Installing Husky in each sub-project:** Husky and lint-staged must live at the git root, not inside individual app directories. Git hooks only run from the repo root.
- **Using `rsync --delete` without backup:** The current deploy.yml already uses `--delete`, which means a bad deploy completely destroys the previous build. Always backup first.
- **Replacing console.log with empty strings:** Replace with appropriate logger level calls. `console.log` for debug info becomes `log.debug()`, `console.error` becomes `log.error()` which also reports to Sentry.

## Don't Hand-Roll

| Problem                  | Don't Build                    | Use Instead                   | Why                                                                                               |
| ------------------------ | ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| Error tracking           | Custom error logging service   | @sentry/node + @sentry/vue    | Source maps, release tracking, breadcrumbs, user context, alerting -- months of work to replicate |
| HTTP injection testing   | Custom HTTP client for tests   | Fastify `inject()`            | Built into Fastify, handles plugins, auth, serialization automatically                            |
| Pre-commit linting       | Custom git hooks scripts       | Husky + lint-staged           | Handles installation, partial staging, pnpm compatibility, CI skip                                |
| Database backup rotation | Custom Node.js backup script   | Bash + mysqldump + cron       | Shell is simpler, more reliable, battle-tested for this exact use case                            |
| S3 upload                | Custom HTTP upload             | aws cli s3 cp                 | Handles multipart, retry, checksums natively                                                      |
| Frontend logger          | Winston/Bunyan/heavy framework | Simple createLogger() wrapper | Frontend needs are minimal: level gating + Sentry integration. 30 lines of code, no dependency    |

**Key insight:** This phase is about wiring together proven tools, not building custom infrastructure. Every "custom solution" temptation here has a battle-tested alternative that a solo developer can maintain.

## Common Pitfalls

### Pitfall 1: Sentry GitHub Auto-Create Requires Paid Plan

**What goes wrong:** The free Developer plan does NOT support automatic GitHub issue creation from Sentry alerts. Manual issue creation from Sentry is available on Team plan ($26/mo). Auto-create via alert rules requires Business plan ($80/mo).
**Why it happens:** Sentry's free tier is limited to 1 user, basic alerting via email only. GitHub integration for issue management is a paid feature.
**How to avoid:** Use Sentry's free tier for error tracking and alerting (email/webhook). For the GitHub Issues integration, either: (a) upgrade to Team plan ($26/mo), (b) use a webhook-to-GitHub-issue bridge (GitHub Action or simple script), or (c) manually create issues from Sentry dashboard. Recommendation: use Sentry webhook alerts + a small GitHub Action that creates issues from the webhook payload -- this achieves the goal on the free tier.
**Warning signs:** Setting up Sentry and expecting auto-issue-creation to work without checking plan tier.

### Pitfall 2: Test Database Needs MySQL Running in CI

**What goes wrong:** Tests pass locally (where MySQL is installed) but fail in CI (GitHub Actions has no MySQL by default).
**Why it happens:** GitHub Actions runners don't include MySQL. You need to add a MySQL service container.
**How to avoid:** Add a MySQL service to the CI job:

```yaml
services:
  mysql:
    image: mysql:8.0
    env:
      MYSQL_ROOT_PASSWORD: test
      MYSQL_DATABASE: eltemplo_test
    ports:
      - 3306:3306
    options: --health-cmd="mysqladmin ping" --health-interval=10s --health-timeout=5s --health-retries=3
```

**Warning signs:** Tests failing in CI with "ECONNREFUSED" or "ER_ACCESS_DENIED".

### Pitfall 3: Husky Install in Wrong Directory

**What goes wrong:** Pre-commit hooks don't fire because Husky was installed inside a sub-project instead of the git root.
**Why it happens:** The monorepo has no root package.json currently. Husky must be at the .git directory level.
**How to avoid:** Create a minimal root package.json. Run `pnpm add -D husky lint-staged` at root. Initialize with `pnpm exec husky init`. Configure lint-staged to use per-project config files or match globs per project.
**Warning signs:** `git commit` runs without lint-staged firing.

### Pitfall 4: Sentry instrument.ts Import Order in CommonJS/ESM Mix

**What goes wrong:** Sentry doesn't capture errors because it initialized after Fastify.
**Why it happens:** The API uses `"module": "NodeNext"` in tsconfig but `"type"` is not set in package.json (defaults to CJS). The `import './instrument'` must be the first import in the entry file.
**How to avoid:** In `index.ts`, import `./instrument` before everything else, including `dotenv`. Sentry should instrument before any HTTP/database modules load. Check if the API output is CJS or ESM and use the appropriate Sentry init pattern.
**Warning signs:** Sentry dashboard shows 0 events even after errors occur.

### Pitfall 5: Rollback Script Overwrites Database Migrations

**What goes wrong:** Rolling back the API code reverts to a version that expects an older database schema, but the database has already been migrated.
**Why it happens:** The deploy.yml runs `node dist/db/run-migrations.js` before the smoke test. If the smoke test fails and we rollback the code, the database is still on the new schema.
**How to avoid:** Database migrations should be backward-compatible (additive only -- add columns/tables, don't remove or rename). The rollback restores the previous API build, which should still work with the new schema. Document this constraint in the runbook.
**Warning signs:** After rollback, API crashes with "column not found" or similar schema errors.

### Pitfall 6: console.log Count Includes Validation Scripts

**What goes wrong:** The 278+ console.log count includes ~266 in the API, but ~240 of those are in `src/modules/sessions/validation/` scripts that are standalone CLI tools, not production code.
**Why it happens:** The grep counts all files under `src/`. The validation scripts are intentionally console-heavy (they print test results).
**How to avoid:** The decision says "keep validation scripts as-is". Only replace console.\* in production code paths: `src/index.ts` (1), `src/jobs/auto-approve.ts` (5), and about 12 in the frontend apps. The bulk of the work is much smaller than it appears.
**Warning signs:** Trying to replace console.log in validation scripts that are meant to be run as CLI tools.

### Pitfall 7: Admin .gitignore Missing .env.development

**What goes wrong:** After removing `.env.development` from git, it gets re-added on next commit because `.gitignore` doesn't exclude it.
**Why it happens:** The admin app's `.gitignore` has `.env`, `.env.local`, `.env.*.local` but NOT `.env.development` or `.env.production`.
**How to avoid:** Update `el-templo-admin/.gitignore` to add `.env.development` and `.env.production` lines. Also add `.env*` with `!.env.example` to be safe. Run `git rm --cached el-templo-admin/.env.development` to untrack it.
**Warning signs:** `git status` still shows `.env.development` as tracked after adding to `.gitignore`.

## Code Examples

### Vitest Config for API Integration Tests

```typescript
// el-templo-api/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: ".",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/setup.ts"],
    // Each test file gets its own worker, tests within a file run sequentially
    fileParallelism: false, // DB tests should not run in parallel
    testTimeout: 30000, // DB operations can be slow
    env: {
      NODE_ENV: "test",
      DB_NAME: "eltemplo_test",
      DB_HOST: "localhost",
      DB_USER: "root",
      DB_PASSWORD: "",
    },
  },
});
```

### Test Helper: Build App for Testing

```typescript
// el-templo-api/test/helpers.ts
import { buildApp } from "../src/app";
import type { FastifyInstance } from "fastify";

// The existing buildApp() factory already supports this pattern perfectly.
// No server.listen() needed -- Fastify's inject() works without it.
export async function createTestApp(): Promise<FastifyInstance> {
  // Set test environment variables before building
  process.env.DB_NAME = "eltemplo_test";
  process.env.NODE_ENV = "test";

  const app = await buildApp();
  await app.ready(); // Ensure all plugins are loaded
  return app;
}

// Helper to get an auth token for protected routes
export async function getAuthToken(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password },
  });
  const body = JSON.parse(response.body);
  return body.token;
}
```

### Husky + lint-staged Root Configuration

```json
// Root package.json (NEW)
{
  "name": "el-templo",
  "private": true,
  "scripts": {
    "prepare": "husky"
  },
  "devDependencies": {
    "husky": "^9.0.0",
    "lint-staged": "^16.0.0"
  },
  "lint-staged": {
    "el-templo-api/**/*.ts": [
      "eslint --fix --config el-templo-api/eslint.config.js"
    ],
    "el-templo-app/**/*.{ts,vue}": [
      "eslint --fix --config el-templo-app/eslint.config.js"
    ],
    "el-templo-admin/**/*.{ts,vue}": [
      "eslint --fix --config el-templo-admin/eslint.config.js"
    ],
    "**/*.{ts,vue,js,json,md}": ["prettier --write"]
  }
}
```

### CI Workflow with Test Gate and MySQL Service

```yaml
# Addition to .github/workflows/ci.yml
api-test:
  name: API - Integration Tests
  runs-on: ubuntu-latest

  services:
    mysql:
      image: mysql:8.0
      env:
        MYSQL_ROOT_PASSWORD: test
        MYSQL_DATABASE: eltemplo_test
      ports:
        - 3306:3306
      options: >-
        --health-cmd="mysqladmin ping"
        --health-interval=10s
        --health-timeout=5s
        --health-retries=3

  defaults:
    run:
      working-directory: el-templo-api

  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with:
        version: 10
    - uses: actions/setup-node@v4
      with:
        node-version: "22"
        cache: "pnpm"
        cache-dependency-path: el-templo-api/pnpm-lock.yaml
    - run: pnpm install --frozen-lockfile
    - name: Run tests
      run: pnpm exec vitest run
      env:
        DB_HOST: localhost
        DB_USER: root
        DB_PASSWORD: test
        DB_NAME: eltemplo_test
        DB_PORT: 3306
        NODE_ENV: test
        JWT_SECRET: test-secret-for-ci
```

### Sentry Webhook to GitHub Issue (Free Tier Workaround)

```yaml
# .github/workflows/sentry-webhook.yml
# Called via Sentry webhook alert -> repository dispatch
name: Create Issue from Sentry
on:
  repository_dispatch:
    types: [sentry-alert]

jobs:
  create-issue:
    runs-on: ubuntu-latest
    steps:
      - name: Create GitHub Issue
        uses: actions/github-script@v7
        with:
          script: |
            const payload = context.payload.client_payload;
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `[Sentry] ${payload.title || 'New Error'}`,
              body: `## Sentry Error\n\n${payload.message || 'No details'}\n\nLink: ${payload.url || 'N/A'}`,
              labels: ['bug', 'sentry']
            });
```

## Discretion Recommendations

### Frontend Sentry: API-only (HIGH confidence)

**Recommendation:** Set up Sentry for the API only in this phase. The API is where all business logic, database operations, and authentication happen. Frontend errors are less critical at this scale (<100 users) and the effort of maintaining 3 Sentry projects vs 1 is 3x the configuration work. If frontend Sentry is desired later, the boot file pattern shown above makes it a 30-minute add-on.

### Logging Approach: Pino in API, Simple Wrapper in Frontends (HIGH confidence)

**Recommendation:** The API already uses Pino natively via Fastify's `logger: true`. For frontend apps, use a simple `createLogger(context)` wrapper (see Pattern 5 above) that: (a) gates by log level (suppress debug in production), (b) calls `Sentry.captureMessage()` for errors, and (c) keeps console output in development for debugging. No additional logging dependency needed.

### Cloud Storage: AWS S3 (HIGH confidence)

**Decision:** AWS S3 — user already runs EC2 on AWS, so keeping backups on the same cloud provider simplifies ops (single set of credentials, IAM roles, billing). For small backup sizes (<1GB), cost is negligible on either provider.

### Vue Store Tests: Skip for Now (MEDIUM confidence)

**Recommendation:** Skip Vue store tests in this phase. The stores (sessionPlayerStore, weekStore) are thin wrappers around API calls and local state. The API integration tests cover the real business logic. Store tests add testing effort without catching bugs that integration tests miss. Add them in a future phase when the codebase has baseline coverage and the testing culture is established.

### DayPlayer.vue Split Strategy (HIGH confidence)

**Recommendation:** Based on the inventory description (handles splash screen, Deuteros choice, block progression, timer, exercise display, per-exercise completion tracking), extract:

1. `DeuterosSelector.vue` -- the Deuteros variant choice screen (clear UI boundary)
2. `BlockProgressionView.vue` -- block navigation and current block display
3. `useSessionTimer` composable -- timer logic (already partially in useSessionPlayer)
4. Keep DayPlayer.vue as the container/orchestrator that manages state transitions between these sub-views

### edit-service.ts Split Strategy (HIGH confidence)

**Recommendation:** Based on the existing file structure (edit-service.ts at 1232 LOC alongside format-params.ts, prescribe-service.ts), extract by domain operation:

1. `session-mutation-service.ts` -- add/remove/reorder blocks and exercises
2. `exercise-swap-service.ts` -- exercise replacement and compatibility logic
3. Keep `edit-service.ts` as the facade that delegates to domain services and handles transactions
4. Note: `format-params.ts` already exists as a separate file, which is good -- this pattern should be followed for the other extractions

### Path Aliases: Do During Refactoring (LOW priority)

**Recommendation:** The app and admin tsconfigs already have path aliases configured (`src/*`, `components/*`, etc.). The API tsconfig does NOT have path aliases. During the edit-service.ts refactoring, add `@/*` paths to the API tsconfig if deep relative imports are encountered. Don't do a separate pass just for path aliases.

## State of the Art

| Old Approach                           | Current Approach                                          | When Changed      | Impact                                         |
| -------------------------------------- | --------------------------------------------------------- | ----------------- | ---------------------------------------------- |
| `@sentry/node` + custom Fastify plugin | `@sentry/node` with built-in `setupFastifyErrorHandler()` | Sentry v8+ (2024) | No need for `fastify-sentry` community plugin  |
| jest for Node.js testing               | vitest (Vite-native, ESM-first)                           | vitest v1+ (2024) | Faster, native TS support, no transform config |
| Husky v4 (gitHooks in package.json)    | Husky v9 (`husky init`, `.husky/` directory)              | Husky v9 (2024)   | Simpler setup, `prepare` script pattern        |
| Separate backup CLIs                   | aws cli for S3                                            | Native S3 support | Single tool, no endpoint-url needed            |

**Deprecated/outdated:**

- `fastify-sentry` npm package: Use official `@sentry/node` instead, which has native Fastify support since v8
- `@sentry/tracing`: Merged into `@sentry/node` and `@sentry/vue` core packages
- Husky v4 `.huskyrc` config: Use v9 `.husky/` directory structure

## Open Questions

1. **Sentry DSN Management**
   - What we know: Sentry DSN is a public-safe value (client-side) but should still be environment-managed
   - What's unclear: Whether to use GitHub secrets for CI builds or hardcode in boot files (DSN is not a secret per Sentry docs)
   - Recommendation: Use VITE_SENTRY_DSN env var for frontend, SENTRY_DSN env var for API. Add to GitHub secrets and `.env.example` templates.

2. **MySQL in CI: Service Container vs. GitHub-hosted MySQL**
   - What we know: GitHub Actions supports MySQL service containers (Docker-based)
   - What's unclear: Whether the free GitHub Actions tier has sufficient minutes for MySQL container startup + test runs
   - Recommendation: Use MySQL 8.0 service container as shown in examples. Startup adds ~15s, well within free tier limits (2000 min/month).

3. **Sentry Free Tier + GitHub Issues Workaround Complexity**
   - What we know: Auto-create GitHub issues from Sentry requires Business plan ($80/mo). Manual issue creation requires Team plan ($26/mo).
   - What's unclear: Whether the webhook-to-GitHub-Action workaround is reliable enough for production use
   - Recommendation: Start with Sentry free tier + email alerts. Build the webhook-to-issue GitHub Action as a low-priority stretch goal. If the user finds they want native integration, upgrade to Team ($26/mo) -- it's reasonable for production use.

4. **Secret Rotation Procedure**
   - What we know: Need to rotate JWT secrets, DB passwords, API keys in production
   - What's unclear: The exact order of operations to rotate without downtime (update GitHub secrets, deploy, update server env)
   - Recommendation: Document the rotation procedure in the runbook. For JWT secret rotation, use a grace period approach: add new secret, allow both old and new for 24h, then remove old. For DB password: update MySQL first, then update env, then restart API.

## Sources

### Primary (HIGH confidence)

- Fastify Testing Guide: https://fastify.dev/docs/latest/Guides/Testing/
- Sentry Fastify Integration: https://docs.sentry.io/platforms/javascript/guides/fastify/
- Sentry Vue 3 Integration: https://docs.sentry.io/platforms/javascript/guides/vue/
- Vitest globalSetup: https://vitest.dev/config/globalsetup
- Sentry GitHub Integration: https://docs.sentry.io/organization/integrations/source-code-mgmt/github/
- Codebase inspection: package.json files, tsconfig.json, CI/CD workflows, deploy scripts, source structure

### Secondary (MEDIUM confidence)

- Sentry pricing and plan features: https://sentry.io/pricing/ -- auto-create GitHub issues requires Business plan
- Husky + lint-staged monorepo setup: community guides verified against official Husky v9 docs
- AWS S3 CLI reference: https://docs.aws.amazon.com/cli/latest/reference/s3/

### Tertiary (LOW confidence)

- Sentry free tier exact feature boundaries (GitHub integration on Developer plan): conflicting information across sources, needs validation during setup
- GitHub Actions MySQL service container performance: based on community reports, not benchmarked for this project

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all libraries verified via npm/official docs, versions confirmed
- Architecture patterns: HIGH -- based on direct codebase inspection, existing patterns (buildApp factory, Pino logger, Quasar boot files) all verified
- Testing approach: HIGH -- Fastify inject() is the official recommended pattern, vitest already in use
- Sentry integration: HIGH (setup) / LOW (GitHub issues on free tier)
- Deploy rollback: MEDIUM -- pattern is sound but untested for this specific deploy.yml
- Database backups: MEDIUM -- standard mysqldump pattern, cloud archival needs endpoint configuration
- Pitfalls: HIGH -- identified from actual codebase inspection (admin .gitignore, console.log distribution, API module structure)

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable tools, 30-day validity)

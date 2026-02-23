# Phase 27: Member App Staging Environment - Research

**Researched:** 2026-02-15
**Domain:** DevOps / CI-CD / Mobile Builds / Infrastructure
**Confidence:** HIGH (infrastructure), MEDIUM (mobile builds)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Staging scope

- All 3 apps get staging: member app, admin app, API
- Same EC2 instance as production -- different ports, Nginx routes by subdomain
- Subdomains: app-staging.eltemplo.org, admin-staging.eltemplo.org, api-staging.eltemplo.org
- Staging API runs as separate PM2 process (e.g., port 4001 alongside production port 4000)
- Separate build output directories: /opt/el-templo-staging/app/, /opt/el-templo-staging/admin/
- Separate Sentry projects for staging vs production
- Use case: pre-release testing AND client demos

#### Data strategy (REVISED)

- Fake/generated data only -- NO production data copy
- Same schema as production, populated with scripted fake users and sample sessions
- Weekly cron resets staging DB: drop -> create -> migrate -> seed fake data (ensures new tables get populated)
- Two known test users: test-member@eltemplo.org and test-admin@eltemplo.org with fixed passwords
- Shares production media (R2/S3 video files) -- no separate media bucket
- Separate MySQL database on same server: eltemplo_staging
- Auto-migrate after seeding to apply any pending schema changes

#### Deployment flow

- Branch-based: push to `staging` branch auto-deploys to staging environment via CI/CD
- Staging-first promotion: staging branch -> test on staging -> merge to master -> production deploy
- Same safety pipeline as production: backup, deploy, migrate, smoke test, auto-rollback on failure
- Mobile builds (APK + iOS) are manual trigger only (workflow_dispatch), not on every push

#### Mobile builds

- Android: direct APK file distribution (sideload, no Play Store). Check if keystore exists during research; create if needed
- iOS: TestFlight distribution. Initial Capacitor iOS project setup required (Info.plist, provisioning, etc.)
- iOS builds via GitHub Actions macOS runners with manual workflow_dispatch trigger (conserve runner minutes)
- No Mac available locally -- all iOS builds are CI-based
- Staging apps have different app name: "El Templo (Staging)" for device coexistence
- Staging apps look identical to production (no staging banner/ribbon) -- distinguished by app name only
- Separate bundle IDs for staging apps to coexist with production on same device

#### Access control

- Staging web apps are publicly accessible (no HTTP basic auth, no IP whitelist)
- Separate JWT secrets for staging and production (tokens don't cross environments)
- No external communications to suppress (app doesn't send emails/push notifications currently)

### Claude's Discretion

- APK storage location for staging builds (GitHub Actions artifact, S3, or server)
- Exact fake data generation approach (seed script structure, how many fake users/sessions)
- Nginx configuration details for subdomain routing
- PM2 ecosystem config structure for staging processes
- Staging .env file management and variable naming conventions

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope
</user_constraints>

## Summary

This phase creates a full staging environment for all 3 apps (API, member app, admin app) on the same EC2 instance as production, plus mobile build workflows for Android (sideload APK) and iOS (TestFlight). The infrastructure work is well-scoped: Nginx subdomain routing, PM2 process management, separate MySQL database, CI/CD pipeline extension, and a staging seed script with fake data.

The codebase is already well-structured for this. The existing deploy workflow (`deploy.yml`) uses GitHub Secrets for all paths/credentials and can be adapted for staging by creating a parallel `deploy-staging.yml` that triggers on the `staging` branch. The API already reads `PORT`, `DB_NAME`, `JWT_SECRET`, and `FRONTEND_URL`/`ADMIN_URL` from environment variables, meaning staging just needs its own `.env.production` file with different values. The existing nginx configs in `deploy/nginx/` follow a clean per-subdomain pattern that extends naturally.

**Primary recommendation:** Structure this as 5 work areas: (1) server infrastructure (nginx, PM2, MySQL), (2) CI/CD staging pipeline, (3) staging seed script with fake data, (4) Android APK build workflow, (5) iOS TestFlight build workflow. The server infrastructure and CI/CD should be done first since mobile builds depend on having a working staging API.

## Existing Codebase Analysis

### Current Production Infrastructure

**Deploy workflow** (`/.github/workflows/deploy.yml`):

- Triggers on push to master/main or workflow_dispatch
- Detects changes per project, builds only what changed
- Uses GitHub Secrets for all configuration (paths, credentials, URLs)
- Full pipeline: build -> upload artifact -> backup -> deploy via rsync -> install deps -> migrate -> restart PM2 -> smoke test -> auto-rollback
- Current secrets used: `SSH_PRIVATE_KEY`, `SERVER_HOST`, `SSH_USER`, `API_DEPLOY_PATH`, `APP_DEPLOY_PATH`, `ADMIN_DEPLOY_PATH`, `VITE_API_URL`, `VITE_SENTRY_DSN`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL`, `ADMIN_URL`, `SENTRY_DSN`, `API_PORT`

**CI workflow** (`/.github/workflows/ci.yml`):

- Triggers on push to master/main/develop and PRs to same
- Runs type checks, lint, audit, build for all 3 apps in parallel
- API tests run against MySQL service container

**PM2 ecosystem** (`/el-templo-api/ecosystem.config.cjs`):

- Single app: `eltemplo-api` on `dist/index.js`
- CWD: `/var/www/el-templo/el-templo-api`
- Logs to `/var/log/pm2/`
- 500MB memory limit, graceful shutdown

**Nginx configs** (`/deploy/nginx/`):

- `api.eltemplo.org` -> reverse proxy to `127.0.0.1:3000`
- `app.eltemplo.org` -> serves SPA from `/var/www/member-app/spa`
- `admin.eltemplo.org` -> serves SPA from `/var/www/admin-app`
- All use port 80 (SSL added by certbot)
- SPA configs use `try_files` for history mode routing

**API env loading** (`/el-templo-api/src/index.ts`):

- Loads `.env.production` when `NODE_ENV=production`, else `.env.development`
- Falls back to `.env`
- CORS configured from `FRONTEND_URL` and `ADMIN_URL` env vars, plus Capacitor origins

**Server deploy paths** (from secrets and scripts):

- API: configured via `API_DEPLOY_PATH` secret (referenced as `/var/www/el-templo/el-templo-api` in ecosystem.config)
- App: configured via `APP_DEPLOY_PATH` secret (served from `/var/www/member-app/spa`)
- Admin: configured via `ADMIN_DEPLOY_PATH` secret (served from `/var/www/admin-app`)

### Current Database Setup

**Schema** (`/el-templo-api/src/db/schema/`):

- 19 tables exported from index.ts
- Key tables: users, branches, sessions, session-blocks, session-prescriptions, completed-sessions, exercises, routes, spom-rules, etc.
- Users have: email, passwordHash (argon2), firstName, lastName, role (member/coach/admin/superadmin), branchId, level (alfa/delta/sigma/omega/spartan)

**Existing seed scripts**:

- `seed.ts`: Creates 5 branches, 1 superadmin, 5 coaches, 20 members (26 total users). Uses `SEED_ADMIN_PASSWORD` and `SEED_DEFAULT_PASSWORD` env vars. Clears users and branches first.
- `seed-spom.ts`: Seeds reference data from CSV files (routes, intensity rules, contraction rules, SPOM rules, weekly rotator, formats, format compatibility, exercises, SPOM config). Reads CSV files from `/docs/session-logic/` directory. Exported as `seedSPOM()` function.

**Migration system** (`/el-templo-api/src/db/run-migrations.ts`):

- Custom migration runner (not drizzle-kit migrate)
- Reads `.sql` files from `src/db/migrations/` directory
- Tracks applied migrations in `_migrations` table
- Handles drizzle breakpoints and idempotent re-runs
- Currently 15 migrations (0000-0014)

### Current Capacitor Setup

**Version situation** (IMPORTANT):

- Main app (`el-templo-app/package.json`): `@capacitor/cli: ^8.1.0`, `@capacitor/core: ^8.0.1`
- Capacitor source (`src-capacitor/package.json`): `@capacitor/core: ^7.0.0`, `@capacitor/ios: ^7.4.5`, `@capacitor/android: ^7.4.5`
- Installed in src-capacitor: `@capacitor/core` v7.4.5, `@capacitor/cli` v8.1.0
- This is a version mismatch that should be resolved before mobile builds

**Android project** (`/el-templo-app/src-capacitor/android/`):

- `applicationId`: `com.eltemplo.app`
- `compileSdk`: 35, `minSdk`: 23, `targetSdk`: 35
- Gradle AGP: `com.android.tools.build:gradle:8.7.2`
- Java/Kotlin not configured for signing -- no signingConfigs block
- **No keystore exists** -- needs to be generated for release/staging APK builds
- Debug APKs use the default Android debug key (auto-generated)

**iOS project** (`/el-templo-app/src-capacitor/ios/`):

- Bundle ID: `com.eltemplo.app`
- Display name: "El Templo"
- Xcode project exists: `App.xcodeproj`, `App.xcworkspace`
- Podfile references Capacitor 7.4.5 pods
- Platform: iOS 14.0 minimum
- Info.plist has standard Capacitor configuration

**Capacitor config** (`/el-templo-app/src-capacitor/capacitor.config.json`):

```json
{
  "appId": "com.eltemplo.app",
  "appName": "El Templo",
  "webDir": "www",
  "plugins": {
    "CapacitorHttp": { "enabled": true }
  }
}
```

**Build output locations**:

- SPA build: `el-templo-app/dist/spa/`
- Capacitor build: `el-templo-app/dist/capacitor/`
- Admin SPA: `el-templo-admin/dist/spa/`

## Architecture Patterns

### Pattern 1: Staging Deploy Workflow (parallel to production)

**What:** A `deploy-staging.yml` workflow that mirrors `deploy.yml` but targets the staging environment.

**Key differences from production:**

- Triggers on push to `staging` branch (not master)
- Uses a parallel set of GitHub Secrets with `STAGING_` prefix
- Deploys to different paths on the same server
- Points API at `eltemplo_staging` database
- Uses port 4001 for staging API (vs 3000 for production)

**Staging-specific secrets needed:**

```
STAGING_API_DEPLOY_PATH=/opt/el-templo-staging/api
STAGING_APP_DEPLOY_PATH=/opt/el-templo-staging/app
STAGING_ADMIN_DEPLOY_PATH=/opt/el-templo-staging/admin
STAGING_DB_NAME=eltemplo_staging
STAGING_DB_USER=eltemplo_staging (or reuse eltemplo user with GRANT on both DBs)
STAGING_DB_PASSWORD=<separate password>
STAGING_JWT_SECRET=<separate secret>
STAGING_API_PORT=4001
STAGING_VITE_API_URL=https://api-staging.eltemplo.org/api
STAGING_FRONTEND_URL=https://app-staging.eltemplo.org
STAGING_ADMIN_URL=https://admin-staging.eltemplo.org
STAGING_SENTRY_DSN=<staging Sentry project DSN>
STAGING_VITE_SENTRY_DSN=<staging Sentry Vue project DSN>
```

### Pattern 2: Nginx Subdomain Configuration for Staging

**What:** Three new Nginx server blocks for staging subdomains.

```nginx
# /etc/nginx/sites-available/api-staging.eltemplo.org
server {
    listen 80;
    server_name api-staging.eltemplo.org;

    location / {
        proxy_pass http://127.0.0.1:4001;
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

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}

# /etc/nginx/sites-available/app-staging.eltemplo.org
server {
    listen 80;
    server_name app-staging.eltemplo.org;
    root /opt/el-templo-staging/app;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}

# admin-staging.eltemplo.org follows same pattern
```

### Pattern 3: PM2 Ecosystem with Staging Process

**What:** Extend ecosystem.config.cjs to include a staging process.

```javascript
module.exports = {
  apps: [
    {
      name: "eltemplo-api",
      script: "dist/index.js",
      cwd: "/var/www/el-templo/el-templo-api",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: { NODE_ENV: "production" },
      error_file: "/var/log/pm2/eltemplo-api-error.log",
      out_file: "/var/log/pm2/eltemplo-api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: "eltemplo-staging-api",
      script: "dist/index.js",
      cwd: "/opt/el-templo-staging/api",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: { NODE_ENV: "production" },
      error_file: "/var/log/pm2/eltemplo-staging-api-error.log",
      out_file: "/var/log/pm2/eltemplo-staging-api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
```

**Recommendation:** Keep the ecosystem config in the repo but use the deploy workflow to manage each process independently. The staging API has its own `.env.production` with `PORT=4001`, `DB_NAME=eltemplo_staging`, etc.

### Pattern 4: Android Product Flavors for Staging

**What:** Use Gradle product flavors to create staging builds with different `applicationId` and `appName`.

```gradle
android {
    // ... existing config ...

    flavorDimensions "environment"
    productFlavors {
        production {
            dimension "environment"
            // uses default applicationId: com.eltemplo.app
        }
        staging {
            dimension "environment"
            applicationIdSuffix ".staging"
            // results in: com.eltemplo.app.staging
            manifestPlaceholders = [appName: "El Templo (Staging)"]
        }
    }
}
```

Combined with `capacitor.config.ts` (converted from JSON) for dynamic configuration:

```typescript
import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId:
    process.env.STAGING === "true"
      ? "com.eltemplo.app.staging"
      : "com.eltemplo.app",
  appName: process.env.STAGING === "true" ? "El Templo (Staging)" : "El Templo",
  webDir: "www",
  plugins: {
    CapacitorHttp: { enabled: true },
  },
};

export default config;
```

### Pattern 5: Staging Seed Script

**What:** A dedicated seed script that creates fake data for the staging database.

The existing `seed.ts` creates users only. The existing `seed-spom.ts` creates reference data from CSVs. For staging, we need a combined script that:

1. Runs migrations first (ensure schema is current)
2. Seeds reference data (routes, exercises, SPOM rules, etc.) using existing `seedSPOM()`
3. Seeds test users with fixed credentials
4. Seeds sample sessions and completed sessions for demo purposes

**Recommendation for fake data:**

- Use `@faker-js/faker` with a fixed seed for reproducible data
- Create 2 known test users (test-member@eltemplo.org, test-admin@eltemplo.org) with fixed passwords
- Create 15-20 additional fake members across branches and levels
- Create 2-3 coaches
- Seed ~50 completed sessions across members for last 30 days (for demo dashboards)
- Seed current week sessions (generated by algorithm, pre-approved)

### Anti-Patterns to Avoid

- **Sharing production database:** Never point staging at production DB even for reads. Always use `eltemplo_staging`.
- **Hardcoding staging URLs in source:** Keep all environment-specific values in env vars / GitHub Secrets.
- **Modifying capacitor.config.json directly for staging:** Use dynamic `capacitor.config.ts` or build-time substitution instead.
- **Running iOS builds on every push:** macOS runners cost ~10x more. Use workflow_dispatch for mobile builds.

## Don't Hand-Roll

| Problem                    | Don't Build                                | Use Instead                                                          | Why                                                             |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| Fake data generation       | Custom random data functions               | `@faker-js/faker`                                                    | Locale support (es), reproducible with seeds, comprehensive API |
| Android signing            | Custom shell scripts for keytool/jarsigner | `r0adkll/sign-android-release` GitHub Action                         | Handles keystore decoding, signing, and alignment in one step   |
| iOS certificate management | Manual cert import scripts                 | Fastlane `match` or manual keychain import steps                     | Certificate lifecycle is complex; Fastlane handles it           |
| Nginx SSL                  | Manual certbot per subdomain               | `certbot --nginx` with `-d` flags for all staging subdomains at once | Handles renewal, config updates automatically                   |

**Key insight:** The deploy pipeline already exists for production -- the staging version should be a modified copy, not a generic "multi-environment" abstraction. Keep staging and production workflows as separate files for clarity and independent modification.

## Common Pitfalls

### Pitfall 1: Port Conflict Between Production and Staging API

**What goes wrong:** Both PM2 processes try to start on the same port.
**Why it happens:** Staging `.env.production` not created or `PORT` not set correctly.
**How to avoid:** Deploy step must create `.env.production` for staging with `PORT=4001` before starting PM2 process. Smoke test should hit the staging health endpoint.
**Warning signs:** PM2 process crashes immediately after start, "EADDRINUSE" in logs.

### Pitfall 2: CORS Rejections on Staging

**What goes wrong:** Frontend staging apps get 403/CORS errors when calling staging API.
**Why it happens:** Staging API `.env.production` has `FRONTEND_URL` and `ADMIN_URL` still pointing to production URLs.
**How to avoid:** Staging `.env.production` must set `FRONTEND_URL=https://app-staging.eltemplo.org` and `ADMIN_URL=https://admin-staging.eltemplo.org`.
**Warning signs:** Browser console shows CORS policy errors.

### Pitfall 3: Staging API Connecting to Production Database

**What goes wrong:** Staging writes pollute production data or staging shows real user data.
**Why it happens:** `DB_NAME` not overridden in staging env, defaults to `eltemplo`.
**How to avoid:** Staging `.env.production` must set `DB_NAME=eltemplo_staging`. The weekly cron reset script should verify it's operating on `eltemplo_staging` before dropping tables.
**Warning signs:** Staging shows real user emails, or staging seed script fails because production tables have different data.

### Pitfall 4: Capacitor Version Mismatch

**What goes wrong:** Mobile builds fail with incompatible plugin errors.
**Why it happens:** Main app has Capacitor 8 (`@capacitor/cli: ^8.1.0`, `@capacitor/core: ^8.0.1`) but src-capacitor has Capacitor 7 (`@capacitor/core: ^7.0.0`, `@capacitor/ios: ^7.4.5`, `@capacitor/android: ^7.4.5`). The installed CLI is v8.1.0 but core is v7.4.5.
**How to avoid:** Align Capacitor versions before attempting mobile builds. Either upgrade src-capacitor to Capacitor 8 or pin main app to Capacitor 7.
**Warning signs:** `npx cap sync` shows version warnings, build errors mentioning plugin API changes.

### Pitfall 5: iOS Build Certificate Expiration

**What goes wrong:** iOS builds fail after ~1 year when distribution certificate or provisioning profile expires.
**Why it happens:** Apple certificates have limited validity.
**How to avoid:** Document certificate renewal process. Set a calendar reminder. Store certificate generation commands.
**Warning signs:** Build log shows "expired" or "no valid signing identities" error.

### Pitfall 6: Android Debug vs Release Signing

**What goes wrong:** APK generated in CI can't be installed, or is unsigned.
**Why it happens:** `./gradlew assembleDebug` creates a debug-signed APK (fine for sideloading). `./gradlew assembleRelease` creates an unsigned APK that needs signing.
**How to avoid:** For staging sideload distribution, debug APK is sufficient. No keystore needed. If later wanting signed APKs, generate a keystore and store it as a base64 GitHub Secret.
**Warning signs:** APK shows "app not installed" error on device.

### Pitfall 7: Weekly Cron Reset Hitting Wrong Database

**What goes wrong:** Cron job drops production database instead of staging.
**Why it happens:** Script uses wrong env vars or runs in wrong context.
**How to avoid:** Hardcode `eltemplo_staging` database name in the reset script (don't rely on env vars for the drop/create step). Add a safety check that refuses to drop `eltemplo` (production).
**Warning signs:** Production goes down on a schedule; users report data loss.

## Code Examples

### Example 1: Staging Seed Script Structure

```typescript
// el-templo-api/src/db/seed-staging.ts
import "dotenv/config";
import { faker } from "@faker-js/faker/locale/es";
import * as argon2 from "argon2";
import { createSingleConnection } from "./index";
import { seedSPOM } from "./seed-spom";
import * as schema from "./schema";

// Fixed seed for reproducible data
faker.seed(12345);

const STAGING_PASSWORD = process.env.STAGING_SEED_PASSWORD || "templo2026";

async function seedStaging() {
  // Safety check: refuse to seed production
  const dbName = process.env.DB_NAME;
  if (dbName === "eltemplo") {
    throw new Error(
      "SAFETY: Refusing to seed production database. Set DB_NAME=eltemplo_staging",
    );
  }

  const { db, connection } = await createSingleConnection();

  // 1. Seed reference data (SPOM, exercises, etc.)
  await seedSPOM();

  // 2. Seed users
  const passwordHash = await argon2.hash(STAGING_PASSWORD);

  // Known test users
  await db.insert(schema.users).values([
    {
      email: "test-member@eltemplo.org",
      passwordHash,
      firstName: "Test",
      lastName: "Member",
      role: "member",
      branchId: 1,
      level: "sigma",
    },
    {
      email: "test-admin@eltemplo.org",
      passwordHash,
      firstName: "Test",
      lastName: "Admin",
      role: "superadmin",
      branchId: 1,
      level: "spartan",
    },
  ]);

  // Additional fake members
  // ... generate with faker

  await connection.end();
}
```

### Example 2: Weekly Staging Reset Cron Script

```bash
#!/bin/bash
# /opt/el-templo-staging/reset-staging.sh
# Cron: 0 4 * * 0  (every Sunday at 04:00 UTC / 01:00 Argentina)
set -euo pipefail

DB_NAME="eltemplo_staging"
DB_USER="${STAGING_DB_USER}"
DB_PASSWORD="${STAGING_DB_PASSWORD}"

# SAFETY: Never drop production
if [ "$DB_NAME" = "eltemplo" ]; then
  echo "ERROR: Refusing to reset production database"
  exit 1
fi

echo "[$(date)] Resetting staging database..."
mysql -u "$DB_USER" -p"$DB_PASSWORD" -e "DROP DATABASE IF EXISTS $DB_NAME; CREATE DATABASE $DB_NAME;"

echo "[$(date)] Running migrations..."
cd /opt/el-templo-staging/api
NODE_ENV=production node dist/db/run-migrations.js

echo "[$(date)] Seeding fake data..."
NODE_ENV=production node dist/db/seed-staging.js

echo "[$(date)] Staging reset complete"
```

### Example 3: Android APK Build Workflow

```yaml
# .github/workflows/build-android-staging.yml
name: Build Android Staging APK

on:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: el-templo-app

    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "pnpm"
          cache-dependency-path: el-templo-app/pnpm-lock.yaml

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: "zulu"
          java-version: "17"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build web assets for staging
        run: pnpm run build
        env:
          VITE_API_URL: https://api-staging.eltemplo.org/api
          VITE_APP_NAME: "El Templo (Staging)"
          VITE_SENTRY_DSN: ${{ secrets.STAGING_VITE_SENTRY_DSN }}

      - name: Copy web assets to Capacitor
        run: npx cap copy android

      - name: Build debug APK
        working-directory: el-templo-app/src-capacitor/android
        run: ./gradlew assembleDebug

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: staging-apk
          path: el-templo-app/src-capacitor/android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 30
```

### Example 4: iOS TestFlight Build Workflow (High-Level)

```yaml
# .github/workflows/build-ios-staging.yml
name: Build iOS Staging (TestFlight)

on:
  workflow_dispatch:

jobs:
  build:
    runs-on: macos-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Install dependencies
        working-directory: el-templo-app
        run: pnpm install --frozen-lockfile

      - name: Build web assets for staging
        working-directory: el-templo-app
        run: pnpm run build
        env:
          VITE_API_URL: https://api-staging.eltemplo.org/api
          VITE_APP_NAME: "El Templo (Staging)"
          VITE_SENTRY_DSN: ${{ secrets.STAGING_VITE_SENTRY_DSN }}

      - name: Sync Capacitor
        working-directory: el-templo-app
        run: npx cap sync ios

      - name: Install CocoaPods
        working-directory: el-templo-app/src-capacitor/ios/App
        run: pod install

      - name: Import certificate and provisioning profile
        env:
          BUILD_CERTIFICATE_BASE64: ${{ secrets.IOS_BUILD_CERTIFICATE_BASE64 }}
          P12_PASSWORD: ${{ secrets.IOS_P12_PASSWORD }}
          BUILD_PROVISION_PROFILE_BASE64: ${{ secrets.IOS_BUILD_PROVISION_PROFILE_BASE64 }}
        run: |
          # Decode and import certificate
          CERTIFICATE_PATH=$RUNNER_TEMP/build_certificate.p12
          PROFILE_PATH=$RUNNER_TEMP/build_pp.mobileprovision
          KEYCHAIN_PATH=$RUNNER_TEMP/app-signing.keychain-db

          echo -n "$BUILD_CERTIFICATE_BASE64" | base64 --decode -o $CERTIFICATE_PATH
          echo -n "$BUILD_PROVISION_PROFILE_BASE64" | base64 --decode -o $PROFILE_PATH

          security create-keychain -p "" $KEYCHAIN_PATH
          security set-keychain-settings -lut 21600 $KEYCHAIN_PATH
          security unlock-keychain -p "" $KEYCHAIN_PATH
          security import $CERTIFICATE_PATH -P "$P12_PASSWORD" -A -t cert -f pkcs12 -k $KEYCHAIN_PATH
          security list-keychain -d user -s $KEYCHAIN_PATH

          mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
          cp $PROFILE_PATH ~/Library/MobileDevice/Provisioning\ Profiles

      - name: Build and archive
        working-directory: el-templo-app/src-capacitor/ios/App
        run: |
          xcodebuild -workspace App.xcworkspace \
            -scheme App \
            -sdk iphoneos \
            -configuration Release \
            -archivePath $RUNNER_TEMP/app.xcarchive \
            archive

      - name: Export IPA
        run: |
          xcodebuild -exportArchive \
            -archivePath $RUNNER_TEMP/app.xcarchive \
            -exportOptionsPlist ExportOptions.plist \
            -exportPath $RUNNER_TEMP/export

      - name: Upload to TestFlight
        env:
          APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
          APPLE_API_ISSUER_ID: ${{ secrets.APPLE_API_ISSUER_ID }}
          APPLE_API_KEY_CONTENT: ${{ secrets.APPLE_API_KEY_CONTENT }}
        run: |
          # Use xcrun altool or App Store Connect API
          xcrun altool --upload-app \
            -f $RUNNER_TEMP/export/App.ipa \
            --apiKey "$APPLE_API_KEY_ID" \
            --apiIssuer "$APPLE_API_ISSUER_ID" \
            -t ios
```

## Discretion Recommendations

### APK Storage Location

**Recommendation: GitHub Actions Artifacts (30-day retention)**

- Simple, no extra infrastructure needed
- Download link available in the Actions UI
- 30-day retention is sufficient for staging builds
- Alternative (if longer retention needed): upload to the same S3 bucket used for backups (`s3://eltemplo-backups/apk/`)

### Fake Data Generation Approach

**Recommendation: Single `seed-staging.ts` script using `@faker-js/faker` with Spanish locale**

- Install as devDependency: `pnpm add -D @faker-js/faker`
- Use fixed seed (`faker.seed(12345)`) for reproducible data
- Generate: 5 branches (reuse existing), 2 known test users, 3 coaches, 15 fake members
- Generate ~30-50 completed sessions across members for last 30 days
- Don't generate sessions/session-blocks (these are algorithm-generated at runtime)
- Script calls existing `seedSPOM()` first to populate reference data
- Total: ~100 lines of code beyond what exists

### Nginx Configuration

**Recommendation: 3 new server block files in `deploy/nginx/`**

- `api-staging.eltemplo.org` (reverse proxy to port 4001)
- `app-staging.eltemplo.org` (SPA from `/opt/el-templo-staging/app`)
- `admin-staging.eltemplo.org` (SPA from `/opt/el-templo-staging/admin`)
- Copy existing configs, change server_name and paths
- SSL: run `certbot --nginx -d api-staging.eltemplo.org -d app-staging.eltemplo.org -d admin-staging.eltemplo.org` after DNS setup

### PM2 Ecosystem Config

**Recommendation: Separate ecosystem file OR direct pm2 start in deploy workflow**

- Option A: Add staging process to existing `ecosystem.config.cjs` (shown in Pattern 3)
- Option B: Deploy workflow runs `pm2 start dist/index.js --name eltemplo-staging-api` directly
- **Prefer Option B** -- keeps staging PM2 process independent, managed entirely by the deploy workflow like production already does (see deploy.yml line 347: `pm2 restart eltemplo-api --update-env || pm2 start dist/index.js --name eltemplo-api`)

### Staging .env Management

**Recommendation: Generate `.env.production` in the deploy workflow, same as production**

- The production deploy workflow already creates `.env.production` with secrets (deploy.yml lines 287-301)
- Staging workflow does the same with staging-prefixed secrets
- No `.env.staging` file needed -- staging API runs with `NODE_ENV=production` and uses `.env.production` (which contains staging values)
- This matches the existing pattern and requires no code changes to env loading logic

## State of the Art

| Old Approach               | Current Approach                                         | When Changed | Impact                                                       |
| -------------------------- | -------------------------------------------------------- | ------------ | ------------------------------------------------------------ |
| `cap build` for APK        | `npx cap copy` + `./gradlew assembleDebug` for debug APK | Capacitor 6+ | More control, no signing issues for debug builds             |
| Fastlane for Android CI    | Direct Gradle in GitHub Actions                          | 2024+        | Simpler, fewer dependencies for basic APK builds             |
| Manual iOS cert management | Fastlane match or manual keychain import in CI           | Ongoing      | Match is cleaner for teams, manual is simpler for single-dev |

**Deprecated/outdated:**

- Capacitor `cap build` command: Exists but has known signing issues for Android. Use `cap copy` + direct Gradle instead.
- `altool`: Apple has deprecated `altool` in favor of `notarytool` and the App Store Connect API. Use `xcrun notarytool` or the API directly for TestFlight uploads.

## Open Questions

1. **Apple Developer Account Setup**
   - What we know: iOS TestFlight requires an Apple Developer Program membership ($99/year) and app registration in App Store Connect.
   - What's unclear: Whether the user already has an Apple Developer account set up with the staging app registered.
   - Recommendation: Ask user during planning. If no Apple account, iOS TestFlight work should be a separate sub-plan that can be deferred.

2. **DNS for Staging Subdomains**
   - What we know: Need A records for `api-staging.eltemplo.org`, `app-staging.eltemplo.org`, `admin-staging.eltemplo.org` pointing to the EC2 IP.
   - What's unclear: Who manages DNS and how long propagation takes.
   - Recommendation: First task in the plan should be DNS setup with verification.

3. **Capacitor Version Alignment**
   - What we know: Main app declares Capacitor 8, src-capacitor uses Capacitor 7. This mismatch may cause issues.
   - What's unclear: Whether builds work as-is or need version alignment first.
   - Recommendation: Test `npx cap sync` and `./gradlew assembleDebug` in CI with current versions. If it fails, add a version alignment task before mobile build tasks.

4. **EC2 Instance Resources**
   - What we know: Staging runs on the same instance as production.
   - What's unclear: How much memory/CPU headroom exists. A second Node.js process + MySQL database adds load.
   - Recommendation: Set staging API PM2 memory limit to 300MB (vs 500MB for production). Monitor after setup.

5. **Debug APK vs Signed APK for Sideloading**
   - What we know: Debug APKs are auto-signed with the debug key and work for sideloading. No keystore needed.
   - What's unclear: Whether the user wants debug APKs (simpler) or properly signed APKs (requires keystore).
   - Recommendation: Start with debug APKs. They work fine for sideloading. A keystore is only needed for Play Store (Phase 20 scope) or if debug APK has limitations the user encounters.

## Sources

### Primary (HIGH confidence)

- Codebase analysis: `deploy.yml`, `ci.yml`, `ecosystem.config.cjs`, nginx configs, `.env.example` files, `seed.ts`, `seed-spom.ts`, `run-migrations.ts`, `app.ts`, `index.ts`, `capacitor.config.json`, Android `build.gradle`, iOS `Info.plist` -- all read directly from repo
- [Quasar Capacitor Build Commands](https://quasar.dev/quasar-cli-vite/developing-capacitor-apps/build-commands/) -- verified build commands and output paths
- [Capacitor Environment-Specific Configurations](https://capacitorjs.com/docs/guides/environment-specific-configurations) -- product flavors and iOS schemes for staging
- [PM2 Ecosystem File Documentation](https://pm2.keymetrics.io/docs/usage/application-declaration/) -- multi-app config patterns

### Secondary (MEDIUM confidence)

- [Capgo: Automatic Capacitor Android Build with GitHub Actions](https://capgo.app/blog/automatic-capacitor-android-build-github-action/) -- workflow structure verified against GitHub Actions docs
- [Capgo: Automatic Capacitor iOS Build with GitHub Actions](https://capgo.app/blog/automatic-capacitor-ios-build-github-action/) -- TestFlight workflow structure and required secrets
- [Android Developer: Build Variants](https://developer.android.com/build/build-variants) -- product flavors documentation
- [GitHub Marketplace: Sign Android Release](https://github.com/marketplace/actions/sign-android-release) -- if signed APK is needed later

### Tertiary (LOW confidence)

- [Apple Developer: altool deprecation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution) -- altool vs notarytool; needs validation against current Xcode version on macos-latest runner
- iOS TestFlight workflow details -- specific xcodebuild flags and ExportOptions.plist content may need adjustment based on actual Xcode project configuration

## Metadata

**Confidence breakdown:**

- Server infrastructure (nginx, PM2, MySQL, deploy workflow): HIGH -- direct extrapolation from existing production setup
- CI/CD staging pipeline: HIGH -- pattern matches existing deploy.yml almost 1:1
- Staging seed script: HIGH -- extends existing seed.ts/seed-spom.ts patterns
- Android APK builds: MEDIUM -- straightforward Gradle debug build, but Capacitor version mismatch is a risk
- iOS TestFlight builds: MEDIUM -- requires Apple Developer account setup, certificate management, and no local Mac for testing; many moving parts

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (30 days -- infrastructure patterns are stable)

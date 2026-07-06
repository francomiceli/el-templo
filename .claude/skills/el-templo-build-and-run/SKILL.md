---
name: el-templo-build-and-run
description: >
  Build-and-run runbook for the El Templo monorepo. Use when you need to: set up
  the dev environment from scratch, install dependencies (pnpm), configure .env
  files and environment variables, provision local MySQL, run a dev server, build
  any app, run typecheck (tsc / vue-tsc / nuxi typecheck), run lint, run tests
  (Vitest, integration tests against MySQL), understand CI workflows, the deploy
  pipeline, mobile builds (Capacitor Android/iOS), app versioning (version.txt),
  or pre-commit hooks (Husky + lint-staged). Triggers: setup, install, run dev
  server, build, typecheck, lint, run tests, CI, environment, env vars, ports,
  dist artifacts, mobile build, Android, iOS, Capacitor.
---

# El Templo — Build & Run

Runbook for recreating the environment from scratch, building, running, and
verifying every app in the monorepo at `/home/franco/projects/el-templo`.
All commands below are verified against the repo as of 2026-07-05.

## When NOT to use this skill

- Push/merge/deploy gating and branch policy → **el-templo-change-control**
- Anything about writing, generating, or applying DB migrations (the `db:migrate`
  runner, `_migrations` table, numbering) → **el-templo-db-migrations**
- Diagnosing a bug or runtime failure → **el-templo-debugging-playbook**
- "Why did this break before / has this happened before" → **el-templo-failure-archaeology**

## 1. Monorepo layout

Four deployable apps. **This is NOT a pnpm workspace at the root** — each app has
its own `pnpm-lock.yaml` and installs independently in its own directory. The
root `package.json` exists only for Husky + lint-staged + Prettier.

| Directory          | Stack                                                     | What it is                         | Deployed as                             |
| ------------------ | --------------------------------------------------------- | ---------------------------------- | --------------------------------------- |
| `el-templo-api/`   | Fastify 5 + Drizzle ORM + MySQL (mysql2), TypeScript, tsx | Backend API                        | Node process under pm2 (`eltemplo-api`) |
| `el-templo-app/`   | Quasar 2 + Vue 3 + Capacitor 8                            | Member app (Android/iOS + web SPA) | SPA + native store builds               |
| `el-templo-admin/` | Quasar 2 + Vue 3 (web-only, no Capacitor)                 | Admin/coach panel                  | SPA                                     |
| `el-templo-web/`   | Nuxt 4 (SSG via `nuxt generate`)                          | Public landing page (eltemplo.org) | Static site                             |

Ancillary directories (not part of the 4-app build/deploy pipeline):

- `workers/media-proxy/` — Cloudflare Worker (`wrangler.toml`).
- `tools/` — QR generators, Firebase service files, iOS signing helpers.
- `digital-initiatives/`, `poc-pdf/`, `scratchpad/` — side projects / experiments.
- Root `*.md` files — handoffs and briefs, not code.

## 2. Prerequisites

- **Node**: CI uses **Node 22** (`NODE_VERSION: '22'` in every workflow). App
  `engines` accept `^20 || ^22 || ^24 || ^26 || ^28`.
- **pnpm**: CI pins **pnpm 10** (`pnpm/action-setup@v4` with `version: 10`);
  `el-templo-api/package.json` declares `"packageManager": "pnpm@10.28.1"`.
- **MySQL 8.0** running locally on port 3306 (CI uses the `mysql:8.0` image).
  There is no docker-compose in the repo — MySQL is provisioned by you.
- **Java 21 (Zulu)** — only for local Android builds (normally done in CI).

## 3. Setup from scratch

### 3.0 Root (pre-commit hooks)

```bash
cd /home/franco/projects/el-templo
pnpm install   # installs husky + lint-staged + prettier, wires git hooks via "prepare": "husky"
```

### 3.1 API (`el-templo-api/`)

```bash
cd el-templo-api
pnpm install
cp .env.example .env   # then fill values
```

Create the local database, then run migrations (detail lives in
**el-templo-db-migrations**; never use `drizzle-kit migrate`):

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS eltemplo"
pnpm db:migrate        # custom runner: src/db/run-migrations.ts, tracks _migrations table
pnpm db:seed           # optional seed (needs SEED_ADMIN_PASSWORD / SEED_DEFAULT_PASSWORD in .env)
```

Env vars in `el-templo-api/.env.example` (names only — never commit values):

| Group                 | Variables                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database              | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (local default `eltemplo`)                                                                                                                                      |
| Auth                  | `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_ACCESS_EXPIRES_IN`                                                                                                                                                                   |
| CORS                  | `FRONTEND_URL`, `ADMIN_URL`                                                                                                                                                                                               |
| Server                | `PORT` (default 3000), `NODE_ENV`                                                                                                                                                                                         |
| Sentry (optional)     | `SENTRY_DSN`                                                                                                                                                                                                              |
| Cloudflare R2 (video) | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`                                                                                                                            |
| Email (Resend)        | `RESEND_API_KEY` (required in prod — email degrades **silently** without it), `FRANCHISE_NOTIFICATION_EMAIL`, `GLADIUS_NOTIFICATION_EMAIL`, `ACADEMY_NOTIFICATION_EMAIL`, `APP_NOTIFICATION_EMAIL`, `CAMPAIGN_EMAIL_FROM` |
| AI                    | `ANTHROPIC_API_KEY`                                                                                                                                                                                                       |
| Push (Firebase)       | `FIREBASE_SERVICE_ACCOUNT_BASE64`, `DRY_RUN`                                                                                                                                                                              |
| Seeding               | `SEED_ADMIN_PASSWORD`, `SEED_DEFAULT_PASSWORD`                                                                                                                                                                            |

Rule: adding a new env var ⇒ update the corresponding `.env.example`.

### 3.2 Member app (`el-templo-app/`)

```bash
cd el-templo-app
pnpm install           # postinstall runs `quasar prepare`
cp .env.example .env
```

Env vars: `VITE_API_URL` (local: `http://localhost:3000/api`), `VITE_APP_NAME`,
optional `VITE_SENTRY_DSN`.

### 3.3 Admin app (`el-templo-admin/`)

```bash
cd el-templo-admin
pnpm install           # postinstall: `quasar prepare && node scripts/copy-ffmpeg.mjs`
cp .env.example .env
```

Env vars: `VITE_API_URL`, optional `VITE_SENTRY_DSN`, optional
`VITE_APP_ENVIRONMENT` (set by CI/CD; media uploads disabled when set).

### 3.4 Landing (`el-templo-web/`)

```bash
cd el-templo-web
pnpm install           # postinstall runs `nuxi prepare`
cp .env.example .env
```

Env vars: `NUXT_PUBLIC_API_URL`, optional `NUXT_PUBLIC_SENTRY_DSN`,
`NUXT_PUBLIC_APP_ENVIRONMENT`, `NUXT_PUBLIC_GA4_ID`, `NUXT_PUBLIC_META_PIXEL_ID`.

## 4. Commands per app (verified against each package.json)

### el-templo-api

| Task         | Command                                                                                                                    | Notes                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Dev server   | `pnpm dev`                                                                                                                 | `tsx watch src/index.ts`, listens on `PORT` (default **3000**)                                                     |
| Build        | `pnpm build`                                                                                                               | `tsc` → emits to `dist/`                                                                                           |
| Start (prod) | `pnpm start`                                                                                                               | `node dist/index.js`                                                                                               |
| Typecheck    | `pnpm exec tsc --noEmit`                                                                                                   | No dedicated script; this is the exact CI command. **Mandatory before committing.**                                |
| Lint         | —                                                                                                                          | No lint script in the API (ESLint is a devDep but unwired)                                                         |
| Tests        | `pnpm test` (`vitest run`) / `pnpm test:watch`                                                                             | Integration tests vs real MySQL — see §5                                                                           |
| DB           | `pnpm db:migrate`, `pnpm db:generate`, `pnpm db:seed`, `pnpm db:push`, `pnpm db:studio`, `pnpm db:reset`, `pnpm seed:spom` | Migration policy → **el-templo-db-migrations**. `db:push`/`db:reset` bypass migration tracking — prototyping only. |

### el-templo-app (member)

| Task       | Command                                          | Notes                                                                                               |
| ---------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Dev server | `pnpm dev`                                       | `quasar dev`, port **9000** (Quasar default; no port override in `quasar.config.js`), opens browser |
| Build      | `pnpm build`                                     | `quasar build` → `dist/spa/`. `vite-plugin-checker` runs **ESLint** (not vue-tsc) during build      |
| Lint       | `pnpm lint`                                      | ESLint flat config over `src*/**`                                                                   |
| Format     | `pnpm format`                                    | Prettier                                                                                            |
| Tests      | `pnpm test` / `pnpm test:watch` / `pnpm test:ui` | Small Vitest unit suite in `el-templo-app/test/` (no DB needed)                                     |

### el-templo-admin

| Task       | Command      | Notes                                                                                       |
| ---------- | ------------ | ------------------------------------------------------------------------------------------- |
| Dev server | `pnpm dev`   | `quasar dev`, port **9100** (set in `quasar.config.js`)                                     |
| Build      | `pnpm build` | `quasar build` → `dist/spa/` (history-mode router). ESLint via vite-plugin-checker at build |
| Lint       | `pnpm lint`  | Same shape as app                                                                           |
| Tests      | —            | No test script                                                                              |

### el-templo-web

| Task        | Command                       | Notes                                                           |
| ----------- | ----------------------------- | --------------------------------------------------------------- |
| Dev server  | `pnpm dev`                    | `nuxt dev`, port **9200** (set in `nuxt.config.ts` `devServer`) |
| Build (SSG) | `pnpm generate`               | `nuxt generate` — this is what CI builds                        |
| Build (SSR) | `pnpm build` / `pnpm preview` | Present but CI uses `generate`                                  |
| Typecheck   | `pnpm typecheck`              | `nuxi typecheck` (vue-tsc). Runs in CI, blocking                |
| Lint        | `pnpm lint`                   | `eslint .`                                                      |

### Port map (local dev)

| Port | Service               |
| ---- | --------------------- |
| 3000 | API (`PORT` env)      |
| 3306 | MySQL                 |
| 9000 | Member app dev server |
| 9100 | Admin dev server      |
| 9200 | Landing dev server    |

## 5. Test policy

- **Do NOT run the API integration suite locally by default** — it is heavy and
  runs in CI on every push. **Local typecheck IS mandatory** before committing:
  `pnpm exec tsc --noEmit` in `el-templo-api/` (and `pnpm typecheck` in
  `el-templo-web/` if you touched it).
- API tests are **integration tests against real MySQL**. Vitest provisions one
  database **per worker**: `eltemplo_test_<VITEST_POOL_ID>` (created by
  `test/setup.ts`, stale DBs dropped by `test/setup-global.ts` — including the
  legacy unsuffixed `eltemplo_test`). You never create test DBs by hand; the
  MySQL user just needs privileges to CREATE/DROP `eltemplo_test_*`.
- DB credentials for tests come from `el-templo-api/.env.development` then
  `.env` (`DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`); `DB_NAME` is overridden
  per worker — never set it for tests. `JWT_SECRET` and `NODE_ENV=test` are
  injected by `vitest.config.ts`.
- Parallelism: `MAX_TEST_WORKERS` env (default 4) caps Vitest fork workers.
- Auth/request helpers for new tests: `el-templo-api/test/helpers.ts`
  (`createTestApp()` wraps the real `buildApp()` factory).
- New API routes must ship with integration tests in `el-templo-api/test/`.

## 6. CI/CD (descriptive only — push gating lives in el-templo-change-control)

### CI — `.github/workflows/ci.yml`

Runs on push and PR to `master`, `main`, `develop`, `staging`. Five parallel jobs:

| Job           | Steps (blocking unless noted)                                                          |
| ------------- | -------------------------------------------------------------------------------------- |
| `api-check`   | `tsc --noEmit` → `pnpm audit` (advisory, `\|\| true`) → `pnpm run build`               |
| `api-test`    | MySQL 8.0 service container (`eltemplo_test`) → `pnpm test`                            |
| `app-check`   | lint (advisory, `continue-on-error`) → audit (advisory) → `pnpm run build`             |
| `admin-check` | lint (advisory) → audit (advisory) → `pnpm run build`                                  |
| `web-check`   | lint (advisory) → audit (advisory) → `nuxi typecheck` (blocking) → `pnpm run generate` |

### Deploy — `.github/workflows/deploy.yml` (prod, push to master/main or manual) and `deploy-staging.yml` (push to staging)

Same pipeline shape:

1. **Detect changes** (`dorny/paths-filter`) per app dir; only changed apps are
   built. `workflow_dispatch` bypasses detection and deploys everything.
2. **Build** each changed app (API build also runs typecheck + the full test
   suite against a MySQL service container, and copies migration SQL into `dist/`).
3. **Backup** the current deploy on the EC2 server (for rollback).
4. **rsync** built artifacts to the server (api, app, admin, web each to their
   own path).
5. **API post-deploy**: `pnpm install --prod --frozen-lockfile` →
   `NODE_ENV=production node dist/db/run-migrations.js` →
   `pm2 restart eltemplo-api --update-env`.
6. **Smoke tests**: API `/health` + web HTTP check; on failure, **auto-rollback**
   restores the backup and restarts pm2.

## 7. Mobile builds (Capacitor, member app only)

`el-templo-app/src-capacitor/` holds the native projects and has its **own
package.json** (`pnpm install` inside it is a separate step). The web build is
copied in (`cp -r dist/spa/* www/`) then `npx cap sync android|ios`.

### Workflows (all `workflow_dispatch` — manual only)

| Workflow                       | Output                                                                                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build-android-staging.yml`    | Debug staging APK (`app-staging-debug.apk`) as a GH artifact                                                                                                                                                                            |
| `build-android-production.yml` | **Master-only** (fails on other refs). Signed AAB + APK via `./gradlew bundleProductionRelease assembleProductionRelease`, uploads to Play Store via service account. `VERSION_NAME` from `version.txt`, `VERSION_CODE` = GH run number |
| `build-ios-staging.yml`        | TestFlight build (`com.eltemplo.app.staging`), macOS runner                                                                                                                                                                             |
| `build-ios-production.yml`     | **Master-only**, `macos-26` runner, uploads to App Store Connect. `MARKETING_VERSION` from `version.txt`                                                                                                                                |

### Versioning

- Source of truth: `el-templo-app/version.txt` (X.Y.Z; `1.5.6` in the working
  tree as of 2026-07-05). Keep `el-templo-app/package.json` `version` in sync.
- `el-templo-app/bump-version.sh` propagates `version.txt` into Android
  `build.gradle` (`versionName`) and iOS `project.pbxproj` (`MARKETING_VERSION`).
  The store workflows also read `version.txt` directly at build time.
- Convention: feature ⇒ minor bump, bugfix ⇒ patch bump, done on production builds.

### Known state (as of 2026-07-05)

The iOS **Associated Domains** entitlement is **commented out** in
`el-templo-app/src-capacitor/ios/App/App.entitlements` (Universal Links iOS are
OFF; the App Store provisioning profile lacked the capability). Android deep
links still work. Restore it before resuming mail/freemium deep-link campaigns.

## 8. Pre-commit hooks

Husky + lint-staged run from the **root** on every commit (requires a one-time
`pnpm install` at the repo root). Per root `package.json`:

- `el-templo-app/**/*.{ts,vue}` and `el-templo-admin/**/*.{ts,vue}` →
  `eslint --fix` with each app's flat config.
- `el-templo-web/{pages,layouts,components,...}/**/*.{ts,vue}` →
  `eslint --fix` via `pnpm --filter el-templo-web`.
- `**/*.{ts,vue,js,json,md}` → `prettier --write`.

If a commit fails on lint-staged: fix and make a **new** commit (don't amend).

## Provenance & maintenance

Everything above was read from the repo on 2026-07-05. To re-verify:

```bash
# Scripts per app
for d in el-templo-api el-templo-app el-templo-admin el-templo-web; do
  echo "== $d =="; jq .scripts /home/franco/projects/el-templo/$d/package.json; done
# Env var names
grep -v '^\s*#' /home/franco/projects/el-templo/el-templo-*/.env.example | grep '='
# CI / deploy / mobile workflows
ls /home/franco/projects/el-templo/.github/workflows/
# Dev ports
grep -n "port" /home/franco/projects/el-templo/el-templo-{app,admin}/quasar.config.js \
  /home/franco/projects/el-templo/el-templo-web/nuxt.config.ts
# Test DB provisioning
sed -n 1,40p /home/franco/projects/el-templo/el-templo-api/test/setup.ts
# Version + entitlements
cat /home/franco/projects/el-templo/el-templo-app/version.txt
cat "/home/franco/projects/el-templo/el-templo-app/src-capacitor/ios/App/App.entitlements"
```

Update this skill when: scripts change in any `package.json`, workflows are
added/renamed in `.github/workflows/`, dev ports move, `.env.example` gains
variables, or the Associated Domains entitlement is restored.

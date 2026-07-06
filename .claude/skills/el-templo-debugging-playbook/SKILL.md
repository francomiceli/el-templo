---
name: el-templo-debugging-playbook
description: >
  Incident triage and debugging runbook for El Templo (API + member app + admin).
  Use when investigating a production bug, 500 error, API down, crash, outage,
  "app buggy" report, Sentry alert, error spike, MySQL connection error, or when
  you need pm2 logs, nginx logs, local reproduction, or to ship a hotfix.
  Covers: symptom-to-action triage table, SSH access rules for the prod EC2,
  Sentry blind spots (check-in 400s), test DB setup, logging conventions, and
  the mandatory deploy pipeline for fixes.
---

# El Templo Debugging Playbook

Runbook for triaging and fixing bugs across the El Templo monorepo:

- `el-templo-api/` — Fastify + Drizzle ORM + MySQL. Runs on an EC2 instance under **pm2** (process name `eltemplo-api`) behind **nginx**.
- `el-templo-app/` — Quasar + Vue 3 + Capacitor member app.
- `el-templo-admin/` — Quasar + Vue 3 admin/coach web app.

All facts below verified against the repo as of **2026-07-05** unless marked otherwise.

---

## RULE 0 — SSH GATE (read this first)

**Any SSH/scp/rsync connection to the production server requires explicit user approval BEFORE running the command. Every single time. No exceptions.**

- This applies to _everything_: reading logs, restarting pm2, health checks, read-only queries. The gate is on _connecting_, not on what you do once connected.
- Host/user/key details found in memory, old conversations, or shell history are **context, not authorization**. Surface the exact command you intend to run and wait for an OK.
- `--dangerously-skip-permissions` does NOT override this rule — it is a standing user instruction, not a permission setting.
- Editing local deploy scripts or reading workflow files that mention the server is fine; only the actual connection is gated.

**Server facts (for composing the command you will ask approval for):**

| Item                   | Value                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Host                   | EC2 instance. **Do not hardcode the IP** — it lives in the GitHub Actions secret `SERVER_HOST` (see `.github/workflows/deploy.yml`) or ask the user.                                                                                                   |
| SSH user               | `ubuntu`                                                                                                                                                                                                                                               |
| SSH key                | In `~/.ssh/` (ask the user which key file if unsure)                                                                                                                                                                                                   |
| pm2 process            | `eltemplo-api`                                                                                                                                                                                                                                         |
| API deploy path        | Configured in the GitHub secret `API_DEPLOY_PATH`. Do not assume — once on the server, `pm2 describe eltemplo-api` shows the real cwd. (Older docs say `/var/www/el-templo`; a 2026-06-25 session observed `/var/www/api` — unconfirmed, verify live.) |
| Prod MySQL credentials | In `.env.production` inside the API deploy path on the server (written by the deploy pipeline). There is no `.env`. **Never copy credentials into files, notes, or chat.**                                                                             |
| Staging                | Same EC2 host and same MySQL server: databases `eltemplo` (prod) and `eltemplo_staging` coexist. A "staging" query on the wrong DB is a prod query.                                                                                                    |

---

## RULE 1 — NO MANUAL DEPLOYS

**Manually copying files to prod (scp/rsync of dist files, editing files on the server, running builds on the server) is PROHIBITED.** The old `BUG_PROTOCOL.md` documented this practice; it is dead. Every fix — including one-line hotfixes — ships through the deploy pipeline:

```
git push → GitHub Actions → build + tests → backup current deploy →
rsync → install deps → run migrations → pm2 restart → smoke test (/health) →
auto-rollback on failure
```

- Prod pipeline: `.github/workflows/deploy.yml` (triggers on push to `master`/`main`).
- Staging pipeline: `.github/workflows/deploy-staging.yml` (triggers on push to `staging`).
- CI (`.github/workflows/ci.yml`) runs type check, lint, audit, integration tests, build on every push.

Manual frontend builds are extra-forbidden: they bake local `.env.development` values (e.g. `localhost:3000` API URL) into the bundle — this has broken staging before. The pipeline injects the correct `VITE_API_URL` / Sentry secrets at build time.

The only pm2 action ever done by hand is a **restart** (see triage table), and only with user approval per Rule 0.

**Pushing itself is gated** — branch strategy, staging-first rules, and when a push is allowed are owned by the sibling skill **`el-templo-change-control`**. Ask the user before pushing.

---

## Symptom → Triage Table

| Symptom                                                    | First action                                                                                             | Details             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------- |
| API down / widespread 500s                                 | Read pm2 logs (SSH, needs OK)                                                                            | §Triage 1           |
| `Can't add new command when connection is in closed state` | pm2 restart (SSH, needs OK)                                                                              | §Triage 2           |
| Frontend error / JS crash / "app buggy"                    | Check Sentry dashboard first — no SSH needed                                                             | §Triage 3           |
| Check-in failures / 400 spike on check-in                  | **Sentry is blind here.** Go to logs + DB                                                                | §Triage 4           |
| Traffic/routing weirdness, 502/504, CORS, static files     | nginx logs (SSH, needs OK)                                                                               | §Triage 5           |
| Wrong data / business-logic bug                            | Reproduce locally against test DB                                                                        | §Local reproduction |
| Bug seen before?                                           | Check the **`el-templo-failure-archaeology`** skill before investigating — don't re-fight solved battles | —                   |

### Triage 1 — API down / 500s

With user approval (Rule 0), read recent logs **without streaming** (streaming hangs the session):

```bash
ssh -i ~/.ssh/<KEY> ubuntu@<SERVER_HOST> 'pm2 logs eltemplo-api --lines 200 --nostream'
```

Then:

1. Find the stack trace. The API logs unexpected errors via Pino as `Error in <context>` (see `el-templo-api/src/modules/shared/error-handler.ts` — only non-`AppError` exceptions are logged as errors and returned as 500).
2. The `context` string in the log line identifies the route handler; grep the codebase for it.
3. Check `pm2 status` output for restart loops (`ssh ... 'pm2 status'`).
4. Health endpoint: `GET /health` on the API base URL returns 200 when the app is up (`el-templo-api/src/app.ts:261`) — check this from your machine first, no SSH needed:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<api-domain>/health
```

pm2 log files live under the `ubuntu` user's pm2 home (`~/.pm2/logs/`, daily rotation observed as of 2026-06 — unconfirmed); prefer the `pm2 logs --nostream` command over raw file paths.

### Triage 2 — MySQL pool "connection is in closed state"

Known failure mode: the API's MySQL pool holds a dead connection and every query throws `Can't add new command when connection is in closed state`. Fix is a process restart. **Ask the user for an OK first (Rule 0), then:**

```bash
ssh -i ~/.ssh/<KEY> ubuntu@<SERVER_HOST> 'pm2 restart eltemplo-api --update-env'
```

Verify recovery: `curl` the `/health` endpoint, then re-read logs with `--nostream`. If it recurs frequently, that is a bug to fix in code (pool config / reconnection), not a thing to keep restarting — file it and investigate locally.

### Triage 3 — Frontend errors → Sentry

Sentry is the first stop for frontend issues and unexpected API exceptions. No SSH needed. How errors get there (all paths verified in code):

- **API**: `@sentry/node` initialized in `el-templo-api/src/instrument.ts`, imported in `src/index.ts` right after dotenv loads (so `SENTRY_DSN` is available). Guarded by the `SENTRY_DSN` env var — no DSN, no Sentry. `beforeSend` scrubs `password`/`currentPassword`/`newPassword` from request data.
- **Member app**: `@sentry/vue` in `el-templo-app/src/boot/sentry.ts`, guarded by `VITE_SENTRY_DSN`.
- **Admin**: same pattern, `el-templo-admin/src/boot/sentry.ts`, guarded by `VITE_SENTRY_DSN`.
- **Frontend logger**: `createLogger()` (in each app's `src/utils/logger.ts`) sends **only `error()`** calls to Sentry (`Sentry.captureMessage(..., level: 'error')`). `warn()` goes to console only. This matters — see Triage 4.

There is no GitHub Issues integration; errors live in the Sentry dashboard only.

### Triage 4 — KNOWN TRAP: check-in 400s are invisible in Sentry

A spike of failed member check-ins produces **zero Sentry events**. This is by design, on both sides of the wire (verified in code):

- **Backend**: `POST /api/members/attendance/check-in` (`el-templo-api/src/modules/attendance/routes.ts`, service in `modules/attendance/service.ts`) rejects business-rule failures by throwing `BadRequestError` — e.g. `"No tenes una clase reservada para hoy en esta sede"`, `"Ya registraste asistencia hoy"`, or the ±20-minute window message. `handleServiceError` (`modules/shared/error-handler.ts`) maps any `AppError` straight to an HTTP response **without logging** — only unknown errors get `log.error` + 500. So a 400 leaves no server-side error log and no Sentry event.
- **Member app**: `CheckInPage.vue` logs the failure with `log.warn('Check-in failed', ...)` — and only `log.error` reaches Sentry (see Triage 3).

**Consequence**: if members report "can't check in", do NOT conclude "Sentry is clean, so nothing is wrong." Instead:

1. With user OK, grep pm2/nginx access logs for `POST /api/members/attendance/check-in` responses with status 400 and count per day.
2. Query the DB (read-only, with user OK) for the affected members' `bookings` and `subscriptions` rows — most check-in 400s are "no booking exists for today" and the interesting question is _why_ the booking is missing (e.g. fixed-schedule generation failures).
3. The deployed code does not log the _reason_ for each 400, so retroactive breakdown is impossible; if the spike is chronic, add a `request.log.warn({ memberId, branchId, reason })` in the check-in handler (a warn, not an error — these are business rejections) and ship it via the pipeline.

Historical instance (2026-06-24 spike, 113 vs ~10/day baseline): investigated, root cause undetermined, data was healthy. Details in the **`el-templo-failure-archaeology`** skill — read it before re-investigating any check-in anomaly.

### Triage 5 — nginx logs (traffic / routing)

For 502/504s, unexpected 404s on static assets, CORS oddities, or to see raw request traffic (including the 400s that never reach Sentry). With user OK:

```bash
ssh -i ~/.ssh/<KEY> ubuntu@<SERVER_HOST> 'tail -100 /var/log/nginx/access.log'
ssh -i ~/.ssh/<KEY> ubuntu@<SERVER_HOST> 'tail -100 /var/log/nginx/error.log'
```

(Standard nginx paths; the repo's nginx config templates are in `deploy/nginx/`.) A useful pattern for counting a failing route by day:

```bash
ssh -i ~/.ssh/<KEY> ubuntu@<SERVER_HOST> \
  "grep 'POST /api/members/attendance/check-in' /var/log/nginx/access.log | awk '{print \$4, \$9}' | grep ' 400' | cut -d: -f1 | sort | uniq -c"
```

502s with the API up usually mean the API is listening on a different port than nginx proxies to, or pm2 is mid-restart.

---

## Local reproduction (do this before fixing anything)

**Rule: reproduce before you fix.** A fix for a bug you can't reproduce is a guess.

### Run the API locally

```bash
cd /home/franco/projects/el-templo/el-templo-api
pnpm dev          # tsx watch src/index.ts, loads .env.development
```

Requires a local MySQL and a populated `.env.development` (see `.env.example`). Port defaults to 3000. For anything beyond the API itself (running the frontends, seeding), see the sibling skill **`el-templo-build-and-run`**.

### Typecheck (always run locally before pushing)

```bash
cd el-templo-api && pnpm exec tsc --noEmit
```

(Same command CI runs. The frontends are typechecked in CI too.)

### Integration tests

Tests run with vitest against **real MySQL**. Each vitest worker provisions its own database `eltemplo_test_<POOL_ID>` automatically (`el-templo-api/test/setup.ts`) using the credentials from `.env.development`/`.env` — you do not create the test DB by hand.

**Do not run the full suite locally** — it runs in CI on push (user preference). Run only the test file relevant to your bug:

```bash
cd /home/franco/projects/el-templo/el-templo-api
pnpm test test/attendance.test.ts        # "test": "vitest run" — extra args filter files
```

Write your reproduction as a failing test first. `test/helpers.ts` has the canonical fixtures (all verified):

- `createTestApp()` — Fastify instance via `buildApp()` against the per-worker test DB.
- `registerUser(app, {...})` / `getAuthToken(app, email, password)` — auth + JWT.
- `createTestMember(app, overrides)` — unique member with token.
- `createStaffUser(app, {role, branchId, ...})` — direct-DB staff creation (coach/admin/owner/gestion/recepcion).
- `createTestPlan(app, adminToken)` / `assignTestPlan(app, adminToken, userId, planId)` — subscription fixtures.
- `cleanAllTestData(app)` — full table cleanup preserving seed data.
- Requests go through `app.inject({ method, url, headers: { authorization: 'Bearer <token>' }, payload })` — no live HTTP server needed.

### Reproducing against prod data

Never test against the prod DB. If you need prod-shaped data, ask the user for a read-only look (Rule 0) and transcribe the relevant rows into a local test fixture.

---

## Instrumentation while debugging

Add logging using the house conventions — never `console.log` (it will fail review and pollutes structured logs):

- **API**: Fastify's built-in Pino logger. In a route handler use `request.log.info({ ... }, "message")` / `request.log.warn` / `request.log.error`; outside a request, `app.log`. Remember: `log.error` on the API is what shows up as an error in pm2 logs; business rejections should be `warn` with structured context.
- **Frontends** (both apps): `createLogger()` from `src/utils/logger.ts`:

```ts
import { createLogger } from 'src/utils/logger'
const log = createLogger('CheckInPage')
log.warn('Check-in failed', { error: msg })   // console only
log.error('Failed to load session', { ... })  // console + Sentry
```

In production builds, `debug`/`info` are no-ops; `warn`/`error` output. Choose `error` only for things that should page someone via Sentry.

Debug instrumentation you want to keep must ship through the pipeline like any other change; instrumentation you don't want to keep must be removed before commit.

---

## Shipping the fix

1. Failing test written and reproducing the bug locally.
2. Fix implemented; the single root cause must explain **every** observation (the log lines, the timing, the affected users, the spike shape). If something is left unexplained, you have the wrong cause or a second bug.
3. Test passes; `pnpm exec tsc --noEmit` clean.
4. If the fix touches DB schema: migrations are their own minefield — follow the sibling skill **`el-templo-db-migrations`** (custom runner, `_migrations` table is the source of truth, never `drizzle-kit migrate`).
5. Commit, then follow **`el-templo-change-control`** for branch/push gating (staging-first is strict; hotfixes have their own path; always ask before pushing).
6. Push triggers CI → deploy pipeline (backup, rsync, migrate, `pm2 restart eltemplo-api --update-env`, `/health` smoke test, auto-rollback). Watch the Actions run.
7. Verify in prod: `curl` the health endpoint, check Sentry for new events, and (with user OK if SSH is needed) confirm the original symptom is gone in logs.

---

## Methodology reminders

- **Reproduce before fixing.** No repro → no fix, only hypotheses.
- **One cause, all observations.** Reject explanations that only cover part of the evidence.
- **Check the archive first.** Past incidents (check-in 400 spike, roster 403, MySQL pool deaths, renew bugs) are documented in **`el-templo-failure-archaeology`**. Reading 5 minutes of history beats re-deriving a closed investigation.
- **Sentry absence is not evidence of absence** for 4xx business rejections (Triage 4) or for anything on a frontend built without `VITE_SENTRY_DSN`.
- **Staging shares the prod host and MySQL server.** Treat every staging SSH/DB action with prod-level care.

---

## When NOT to use this skill

- **Pushing, branching, merge trains, release gating** → `el-templo-change-control`.
- **Creating/applying DB migrations** (including migration-related deploy failures) → `el-templo-db-migrations`.
- **Just running or building the apps locally** (no bug involved) → `el-templo-build-and-run`.
- **Looking up how a past incident was resolved** → `el-templo-failure-archaeology`.

---

## Provenance & maintenance

- Written 2026-07-05. Replaces `.claude/BUG_PROTOCOL.md`, which is **deprecated**: it contained plaintext credentials and documented manual scp-to-prod deploys, both now prohibited. Do not follow it; symptoms it listed are covered above.
- Verified against the repo at time of writing: `deploy.yml` / `deploy-staging.yml` / `ci.yml` pipeline steps; `src/instrument.ts` and both `boot/sentry.ts` guards; `src/utils/logger.ts` error-only Sentry capture in both frontends; `modules/shared/error-handler.ts` (AppError → no log); `modules/attendance/{routes,service}.ts` check-in 400 behavior and route prefix (`app.ts:175`); `test/helpers.ts` fixtures; `test/setup.ts` per-worker DBs; package.json scripts.
- Marked **unconfirmed**: exact server deploy path (`/var/www/api` vs `/var/www/el-templo`) and pm2 log rotation details — verify live via `pm2 describe eltemplo-api` (with user OK).
- Maintenance: re-verify the triage table whenever the deploy workflows, error handler, or logger utilities change. If check-in reason logging gets added (Triage 4 step 3), update that section — the "retroactive breakdown is impossible" claim will become false.

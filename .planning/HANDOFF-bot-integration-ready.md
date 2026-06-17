---
doc: HANDOFF
title: el-templo-bot — Integration-Ready Baseline
audience: Developer picking up real-API / turnera / admin-app / production-database integration
prepared_on: 2026-06-17
prepared_by: Matías (owner of el-templo-bot scope)
branch: feature/whatsapp-bot-scaffold
head_commit: 17378509 (Phase 98 closed; verifier PASSED 8/8 must-haves)
scope: el-templo-bot to "integration-ready" + green API test baseline
out_of_scope: real-API/turnera wiring, admin-app integration, real-DB testing, production deploy
secrets_policy: env var NAMES only — no real secret values appear in this doc; live `.env` holds real OpenAI/WhatsApp/DB credentials and MUST NOT land in any committed file
push_status: local-only — this doc and all Phase 98 commits live on feature/whatsapp-bot-scaffold; nothing pushed, nothing merged to master
---

# HANDOFF: `el-templo-bot` — Integration-Ready Baseline

## 1. Scope boundary

**What I own (this branch, ready to hand off):**

- `el-templo-bot` — webhook handler, AI provider, tools layer, state machine, Redis session/debounce, proactive schedulers — built and **tested end-to-end in live integration on 2026-06-17** (full PB1 discovery flow, profile extraction, `register_trial` + `check_schedule` + interactive-button confirmation closed a trial-class booking; `request_human` → handoff phrase fired correctly).
- **Green test baseline** on `el-templo-api`: **519 passed / 1 failed / 520 total** (single failure is the intentional Phase-95-deferred BUG-03 (i) LIKE-search RED — see §6).
- **Permanent sweep-lint guardrail** against raw-SQL ↔ Drizzle column-name drift (97.5).
- All planning artifacts under `.planning/` — phase summaries, decisions, halt narratives, findings.

**What you own (out of scope for this handoff):**

- Real-API / turnera wiring — the bot's `book_class` and `register_trial` tools already POST to `${API_BASE_URL}/api/bot/scheduling/*` (`el-templo-bot/src/ai/tools.ts:746-762, 921-942`), but real turnera availability/cancellation/wait-list mechanics on the API side are yours.
- Admin-app integration testing — the admin SPA's WhatsApp conversation UI (`el-templo-admin`) talks to `el-templo-api`; cross-app end-to-end testing is yours.
- Real-DB testing — populate a realistic dataset and exercise against real branches/plans/schedules; see §4 for the seed scripts I provide.
- Production deploy — pushes, master merges, EC2 rsync, PM2 restart, CI/CD secrets — all yours.

**Hard constraints carried from my side:**

- This branch (`feature/whatsapp-bot-scaffold`) has NOT been pushed and is NOT merged to master.
- No secret values are committed. `.env` files are gitignored; only `.env.example` files are tracked.

---

## 2. Current state of `el-templo-bot` end-to-end

**Confirmed working in live testing on 2026-06-17:** full PB1 discovery flow, profile-tag extraction, `register_trial` + `check_schedule` + interactive button confirmation completed a real trial-class booking against the dev DB; `request_human` correctly emitted the handoff phrase via `sendTextMessage`.

### Module map

| Module                     | File                                             | Entry                                                               | What it does                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot process bootstrap      | `el-templo-bot/src/index.ts`                     | `bootstrap()` at `:29-43`                                           | Loads `dotenv/config`, decorates Fastify with `app.db`, registers `webhookRoutes`, starts schedulers (`:47-48`), listens on `PORT` (default 3001)                                                        |
| Webhook routes             | `el-templo-bot/src/webhook/routes.ts`            | `webhookRoutes` plugin                                              | `GET /webhook` (Meta verify handshake, `:31-47`) + `POST /webhook` (inbound, `:49-...`); no prefix                                                                                                       |
| Inbound handler            | `el-templo-bot/src/webhook/handler.ts`           | `handleInboundMessage` at `:201`                                    | Debounce → save inbound → state lookup → AI loop → tool execution → reply                                                                                                                                |
| Debounce / dead-man switch | `el-templo-bot/src/memory/session.ts`            | `tryAcquireDebounce` at `:235-251`, `releaseDebounce` at `:260-278` | Atomic SETNX + Lua compare-and-delete on Redis; TTL from `DEBOUNCE_TTL_SECONDS` (Phase 93/94/97 invariant)                                                                                               |
| Redis session              | `el-templo-bot/src/memory/session.ts`            | `getSession` `:47`, `updateSession` `:122-152` (Lua atomic)         | Keys prefixed `wa:session:`; TTL 21 600 s (6 h); cap 20 messages                                                                                                                                         |
| State machine              | `el-templo-bot/src/state/machine.ts`             | `determineClientState(phone, db)` `:54-136`                         | Raw-SQL lookup on `users` + `subscriptions JOIN subscription_plans` + `attendance`; returns `lead`, `trial`, `active_member`, `inactive_member`, `expired_member`                                        |
| AI provider factory        | `el-templo-bot/src/ai/provider.ts`               | `createAiProvider()` `:57-69`                                       | Env-routed switch on `AI_PROVIDER` (default `"openai"`); branches to `OpenAiProvider` (`openai.ts:57-69`) or `AnthropicProvider` (`anthropic.ts:28-36`)                                                  |
| System prompt              | `el-templo-bot/src/ai/system-prompt.ts`          | `getSystemPrompt(opts?)` `:250`                                     | Accepts `clientState?`, `profileContext?`, `activePlaybook?`, `currentStage?`, `currentAvatar?`, `softRejectionRule?`, `todayISO?`, `todayDayName?` (defaults to Argentine TZ via `Intl.DateTimeFormat`) |
| Tool catalog               | `el-templo-bot/src/ai/tools.ts`                  | `BOT_TOOLS` `:96`                                                   | `check_schedule`, `check_membership`, `get_location`, `request_human`, `book_class`, `register_trial`                                                                                                    |
| Tool dispatcher            | `el-templo-bot/src/ai/tools.ts`                  | `executeTool` `:242-275`                                            | Switch on tool name; wraps each handler; catches `ToolTimeoutError` → Spanish timeout message                                                                                                            |
| Class-reminder scheduler   | `el-templo-bot/src/schedulers/class-reminder.ts` | `startClassReminderScheduler(db)` `:175-191`                        | Cron `"*/30 * * * *"` (`:179`) in TZ `"America/Argentina/Buenos_Aires"` (`:184`); sends `sendTemplateMessage`                                                                                            |
| Trial-follow-up scheduler  | `el-templo-bot/src/schedulers/trial-followup.ts` | `startTrialFollowupScheduler(db)` `:185-201`                        | Cron `"0 * * * *"` (`:189`); gated by `isBusinessHours()` (`:46-58`, 10–19 local)                                                                                                                        |

### Tool surface (where the bot calls real systems)

| Tool                                                                  | Surface                                                                                                                                            |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check_schedule`, `check_membership`, `get_location`, `request_human` | Raw SQL against the shared MySQL DB (`tools.ts:317-339, 469-549, 567-624, 638-642`) — **no internal API call**                                     |
| `book_class`                                                          | HTTP POST `${API_BASE_URL}/api/bot/scheduling/book-class` with header `x-bot-api-key: ${BOT_API_KEY}` (`tools.ts:746-762`); reads back via raw SQL |
| `register_trial`                                                      | HTTP POST `${API_BASE_URL}/api/bot/scheduling/register-trial` with same auth (`tools.ts:921-942`); reads back via raw SQL                          |
| Both POSTs                                                            | Wrapped in `withTimeout` (Phase 95) bounded by `EXECUTE_TOOL_TIMEOUT_MS` (default `30_000`)                                                        |

### Cross-phase invariant the bot honors

```
DEBOUNCE_TTL_SECONDS >= (OPENAI_TIMEOUT_MS / 1000) × MAX_TOOL_ITERATIONS
                     + (executeTool_timeout_seconds × MAX_TOOL_ITERATIONS)
                     + safety_buffer
```

Default concrete values: `OPENAI_TIMEOUT_MS=45000` (`openai.ts:50-55`), `MAX_TOOL_ITERATIONS=5` (`handler.ts:91`), `EXECUTE_TOOL_TIMEOUT_MS=30000` (`tools.ts:36-43`), safety_buffer=20 → minimum TTL 395 s (→ 600 s in `.env.example:48`). If you tune any term, recompute the floor and update `DEBOUNCE_TTL_SECONDS` to stay above it — the dead-man switch firing mid-OpenAI-call re-manifests BUG-01.

---

## 3. What is MOCKED in tests vs. what needs REAL wiring

### Mocked in tests (DO NOT touch — these mocks are how the API suite hits 519/1/520)

| Mock                       | File:Line                                                      | Returns                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createAiProvider` factory | `el-templo-api/test/whatsapp/webhook.test.ts:45-59`            | `{ chat: vi.fn().mockResolvedValue({ content: "Hola, soy Mica.", toolCalls: [] }) }` (empty `toolCalls` keeps the handler on the no-tool path per `handler.ts:708`) |
| `sendTextMessage`          | `el-templo-api/test/whatsapp/webhook.test.ts:27-39`            | Fake wamid `"wamid.sent.mock123"`                                                                                                                                   |
| `WHATSAPP_*` env literals  | `el-templo-api/test/whatsapp/webhook.test.ts:194-205`          | Placeholder strings `"test-token"`, `"test-phone-id"`                                                                                                               |
| `OPENAI_API_KEY`           | `el-templo-api/.env.test` (or equivalent) + project convention | Placeholder `sk-xxxxxxxx`; openai-provider would return live 401 against this — irrelevant under vi.mock                                                            |

### Real wiring required (you must supply real credentials in `.env`)

**By NAME only. Cross-reference `.env.example` files for descriptions; never commit real values.**

**AI provider** (set in `el-templo-bot/.env`; documented in `el-templo-bot/.env.example`):

- `AI_PROVIDER` — `openai` (default) or `anthropic` (`.env.example:21`; `provider.ts:58`)
- `AI_MODEL` — optional override; defaults: openai `gpt-4o-mini`, anthropic `claude-haiku-4-5-20251001` (`.env.example:22`; `provider.ts:47-50`)
- `OPENAI_API_KEY` — required if `AI_PROVIDER=openai`; read by the OpenAI SDK internally, not via `process.env` in bot src (`.env.example:23`; `openai.ts:63`)
- `OPENAI_TIMEOUT_MS` — default `45000`; tied to cross-phase invariant (`.env.example:26`; `openai.ts:50-55`)
- `ANTHROPIC_API_KEY` — required if `AI_PROVIDER=anthropic`; read by the Anthropic SDK internally (`.env.example:30`; `anthropic.ts:33`)

**WhatsApp Cloud API** (set in `el-templo-bot/.env`; also in `el-templo-api/.env` if API endpoints exercise it):

- `WHATSAPP_TOKEN` — Meta Graph Bearer token (`bot/.env.example:15`; `client.ts:63-69, 130-136, 229-236`)
- `WHATSAPP_PHONE_ID` — Meta phone-number-id used in URL path (`bot/.env.example:16`; `client.ts:64, 131, 230`)
- `WHATSAPP_VERIFY_TOKEN` — Meta webhook verify challenge (`bot/.env.example:17`; `client.ts:34-39`)
- `WHATSAPP_BUSINESS_ACCOUNT_ID` — declared at `bot/.env.example:18` but **NOT read anywhere in `bot/src/**`\*\* (discrepancy flagged below); set it for completeness if your deploy tooling expects it
- Graph API version is pinned: `client.ts:21` `const GRAPH_API_VERSION = "v21.0";` — bump in code if you need a newer Cloud API contract

**Shared MySQL** (set in BOTH `el-templo-bot/.env` and `el-templo-api/.env`; same DB):

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (`bot/.env.example:5-9`; `api/.env.example:5-9`; `api/drizzle.config.ts:9-13`)

**Redis** (set in `el-templo-bot/.env`; bot only):

- `REDIS_URL` (`bot/.env.example:12`; consumed by session / debounce / scheduler-distributed-lock)

**Bot ↔ API auth** (set in BOTH `el-templo-bot/.env` and `el-templo-api/.env`; must match):

- `API_BASE_URL` — bot's view of the API, default `http://localhost:3000` (`bot/.env.example:37`; `tools.ts:747, 922`)
- `BOT_API_KEY` — shared secret sent as `x-bot-api-key` header by the bot, validated server-side (`bot/.env.example:40`; `api/.env.example:57`; bot call sites `tools.ts:748, 923`)

**API-side production reqs** (set in `el-templo-api/.env`):

- `JWT_SECRET` (`api/.env.example:12`)
- `JWT_EXPIRES_IN` (`api/.env.example:13`; default `7d`)
- `FRONTEND_URL`, `ADMIN_URL` — CORS allow-list (`api/.env.example:16-17`)
- `NODE_ENV` (`api/.env.example:24`)
- `SENTRY_DSN` — optional, Sentry guarded by presence (`api/.env.example:20`)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` — Cloudflare R2 for video uploads (`api/.env.example:27-31`)
- `RESEND_API_KEY`, `FRANCHISE_NOTIFICATION_EMAIL`, `GLADIUS_NOTIFICATION_EMAIL`, `ACADEMY_NOTIFICATION_EMAIL`, `APP_NOTIFICATION_EMAIL` — Resend transactional email (`api/.env.example:34-38`)
- `ANTHROPIC_API_KEY` — API-side franchise agent (separate from the bot's AI provider) (`api/.env.example:41`)
- `SEED_ADMIN_PASSWORD`, `SEED_DEFAULT_PASSWORD` — only for `pnpm db:seed` (`api/.env.example:60-61`; `seed.ts:7-18`)
- `CONFIRM_PRODUCTION_SEED=yes` — required gate for `pnpm seed:production` (`seed-production.ts:16-21`; npm script `api/package.json:18`)

**Admin SPA** (set in `el-templo-admin/.env`):

- `VITE_API_URL` (`admin/.env.example:5`)
- `VITE_SENTRY_DSN` — optional (`admin/.env.example:8`)
- `VITE_APP_ENVIRONMENT` — `"staging"` disables media uploads (`admin/.env.example:11`)

**Tuning knobs (defaults are sensible; touch only if you understand the cross-phase invariant)**:

- `DEBOUNCE_TTL_SECONDS` — default `600`; ≥ invariant floor (`bot/.env.example:48`)
- `EXECUTE_TOOL_TIMEOUT_MS` — default `30000` (`bot/.env.example:29`; `tools.ts:36-43`)
- `PORT` — bot default `3001` (`bot/.env.example:33`; `index.ts:26`), API default `3000` (`api/.env.example:23`)

**Discrepancies to flag before deploy:**

1. `WHATSAPP_BUSINESS_ACCOUNT_ID` declared in `bot/.env.example:18` but NEVER read in `bot/src/**` (`grep process.env.WHATSAPP_BUSINESS_ACCOUNT_ID` returns 0 hits). Either delete from `.env.example` or wire it where Meta tooling actually expects it.
2. `CLASS_REMINDER_HOURS` is **read** at `bot/src/schedulers/class-reminder.ts:37` (default `2`) but **not documented** in `bot/.env.example`. Add it before staging.
3. `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` are read by their SDKs' internal env lookup, not by `process.env.*` in bot src — easy to miss when grepping; verify your deploy env actually populates them.

---

## 4. Database

### Drizzle + scripts (all under `el-templo-api/`)

- Config: `el-templo-api/drizzle.config.ts` — schema dir `./src/db/schema`, output dir `./src/db/migrations`, dialect `mysql`, `multipleStatements: true`.
- Run migrations: `pnpm --filter el-templo-api db:migrate` (drizzle-kit) or `pnpm --filter el-templo-api db:run-migrations` (raw SQL runner via `tsx src/db/run-migrations.ts`).
- Generate a new migration: `pnpm --filter el-templo-api db:generate`.
- Push schema state for dev iteration: `pnpm --filter el-templo-api db:push`.
- Drizzle Studio: `pnpm --filter el-templo-api db:studio`.
- Latest migration in `el-templo-api/src/db/migrations/` (45 files total): `0043_populate_timezone_tables.sql`. Sequence tail: `…0040_whatsapp_message_unique_raw.sql`, `0041_update_client_state_enum.sql`, `0042_add_branch_address_columns.sql`, `0043_populate_timezone_tables.sql`.
- npm-script source of truth: `el-templo-api/package.json:12-20`.

### `eltemplo` (dev/prod) vs `eltemplo_test`

- The test runner FORCES `DB_NAME=eltemplo_test`:
  - `el-templo-api/vitest.config.ts:17-25` — `env.NODE_ENV='test'`, `env.DB_NAME='eltemplo_test'`
  - `el-templo-api/test/helpers.ts:16-23` — `createTestApp()` overrides `process.env.DB_NAME = "eltemplo_test"` and sets a deterministic `JWT_SECRET` before `buildApp()`
- Production / dev runtime reads `DB_NAME` from real env (typically `eltemplo`).
- Tests run **sequentially** by design: `vitest.config.ts:15` `fileParallelism: false, // DB tests must run sequentially`. Do not "optimize" by re-enabling parallelism — the shared MySQL state breaks.

### The 97.5 column-name convention (READ THIS BEFORE WRITING ANY RAW SQL)

The Drizzle schema renamed JS-side `status` to disambiguated SQL columns:

- `el-templo-api/src/db/schema/subscriptions.ts:18-23` → SQL column `subscription_status` (JS property `status`, mysqlEnum `["active","paused","cancelled","expired"]`)
- `el-templo-api/src/db/schema/bookings.ts:15-22` → SQL column `booking_status` (JS property `status`, mysqlEnum `["reservado","qr_escaneado","confirmado","cancelado","lista_espera","no_show"]`)

**Rule: any new raw SQL (`sql\`…\``) referencing these tables MUST use the SQL column names** (`subscription_status`, `booking_status`), not `status`. Drizzle-mediated queries (`db.select({ status: schema.subscriptions.status })`) are safe — the ORM handles the rename. Raw SQL is where this drift previously caused `Unknown column 'sub.status' in 'field list'` (MySQL errno 1054, sqlState 42S22) at runtime on every `check_membership` call and on the `determineClientState` subscription branch.

**Permanent guardrail** — `el-templo-api/test/lint/raw-sql-column-drift.test.ts` runs in the regular vitest suite:

- Scans `el-templo-bot/src/**` and `el-templo-api/src/**` for raw `sql\`…\`` template literals.
- Compares `<alias>.<col>` references (and bare unqualified `<col>` tokens in single-table queries) against Drizzle-declared SQL column names via live `getTableColumns`/`isTable`/`getTableName` introspection.
- Enforces a must-include SUBSET of 10 high-risk renames across 8 tables (test name `"Drizzle-discovered rename map ⊇ the high-risk must-include subset (D-03 — 10 entries across 8 tables)"` at `:503`):
  - `subscriptions.status → subscription_status`
  - `bookings.status → booking_status`
  - `attendance.status → attendance_status`, `attendance.source → attendance_source`
  - `whatsapp_conversations.status → conversation_status`
  - `whatsapp_messages.direction → message_direction`, `whatsapp_messages.messageType → wa_message_type`
  - `aura_config.sourceType → aura_config_source_type`
  - `exercises.level → exercise_level`
  - `format_compatibility.level → compat_level`
- Includes a PERMANENT positive-control synthetic-drift fixture that MUST always fail without the guard — defending the guard itself.

If you add a new column with this `_status` / `_type` / `_level` rename pattern, extend the must-include SUBSET in the same PR.

### Seed scripts to get a realistic dataset

- `pnpm --filter el-templo-api db:seed` → `tsx src/db/seed.ts` — baseline dev seed (admin user + default users; requires `SEED_ADMIN_PASSWORD` + `SEED_DEFAULT_PASSWORD`, otherwise aborts at `seed.ts:7-18`).
- `pnpm --filter el-templo-api seed:production` → `tsx src/db/seed-production.ts` — branches + plans + schedules (requires `CONFIRM_PRODUCTION_SEED=yes` gate at `seed-production.ts:16-21`).
- `pnpm --filter el-templo-api seed:spom` → `tsx src/db/seed-spom.ts` — SPOM-specific.
- `pnpm --filter el-templo-api db:reset` → `pnpm db:push && pnpm db:seed` — full reset for dev.

There is **no single "full booking-flow" seed script** that produces a realistic conversational dataset. For end-to-end testing, run `db:reset` then `seed:production`, then exercise the bot manually (see §5) to generate `whatsapp_conversations` / `whatsapp_messages` / `subscriptions` / `bookings` rows.

---

## 5. How to run locally

### Dev-server commands (each in its own terminal)

| App   | Command                             | Port                    | Source                                                    |
| ----- | ----------------------------------- | ----------------------- | --------------------------------------------------------- |
| API   | `pnpm --filter el-templo-api dev`   | `3000`                  | `tsx watch src/index.ts` (`el-templo-api/package.json:7`) |
| Bot   | `pnpm --filter el-templo-bot dev`   | `3001`                  | `tsx watch src/index.ts` (`el-templo-bot/package.json:7`) |
| Admin | `pnpm --filter el-templo-admin dev` | quasar default (`9000`) | `quasar dev` (`el-templo-admin/package.json:13`)          |

Prereqs: local MySQL with `eltemplo` DB created and migrated (`pnpm --filter el-templo-api db:migrate` then `pnpm --filter el-templo-api db:reset`), local Redis on `localhost:6379`, `.env` files populated per §3.

### ngrok webhook setup (Meta → bot)

The bot listens on `PORT=3001` (`bot/index.ts:43-44`, host `0.0.0.0`). Meta's webhook callback hits **`POST /webhook`** (defined at `bot/src/webhook/routes.ts:49-51`); Meta verification handshake hits **`GET /webhook`** (defined at `:31-47`, returns the challenge if `mode=subscribe` and `verify_token` matches `WHATSAPP_VERIFY_TOKEN` per `client.ts:29-51`).

Bring up an ngrok tunnel pointed at the bot:

```bash
ngrok http 3001
```

Take the `https://<sub>.ngrok-free.app` URL and configure it in Meta App Dashboard → WhatsApp → Configuration → Callback URL as `https://<sub>.ngrok-free.app/webhook`, with the verify-token field set to whatever `WHATSAPP_VERIFY_TOKEN` you put in `bot/.env`. Subscribe to the `messages` field. Meta sends a `hub.challenge` GET — `client.ts:29-51` echoes it back if the token matches, else logs and returns `null`.

For Meta token + phone-number-id setup, the existing guides are:

- `docs/deployment/whatsapp-token-setup.md`
- `docs/deployment/whatsapp-phone-registration.md`
- `docs/deployment/whatsapp-templates.md`
- `docs/meta-token-regeneration.md`
- `docs/deployment/github-secrets-checklist.md`

### Exercising a full booking/membership flow manually

1. Start API + bot + ngrok per above; verify Meta webhook configured + subscribed.
2. Seed real branches/plans/schedules: `pnpm --filter el-templo-api seed:production` (with the `CONFIRM_PRODUCTION_SEED=yes` gate).
3. From your real WhatsApp account, message the test phone number (the one tied to `WHATSAPP_PHONE_ID`).
4. The bot's `determineClientState` will classify you as `lead` (no `users` row yet), seat you in playbook PB1, run the discovery flow with profile-tag extraction, present the trial-class scheduling flow when it advances, dispatch `register_trial` via HTTP POST to the API (`tools.ts:921-942`), then on success drive `check_schedule` + interactive-button confirmation to dispatch `book_class` (`tools.ts:746-762`).
5. To exercise `request_human` → handoff, type a phrase that surfaces `softRejection` strongly enough to elicit the LLM to call the tool (e.g., persistent agitated rejection); the handler sets `conversation_status='human_takeover'` and the bot stays silent thereafter (see §6 known issues — silent-dead-end UX gap).
6. To exercise schedulers: insert a `bookings` row with `class_at` ≈ now + `CLASS_REMINDER_HOURS` (default 2 h) and watch the cron tick at `:30`/`:00` (`*/30 * * * *` in Argentine TZ); insert a `users` row with `trial_class_at` ≈ now and watch the hourly trial-followup tick during 10-19 local.

---

## 6. Test baseline + known issues

### Baseline (post Phase 98)

```
cd el-templo-api && pnpm test --run
# 519 passed / 1 failed / 520 total
```

The **single** failure is by design — Phase-95-deferred BUG-03 (i) LIKE-search RED. Test description: `"BUG-03 candidate (i) — LIKE-search ambiguity at tools.ts:455 > RED: returns exactly one disambiguated branch for substring-match input (FAILS on master)"`. Test file: `el-templo-api/test/whatsapp/v5-3-3-booking.integration.test.ts:99-164`. Production location of the LIKE search has drifted line-wise: the ROADMAP/STATE refer to the historical line `tools.ts:455`; the current physical location is `el-templo-bot/src/ai/tools.ts:569` (`query = sql\`SELECT id, name, code FROM branches WHERE is_active = true AND name LIKE ${\`%${branchName}%\`}\``). Defect class unchanged; only the line number drifted. The defect only fires on synthetic substring-overlap seed data, not on current production branch data.

If you see anything OTHER than that single failure, something is wrong — read the next finding first.

### Finding 1 — `ai-tools-membership-drift.test.ts` flake (98-FINDING-01)

**Full report:** `.planning/phases/98-test-hygiene-98-a-b-c/98-FINDINGS-phase-97-bound.md`. **Routed to:** Phase 97 RGUARD-01 scope (it blocks the regression-baseline lock).

`el-templo-api/test/whatsapp/ai-tools-membership-drift.test.ts` (added by 97.5, commit `cfb13e2c`) fails non-deterministically. Observed runs during Phase 98 verification: one early run had 24 failures, an operator run hit 4 failures (3 of which were in this file), the immediate retry was clean 519/1/520. NOT a parallelism race (`vitest.config.ts:15` has `fileParallelism: false`). Most likely cross-file shared-state leakage on `branches` / `subscriptions` between this file and `ai-tools.test.ts`. Suggested fix direction in the report: audit `beforeEach`/`afterEach` cleanup completeness, FK-aware truncation order, consider a shared cleanup helper. Verify determinism by running `pnpm --filter el-templo-api test --run` ≥10 times in a row before locking any new regression baseline on top of this suite.

### Finding 2 — `human_takeover` silent dead-end UX gap

At `el-templo-bot/src/webhook/handler.ts:382-389`:

```ts
// 3. Human takeover check -- bot stays silent
if (conversationStatus === "human_takeover") {
  log.info(
    { conversationId },
    "Conversation in human_takeover, bot staying silent",
  );
  return;
}
```

The bot logs and returns. There is **no** acknowledgement message sent to the user (e.g., "Ya te paso con una persona — un momento por favor"), **no** scheduled follow-up to detect operator non-response, and **no** notification surfaced to operators that someone is waiting. Combined with the schedulers (`class-reminder`, `trial-followup`) — neither of which fire on this state — a user can sit in `human_takeover` indefinitely with zero engagement from either side. In live testing on 2026-06-17 `request_human` correctly fired the handoff phrase before flipping state, but the subsequent silence is the gap.

**Suggested fix direction** (when you scope it): (a) send a single acknowledgement message immediately after `request_human` flips state, with a soft SLA expectation (`"Una persona te responderá a la brevedad"`); (b) emit an operator-facing notification (admin app conversation badge, Slack/email, Resend transactional, etc.); (c) consider a scheduler/cron pass that detects `human_takeover` conversations with no operator reply within X hours and either nudges the operator or auto-resumes the bot with a "still here?" check. Not a Phase 98 defect; flagging as integration-readiness blocker for production traffic.

### Deferred test-reliability items (from `.planning/STATE.md`)

- `el-templo-bot/test/v5-3-3-openai-latency.test.ts` ~line 515 — Phase 94-01 SC#3 flake (`STATE.md:96`); `vi.useFakeTimers` + `advanceTimersByTimeAsync` ordering family.
- `el-templo-bot/test/v5-3-3-degr-01-escalation.test.ts` — Phase 95-03 DEGR-01 escalation suite; 1–5 of 9 tests fail intermittently across 10-run samples (`STATE.md:97`).
- Both have NO production impact per `STATE.md:97`; deferred to Phase 97 or dedicated debug.

---

## 7. Open risks for live integration

### Risk 1 — `formatBranchLocations` accent-insensitive matching is broken

- Location: `el-templo-bot/src/ai/tools.ts:600` (`function formatBranchLocations(rows, prefix?)`), called from `:589` and `:597`.
- Mechanism: `row.name.toLowerCase().includes(key)` where `key` is a non-accented constant from `BRANCH_ADDRESSES` (`tools.ts:61-67`, e.g., `"constitucion"`, `"jujuy"`).
- Defect: real branch rows can carry accented names (`"Constitución"`). `"constitución".includes("constitucion")` returns `false`, so the branch falls through to the "no address" path — user sees the branch name but no address and no Maps link. `get_location` silently degrades.
- Source: `.planning/phases/98-test-hygiene-98-a-b-c/98-HALT.md:125-129`.
- Fix shape: NFD-normalize both sides + strip combining marks (`.normalize("NFD").replace(/\p{Diacritic}/gu, "")`) before `.includes()`. Captured for v5.4.0 staging-gate review; not fixed in Phase 98.

### Risk 2 — Tool-layer date validation deferred (Phase 96.5)

- Today: `system-prompt.ts:90-104` grounds the model in Argentine date via `Intl.DateTimeFormat`. Prompt-side defense only.
- Deferred: `el-templo-bot/src/ai/tools.ts` does **NOT** independently reject past dates server-side (`.planning/phases/96.5-date-grounding-fix/96.5-01-SUMMARY.md:229,254`). If the model hallucinates a past date, the tool will happily POST it to the API.
- Risk: under real production traffic at scale, a hallucination slips through prompt grounding and creates a phantom booking row for a past date. Belt-and-suspenders fix is v5.4.0 hardening.

### Risk 3 — Timezone assumptions

Argentine TZ is hard-coded in three places — verify they hold for your deploy:

- `el-templo-bot/src/schedulers/class-reminder.ts:96, 100, 184` — explicit `CONVERT_TZ('UTC' → 'America/Argentina/Buenos_Aires')` in raw SQL + cron `timezone` option.
- `el-templo-bot/src/schedulers/trial-followup.ts:46-58, 194` — `Intl.DateTimeFormat` Argentine TZ for `isBusinessHours()` (10-19 local).
- `el-templo-bot/src/ai/system-prompt.ts:90-104` — `getArgentineToday()`.
- `el-templo-bot/src/ai/knowledge.ts:480` — `toLocaleString("es-AR")` for currency formatting.

If El Templo ever runs a non-Argentine branch, every one of these is wrong. Phone normalization (`client.ts:75, 152, 250`) is also Argentine-specific (`549xxx → 54xxx`).

### Risk 4 — v5.4.0 items that need closure before live production

Per `.planning/STATE.md` "v5.4.0 production-ready path":

- **Live BUG-02 smoke test** — `STATE.md:39, 95, 111, 162` — throttled-upstream WhatsApp send with interim msg + graceful fallback observation; cannot be exercised against ngrok + Meta test tokens, requires a real production-class WhatsApp account.
- **Cross-phase invariant alerting** — `STATE.md:171` — alert if `OPENAI_TIMEOUT_MS`, `MAX_TOOL_ITERATIONS`, `EXECUTE_TOOL_TIMEOUT_MS`, `safety_buffer`, or `DEBOUNCE_TTL_SECONDS` drift out of invariant range.
- **Bot↔CRM persistence layer decision** — `STATE.md:114` — bot currently logs transcripts via Pino only; not queryably persisted. Decide whether v5.4.0 or Kero phase 1 owns durable conversation persistence beyond the existing `whatsapp_messages` table.
- **WhatsApp Business Account verification + permanent tokens + production phone number** — `MACRO-ROADMAP.md:50-52`.

### Risk 5 — Phase 97 RGUARD-01 blocker

The regression-baseline lock that v5.3.3 was supposed to close hasn't shipped yet — it's BLOCKED on Finding 98-FINDING-01 (the membership-drift flake). Until that flake closes deterministically, RGUARD-01 cannot lock a meaningful baseline. ROADMAP entry for Phase 97 now reflects this dependency.

---

## Cross-references

- `.planning/MACRO-ROADMAP.md` — cross-milestone sequence (v5.3.3 → v5.4.0 → Kero CRM)
- `.planning/ROADMAP.md` — phase ledger and outstanding work
- `.planning/STATE.md` — v5.4.0 production-ready path + deferrals
- `.planning/REQUIREMENTS.md` — v5.3.3 requirement IDs (CONC, LAT, BOOK, CTXT, DEGR, ELEV, VOSEO, RGUARD, HYG)
- `.planning/codebase/INTEGRATIONS.md`, `STACK.md`, `STRUCTURE.md`, `ARCHITECTURE.md`, `CONCERNS.md`, `CONVENTIONS.md`, `TESTING.md`
- `.planning/phases/98-test-hygiene-98-a-b-c/98-HALT.md` — accent-insensitive defect + Task 2 expanded-scope narrative
- `.planning/phases/98-test-hygiene-98-a-b-c/98-FINDINGS-phase-97-bound.md` — Finding 98-FINDING-01 full report
- `.planning/phases/98-test-hygiene-98-a-b-c/98-01-SUMMARY.md` — Phase 98 SUMMARY with post-merge sign-off
- `.planning/phases/98-test-hygiene-98-a-b-c/98-VERIFICATION.md` — verifier PASSED 8/8 must-haves report
- `.planning/phases/97.5-raw-sql-column-drift-prod-fix/97.5-01-SUMMARY.md` — raw-SQL column-drift fix + sweep-lint design
- `.planning/phases/96.5-date-grounding-fix/96.5-01-SUMMARY.md` — date-grounding fix + deferred tool-layer validation note
- `el-templo-bot/CLAUDE.md` — bot-specific dev guidelines
- `docs/deployment/` — WhatsApp setup, GitHub secrets, etc.
- `deploy/DEPLOYMENT-GUIDE.md`, `deploy/DEPLOYMENT-CHECKLIST.md`, `deploy/RUNBOOK.md` — your turf
- `contexto/whatsapp-bot-architecture.txt`, `contexto/whatsapp-bot-developer-handoff.md` — earlier handoff material (pre-v5.3.3); this doc supersedes for the v5.x post-97.5/98 state

---

_Prepared 2026-06-17 against HEAD `17378509` on `feature/whatsapp-bot-scaffold`. Local only — not pushed, not merged to master._

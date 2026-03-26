# Environment Variable Setup Analysis

**Date:** 2026-03-25
**Scope:** el-templo-api, el-templo-bot, deploy scripts
**Purpose:** Audit current env var management, identify gaps, recommend production strategy

---

## 1. Current State Audit

### All Environment Variables by Package

| Variable                     | el-templo-api | el-templo-bot | Shared? | Notes                                         |
| ---------------------------- | :-----------: | :-----------: | :-----: | --------------------------------------------- |
| **Database**                 |               |               |         |                                               |
| DB_HOST                      |       x       |       x       |   Yes   | Same MySQL instance                           |
| DB_PORT                      |       x       |       x       |   Yes   | 3306                                          |
| DB_USER                      |       x       |       x       |   Yes   |                                               |
| DB_PASSWORD                  |       x       |       x       |   Yes   |                                               |
| DB_NAME                      |       x       |       x       |   Yes   | eltemplo                                      |
| **Redis**                    |               |               |         |                                               |
| REDIS_URL                    |       x       |       x       |   Yes   | redis://localhost:6379                        |
| **WhatsApp**                 |               |               |         |                                               |
| WHATSAPP_TOKEN               |       x       |       x       |   Yes   | API uses for admin takeover sends             |
| WHATSAPP_PHONE_ID            |       x       |       x       |   Yes   | API uses for admin takeover sends             |
| WHATSAPP_VERIFY_TOKEN        |       x       |       x       |   No    | Bot only (webhook verification)               |
| WHATSAPP_BUSINESS_ACCOUNT_ID |       -       |       x       |   No    | Bot .env.example only, not in code            |
| **AI**                       |               |               |         |                                               |
| AI_PROVIDER                  |       -       |       x       |   No    | Bot only                                      |
| AI_MODEL                     |       -       |       x       |   No    | Bot only                                      |
| OPENAI_API_KEY               |       -       |       x       |   No    | Bot only                                      |
| ANTHROPIC_API_KEY            |       x       |       x       |   No    | API uses for franchise AI agent, bot for chat |
| **Auth/Comms**               |               |               |         |                                               |
| JWT_SECRET                   |       x       |       -       |   No    | API only                                      |
| JWT_EXPIRES_IN               |       x       |       -       |   No    | API only                                      |
| BOT_API_KEY                  |       x       |       x       |   Yes   | Bot sends, API validates                      |
| API_BASE_URL                 |       -       |       x       |   No    | Bot only (localhost API calls)                |
| **Server**                   |               |               |         |                                               |
| PORT                         |   x (3000)    |   x (3001)    |   No    | Different ports                               |
| NODE_ENV                     |       x       |       x       |   Yes   | Same value per environment                    |
| LOG_LEVEL                    |       x       |       -       |   No    | API only                                      |
| **CORS**                     |               |               |         |                                               |
| FRONTEND_URL                 |       x       |       -       |   No    | API only                                      |
| ADMIN_URL                    |       x       |       -       |   No    | API only                                      |
| **Cloudflare R2**            |               |               |         |                                               |
| R2_ACCOUNT_ID                |       x       |       -       |   No    | API only                                      |
| R2_ACCESS_KEY_ID             |       x       |       -       |   No    | API only                                      |
| R2_SECRET_ACCESS_KEY         |       x       |       -       |   No    | API only                                      |
| R2_BUCKET_NAME               |       x       |       -       |   No    | API only                                      |
| R2_PUBLIC_URL                |       x       |       -       |   No    | API only                                      |
| **Email (Resend)**           |               |               |         |                                               |
| RESEND_API_KEY               |       x       |       -       |   No    | API only                                      |
| FRANCHISE_NOTIFICATION_EMAIL |       x       |       -       |   No    | API only                                      |
| GLADIUS_NOTIFICATION_EMAIL   |       x       |       -       |   No    | API only                                      |
| ACADEMY_NOTIFICATION_EMAIL   |       x       |       -       |   No    | API only                                      |
| APP_NOTIFICATION_EMAIL       |       x       |       -       |   No    | API only                                      |
| **Monitoring**               |               |               |         |                                               |
| SENTRY_DSN                   |       x       |       -       |   No    | API only (optional)                           |
| **Bot Scheduling**           |               |               |         |                                               |
| CLASS_REMINDER_HOURS         |       -       |       x       |   No    | Bot only (default 2)                          |
| **Seed**                     |               |               |         |                                               |
| SEED_ADMIN_PASSWORD          |       x       |       -       |   No    | Dev only                                      |
| SEED_DEFAULT_PASSWORD        |       x       |       -       |   No    | Dev only                                      |

**Summary:** 8 variables are shared between both processes (DB x5, REDIS_URL, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, BOT_API_KEY). The rest are package-specific.

---

## 2. Recommendation: Separate .env per Package

**Recommended approach: Each package maintains its own .env file.** This is already the current setup and is the right choice.

### Why This Works

- Each process loads its own `.env` via dotenv at startup (already implemented)
- PM2 ecosystem.config.cjs only passes `NODE_ENV: 'production'` (correct -- no secrets in committed files)
- Shared vars (DB, Redis, WhatsApp, BOT_API_KEY) are duplicated across both .env files
- For 2 processes on a single EC2, this duplication is acceptable and simpler than alternatives

### Alternatives Considered (Not Recommended)

| Approach                        | Why Not                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Single root `.env`              | Requires custom dotenv loader, both processes would load vars they don't need, harder to reason about per-process config |
| PM2 `env_production` block      | Secrets visible in `pm2 show` output and ecosystem file (committed to git)                                               |
| Secrets manager (AWS SSM, etc.) | Over-engineering for a single EC2 deployment, adds latency and a dependency                                              |
| `.env` symlinks                 | Fragile, confusing debugging, no real benefit over copy                                                                  |

### Practical Implication

When updating a shared var (e.g., rotating WHATSAPP_TOKEN), you must update it in **both** `.env` files on the server. This is a 2-file operation, not ideal, but acceptable for 2 processes. If the monorepo grows to 3+ backend processes sharing credentials, revisit a shared `.env` loader.

---

## 3. .env.example Audit

| File                              | Status       | Notes                                                                                 |
| --------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `el-templo-api/.env.example`      | Complete     | 62 lines, includes all API vars + bot-related vars (WhatsApp, Redis, AI, BOT_API_KEY) |
| `el-templo-bot/.env.example`      | Complete     | 35 lines, all bot vars present, cross-references API BOT_API_KEY                      |
| `el-templo-admin/.env.example`    | Exists       | Frontend app                                                                          |
| `el-templo-app/.env.example`      | Exists       | Frontend app                                                                          |
| `el-templo-web/.env.example`      | Exists       | Frontend app                                                                          |
| `deploy/.env.production.template` | **OUTDATED** | Only covers 7 API vars. Missing 20+ vars (see Section 6)                              |

### deploy/.env.production.template Gap

Currently includes only:

- PORT, NODE_ENV, DB_HOST/PORT/USER/PASSWORD/NAME, FRONTEND_URL, ADMIN_URL, JWT_SECRET, LOG_LEVEL

Missing from template:

- JWT_EXPIRES_IN
- R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
- RESEND_API_KEY, notification emails (x4)
- ANTHROPIC_API_KEY
- WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN
- REDIS_URL
- AI_PROVIDER, AI_MODEL, OPENAI_API_KEY
- BOT_API_KEY
- SENTRY_DSN
- All bot-specific vars (API_BASE_URL, CLASS_REMINDER_HOURS, WHATSAPP_BUSINESS_ACCOUNT_ID)

---

## 4. Shared Variables Analysis

| Variable          | el-templo-api Usage                               | el-templo-bot Usage                | Must Match? |
| ----------------- | ------------------------------------------------- | ---------------------------------- | :---------: |
| DB_HOST           | Database connection                               | Database connection                |     Yes     |
| DB_PORT           | Database connection                               | Database connection                |     Yes     |
| DB_USER           | Database connection                               | Database connection                |     Yes     |
| DB_PASSWORD       | Database connection                               | Database connection                |     Yes     |
| DB_NAME           | Database connection                               | Database connection                |     Yes     |
| REDIS_URL         | Session/cache                                     | Conversation context/locks         |     Yes     |
| WHATSAPP_TOKEN    | Admin takeover sends (whatsapp/service.ts)        | Webhook responses (client.ts)      |     Yes     |
| WHATSAPP_PHONE_ID | Admin takeover sends (whatsapp/service.ts)        | Webhook responses (client.ts)      |     Yes     |
| BOT_API_KEY       | Validates bot requests (scheduling/bot-routes.ts) | Authenticates API calls (tools.ts) |     Yes     |

**Recommendation:** Keep duplicated in each `.env` file. The bot's `.env.example` already has the comment `# Bot-to-API authentication (must match el-templo-api BOT_API_KEY)` which is good practice. No changes needed here.

**Risk:** If BOT_API_KEY or WHATSAPP_TOKEN values diverge between the two `.env` files in production, bot-to-API calls or WhatsApp sends will silently fail. When rotating these values, always update both files and restart both PM2 processes.

---

## 5. WhatsApp Token Management

### Current State (Development)

The `WHATSAPP_TOKEN` in `.env` is a **temporary token** generated from the Meta Graph API Explorer. These tokens expire after 24 hours and are suitable only for development and testing.

### Production Setup: Permanent System User Token

For production, you need a **permanent access token** via a System User in Meta Business Manager. This token does not expire unless manually revoked.

**Step-by-step:**

1. Go to [Meta Business Manager](https://business.facebook.com/) > **Business Settings**
2. Navigate to **Users** > **System Users**
3. Click **Add** to create a new System User
   - Name: `el-templo-bot` (or similar)
   - Role: **Admin**
4. Click on the created System User > **Add Assets**
   - Select your WhatsApp Business Account
   - Grant **Full Control**
5. Click **Generate New Token**
   - Select your Meta App
   - Required permissions: `whatsapp_business_messaging`, `whatsapp_business_management`
   - Click **Generate Token**
6. **Copy the token immediately** (it is shown only once)

### Token Properties

- Does **not** expire (unlike Graph API Explorer tokens)
- Can be revoked manually from Business Manager
- Scoped to the specific WhatsApp Business Account
- Works with the same WHATSAPP_PHONE_ID

### Where to Store

- `/var/www/el-templo/el-templo-api/.env` -- for admin takeover message sends
- `/var/www/el-templo/el-templo-bot/.env` -- for bot webhook responses
- Both files must have the **same token value**

### Security Notes

- Do not commit the token to git (already handled: `.env` is gitignored)
- Rotate the token if the server is compromised: revoke in Business Manager, generate new one, update both `.env` files
- The `WHATSAPP_VERIFY_TOKEN` is a separate, self-chosen string for webhook verification and does not need Meta generation

---

## 6. Production Deployment Gaps

### deploy/update-server.sh

**Current script only handles el-templo-api.** It needs to also build and restart el-templo-bot.

Missing steps:

- `cd /var/www/el-templo/el-templo-bot && pnpm install && pnpm build`
- `pm2 restart eltemplo-bot`

The bot has no database migrations (uses the same schema as API), so no `db:push` needed for the bot.

### deploy/.env.production.template

**Severely outdated.** Should be split into two templates or expanded to cover both processes. Recommended approach: create two templates:

- `deploy/.env.production.api.template` -- all el-templo-api vars
- `deploy/.env.production.bot.template` -- all el-templo-bot vars

### Production .env File Locations

On EC2, each app needs its own `.env` file:

- `/var/www/el-templo/el-templo-api/.env` -- all API environment variables
- `/var/www/el-templo/el-templo-bot/.env` -- all bot environment variables

These files are created manually on the server (never committed to git). The `.env.example` files in each package serve as the template.

### deploy/setup-ec2.sh

Missing:

- Redis installation (`apt install -y redis-server`)
- Redis service start/enable
- PM2 startup configuration (`pm2 startup systemd`)
- Instructions for creating both `.env` files (currently only mentions API)

---

## 7. PM2 Ecosystem File

### Current State: Correct

The `el-templo-api/ecosystem.config.cjs` is properly configured:

- Both `eltemplo-api` and `eltemplo-bot` apps defined
- Only `NODE_ENV: 'production'` passed via env block (no secrets)
- Separate log files for each process
- Appropriate memory limits (500M API, 300M bot)
- Graceful shutdown configured (kill_timeout, wait_ready, listen_timeout)

### Guidelines

- **Do NOT put secrets in ecosystem.config.cjs** -- this file is committed to git
- PM2's `env_production` block is for non-secret runtime config only (NODE_ENV)
- All secrets must stay in the per-app `.env` files loaded by dotenv at process startup
- The `cwd` paths (`/var/www/el-templo/el-templo-api` and `/var/www/el-templo/el-templo-bot`) mean each process loads `.env` from its own directory

---

## Action Items (Prioritized)

### No Action Needed

1. `.env.example` files for both API and bot are complete and committed
2. PM2 ecosystem.config.cjs is correctly configured
3. Separate `.env` per package strategy is already in place

### TODO (Before Production Deploy)

1. **[HIGH] Update `deploy/.env.production.template`** -- Split into two templates (API + bot) covering all current vars. Use each package's `.env.example` as the source of truth.

2. **[HIGH] Update `deploy/update-server.sh`** -- Add bot install, build, and restart steps after the API section.

3. **[HIGH] Set up permanent WhatsApp System User token** -- Follow steps in Section 5 above. Must be done before production bot deployment.

4. **[HIGH] Create `.env` files on EC2** -- Both `/var/www/el-templo/el-templo-api/.env` and `/var/www/el-templo/el-templo-bot/.env` with production values.

5. **[MEDIUM] Update `deploy/setup-ec2.sh`** -- Add Redis installation, PM2 startup config, and instructions for both `.env` files.

6. **[LOW] Clean up `WHATSAPP_BUSINESS_ACCOUNT_ID`** -- Present in bot `.env.example` but not referenced in any code. Either use it or remove it from the template.

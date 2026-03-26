# Environment Variable Setup Analysis

**Date:** 2026-03-25 (updated 2026-03-26)
**Scope:** el-templo-api, el-templo-bot, GitHub Actions workflows, deploy scripts
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

## 2. Production Deployment: GitHub Actions + Secrets

Production deployment is fully automated via GitHub Actions. There are **no manually-created .env files on the server**. The workflow generates .env.production files from GitHub Secrets during CI/CD and deploys them via rsync.

### How It Works

1. **Trigger:** Push to `master` branch (or manual `workflow_dispatch`)
2. **Detect changes:** `dorny/paths-filter` determines which packages changed
3. **Build:** Each changed package builds in its own CI job
4. **Create .env.production:** The deploy job writes `.env.production` files using GitHub Secrets values
5. **Deploy:** `rsync --delete` syncs build artifacts + .env.production to the EC2 server
6. **Post-deploy:** Install prod dependencies, run migrations, restart PM2 processes
7. **Smoke test:** Hit `/health` endpoint; auto-rollback on failure

### Current GitHub Secrets (API)

The "Create .env.production for API" step in `deploy.yml` currently writes these secrets:

| Secret               | Used in .env.production | Notes                           |
| -------------------- | :---------------------: | ------------------------------- |
| DB_HOST              |           Yes           |                                 |
| DB_PORT              |           Yes           | Default 3306                    |
| DB_USER              |           Yes           |                                 |
| DB_PASSWORD          |           Yes           |                                 |
| DB_NAME              |           Yes           |                                 |
| JWT_SECRET           |           Yes           |                                 |
| JWT_EXPIRES_IN       |           Yes           | Default 7d                      |
| FRONTEND_URL         |           Yes           |                                 |
| ADMIN_URL            |           Yes           |                                 |
| SENTRY_DSN           |           Yes           |                                 |
| R2_ACCOUNT_ID        |           Yes           |                                 |
| R2_ACCESS_KEY_ID     |           Yes           |                                 |
| R2_SECRET_ACCESS_KEY |           Yes           |                                 |
| R2_BUCKET_NAME       |           Yes           |                                 |
| R2_PUBLIC_URL        |           Yes           |                                 |
| API_PORT             |           Yes           | Default 3000                    |
| API_DEPLOY_PATH      |          Infra          | rsync destination path          |
| APP_DEPLOY_PATH      |          Infra          | rsync destination path          |
| ADMIN_DEPLOY_PATH    |          Infra          | rsync destination path          |
| WEB_DEPLOY_PATH      |          Infra          | rsync destination path          |
| SSH_PRIVATE_KEY      |          Infra          | SSH key for server access       |
| SSH_USER             |          Infra          | SSH user for server access      |
| SERVER_HOST          |          Infra          | Server hostname/IP              |
| VITE_API_URL         |       Build-time        | Injected during frontend builds |
| VITE_SENTRY_DSN      |       Build-time        | Injected during frontend builds |

### Missing from Current API .env.production

The workflow's "Create .env.production for API" step is **missing several secrets** that the API needs in production:

- `WHATSAPP_TOKEN` -- needed for admin takeover message sends
- `WHATSAPP_PHONE_ID` -- needed for admin takeover message sends
- `REDIS_URL` -- needed for session/cache
- `BOT_API_KEY` -- needed to validate bot requests
- `RESEND_API_KEY` -- needed for email notifications
- `FRANCHISE_NOTIFICATION_EMAIL`, `GLADIUS_NOTIFICATION_EMAIL`, `ACADEMY_NOTIFICATION_EMAIL`, `APP_NOTIFICATION_EMAIL` -- needed for email routing
- `ANTHROPIC_API_KEY` -- needed for franchise AI agent

These must be added as GitHub Secrets and included in the workflow's "Create .env.production for API" step.

### Staging Uses the Same Pattern

`deploy-staging.yml` follows the identical pattern but with `STAGING_` prefixed secrets (e.g., `STAGING_DB_HOST`, `STAGING_DB_USER`). Staging deploys on push to the `staging` branch.

### Key Implication

When rotating a secret (e.g., `WHATSAPP_TOKEN`), you update it **once** in GitHub Secrets. The next deploy automatically propagates it to the server. There is no need to SSH into the server to edit files. For shared secrets (used by both API and bot), the same GitHub Secret value is referenced in both .env.production file creation steps.

---

## 3. Local Development: Separate .env per Package

**For local development, each package maintains its own .env file.** This is already the current setup and is the right choice.

### Why This Works

- Each process loads its own `.env` via dotenv at startup (already implemented)
- Shared vars (DB, Redis, WhatsApp, BOT_API_KEY) are duplicated across both .env files
- For 2 processes on a single machine, this duplication is acceptable and simpler than alternatives

### Alternatives Considered (Not Recommended)

| Approach                        | Why Not                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Single root `.env`              | Requires custom dotenv loader, both processes would load vars they don't need, harder to reason about per-process config |
| PM2 `env_production` block      | Secrets visible in `pm2 show` output and ecosystem file (committed to git)                                               |
| Secrets manager (AWS SSM, etc.) | Over-engineering for a single EC2 deployment, adds latency and a dependency                                              |
| `.env` symlinks                 | Fragile, confusing debugging, no real benefit over copy                                                                  |

---

## 4. .env.example Audit

| File                           | Status   | Notes                                                                                 |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------- |
| `el-templo-api/.env.example`   | Complete | 62 lines, includes all API vars + bot-related vars (WhatsApp, Redis, AI, BOT_API_KEY) |
| `el-templo-bot/.env.example`   | Complete | 35 lines, all bot vars present, cross-references API BOT_API_KEY                      |
| `el-templo-admin/.env.example` | Exists   | Frontend app                                                                          |
| `el-templo-app/.env.example`   | Exists   | Frontend app                                                                          |
| `el-templo-web/.env.example`   | Exists   | Frontend app                                                                          |

Note: `deploy/.env.production.template` is **obsolete**. Production .env files are generated by the GitHub Actions workflow from GitHub Secrets. This template file is not used by the deploy pipeline and should not be relied upon.

---

## 5. Shared Variables Analysis

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

**For local development:** Keep duplicated in each `.env` file. The bot's `.env.example` already has the comment `# Bot-to-API authentication (must match el-templo-api BOT_API_KEY)` which is good practice.

**For production:** Shared values use the same GitHub Secret referenced in both .env.production creation steps. Updating the secret once propagates to both processes on next deploy.

---

## 6. WhatsApp Token Management

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

Add as GitHub Secret `WHATSAPP_TOKEN`. The deploy workflow injects it into both the API and bot `.env.production` files during deploy. For local development, add to both `el-templo-api/.env` and `el-templo-bot/.env`.

### Security Notes

- Do not commit the token to git (already handled: `.env` is gitignored)
- Rotate the token if the server is compromised: revoke in Business Manager, generate new one, update the GitHub Secret -- next deploy propagates the change
- The `WHATSAPP_VERIFY_TOKEN` is a separate, self-chosen string for webhook verification and does not need Meta generation

---

## 7. Production Deployment: Bot Requirements

### New GitHub Secrets to Add

These secrets must be added in GitHub repository settings for bot deployment:

| Secret                | Value                                   | Also Used By | Notes                            |
| --------------------- | --------------------------------------- | ------------ | -------------------------------- |
| WHATSAPP_TOKEN        | Permanent System User token             | API          | Shared -- same secret for both   |
| WHATSAPP_PHONE_ID     | Meta Business phone number ID           | API          | Shared -- same secret for both   |
| WHATSAPP_VERIFY_TOKEN | Self-chosen webhook string              | -            | Bot only                         |
| AI_PROVIDER           | `openai` or `anthropic`                 | -            | Bot only                         |
| AI_MODEL              | e.g. `gpt-4o-mini`                      | -            | Bot only                         |
| OPENAI_API_KEY        | OpenAI API key                          | -            | Bot only (if using OpenAI)       |
| ANTHROPIC_API_KEY     | Anthropic API key                       | API          | Shared -- API uses for franchise |
| BOT_API_KEY           | Shared auth key                         | API          | Shared -- same secret for both   |
| REDIS_URL             | `redis://localhost:6379`                | API          | Shared -- same Redis instance    |
| BOT_PORT              | `3001`                                  | -            | Bot only                         |
| API_BASE_URL          | `http://localhost:3000/api`             | -            | Bot only (local API calls)       |
| CLASS_REMINDER_HOURS  | `2`                                     | -            | Bot only (default 2)             |
| BOT_DEPLOY_PATH       | e.g. `/var/www/el-templo/el-templo-bot` | -            | Infra -- rsync destination       |

### Workflow Changes Needed (deploy.yml)

The following changes are needed to add bot build/deploy to the production workflow:

**a. Add `bot` to detect-changes paths-filter:**

```yaml
bot:
  - "el-templo-bot/**"
```

**b. Add `build-bot` job** (similar to `build-api` but without tests/migrations):

- Checkout, setup pnpm/node
- `pnpm install --frozen-lockfile`
- `pnpm exec tsc --noEmit` (type check)
- `pnpm run build`
- Upload `bot-dist` artifact (dist/, package.json, pnpm-lock.yaml)

**c. Add "Create .env.production for bot" step in deploy job:**

```yaml
- name: Create .env.production for bot
  if: needs.build-bot.result == 'success'
  run: |
    cat > bot-build/.env.production << 'EOF'
    NODE_ENV=production
    PORT=${{ secrets.BOT_PORT || '3001' }}
    DB_HOST=${{ secrets.DB_HOST }}
    DB_PORT=${{ secrets.DB_PORT || '3306' }}
    DB_USER=${{ secrets.DB_USER }}
    DB_PASSWORD=${{ secrets.DB_PASSWORD }}
    DB_NAME=${{ secrets.DB_NAME }}
    REDIS_URL=${{ secrets.REDIS_URL }}
    WHATSAPP_TOKEN=${{ secrets.WHATSAPP_TOKEN }}
    WHATSAPP_PHONE_ID=${{ secrets.WHATSAPP_PHONE_ID }}
    WHATSAPP_VERIFY_TOKEN=${{ secrets.WHATSAPP_VERIFY_TOKEN }}
    AI_PROVIDER=${{ secrets.AI_PROVIDER }}
    AI_MODEL=${{ secrets.AI_MODEL }}
    OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}
    ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}
    BOT_API_KEY=${{ secrets.BOT_API_KEY }}
    API_BASE_URL=${{ secrets.API_BASE_URL }}
    CLASS_REMINDER_HOURS=${{ secrets.CLASS_REMINDER_HOURS || '2' }}
    EOF
```

**d. Add rsync step for bot:**

```yaml
- name: Deploy bot to server
  if: needs.build-bot.result == 'success'
  run: |
    rsync -avz --delete --exclude node_modules \
      bot-build/ \
      ${{ secrets.SSH_USER }}@${{ secrets.SERVER_HOST }}:${{ secrets.BOT_DEPLOY_PATH }}
```

**e. Add "Install bot dependencies on server" step:**

```yaml
- name: Install bot dependencies on server
  if: needs.build-bot.result == 'success'
  run: |
    ssh ${{ secrets.SSH_USER }}@${{ secrets.SERVER_HOST }} << 'ENDSSH'
      cd ${{ secrets.BOT_DEPLOY_PATH }}
      pnpm install --prod --frozen-lockfile
    ENDSSH
```

**f. Add "Restart bot" step:**

```yaml
- name: Restart bot
  if: needs.build-bot.result == 'success'
  run: |
    ssh ${{ secrets.SSH_USER }}@${{ secrets.SERVER_HOST }} << 'ENDSSH'
      cd ${{ secrets.BOT_DEPLOY_PATH }}
      NODE_ENV=production pm2 restart eltemplo-bot --update-env || NODE_ENV=production pm2 start dist/index.js --name eltemplo-bot
    ENDSSH
```

**g. Add bot backup/rollback steps:**

Add bot path to the backup and rollback steps (alongside API, App, Admin, Web).

**h. Update deploy job `needs` and `if` conditions** to include `build-bot`.

### Staging Workflow (deploy-staging.yml)

Apply the same changes with `STAGING_` prefixed secrets (e.g., `STAGING_WHATSAPP_TOKEN`, `STAGING_BOT_DEPLOY_PATH`).

### Also Missing from API .env.production

The current "Create .env.production for API" step needs these additional secrets added:

- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` -- admin takeover sends
- `REDIS_URL` -- session/cache
- `BOT_API_KEY` -- validate bot requests
- `RESEND_API_KEY` -- email notifications
- `FRANCHISE_NOTIFICATION_EMAIL`, `GLADIUS_NOTIFICATION_EMAIL`, `ACADEMY_NOTIFICATION_EMAIL`, `APP_NOTIFICATION_EMAIL` -- email routing
- `ANTHROPIC_API_KEY` -- franchise AI agent

---

## 8. PM2 Ecosystem File

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
- All secrets are in `.env.production` files deployed by the GitHub Actions workflow
- PM2 process management (restart, start) is executed via SSH commands in the workflow
- The ecosystem.config.cjs is used as a reference for initial PM2 setup and for `cwd` path configuration; the workflow restart commands reference process names defined in this file

---

## 9. Server Setup (One-Time)

### deploy/setup-ec2.sh

This script handles **one-time initial server setup**, not per-deploy configuration. It is run manually when provisioning a new server.

Still needed updates:

- Add Redis installation (`apt install -y redis-server`)
- Add Redis service start/enable
- Add PM2 startup configuration (`pm2 startup systemd`)
- Ensure bot directory structure exists (e.g., `mkdir -p /var/www/el-templo/el-templo-bot`)

Note: This script does NOT need to create `.env` files. The GitHub Actions workflow creates and deploys `.env.production` files on every deploy.

---

## Action Items (Prioritized)

### No Action Needed

1. `.env.example` files for both API and bot are complete and committed
2. PM2 ecosystem.config.cjs is correctly configured
3. Separate `.env` per package strategy is already in place for local development

### TODO (Before Production Bot Deploy)

1. **[HIGH] Add missing GitHub Secrets for API** -- The current "Create .env.production for API" step is missing WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, REDIS_URL, BOT_API_KEY, RESEND_API_KEY, notification emails, and ANTHROPIC_API_KEY. Add these as GitHub Secrets and update the workflow step.

2. **[HIGH] Add new GitHub Secrets for bot** -- Add all bot-specific secrets listed in Section 7 (WHATSAPP*VERIFY_TOKEN, AI_PROVIDER, AI_MODEL, OPENAI_API_KEY, BOT_PORT, API_BASE_URL, CLASS_REMINDER_HOURS, BOT_DEPLOY_PATH). Shared secrets (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, DB*\*, REDIS_URL, BOT_API_KEY, ANTHROPIC_API_KEY) are already needed for the API fix above.

3. **[HIGH] Update deploy.yml** -- Add bot to detect-changes, build-bot job, .env.production for bot, rsync, install deps, restart, backup/rollback. See Section 7 for detailed steps.

4. **[HIGH] Update deploy-staging.yml** -- Same changes as deploy.yml with STAGING\_ prefixed secrets.

5. **[HIGH] Set up permanent WhatsApp System User token** -- Follow steps in Section 6. Store as GitHub Secret `WHATSAPP_TOKEN`. Must be done before production bot deployment.

6. **[MEDIUM] Update deploy/setup-ec2.sh** -- Add Redis installation, PM2 startup config, and bot directory creation for one-time server provisioning.

7. **[LOW] Clean up deploy/.env.production.template** -- This file is obsolete (deployment uses GitHub Secrets, not templates). Consider removing it to avoid confusion.

8. **[LOW] Clean up WHATSAPP_BUSINESS_ACCOUNT_ID** -- Present in bot `.env.example` but not referenced in any code. Either use it or remove it from the template.

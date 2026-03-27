# GitHub Secrets Checklist -- Bot Deployment

All GitHub Secrets required before the WhatsApp bot can deploy via GitHub Actions. Add these in **GitHub repo > Settings > Secrets and variables > Actions > New repository secret**.

---

## New Secrets for Bot

Secrets that must be **added** to GitHub (not already present for the API).

| Secret Name             | Value / Source                                                | Used By | Notes                                                                                              |
| ----------------------- | ------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `WHATSAPP_VERIFY_TOKEN` | Self-chosen random string                                     | Bot     | Meta webhook verification token. Must match the value configured in the Meta App webhook settings. |
| `AI_PROVIDER`           | `openai` or `anthropic`                                       | Bot     | Which AI provider the bot uses for chat.                                                           |
| `AI_MODEL`              | e.g. `gpt-4o-mini` or `claude-3-5-haiku-20241022`             | Bot     | Model identifier for the selected provider.                                                        |
| `OPENAI_API_KEY`        | From [OpenAI dashboard](https://platform.openai.com/api-keys) | Bot     | Required if `AI_PROVIDER=openai`.                                                                  |
| `BOT_PORT`              | `3001`                                                        | Bot     | Port the bot process listens on.                                                                   |
| `API_BASE_URL`          | `http://localhost:3000`                                       | Bot     | Bot calls the API locally on the same server.                                                      |
| `CLASS_REMINDER_HOURS`  | `2` (default)                                                 | Bot     | Hours before class to send WhatsApp reminder.                                                      |
| `BOT_DEPLOY_PATH`       | e.g. `/var/www/el-templo/el-templo-bot`                       | Infra   | rsync destination path on the server.                                                              |

---

## Secrets to Add for API (Missing)

Secrets the API needs in production that are **not yet** in the `deploy.yml` workflow. Add these as GitHub Secrets and include them in the "Create .env.production for API" step.

| Secret Name                    | Value / Source                                                                       | Used By   | Notes                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------ | --------- | ---------------------------------------------------------------------------- |
| `WHATSAPP_TOKEN`               | Permanent System User token (see [whatsapp-token-setup.md](whatsapp-token-setup.md)) | API + Bot | Shared. Used for admin takeover sends (API) and webhook responses (bot).     |
| `WHATSAPP_PHONE_ID`            | From Meta Business Manager > WhatsApp > Phone Numbers                                | API + Bot | Shared. The phone number ID registered in the Meta App.                      |
| `REDIS_URL`                    | `redis://localhost:6379`                                                             | API + Bot | Shared. Session/cache (API) and conversation context (bot).                  |
| `BOT_API_KEY`                  | Self-chosen random string                                                            | API + Bot | Shared. Bot sends this key; API validates it. Must match in both .env files. |
| `RESEND_API_KEY`               | From [Resend dashboard](https://resend.com/api-keys)                                 | API       | Email notification delivery.                                                 |
| `FRANCHISE_NOTIFICATION_EMAIL` | Email address                                                                        | API       | Franchise notification recipient.                                            |
| `GLADIUS_NOTIFICATION_EMAIL`   | Email address                                                                        | API       | Gladius notification recipient.                                              |
| `ACADEMY_NOTIFICATION_EMAIL`   | Email address                                                                        | API       | Academy notification recipient.                                              |
| `APP_NOTIFICATION_EMAIL`       | Email address                                                                        | API       | App notification recipient.                                                  |
| `ANTHROPIC_API_KEY`            | From [Anthropic dashboard](https://console.anthropic.com/settings/keys)              | API + Bot | Shared. Franchise AI agent (API) and chat (bot, if `AI_PROVIDER=anthropic`). |

---

## Already Configured

These secrets are already set up as GitHub Secrets for the existing API deployment:

- **Database:** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- **Auth:** `JWT_SECRET`, `JWT_EXPIRES_IN`
- **URLs:** `FRONTEND_URL`, `ADMIN_URL`, `VITE_API_URL`
- **Monitoring:** `SENTRY_DSN`, `VITE_SENTRY_DSN`
- **Storage:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- **Infrastructure:** `SSH_PRIVATE_KEY`, `SSH_USER`, `SERVER_HOST`, `API_PORT`, `API_DEPLOY_PATH`, `APP_DEPLOY_PATH`, `ADMIN_DEPLOY_PATH`, `WEB_DEPLOY_PATH`

**Shared secrets** (`DB_*`, `REDIS_URL`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `BOT_API_KEY`, `ANTHROPIC_API_KEY`) use the **same GitHub Secret value** for both API and bot `.env.production` files. The deploy workflow references the same secret name in both file creation steps.

---

## How to Add Secrets

1. Go to the GitHub repository
2. Click **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Enter the secret name (exactly as shown above) and its value
5. Click **Add secret**

Secrets are injected into `.env.production` files during the GitHub Actions deploy workflow. Updating a secret takes effect on the next deploy -- no SSH required.

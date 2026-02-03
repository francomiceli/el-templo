# CI/CD Pipeline Usage Guide

This guide documents how to deploy El Templo using the GitHub Actions CI/CD pipeline.

---

## Prerequisites

Before the pipeline can run, you need to configure **GitHub Secrets** in your repository.

### Step 1: Navigate to Repository Secrets

1. Go to: https://github.com/francomiceli/el-templo/settings/secrets/actions
2. Click "New repository secret" for each secret below

### Step 2: Add Required Secrets

Based on your current server setup (from `deploy/.aws-vars` and `.env.production`):

| Secret Name | Value | Source |
|-------------|-------|--------|
| `SSH_PRIVATE_KEY` | Contents of `~/.ssh/eltemplo-key.pem` | Your local SSH key |
| `SSH_USER` | `ubuntu` | EC2 default user |
| `SERVER_HOST` | `54.21.0.171` | Your Elastic IP |
| `API_DEPLOY_PATH` | `/var/www/el-templo/el-templo-api` | Current deploy location |
| `APP_DEPLOY_PATH` | `/var/www/el-templo/el-templo-app` | For static frontend files |
| `DB_HOST` | `localhost` | Database on same server |
| `DB_USER` | `eltemplo` | Your MySQL user |
| `DB_PASSWORD` | (your db password) | From server .env.production |
| `DB_NAME` | `eltemplo` | Database name |
| `JWT_SECRET` | (your jwt secret) | From server .env.production |
| `VITE_API_URL` | `http://54.21.0.171/api` | API URL for frontend |
| `FRONTEND_URL` | `http://54.21.0.171` | For CORS |

#### How to get SSH_PRIVATE_KEY:

```bash
cat ~/.ssh/eltemplo-key.pem
```

Copy the entire output including `-----BEGIN` and `-----END` lines.

#### How to get secrets from server:

```bash
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 'cat /var/www/el-templo/el-templo-api/.env.production'
```

---

## Triggering Deployment

### Option A: Automatic (Push to master)

Any push to `master` branch automatically triggers the deploy workflow:

```bash
git push origin master
```

### Option B: Manual Trigger (GitHub UI)

1. Go to: https://github.com/francomiceli/el-templo/actions/workflows/deploy.yml
2. Click "Run workflow" dropdown
3. Select branch: `master`
4. Click "Run workflow"

### Option C: Manual Trigger (gh CLI)

First install gh CLI:
```bash
# Ubuntu/Debian
sudo apt install gh

# Then authenticate
gh auth login
```

Then trigger:
```bash
gh workflow run deploy.yml --ref master
```

---

## Monitoring Deployment

### Via GitHub UI

1. Go to: https://github.com/francomiceli/el-templo/actions
2. Click on the latest workflow run
3. Watch the progress of each job:
   - `build-api` - Compiles API TypeScript
   - `build-app` - Builds frontend with Vite
   - `deploy` - Uploads to server and restarts PM2

### Via gh CLI (if installed)

```bash
# List recent runs
gh run list --limit 5

# Watch a specific run
gh run watch

# View run details
gh run view <run-id>
```

---

## What the Pipeline Does

```
┌─────────────────────────────────────────────────────────────────┐
│  1. BUILD STAGE (parallel)                                      │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │     build-api       │    │     build-app       │            │
│  │ - pnpm install      │    │ - pnpm install      │            │
│  │ - tsc --noEmit      │    │ - pnpm build        │            │
│  │ - pnpm build        │    │ - Upload artifact   │            │
│  │ - Upload artifact   │    │                     │            │
│  └─────────────────────┘    └─────────────────────┘            │
│            │                          │                         │
│            └──────────┬───────────────┘                         │
│                       ▼                                         │
│  2. DEPLOY STAGE                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ - Download artifacts                                     │   │
│  │ - Setup SSH connection                                   │   │
│  │ - Create .env.production from secrets                    │   │
│  │ - rsync API files to /var/www/el-templo/el-templo-api   │   │
│  │ - rsync App files to /var/www/el-templo/el-templo-app   │   │
│  │ - SSH: pnpm install --prod                               │   │
│  │ - SSH: pm2 restart el-templo-api                         │   │
│  │ - Health check verification                              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### "Secrets not found" Error

Make sure all required secrets are configured in GitHub repository settings.

### SSH Connection Failed

1. Verify `SSH_PRIVATE_KEY` is the complete key (including headers)
2. Verify `SERVER_HOST` is correct IP
3. Check that the key has access to the server:
   ```bash
   ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 'echo "Connected!"'
   ```

### Build Failed

Check the workflow logs in GitHub Actions for specific error messages.

### PM2 Restart Failed

The app name might be different. Check on server:
```bash
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 'pm2 list'
```

Current PM2 app name is `eltemplo-api`. If different, update `deploy.yml`.

---

## Comparison: Manual vs CI/CD

| Aspect | Manual Deploy | CI/CD Pipeline |
|--------|---------------|----------------|
| Command | `ssh ... && git pull && pnpm build && pm2 restart` | `git push` |
| Build location | On server | GitHub Actions |
| Secrets | In `.env.production` on server | GitHub Secrets |
| Rollback | `git revert` + manual deploy | Re-run previous workflow |
| Audit trail | Git log only | GitHub Actions history |

---

## Current Status

As of 2026-02-03:

- ✅ Workflow files committed (`.github/workflows/ci.yml`, `deploy.yml`)
- ✅ GitHub Secrets configured
- ✅ First CI/CD deployment successful

### Deployment History

| Date | Commit | Status | Notes |
|------|--------|--------|-------|
| 2026-02-03 04:43 | `97a8f04` | ✅ Success | First successful CI/CD deploy |

### Issues Fixed During Setup

1. **rsync not installed on GitHub runner** - Added `apt-get install rsync`
2. **rsync not installed on EC2 server** - Added SSH step to install rsync
3. **PM2 app name mismatch** - Changed from `el-templo-api` to `eltemplo-api`

---

## Quick Reference

```bash
# Manual deploy (current method)
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 'cd /var/www/el-templo && git pull && cd el-templo-api && pnpm install && pnpm build && pm2 restart eltemplo-api'

# CI/CD deploy (after secrets configured)
git push origin master  # Automatic
# OR
gh workflow run deploy.yml  # Manual trigger
```

---

*Last updated: 2026-02-02*

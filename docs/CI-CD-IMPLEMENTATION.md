# CI/CD Implementation Proposal

This document describes the proposed GitHub Actions CI/CD setup for El Templo. Please review and provide feedback before finalizing.

---

## Overview

Two workflow files have been created:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | All pushes & PRs | Validate code quality |
| `deploy.yml` | Push to master/main | Build and deploy to production |

---

## Workflow 1: CI (`ci.yml`)

### When It Runs
- Every push to `master`, `main`, or `develop`
- Every pull request targeting those branches

### What It Does

```
┌─────────────────────────────────────────────────────────────┐
│                        CI Workflow                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │     api-check       │    │     app-check       │        │
│  │  (runs in parallel) │    │  (runs in parallel) │        │
│  ├─────────────────────┤    ├─────────────────────┤        │
│  │ 1. Checkout         │    │ 1. Checkout         │        │
│  │ 2. Setup pnpm       │    │ 2. Setup pnpm       │        │
│  │ 3. Setup Node 20    │    │ 3. Setup Node 20    │        │
│  │ 4. Install deps     │    │ 4. Install deps     │        │
│  │ 5. Type check (tsc) │    │ 5. Lint (eslint)    │        │
│  │ 6. Build            │    │ 6. Build            │        │
│  └─────────────────────┘    └─────────────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Secrets Required
**None** - CI runs without secrets for security (PRs from forks can't access secrets)

### Notes & Decisions
- **Lint continues on error**: Currently set to `continue-on-error: true` because there are pre-existing lint warnings. Remove this once lint issues are fixed.
- **Node version**: Using Node 20 LTS. Change if needed.
- **pnpm version**: Using pnpm 10 to match your local setup.

---

## Workflow 2: Deploy (`deploy.yml`)

### When It Runs
- Push to `master` or `main` branch only
- Can also be triggered manually via GitHub UI (workflow_dispatch)

### What It Does

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Deploy Workflow                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  STAGE 1: Build (parallel)                                          │
│  ┌─────────────────────┐    ┌─────────────────────┐                 │
│  │     build-api       │    │     build-app       │                 │
│  ├─────────────────────┤    ├─────────────────────┤                 │
│  │ 1. Checkout         │    │ 1. Checkout         │                 │
│  │ 2. Install deps     │    │ 2. Install deps     │                 │
│  │ 3. Type check       │    │ 3. Build with       │                 │
│  │ 4. Build            │    │    VITE_API_URL     │                 │
│  │ 5. Upload artifact  │    │ 4. Upload artifact  │                 │
│  └─────────────────────┘    └─────────────────────┘                 │
│            │                          │                              │
│            └──────────┬───────────────┘                              │
│                       ▼                                              │
│  STAGE 2: Deploy (after both builds succeed)                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │                      deploy                              │        │
│  ├─────────────────────────────────────────────────────────┤        │
│  │ 1. Download API artifact                                 │        │
│  │ 2. Download App artifact                                 │        │
│  │ 3. Setup SSH key from secret                             │        │
│  │ 4. Create .env.production from secrets                   │        │
│  │ 5. rsync API files to server                             │        │
│  │ 6. rsync App files to server                             │        │
│  │ 7. SSH: Install prod deps + restart PM2                  │        │
│  │ 8. Verify with health check                              │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### How .env.production Is Created

The workflow creates the production environment file dynamically from GitHub secrets:

```bash
# Created during deployment (never committed to repo)
NODE_ENV=production
PORT=${{ secrets.API_PORT || '3000' }}
DB_HOST=${{ secrets.DB_HOST }}
DB_PORT=${{ secrets.DB_PORT || '3306' }}
DB_USER=${{ secrets.DB_USER }}
DB_PASSWORD=${{ secrets.DB_PASSWORD }}
DB_NAME=${{ secrets.DB_NAME }}
JWT_SECRET=${{ secrets.JWT_SECRET }}
JWT_EXPIRES_IN=${{ secrets.JWT_EXPIRES_IN || '7d' }}
FRONTEND_URL=${{ secrets.FRONTEND_URL }}
```

---

## Required GitHub Secrets

### Server Access (Required)

| Secret | Description | Example |
|--------|-------------|---------|
| `SSH_PRIVATE_KEY` | Full private key content for SSH access | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SSH_USER` | Username to SSH into server | `ubuntu`, `ec2-user` |
| `SERVER_HOST` | Server IP address or hostname | `54.21.0.171` |

### Deployment Paths (Required)

| Secret | Description | Example |
|--------|-------------|---------|
| `API_DEPLOY_PATH` | Absolute path where API should be deployed | `/var/www/el-templo-api` |
| `APP_DEPLOY_PATH` | Absolute path where App (static files) should be deployed | `/var/www/el-templo-app` |

### Database (Required)

| Secret | Description | Example |
|--------|-------------|---------|
| `DB_HOST` | MySQL server host | `localhost`, `your-rds-endpoint.amazonaws.com` |
| `DB_USER` | MySQL username | `eltemplo_prod` |
| `DB_PASSWORD` | MySQL password | (your secure password) |
| `DB_NAME` | Database name | `eltemplo` |

### Authentication (Required)

| Secret | Description | How to Generate |
|--------|-------------|-----------------|
| `JWT_SECRET` | Secret for signing JWT tokens | `openssl rand -base64 64` |

### URLs (Required)

| Secret | Description | Example |
|--------|-------------|---------|
| `VITE_API_URL` | Full API URL used by frontend | `https://api.eltemplo.com/api` or `http://54.21.0.171/api` |
| `FRONTEND_URL` | Frontend URL for CORS | `https://app.eltemplo.com` or `http://54.21.0.171` |

### Optional

| Secret | Description | Default |
|--------|-------------|---------|
| `API_PORT` | Port the API listens on | `3000` |
| `DB_PORT` | MySQL port | `3306` |
| `JWT_EXPIRES_IN` | Token expiration time | `7d` |

---

## Assumptions Made (Please Verify)

### 1. Server Setup
- **Assumed**: Server has `pnpm` installed globally
- **Assumed**: Server has `pm2` installed globally
- **Assumed**: SSH access is via key-based authentication
- **Assumed**: Deploy user has write access to deploy paths

**Question**: Is this correct? Do you use a different process manager?

### 2. Deployment Method
- **Assumed**: Using `rsync` over SSH to copy files
- **Assumed**: No containerization (Docker)

**Question**: Do you prefer a different deployment method? (Docker, AWS CodeDeploy, etc.)

### 3. Branch Strategy
- **Assumed**: `master` or `main` is your production branch
- **Assumed**: `develop` branch exists for development

**Question**: What branches do you use? Should deploy trigger on a different branch?

### 4. App Serving
- **Assumed**: Static app files served by Nginx (or similar)
- **Assumed**: Nginx is already configured on the server

**Question**: How is the frontend currently served?

### 5. Database
- **Assumed**: Database is on the same server or accessible from it
- **Assumed**: No database migrations needed during deployment

**Question**: Do you need migration steps in the deploy process?

---

## Alternative Approaches (For Discussion)

### Option A: Current Approach (rsync + SSH)
**Pros**: Simple, no extra services needed, works with any VPS
**Cons**: Requires SSH key management, less rollback capability

### Option B: Docker-based Deployment
**Pros**: Consistent environments, easy rollback, portable
**Cons**: Requires Docker setup on server, more complex

### Option C: AWS-specific (if using EC2)
**Pros**: Better integration with AWS services, can use CodeDeploy
**Cons**: AWS lock-in, more setup

**Question**: Which approach fits your infrastructure best?

---

## Security Considerations

### What's Protected
1. **Secrets never in code**: All sensitive values come from GitHub Secrets
2. **SSH key scoped**: Deploy key should only have access to deploy paths
3. **Production env created at deploy time**: Not stored in repository

### Recommendations
1. **Rotate JWT_SECRET** periodically (will invalidate all sessions)
2. **Use a dedicated deploy SSH key** (not your personal key)
3. **Restrict deploy user permissions** on server
4. **Consider IP allowlisting** for database access

---

## Files Created

```
.github/
├── workflows/
│   ├── ci.yml          # CI workflow
│   └── deploy.yml      # Deploy workflow
└── SECRETS.md          # Secrets documentation

docs/
└── CI-CD-IMPLEMENTATION.md  # This document
```

---

## Next Steps (After Your Review)

1. **Review this document** and answer the questions above
2. **Create GitHub Secrets** in your repository settings
3. **Generate SSH deploy key** and add public key to server
4. **Test CI workflow** by creating a PR
5. **Test Deploy workflow** by pushing to master (or trigger manually)

---

## Questions for You

1. **Server details**: What's your current server setup? (Ubuntu? Amazon Linux? nginx?)
2. **Process manager**: Are you using PM2? Or something else?
3. **Deployment paths**: Where should files be deployed on the server?
4. **Domain/URLs**: What are your production URLs?
5. **Additional steps**: Do you need any other steps during deployment? (migrations, cache clearing, etc.)
6. **Notifications**: Should the workflow notify on success/failure? (Slack, email?)
7. **Staging environment**: Do you want a separate staging deployment?

---

## How to Provide Feedback

Please review this document and let me know:
- Any assumptions that are incorrect
- Any changes you'd like to the workflow
- Answers to the questions above
- Any additional requirements

I'll update the workflows based on your feedback before you set up the secrets.

# El Templo

A modular fitness super-app for El Templo gym -- member training, admin management, and algorithmic session generation.

## Architecture Overview

El Templo is a **3-app monorepo** with a shared Fastify API backend:

| Directory | Description | Stack |
|-----------|-------------|-------|
| `el-templo-app/` | Member-facing PWA/mobile app | Vue 3, Quasar, Capacitor, TypeScript |
| `el-templo-admin/` | Coach/admin web app | Vue 3, Quasar, TypeScript |
| `el-templo-api/` | Shared backend API | Fastify 5, Drizzle ORM, MySQL 8, TypeScript |

**Member App** -- Members view their algorithmically-generated daily sessions (SPOM framework), complete guided workouts with block structure, track per-exercise completion, and progress through levels (Alfa > Delta > Sigma > Omega > Spartan).

**Admin App** -- Coaches review, approve, and edit generated sessions. Manage exercise swaps, format changes, mobility assignments, and PDF export for printing.

**API** -- Central backend serving both frontends. Handles authentication, SPOM-based session generation (deterministic 9-stage pipeline), session management, progression tracking, and admin operations. CORS configured for both frontend origins.

## Tech Stack

**Frontend:**
- Vue 3 (Composition API)
- Quasar Framework
- TypeScript
- Capacitor (member app -- PWA + native iOS/Android)
- Pinia stores

**Backend:**
- Fastify 5
- TypeScript
- Drizzle ORM
- MySQL 8

**Infrastructure:**
- GitHub Actions (CI/CD)
- PM2 (process management)
- Nginx (reverse proxy + SSL)
- Let's Encrypt (SSL certificates)

**Production domains:**
- `app.eltemplo.org` -- Member app
- `admin.eltemplo.org` -- Admin app
- `api.eltemplo.org` -- API

## Prerequisites

- Node.js 22+
- pnpm 10+
- MySQL 8.0+
- Git

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd el-templo
```

### 2. Install root dependencies (pre-commit hooks)

```bash
pnpm install
```

This installs Husky and lint-staged at the monorepo root. The `prepare` script automatically sets up Git hooks.

### 3. Install project dependencies

```bash
cd el-templo-api && pnpm install
cd ../el-templo-app && pnpm install
cd ../el-templo-admin && pnpm install
```

### 4. Database setup

Create the MySQL database and configure environment variables:

```bash
mysql -u root -p -e "CREATE DATABASE eltemplo;"
cd el-templo-api
cp .env.example .env.development
# Edit .env.development with your database credentials and JWT secret
```

Required environment variables (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `DB_HOST` | MySQL host (default: `localhost`) |
| `DB_PORT` | MySQL port (default: `3306`) |
| `DB_USER` | MySQL user |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | Database name (default: `eltemplo`) |
| `JWT_SECRET` | JWT signing secret (generate with `openssl rand -base64 32`) |
| `FRONTEND_URL` | Member app URL for CORS (default: `http://localhost:9000`) |

### 5. Run migrations and seed data

```bash
cd el-templo-api
pnpm run build
node dist/db/run-migrations.js
node dist/db/seed.js
node dist/db/seed-spom.js
```

### 6. Start development servers

```bash
# Terminal 1: API (localhost:3000)
cd el-templo-api && pnpm run dev

# Terminal 2: Member App (localhost:9000)
cd el-templo-app && pnpm run dev

# Terminal 3: Admin App (localhost:9100)
cd el-templo-admin && pnpm run dev
```

## Development Workflow

### Pre-commit hooks

ESLint and Prettier run automatically on staged files via Husky + lint-staged. No manual formatting needed.

- `.ts` and `.vue` files in `el-templo-app/` and `el-templo-admin/` -- ESLint `--fix` + Prettier
- All `.ts`, `.vue`, `.js`, `.json`, `.md` files -- Prettier

### Common commands

```bash
# Linting
cd el-templo-app && pnpm run lint
cd el-templo-admin && pnpm run lint

# Formatting
cd el-templo-app && pnpm run format
cd el-templo-admin && pnpm run format

# Building
cd el-templo-api && pnpm run build
cd el-templo-app && pnpm run build
cd el-templo-admin && pnpm run build

# Database
cd el-templo-api && pnpm run db:generate   # Generate migration from schema changes
cd el-templo-api && pnpm run db:migrate    # Run pending migrations
cd el-templo-api && pnpm run db:studio     # Open Drizzle Studio
```

## Project Structure

```
el-templo/
├── el-templo-api/              # Backend API
│   ├── src/
│   │   ├── modules/            # Feature modules
│   │   │   ├── auth/           #   Authentication (login, register, JWT)
│   │   │   ├── sessions/       #   Session generation pipeline
│   │   │   ├── admin/          #   Admin operations (review, edit, generate)
│   │   │   ├── progression/    #   Level progression & evaluations
│   │   │   └── spom/           #   SPOM config & data management
│   │   ├── db/                 # Database schema, migrations, seeds
│   │   │   ├── schema/         #   Drizzle table definitions (20+ tables)
│   │   │   ├── migrations/     #   SQL migration files
│   │   │   ├── seed.ts         #   User & branch seed data
│   │   │   └── seed-spom.ts    #   SPOM rules, exercises, formats seed
│   │   ├── plugins/            # Fastify plugins (database, auth, sessions)
│   │   ├── shared/             # Shared utilities
│   │   ├── jobs/               # Scheduled tasks
│   │   └── app.ts              # App factory (buildApp)
│   └── drizzle.config.ts       # Drizzle ORM configuration
├── el-templo-app/              # Member app (PWA + mobile)
│   └── src/
│       ├── modules/
│       │   ├── training/       #   Weekly view, day player, session flow
│       │   └── progression/    #   Mi Camino (stats, charts, evaluation)
│       ├── boot/               # Quasar boot files (axios, auth, modules)
│       └── stores/             # Pinia stores (auth, user)
├── el-templo-admin/            # Admin app (web only)
│   └── src/
│       ├── pages/              # Admin pages
│       │   ├── SessionsPage    #   Session review & approval
│       │   ├── SessionEditPage #   Block/exercise editing
│       │   └── GeneratePage    #   Session generation controls
│       ├── components/         # Shared components
│       │   └── sessions/       #   Session-specific UI components
│       └── utils/
│           ├── pdf/            #   PDF generation (pdfmake)
│           └── logger.ts       #   Client-side logging
├── deploy/                     # Deployment scripts & guides
│   ├── nginx/                  #   Nginx server configs
│   └── setup-ec2.sh            #   EC2 server setup
├── .github/workflows/          # CI/CD
│   ├── ci.yml                  #   Build & test on PR
│   └── deploy.yml              #   Deploy to production
├── .husky/pre-commit           # Git pre-commit hook (lint-staged)
└── package.json                # Root: husky + lint-staged config
```

## Deployment

Deployment is automated via GitHub Actions:

1. **CI** (`ci.yml`) -- Builds all 3 apps and runs tests on pull requests
2. **Deploy** (`deploy.yml`) -- Builds and deploys to EC2 via rsync on merge to master

Production runs on a single EC2 instance with Nginx as reverse proxy and PM2 managing the API process. SSL certificates are provisioned via Let's Encrypt (certbot).

See the `deploy/` directory for setup scripts, Nginx configs, and the deployment guide.

## Contributing

### Branch naming

- `feature/*` -- New features
- `fix/*` -- Bug fixes
- `refactor/*` -- Code restructuring

### Commit style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): add new feature
fix(scope): correct bug behavior
refactor(scope): restructure without behavior change
docs(scope): update documentation
test(scope): add or update tests
chore(scope): tooling, dependencies, config
```

### Code standards

- Pre-commit hooks handle formatting automatically
- No new `any` types -- use proper TypeScript types
- No `console.log` in production code -- use the structured logger
- All API routes require authentication unless explicitly public

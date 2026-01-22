# Phase 1: Foundation - Research

**Researched:** 2026-01-22
**Domain:** Full-stack project initialization (Quasar + Capacitor + Fastify + Drizzle + MySQL)
**Confidence:** HIGH

## Summary

Phase 1 establishes a working project skeleton with two separate repositories: `el-templo-app` (frontend) and `el-templo-api` (backend). The research confirms this is a well-documented stack with established patterns in 2025-2026. The primary challenges are version pinning for Capacitor 6 ecosystem compatibility and proper separation of concerns between repos.

The standard approach is:
1. Initialize Quasar project with Vite CLI, then add Capacitor mode
2. Initialize Fastify backend with plugin-based architecture
3. Set up Drizzle ORM with MySQL2 driver and generate initial migrations
4. Create seed scripts using drizzle-seed for development data

**Primary recommendation:** Follow official CLI scaffolding for both Quasar and Fastify, then organize code according to established patterns rather than fighting framework conventions. Pin Capacitor ecosystem to 6.x for compatibility with Quasar CLI defaults.

## Standard Stack

The established libraries/tools for this domain:

### Core (Locked by User Decisions)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Quasar Framework | 2.18.x | Vue 3 UI framework | Official Quasar + Capacitor integration, Material Design components |
| Vue 3 | 3.5+ | Frontend framework | Required by Quasar 2.x, Composition API standard |
| TypeScript | 5.5+ | Type safety | Both frontend and backend use TypeScript |
| Capacitor | 6.x | Mobile runtime | Quasar CLI defaults to 6.x, stable plugin ecosystem |
| Fastify | 5.x | Backend framework | 2x faster than Express, TypeScript-first, plugin architecture |
| Drizzle ORM | 0.38+ | TypeScript ORM | SQL-like, type-safe, zero deps, MySQL native support |
| mysql2 | 3.x | MySQL driver | Drizzle's native driver, supports promises |
| pnpm | Latest | Package manager | User decision - both repos use pnpm |

### Supporting (Development Tools)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @quasar/cli | Latest | Quasar CLI tool | Project scaffolding, dev server, builds |
| drizzle-kit | Latest | Schema migrations | Generate/apply migrations, push to dev DB |
| drizzle-seed | Latest | Seed data generator | Development data for branches, users, roles |
| ESLint | Latest | Code linting | Auto-fix on save, Vue/TypeScript rules |
| Prettier | Latest | Code formatting | Consistent style across repos |
| Vite | Bundled with Quasar | Build tool | Bundled by Quasar CLI, no manual config needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate repos | Monorepo (Turborepo, Nx) | More setup complexity, overkill for 2 repos |
| Drizzle ORM | Prisma | Vendor lock-in with DSL, larger bundle, slower cold starts |
| Drizzle ORM | TypeORM | Maintenance issues, decorator complexity, slower |
| Fastify | Express | Legacy, slower, worse TypeScript support |
| Capacitor 6 | Capacitor 7 | Newer but Quasar CLI defaults to 6, plugin compatibility unknown |
| pnpm | npm/yarn | User decided pnpm, no technical reason to change |

**Installation:**

```bash
# Frontend (el-templo-app)
pnpm create quasar
# Choose: Vite, TypeScript, Prettier, ESLint
cd el-templo-app
pnpm install
quasar mode add capacitor

# Backend (el-templo-api)
mkdir el-templo-api && cd el-templo-api
pnpm init
pnpm add fastify drizzle-orm mysql2
pnpm add -D drizzle-kit drizzle-seed @types/node tsx
```

## Architecture Patterns

### Frontend: Quasar + Capacitor Project Structure

**Convention:** Quasar CLI scaffolds a specific directory structure. Follow it, don't fight it.

```
el-templo-app/
├── src/
│   ├── App.vue                      # Root component
│   ├── boot/                        # Quasar boot files (app initialization)
│   │   ├── axios.ts                 # HTTP client setup
│   │   └── capacitor.ts             # Capacitor plugin init
│   ├── router/
│   │   ├── index.ts                 # Router instance
│   │   └── routes.ts                # Route definitions
│   ├── stores/                      # Pinia stores (global state)
│   │   ├── index.ts                 # Pinia initialization
│   │   ├── useAuthStore.ts          # Auth state, JWT token
│   │   └── useUserStore.ts          # User profile, branch, level, role
│   ├── components/                  # Shared/reusable components
│   │   └── layout/
│   │       └── MainLayout.vue       # App shell layout
│   ├── pages/                       # Page components (route targets)
│   │   ├── LoginPage.vue
│   │   ├── RegisterPage.vue
│   │   └── IndexPage.vue
│   ├── css/
│   │   ├── app.scss                 # Global styles
│   │   └── quasar.variables.sass    # Quasar theme variables
│   └── assets/                      # Images, fonts (processed by Vite)
│
├── src-capacitor/                   # Capacitor project (iOS/Android)
│   ├── capacitor.config.json        # Capacitor configuration
│   ├── android/                     # Android Studio project
│   └── ios/                         # Xcode project
│
├── public/                          # Static files (copied as-is)
├── dist/                            # Build output
├── quasar.config.js                 # Quasar CLI configuration
├── .env.development                 # Dev environment variables
├── .env.production                  # Prod environment variables
├── .env.example                     # Example env file (committed)
├── package.json
└── tsconfig.json
```

**Key conventions:**
- `/boot` files run before app mounts - use for Axios setup, Capacitor init
- `/stores` uses Pinia (official Vue 3 state management)
- `/pages` for route components, `/components` for reusables
- `src-capacitor/` created by `quasar mode add capacitor` command
- `.env` files loaded automatically by Quasar CLI (import.meta.env.VITE_*)

**Source:** [Quasar Directory Structure](https://quasar.dev/quasar-cli-vite/directory-structure)

### Backend: Fastify Plugin Architecture

**Convention:** Everything is a plugin. Order matters: plugins → decorators → hooks → routes.

```
el-templo-api/
├── src/
│   ├── index.ts                     # Entry point (starts server)
│   ├── app.ts                       # App factory (builds Fastify instance)
│   │
│   ├── plugins/                     # Core plugins (ecosystem/infrastructure)
│   │   ├── database.ts              # Drizzle connection (fastify.db decorator)
│   │   └── auth.ts                  # JWT verification (fastify.authenticate hook)
│   │
│   ├── db/
│   │   ├── schema/                  # Drizzle schemas (organized by domain)
│   │   │   ├── users.ts             # users, credentials tables
│   │   │   ├── branches.ts          # branches table
│   │   │   └── index.ts             # Export all schemas
│   │   ├── migrations/              # Generated SQL migrations
│   │   ├── seed.ts                  # Seed script (runs drizzle-seed)
│   │   └── index.ts                 # DB client export
│   │
│   ├── modules/                     # Feature modules (business logic)
│   │   └── auth/
│   │       ├── routes.ts            # Fastify plugin with routes
│   │       └── service.ts           # Business logic (login, register)
│   │
│   └── shared/
│       ├── middleware/
│       │   └── auth-guard.ts        # Auth middleware (uses JWT plugin)
│       └── utils/
│           ├── jwt.ts               # Jose JWT helpers
│           └── password.ts          # Argon2 helpers
│
├── drizzle.config.ts                # Drizzle Kit configuration
├── .env.development
├── .env.production
├── .env.example
├── package.json
└── tsconfig.json
```

**Plugin registration order (critical):**

```typescript
// src/app.ts
import Fastify from 'fastify';
import { databasePlugin } from './plugins/database';
import { authPlugin } from './plugins/auth';
import { authModule } from './modules/auth/routes';

export async function buildApp() {
  const app = Fastify({ logger: true });

  // 1. Core plugins first (database, auth, logging)
  await app.register(databasePlugin);
  await app.register(authPlugin);

  // 2. Feature modules second (depend on core plugins)
  await app.register(authModule, { prefix: '/api/auth' });

  return app;
}
```

**Why this order matters:** Fastify loads plugins sequentially. If `authModule` runs before `databasePlugin`, `fastify.db` won't exist yet. Decorators added by plugins are only available to plugins registered after them.

**Source:** [Fastify Getting Started](https://fastify.dev/docs/latest/Guides/Getting-Started/)

### Pattern 1: Database Plugin with Drizzle

**What:** Fastify plugin that creates Drizzle client and decorates Fastify instance with `db` property.

**When to use:** Always. This makes the database client available to all routes via `fastify.db`.

**Example:**

```typescript
// src/plugins/database.ts
import { FastifyPluginAsync } from 'fastify';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from '../db/schema';
import fp from 'fastify-plugin';

const databasePlugin: FastifyPluginAsync = async (fastify) => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const db = drizzle({ client: connection, schema, mode: 'default' });

  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    await connection.end();
  });
};

// Use fastify-plugin to expose decorator to parent scope
export default fp(databasePlugin, { name: 'database' });
```

**Critical detail:** Use `fastify-plugin` wrapper (fp) to expose decorators to parent scope. Without it, `fastify.db` is only available inside the plugin scope.

**Source:** [Fastify Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/), [fastify-mysql example](https://github.com/fastify/fastify-mysql)

### Pattern 2: Drizzle Schema Organization

**What:** Organize schemas by domain, export all from index, use relations for type-safe queries.

**When to use:** Always. Drizzle Kit discovers schemas recursively from the folder configured in `drizzle.config.ts`.

**Example:**

```typescript
// db/schema/users.ts
import { mysqlTable, int, varchar, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { branches } from './branches';

export const users = mysqlTable('users', {
  id: int().primaryKey().autoincrement(),
  email: varchar({ length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: mysqlEnum(['member', 'coach', 'admin', 'superadmin']).default('member').notNull(),
  branchId: int('branch_id').references(() => branches.id).notNull(),
  level: mysqlEnum(['alfa', 'delta', 'sigma', 'omega', 'spartan']).default('alfa').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

export const usersRelations = relations(users, ({ one }) => ({
  branch: one(branches, {
    fields: [users.branchId],
    references: [branches.id],
  }),
}));
```

```typescript
// db/schema/branches.ts
import { mysqlTable, int, varchar, boolean } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const branches = mysqlTable('branches', {
  id: int().primaryKey().autoincrement(),
  name: varchar({ length: 255 }).notNull(),
  code: varchar({ length: 10 }).notNull().unique(),
  isActive: boolean('is_active').default(true).notNull(),
});

export const branchesRelations = relations(branches, ({ many }) => ({
  users: many(users),
}));
```

```typescript
// db/schema/index.ts
export * from './users';
export * from './branches';
```

**Key details:**
- Use `mysqlTable` for MySQL (not `pgTable`)
- Use `mysqlEnum` for enum columns (role, level)
- Define relations separately from tables (enables relational queries)
- Export relations alongside tables for Drizzle to discover them

**Source:** [Drizzle Schema Declaration](https://orm.drizzle.team/docs/sql-schema-declaration), [Drizzle Relations](https://orm.drizzle.team/docs/rqb)

### Pattern 3: Seed Script with drizzle-seed

**What:** Deterministic seed script that populates database with test data.

**When to use:** Development and testing. Run after migrations to get a working database.

**Example:**

```typescript
// db/seed.ts
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { seed } from 'drizzle-seed';
import * as schema from './schema';
import { branches, users } from './schema';
import * as argon2 from 'argon2';

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'eltemplo',
  });

  const db = drizzle({ client: connection, schema });

  // Seed branches (real El Templo locations - user decision)
  const branchData = [
    { name: 'Centro', code: 'CENTRO' },
    { name: 'Alem', code: 'ALEM' },
    { name: 'Constitucion', code: 'CONST' },
    { name: 'Jujuy', code: 'JUJUY' },
    { name: 'Mogotes', code: 'MOGOT' },
  ];

  const insertedBranches = await db.insert(branches).values(branchData).execute();
  console.log(`Seeded ${insertedBranches.length} branches`);

  // Seed superadmin (user decision: admin@eltemplo.com)
  const passwordHash = await argon2.hash('admin123', {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  });

  await db.insert(users).values({
    email: 'admin@eltemplo.com',
    passwordHash,
    role: 'superadmin',
    branchId: insertedBranches[0].insertId, // Centro branch
    level: 'spartan',
  });
  console.log('Seeded superadmin: admin@eltemplo.com');

  // Seed test users with drizzle-seed (deterministic)
  await seed(db, { users }, { count: 20, seed: 12345 });
  console.log('Seeded 20 test users');

  await connection.end();
}

main().catch(console.error);
```

**Package.json script:**

```json
{
  "scripts": {
    "seed": "tsx db/seed.ts"
  }
}
```

**Key details:**
- Seed real branch names (user decision: Centro, Alem, Constitucion, Jujuy, Mogotes)
- Seed superadmin with known credentials (user decision: admin@eltemplo.com)
- Use drizzle-seed for bulk test users (deterministic with seed value)
- Use Argon2id for password hashing (OWASP 2025 recommendation)

**Source:** [drizzle-seed](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-seed)

### Pattern 4: Capacitor Integration with Quasar

**What:** Add Capacitor mode to Quasar project for iOS/Android builds.

**When to use:** Phase 1 - configure even if not building for mobile yet (prevents later friction).

**Commands:**

```bash
# From Quasar project root
quasar mode add capacitor

# Run in dev mode
quasar dev -m capacitor -T android  # Android emulator
quasar dev -m capacitor -T ios      # Xcode simulator (macOS only)

# Build for production
quasar build -m capacitor -T android
quasar build -m capacitor -T ios
```

**Configuration:**

```javascript
// quasar.config.js
module.exports = {
  capacitor: {
    hideSplashscreen: true,
    iosStatusBarPadding: true,
  },
  framework: {
    config: {
      capacitor: {
        iosStatusBarPadding: true,
        backButtonExit: false,
      },
    },
  },
};
```

**Critical:** Do NOT upgrade Gradle when Android Studio prompts. This breaks Capacitor projects. Per Quasar documentation: "Do not upgrade Gradle! Android Studio will suggest upgrades, but this breaks Capacitor."

**Source:** [Quasar Capacitor Preparation](https://quasar.dev/quasar-cli-vite/developing-capacitor-apps/preparation), [Quasar Capacitor Config](https://quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor)

### Anti-Patterns to Avoid

- **Upgrading Gradle in Android Studio:** Breaks Capacitor. Ignore prompts.
- **Manual Capacitor setup without Quasar mode:** Use `quasar mode add capacitor`, not `npx cap init`. Quasar CLI handles integration.
- **Mixing callback and promise APIs in Fastify 5:** Breaking change - choose one pattern and stick to it.
- **Using semicolon delimiters in query strings:** Disabled by default in Fastify 5. Enable explicitly if needed.
- **Forgetting fastify-plugin wrapper for decorators:** Decorators won't be available to parent scope without `fp()` wrapper.
- **Hand-rolling JWT auth:** Use `jose` library. It's 5x smaller than `jsonwebtoken` and works in all runtimes.
- **Using bcrypt for new projects:** Use Argon2id (OWASP 2025 recommendation). Bcrypt is acceptable for legacy only.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signing/verification | Custom crypto implementation | `jose` library | Edge cases (key rotation, algorithm mismatches, timing attacks), 0 deps, ESM-native |
| Password hashing | Custom bcrypt wrapper | `argon2` library | OWASP 2025 recommendation, GPU-resistant, configurable memory/time cost |
| Database migrations | Manual SQL files | `drizzle-kit generate` | Auto-generates migrations from schema changes, tracks applied migrations |
| Seed data generation | Hardcoded INSERT statements | `drizzle-seed` | Deterministic fake data, reproducible across team, handles relations |
| Environment validation | Manual process.env checks | Zod + custom boot file | Type-safe env vars, fails fast on startup, self-documenting |
| Axios setup | Import axios directly | Centralized API client in boot file | Single place for baseURL, interceptors, auth tokens |
| Capacitor feature detection | Platform checks everywhere | Composable with `Capacitor.isNativePlatform()` | Single source of truth, mockable for testing |

**Key insight:** Fastify, Drizzle, and Quasar have strong conventions. Follow them. Don't abstract away framework features in Phase 1 - use them directly until pain points emerge.

## Common Pitfalls

### Pitfall 1: Version Mismatch Between Capacitor Core and Plugins

**What goes wrong:** Capacitor 6 apps break when plugins are on Capacitor 7.

**Why it happens:** `@capacitor/core` is 6.x but `@capacitor/preferences` gets installed as 7.x if not pinned.

**How to avoid:**

```json
{
  "dependencies": {
    "@capacitor/core": "^6.0.0",
    "@capacitor/preferences": "^6.0.0",
    "@capacitor/haptics": "^6.0.0",
    "@capacitor/status-bar": "^6.0.0"
  }
}
```

Pin all Capacitor packages to `^6.x.x`. Check with `pnpm list @capacitor/core` after install.

**Warning signs:** Build errors mentioning "incompatible Capacitor version", iOS/Android apps crashing on plugin usage.

**Source:** [Capacitor 6 Migration Guide](https://capacitorjs.com/docs/v6/updating/6-0)

### Pitfall 2: Forgetting to Run Migrations Before Seeding

**What goes wrong:** Seed script fails with "table does not exist" errors.

**Why it happens:** Drizzle doesn't auto-create tables. Migrations must run first.

**How to avoid:**

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx db/seed.ts",
    "db:reset": "pnpm run db:migrate && pnpm run db:seed"
  }
}
```

Always run `db:migrate` before `db:seed`. Create a `db:reset` script for convenience.

**Warning signs:** Errors like `Table 'eltemplo.users' doesn't exist` when running seed script.

### Pitfall 3: Using `.listen()` Old Syntax in Fastify 5

**What goes wrong:** `fastify.listen(3000)` throws error in Fastify 5.

**Why it happens:** Fastify 5 breaking change - `.listen()` now requires options object.

**How to avoid:**

```typescript
// WRONG (Fastify 4 syntax)
await fastify.listen(3000);

// RIGHT (Fastify 5 syntax)
await fastify.listen({ port: 3000, host: '0.0.0.0' });
```

**Warning signs:** Error: "listen() requires an options object" on server start.

**Source:** [Fastify 5 Migration Guide](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/)

### Pitfall 4: Not Specifying `host: '0.0.0.0'` in Fastify

**What goes wrong:** API is accessible from localhost but not from mobile emulator or other machines on network.

**Why it happens:** Fastify defaults to `127.0.0.1` (localhost only). Mobile emulators need network-accessible host.

**How to avoid:**

```typescript
// src/index.ts
const app = await buildApp();

await app.listen({
  port: Number(process.env.PORT) || 3000,
  host: '0.0.0.0', // Listen on all network interfaces
});

console.log(`Server listening on http://0.0.0.0:${app.server.address().port}`);
```

**Warning signs:** Curl works from server, but mobile app can't reach API. Network requests timeout.

### Pitfall 5: Copying Types Between Repos Without Version Checks

**What goes wrong:** Frontend and backend types drift apart over time, causing runtime errors.

**Why it happens:** User decided to copy types manually (no shared package). Easy to forget to sync after backend schema changes.

**How to avoid:**

1. **Convention:** Types live in backend (`el-templo-api/src/types/models.ts`)
2. **Copy script:** Frontend has script to copy types from backend
3. **Comment in frontend types file:** "GENERATED - do not edit, run pnpm sync-types"

```json
// el-templo-app/package.json
{
  "scripts": {
    "sync-types": "cp ../el-templo-api/src/types/models.ts src/types/models.ts"
  }
}
```

**Warning signs:** TypeScript says request is valid, but backend returns 400. Frontend expects field that doesn't exist in API response.

### Pitfall 6: Not Configuring CORS for Local Development

**What goes wrong:** Frontend (localhost:9000) can't call backend (localhost:3000) due to CORS errors.

**Why it happens:** Fastify doesn't enable CORS by default.

**How to avoid:**

```typescript
// src/app.ts
import cors from '@fastify/cors';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: process.env.NODE_ENV === 'development'
      ? ['http://localhost:9000', 'capacitor://localhost', 'http://localhost']
      : process.env.FRONTEND_URL,
  });

  // ... rest of setup
}
```

Install `@fastify/cors` and register before routes.

**Warning signs:** Browser console shows CORS errors. API returns 200 but frontend sees error.

## Code Examples

Verified patterns from official sources:

### JWT Generation with jose

```typescript
// src/shared/utils/jwt.ts
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export async function generateToken(payload: { userId: number; email: string; role: string }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as { userId: number; email: string; role: string };
}
```

**Source:** [jose documentation](https://github.com/panva/jose)

### Password Hashing with Argon2

```typescript
// src/shared/utils/password.ts
import * as argon2 from 'argon2';

// OWASP 2025 recommended config
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB (128 MiB for high security)
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
```

**Source:** [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [argon2 npm](https://www.npmjs.com/package/argon2)

### Auth Module Route Example

```typescript
// src/modules/auth/routes.ts
import { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema';
import { hashPassword, verifyPassword } from '../../shared/utils/password';
import { generateToken } from '../../shared/utils/jwt';

export const authModule: FastifyPluginAsync = async (fastify) => {
  // Register
  fastify.post('/register', async (request, reply) => {
    const { email, password, branchId } = request.body as {
      email: string;
      password: string;
      branchId: number;
    };

    const passwordHash = await hashPassword(password);

    const [user] = await fastify.db
      .insert(users)
      .values({
        email,
        passwordHash,
        branchId,
        role: 'member',
        level: 'alfa',
      })
      .execute();

    const token = await generateToken({
      userId: user.insertId,
      email,
      role: 'member',
    });

    return { token, user: { id: user.insertId, email, role: 'member' } };
  });

  // Login
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const [user] = await fastify.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      reply.code(401);
      return { error: 'Invalid credentials' };
    }

    const token = await generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return { token, user: { id: user.id, email: user.email, role: user.role } };
  });
};
```

**Source:** Fastify patterns + Drizzle query examples

### Axios Setup in Quasar Boot File

```typescript
// src/boot/axios.ts
import { boot } from 'quasar/wrappers';
import axios, { AxiosInstance } from 'axios';

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default boot(({ app }) => {
  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;
});

export { api };
```

**Source:** [Quasar Boot Files](https://quasar.dev/quasar-cli-vite/boot-files)

### Pinia Auth Store

```typescript
// src/stores/useAuthStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from 'boot/axios';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('authToken'));
  const user = ref<{ id: number; email: string; role: string } | null>(null);

  const isAuthenticated = computed(() => !!token.value);

  async function login(email: string, password: string) {
    const response = await api.post('/auth/login', { email, password });
    token.value = response.data.token;
    user.value = response.data.user;
    localStorage.setItem('authToken', response.data.token);
  }

  async function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('authToken');
  }

  return { token, user, isAuthenticated, login, logout };
});
```

**Source:** [Pinia documentation](https://pinia.vuejs.org/)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vuex | Pinia | 2022 | Official Vue recommendation, 40% less boilerplate, Composition API native |
| Express | Fastify | 2021-2023 | 2x faster, TypeScript-first, schema validation built-in |
| Cordova | Capacitor | 2019-2020 | Modern API, better plugin system, web-first approach |
| jsonwebtoken | jose | 2021-2023 | Zero deps, ESM-native, works in all runtimes (edge, browser, Node) |
| bcrypt | argon2 | 2023-2025 | OWASP 2025 recommendation, GPU-resistant, memory-hard |
| Prisma DSL trend | Drizzle SQL-like | 2023-2025 | Developers preferring SQL knowledge over proprietary DSL |
| TypeORM | Drizzle | 2023-2025 | TypeORM maintenance issues, Drizzle better TypeScript support |
| Jest | Vitest | 2022-2024 | 10-20x faster in watch mode, Vite-native, official Vue recommendation |

**Deprecated/outdated:**
- `@quasar/app` (Webpack): Replaced by `@quasar/cli` + Vite (default since Quasar 2.x)
- Capacitor 5: Replaced by Capacitor 6 (current stable)
- Node 16: EOL September 2023, Capacitor 6 requires Node 18+, Fastify 5 requires Node 20+
- Fastify 4 `.listen(port)` syntax: Breaking change in Fastify 5, must use options object

## Open Questions

Things that couldn't be fully resolved:

1. **Shared types between repos**
   - What we know: User decided manual copy (no shared package)
   - What's unclear: Best timing to sync (pre-commit hook? Manual script? CI check?)
   - Recommendation: Start with manual `pnpm sync-types` script. Add pre-commit hook if drift becomes problem.

2. **Environment variable validation**
   - What we know: Zod is standard for TypeScript validation
   - What's unclear: Should env validation be in separate boot file or inline in app.ts?
   - Recommendation: Fastify - validate in `app.ts` before building app. Quasar - validate in boot file that runs first.

3. **Database migration strategy for production**
   - What we know: Drizzle Kit generates migrations, `migrate` command applies them
   - What's unclear: Should migrations run automatically on deploy or manually triggered?
   - Recommendation: Phase 1 - manual `pnpm db:migrate` on deploy. Automate in later phase once CI/CD is established.

4. **Test user data in seed script**
   - What we know: drizzle-seed can generate deterministic users
   - What's unclear: Exact distribution of members/coaches per branch, level distribution
   - Recommendation: Start with 4 members + 1 coach per branch, all levels represented. Refine based on testing needs.

## Sources

### Primary (HIGH confidence)

**Official Documentation:**
- [Quasar Framework Documentation](https://quasar.dev) - Directory structure, Capacitor integration
- [Quasar CLI Vite Directory Structure](https://quasar.dev/quasar-cli-vite/directory-structure)
- [Quasar Capacitor Preparation](https://quasar.dev/quasar-cli-vite/developing-capacitor-apps/preparation)
- [Quasar Capacitor Configuration](https://quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor)
- [Capacitor 6 Getting Started](https://capacitorjs.com/docs/v6/getting-started)
- [Capacitor 6 Environment Setup](https://capacitorjs.com/docs/v6/getting-started/environment-setup)
- [Capacitor 6 Migration Guide](https://capacitorjs.com/docs/v6/updating/6-0)
- [Fastify Documentation](https://fastify.dev/docs/latest/)
- [Fastify Getting Started](https://fastify.dev/docs/latest/Guides/Getting-Started/)
- [Fastify Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/)
- [Fastify 5 Migration Guide](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Drizzle MySQL Setup](https://orm.drizzle.team/docs/get-started-mysql)
- [Drizzle Schema Declaration](https://orm.drizzle.team/docs/sql-schema-declaration)
- [Drizzle Migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle Relational Queries](https://orm.drizzle.team/docs/rqb)

**Libraries:**
- [jose library](https://github.com/panva/jose) - JWT signing/verification
- [argon2 npm](https://www.npmjs.com/package/argon2) - Password hashing
- [drizzle-seed](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-seed) - Seed data generation
- [@fastify/mysql](https://github.com/fastify/fastify-mysql) - MySQL Fastify plugin

### Secondary (MEDIUM confidence)

**Version Information:**
- [Quasar Releases](https://github.com/quasarframework/quasar/releases) - Current version 2.18.6 (verified 2024-11-13)

**Community Resources:**
- [Quasar GitHub Issues](https://github.com/quasarframework/quasar/issues) - Capacitor status bar issue (#18162)

### Tertiary (LOW confidence - informational only)

**Stack comparison articles:** STACK.md references (verified against official docs where possible)

## Metadata

**Confidence breakdown:**
- Quasar + Capacitor setup: HIGH - Official documentation followed, version pinning verified
- Fastify plugin patterns: HIGH - Official guides and examples
- Drizzle ORM setup: HIGH - Official documentation and verified patterns
- Database seeding: MEDIUM - drizzle-seed is documented but user-specific seed data (branches, roles) is custom
- Version compatibility: HIGH - Capacitor 6 requirements documented (Node 18+, Xcode 15+, Android Studio 2023.1.1+)
- Common pitfalls: MEDIUM - Mix of documented breaking changes (Fastify 5, Capacitor 6) and anticipated issues (CORS, type sync)

**Research date:** 2026-01-22
**Valid until:** 2026-02-22 (30 days - stable stack, low churn expected)

**Note on prior research:** This phase benefits from comprehensive STACK.md and ARCHITECTURE.md research completed 2026-01-21/22. Phase 1 research focused on specific initialization patterns, version pinning, and seed script implementation rather than library selection (already decided).

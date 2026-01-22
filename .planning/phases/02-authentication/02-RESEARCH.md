# Phase 2: Authentication - Research

**Researched:** 2026-01-22
**Domain:** JWT-based authentication for Quasar + Capacitor + Fastify stack
**Confidence:** HIGH

## Summary

Phase 2 implements secure authentication for El Templo app using JWT tokens with Fastify backend, persisted via localStorage (web) and Capacitor Preferences (mobile). The existing infrastructure from Phase 1 provides a solid foundation: argon2 for password hashing, Pinia stores with composition API, Axios interceptors with Bearer token injection, and 401 auto-redirect.

The standard approach is:
1. Backend: @fastify/jwt plugin for token signing/verification with decorator-based route protection
2. Frontend: Vue Router navigation guards with beforeEach hook for auth checking
3. Persistence: localStorage for web, Capacitor Preferences for native (unified via composable)
4. Forms: Quasar QForm + QInput with validation rules for registration/login UI

**Primary recommendation:** Use @fastify/jwt for backend JWT handling (v9+ for Fastify 5 compatibility), implement a simple authenticate decorator, and create a unified token storage composable that abstracts localStorage vs Capacitor Preferences based on platform.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fastify/jwt | ^9.0.0 | JWT signing/verification | Official Fastify plugin, decorates instance with jwt methods, v9 for Fastify 5 |
| jose | ^5.x | JWT utility (alternative) | Already researched in Phase 1, zero deps, if @fastify/jwt insufficient |
| argon2 | ^0.44.0 | Password hashing | Already installed, OWASP 2025 recommendation |
| @capacitor/preferences | ^7.0.0 | Mobile token storage | Official plugin, matches Capacitor 7 version |
| vue-router | ^4.0.0 | Route protection | Already installed, navigation guards built-in |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Quasar Notify plugin | Built-in | Auth feedback | Success/error toasts for login/register/logout |
| Quasar Loading plugin | Built-in | Loading states | During async auth operations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fastify/jwt | jose directly | More control but more code; @fastify/jwt handles common cases |
| Capacitor Preferences | Capacitor Secure Storage | More secure but requires paid plugin; Preferences sufficient for JWT |
| localStorage | sessionStorage | Session storage clears on tab close; requirement is persistence across restarts |

**Installation:**
```bash
# Backend (el-templo-api)
pnpm add @fastify/jwt

# Frontend (el-templo-app) - from src-capacitor directory
cd src-capacitor
pnpm add @capacitor/preferences
npx cap sync
```

## Architecture Patterns

### Backend: Auth Module Structure

```
el-templo-api/src/
├── plugins/
│   └── auth.ts              # @fastify/jwt registration + authenticate decorator
├── modules/
│   └── auth/
│       ├── routes.ts        # POST /register, POST /login, GET /me
│       ├── service.ts       # Business logic (optional, can inline)
│       └── schemas.ts       # JSON Schema validation for requests
└── shared/
    └── utils/
        └── password.ts      # Argon2 helpers (hashPassword, verifyPassword)
```

### Frontend: Auth Flow Structure

```
el-templo-app/src/
├── boot/
│   ├── axios.ts             # Already has Bearer interceptor + 401 redirect
│   └── auth.ts              # NEW: Hydrate auth store on app start
├── composables/
│   └── useTokenStorage.ts   # NEW: Unified localStorage/Preferences abstraction
├── stores/
│   ├── useAuthStore.ts      # Enhance with login/register/logout actions
│   └── useUserStore.ts      # Enhance with profile loading
├── pages/
│   ├── LoginPage.vue        # NEW: Login form
│   ├── RegisterPage.vue     # NEW: Registration form
│   └── ProfilePage.vue      # NEW: Display user level, branch
├── router/
│   ├── index.ts             # Add navigation guards
│   └── routes.ts            # Add auth routes, protect app routes
└── layouts/
    └── MainLayout.vue       # Add logout button (visible from any screen)
```

### Pattern 1: Fastify JWT Plugin with Authenticate Decorator

**What:** Register @fastify/jwt, create authenticate decorator for route protection.

**When to use:** All protected API routes.

**Example:**

```typescript
// src/plugins/auth.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: number; email: string; role: string };
    user: { userId: number; email: string; role: string };
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'development-secret-change-in-prod',
    sign: {
      expiresIn: '7d', // Token valid for 7 days
    },
  });

  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });
};

export default fp(authPlugin, { name: 'auth' });
```

**Source:** [@fastify/jwt GitHub](https://github.com/fastify/fastify-jwt)

### Pattern 2: Auth Routes with JSON Schema Validation

**What:** Register, login, and me endpoints with request validation.

**When to use:** All auth endpoints.

**Example:**

```typescript
// src/modules/auth/routes.ts
import { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { users, branches } from '../../db/schema';
import * as argon2 from 'argon2';

const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'branchId'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 },
      branchId: { type: 'integer' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
    },
  },
};

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string' },
    },
  },
};

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/auth/register
  fastify.post('/register', { schema: registerSchema }, async (request, reply) => {
    const { email, password, branchId, firstName, lastName } = request.body as {
      email: string;
      password: string;
      branchId: number;
      firstName?: string;
      lastName?: string;
    };

    // Check if email already exists
    const existing = await fastify.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    // Verify branch exists
    const branch = await fastify.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1);

    if (branch.length === 0) {
      return reply.code(400).send({ error: 'Invalid branch' });
    }

    const passwordHash = await argon2.hash(password);

    const [result] = await fastify.db
      .insert(users)
      .values({
        email,
        passwordHash,
        branchId,
        firstName: firstName || null,
        lastName: lastName || null,
        role: 'member',
        level: 'alfa',
      });

    const token = fastify.jwt.sign({
      userId: result.insertId,
      email,
      role: 'member',
    });

    return {
      token,
      user: {
        id: result.insertId,
        email,
        role: 'member',
        level: 'alfa',
        branchId,
      },
    };
  });

  // POST /api/auth/login
  fastify.post('/login', { schema: loginSchema }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const [user] = await fastify.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const validPassword = await argon2.verify(user.passwordHash, password);
    if (!validPassword) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Get branch name for response
    const [branch] = await fastify.db
      .select({ name: branches.name })
      .from(branches)
      .where(eq(branches.id, user.branchId))
      .limit(1);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        level: user.level,
        branchId: user.branchId,
        branchName: branch?.name || '',
      },
    };
  });

  // GET /api/auth/me (protected)
  fastify.get('/me', { onRequest: [fastify.authenticate] }, async (request) => {
    const { userId } = request.user;

    const [user] = await fastify.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }

    const [branch] = await fastify.db
      .select({ name: branches.name })
      .from(branches)
      .where(eq(branches.id, user.branchId))
      .limit(1);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      level: user.level,
      branchId: user.branchId,
      branchName: branch?.name || '',
    };
  });
};
```

**Source:** [Fastify Validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)

### Pattern 3: Token Storage Composable

**What:** Unified token storage that uses localStorage on web, Capacitor Preferences on native.

**When to use:** All token read/write operations.

**Example:**

```typescript
// src/composables/useTokenStorage.ts
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const TOKEN_KEY = 'authToken';

export function useTokenStorage() {
  const isNative = Capacitor.isNativePlatform();

  async function getToken(): Promise<string | null> {
    if (isNative) {
      const { value } = await Preferences.get({ key: TOKEN_KEY });
      return value;
    }
    return localStorage.getItem(TOKEN_KEY);
  }

  async function setToken(token: string): Promise<void> {
    if (isNative) {
      await Preferences.set({ key: TOKEN_KEY, value: token });
    } else {
      localStorage.setItem(TOKEN_KEY, token);
    }
  }

  async function removeToken(): Promise<void> {
    if (isNative) {
      await Preferences.remove({ key: TOKEN_KEY });
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  return { getToken, setToken, removeToken };
}
```

**Source:** [Capacitor Preferences](https://capacitorjs.com/docs/apis/preferences)

### Pattern 4: Vue Router Navigation Guards

**What:** Global beforeEach guard to protect routes and redirect unauthenticated users.

**When to use:** Router initialization.

**Example:**

```typescript
// src/router/index.ts
import { defineRouter } from '#q-app/wrappers';
import { createRouter, createWebHashHistory } from 'vue-router';
import routes from './routes';
import { useAuthStore } from 'stores/useAuthStore';

export default defineRouter(function () {
  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createWebHashHistory(),
  });

  Router.beforeEach(async (to, from) => {
    const authStore = useAuthStore();

    // Routes that don't require auth
    const publicRoutes = ['login', 'register'];
    const isPublicRoute = publicRoutes.includes(to.name as string);

    // If not authenticated and trying to access protected route
    if (!authStore.isAuthenticated && !isPublicRoute) {
      return { name: 'login' };
    }

    // If authenticated and trying to access login/register, redirect to home
    if (authStore.isAuthenticated && isPublicRoute) {
      return { name: 'home' };
    }
  });

  return Router;
});
```

**Source:** [Vue Router Navigation Guards](https://router.vuejs.org/guide/advanced/navigation-guards.html)

### Pattern 5: Auth Boot File for Token Hydration

**What:** Boot file that hydrates auth state from stored token on app startup.

**When to use:** App initialization, before router is ready.

**Example:**

```typescript
// src/boot/auth.ts
import { boot } from 'quasar/wrappers';
import { useAuthStore } from 'stores/useAuthStore';
import { useUserStore } from 'stores/useUserStore';
import { api } from './axios';
import { useTokenStorage } from 'src/composables/useTokenStorage';

export default boot(async () => {
  const authStore = useAuthStore();
  const userStore = useUserStore();
  const { getToken } = useTokenStorage();

  const token = await getToken();

  if (token) {
    try {
      // Verify token is still valid by calling /me
      const response = await api.get('/auth/me');
      authStore.setAuth(token, {
        id: response.data.id,
        email: response.data.email,
        role: response.data.role,
      });
      userStore.setProfile(response.data);
    } catch (error) {
      // Token invalid, clear it
      authStore.clearAuth();
    }
  }
});
```

**quasar.config.js addition:**
```javascript
boot: ['axios', 'auth'], // auth must come after axios
```

### Pattern 6: Quasar Form Validation

**What:** QForm with QInput validation rules for login/register forms.

**When to use:** All auth forms.

**Example:**

```vue
<!-- src/pages/LoginPage.vue -->
<template>
  <q-page class="flex flex-center">
    <q-card style="width: 400px; max-width: 90vw">
      <q-card-section>
        <div class="text-h5 text-center">Login</div>
      </q-card-section>

      <q-card-section>
        <q-form @submit="onSubmit" class="q-gutter-md">
          <q-input
            v-model="email"
            type="email"
            label="Email"
            :rules="[
              val => !!val || 'Email is required',
              val => /.+@.+\..+/.test(val) || 'Invalid email format'
            ]"
            lazy-rules
          />

          <q-input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            label="Password"
            :rules="[val => !!val || 'Password is required']"
            lazy-rules
          >
            <template v-slot:append>
              <q-icon
                :name="showPassword ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showPassword = !showPassword"
              />
            </template>
          </q-input>

          <q-btn
            type="submit"
            color="primary"
            label="Login"
            :loading="loading"
            class="full-width"
          />
        </q-form>
      </q-card-section>

      <q-card-section class="text-center">
        <router-link to="/register">Don't have an account? Register</router-link>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from 'stores/useAuthStore';

const $q = useQuasar();
const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const loading = ref(false);

async function onSubmit() {
  loading.value = true;
  try {
    await authStore.login(email.value, password.value);
    $q.notify({ type: 'positive', message: 'Login successful' });
    router.push('/');
  } catch (error: any) {
    $q.notify({
      type: 'negative',
      message: error.response?.data?.error || 'Login failed',
    });
  } finally {
    loading.value = false;
  }
}
</script>
```

**Source:** [Quasar QForm](https://quasar.dev/vue-components/form), [Quasar QInput](https://quasar.dev/vue-components/input)

### Anti-Patterns to Avoid

- **Storing passwords in state:** Only store the hash server-side, never in Pinia or localStorage
- **Hardcoded JWT secrets:** Use environment variables, never commit secrets
- **Missing email uniqueness check:** Always check before insert to avoid duplicate key errors
- **Synchronous token storage on mobile:** Capacitor Preferences is async, always await
- **Navigation guard infinite loops:** Ensure public routes don't redirect to themselves
- **Missing CORS for Capacitor:** Ensure `capacitor://localhost` is in CORS allowed origins (already done in Phase 1)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signing/verification | Custom crypto | @fastify/jwt | Handles expiration, algorithm validation, replay protection |
| Password hashing | bcrypt wrapper | argon2 (already installed) | OWASP 2025 recommendation, memory-hard |
| Form validation | Manual if/else | Quasar :rules prop | Built-in async support, lazy validation, error display |
| Mobile storage | Raw Capacitor APIs | useTokenStorage composable | Unified API, platform detection |
| Route protection | Per-component checks | Vue Router beforeEach | Single source of truth, no duplication |
| Loading states | Manual boolean | Quasar Loading plugin | Overlay, prevents double-submit |
| Notifications | Custom toast component | Quasar Notify plugin | Positioned, animated, action support |

**Key insight:** Authentication is security-critical. Use established patterns from @fastify/jwt and argon2 rather than hand-rolling. The frontend is about UX - use Quasar's form validation and feedback plugins for consistent experience.

## Common Pitfalls

### Pitfall 1: Token Not Persisting on Mobile

**What goes wrong:** User logs in, closes app, reopens, and is logged out.

**Why it happens:** localStorage doesn't persist reliably on iOS WebView. Must use Capacitor Preferences.

**How to avoid:** Use the useTokenStorage composable that detects platform and uses appropriate storage.

**Warning signs:** "Works on web, not on mobile device/emulator"

### Pitfall 2: Race Condition on App Start

**What goes wrong:** Router guard runs before boot file finishes hydrating auth state.

**Why it happens:** Boot files are async but router might initialize before they complete.

**How to avoid:**
1. List auth boot file after axios in quasar.config.js
2. Make auth boot file synchronous for the critical path OR
3. Store token check result and have guard wait for it

**Warning signs:** User is redirected to login even though they have a valid token stored.

### Pitfall 3: Duplicate Email Registration Error Handling

**What goes wrong:** Uncaught database error when registering with existing email.

**Why it happens:** MySQL unique constraint throws error, not caught properly.

**How to avoid:** Check email existence before insert, return 409 Conflict with clear message.

**Warning signs:** 500 error on duplicate registration instead of user-friendly message.

### Pitfall 4: JWT Secret in Code

**What goes wrong:** JWT secret committed to repository, security breach.

**Why it happens:** Developer uses hardcoded fallback during development, forgets to remove.

**How to avoid:**
1. Never use hardcoded secrets, even as fallbacks
2. Fail fast if JWT_SECRET not set in production
3. Add .env to .gitignore

**Warning signs:** JWT_SECRET visible in code review, same token works across environments.

### Pitfall 5: Missing Branch Selection in Registration

**What goes wrong:** User registers without selecting branch, gets default or error.

**Why it happens:** branchId is required per schema but form doesn't collect it.

**How to avoid:** Registration form must include branch selector (dropdown of active branches).

**Warning signs:** All users assigned to branch 1, or registration fails with "branchId required".

### Pitfall 6: 401 Redirect Loop

**What goes wrong:** App stuck in redirect loop between login and home.

**Why it happens:** 401 interceptor redirects to /login, navigation guard redirects back.

**How to avoid:**
1. Axios interceptor: only redirect if not already on login page
2. Clear auth state before redirecting
3. Use window.location.href (already in place) to break Vue Router cycle

**Warning signs:** Browser shows "too many redirects" error.

## Code Examples

### Enhanced useAuthStore

```typescript
// src/stores/useAuthStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from 'boot/axios';
import { useTokenStorage } from 'src/composables/useTokenStorage';
import { useUserStore } from './useUserStore';

export interface AuthUser {
  id: number;
  email: string;
  role: 'member' | 'coach' | 'admin' | 'superadmin';
}

export const useAuthStore = defineStore('auth', () => {
  const { getToken, setToken, removeToken } = useTokenStorage();
  const userStore = useUserStore();

  // State
  const token = ref<string | null>(null);
  const user = ref<AuthUser | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const initialized = ref(false);

  // Getters
  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const isCoach = computed(() =>
    ['coach', 'admin', 'superadmin'].includes(user.value?.role || '')
  );
  const isAdmin = computed(() =>
    ['admin', 'superadmin'].includes(user.value?.role || '')
  );

  // Actions
  function setAuth(newToken: string, newUser: AuthUser) {
    token.value = newToken;
    user.value = newUser;
    error.value = null;
  }

  async function clearAuth() {
    token.value = null;
    user.value = null;
    await removeToken();
    userStore.clearProfile();
  }

  async function login(email: string, password: string) {
    loading.value = true;
    error.value = null;

    try {
      const response = await api.post('/auth/login', { email, password });
      const { token: newToken, user: userData } = response.data;

      await setToken(newToken);
      setAuth(newToken, {
        id: userData.id,
        email: userData.email,
        role: userData.role,
      });
      userStore.setProfile(userData);
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Login failed';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function register(data: {
    email: string;
    password: string;
    branchId: number;
    firstName?: string;
    lastName?: string;
  }) {
    loading.value = true;
    error.value = null;

    try {
      const response = await api.post('/auth/register', data);
      const { token: newToken, user: userData } = response.data;

      await setToken(newToken);
      setAuth(newToken, {
        id: userData.id,
        email: userData.email,
        role: userData.role,
      });
      userStore.setProfile(userData);
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Registration failed';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    await clearAuth();
  }

  async function initialize() {
    if (initialized.value) return;

    const storedToken = await getToken();
    if (storedToken) {
      token.value = storedToken;
      try {
        const response = await api.get('/auth/me');
        setAuth(storedToken, {
          id: response.data.id,
          email: response.data.email,
          role: response.data.role,
        });
        userStore.setProfile(response.data);
      } catch {
        await clearAuth();
      }
    }
    initialized.value = true;
  }

  return {
    // State
    token,
    user,
    loading,
    error,
    initialized,
    // Getters
    isAuthenticated,
    isCoach,
    isAdmin,
    // Actions
    setAuth,
    clearAuth,
    login,
    register,
    logout,
    initialize,
  };
});
```

### Logout Button in MainLayout

```vue
<!-- In MainLayout.vue toolbar -->
<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn flat dense round icon="menu" @click="toggleLeftDrawer" />
        <q-toolbar-title>El Templo</q-toolbar-title>
        <q-btn v-if="authStore.isAuthenticated" flat icon="logout" @click="onLogout">
          <q-tooltip>Logout</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>
    <!-- ... -->
  </q-layout>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from 'stores/useAuthStore';

const $q = useQuasar();
const router = useRouter();
const authStore = useAuthStore();

async function onLogout() {
  await authStore.logout();
  $q.notify({ type: 'positive', message: 'Logged out successfully' });
  router.push('/login');
}
</script>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jsonwebtoken + custom fastify hooks | @fastify/jwt plugin | 2023-2024 | Plugin handles verify decorator, cookie support, TypeScript types |
| bcrypt | argon2 | 2023-2025 | OWASP 2025 recommends Argon2id over bcrypt for new applications |
| Vuex + mapGetters | Pinia + composition API | 2022 | Simpler, TypeScript-native, no mutations boilerplate |
| localStorage everywhere | Platform-aware storage | 2023+ | iOS WebView localStorage unreliable, Preferences required |
| Route-level auth checks | Global navigation guards | Always | Single source of truth, impossible to forget protection |

**Deprecated/outdated:**
- `jsonwebtoken` library: Works but `jose` or `@fastify/jwt` (which uses `fast-jwt`) preferred
- Capacitor 6 `@capacitor/preferences`: Upgrade to ^7.0.0 for Capacitor 7 compatibility
- Cookie-based sessions for mobile: JWTs in Authorization header work better with native apps

## Open Questions

Things that couldn't be fully resolved:

1. **Branch selection UI for registration**
   - What we know: branchId is required, 5 branches exist
   - What's unclear: Should user select from dropdown, or should there be a default?
   - Recommendation: Dropdown with all active branches, no default selection (force explicit choice)

2. **Remember me / token refresh**
   - What we know: Current design uses 7-day token expiration
   - What's unclear: Should there be "remember me" checkbox? Token refresh before expiry?
   - Recommendation: Start with simple 7-day tokens, no refresh. Add refresh tokens in later phase if needed.

3. **Email verification**
   - What we know: Not in Phase 2 requirements
   - What's unclear: Should registration require email verification?
   - Recommendation: Out of scope for Phase 2. Add in future phase if needed. For now, assume valid emails.

4. **Password reset**
   - What we know: Not in Phase 2 requirements
   - What's unclear: Should "forgot password" be implemented?
   - Recommendation: Out of scope for Phase 2. Can be added as Phase 2.1 if user requests.

## Sources

### Primary (HIGH confidence)

**Official Documentation:**
- [@fastify/jwt GitHub](https://github.com/fastify/fastify-jwt) - Plugin API, decorator pattern, TypeScript types
- [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/) - Type providers, declaration merging
- [Fastify Validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) - JSON Schema validation
- [Capacitor Preferences](https://capacitorjs.com/docs/apis/preferences) - Mobile storage API
- [Capacitor 7 Migration](https://capacitorjs.com/docs/updating/7-0) - Breaking changes, version requirements
- [Vue Router Navigation Guards](https://router.vuejs.org/guide/advanced/navigation-guards.html) - beforeEach pattern
- [Quasar QForm](https://quasar.dev/vue-components/form) - Form validation patterns
- [Quasar QInput](https://quasar.dev/vue-components/input) - Input validation rules
- [Quasar Notify](https://quasar.dev/quasar-plugins/notify) - Notification plugin API
- [Drizzle ORM Select](https://orm.drizzle.team/docs/select) - Query patterns
- [jose Library](https://github.com/panva/jose) - JWT utility reference

### Secondary (MEDIUM confidence)

**Phase 1 Research:**
- Argon2 configuration from OWASP 2025 recommendations
- Axios interceptor patterns for Bearer tokens
- Pinia composition API store patterns

### Tertiary (LOW confidence)

None - all authentication patterns verified against official documentation.

## Metadata

**Confidence breakdown:**
- Backend JWT handling: HIGH - @fastify/jwt is official, well-documented
- Password hashing: HIGH - argon2 already installed, OWASP verified
- Mobile storage: HIGH - Capacitor Preferences is official, API documented
- Frontend forms: HIGH - Quasar components well-documented
- Navigation guards: HIGH - Vue Router official patterns
- Token hydration: MEDIUM - Boot file ordering requires testing

**Research date:** 2026-01-22
**Valid until:** 2026-02-22 (30 days - authentication patterns are stable)

**Dependencies verified:**
- @fastify/jwt v9+ required for Fastify 5 (confirmed in docs)
- @capacitor/preferences v7+ required for Capacitor 7 (version alignment)
- Existing argon2 ^0.44.0 is compatible

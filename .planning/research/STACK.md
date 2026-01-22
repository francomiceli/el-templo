# Technology Stack

**Project:** El Templo - Fitness Training Super-App
**Researched:** 2026-01-21
**Stack Focus:** Quasar + Capacitor + Node.js + MySQL (constrained)

---

## Executive Summary

This stack research focuses on **complementary libraries** for the non-negotiable core:
- **Frontend:** Quasar Framework 2.x (Vue 3 + TypeScript)
- **Mobile:** Capacitor 6.x (PWA + iOS + Android)
- **Backend:** Node.js + MySQL

The recommendations prioritize: (1) 2025 ecosystem standards, (2) TypeScript-first libraries, (3) fitness app requirements (timers, offline, session tracking).

---

## Core Framework (Constrained - Non-Negotiable)

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| Quasar Framework | ^2.18.6 | Vue 3 UI framework with 70+ Material components | HIGH |
| Vue 3 | ^3.5+ | Reactive UI framework with Composition API | HIGH |
| TypeScript | ^5.5+ | Type safety across frontend and backend | HIGH |
| Capacitor | ^6.x | Cross-platform native runtime (iOS, Android, PWA) | HIGH |

**Why Quasar 2.18.x:** Latest stable release, Vue 3 compatible, built-in Capacitor integration via `quasar mode add capacitor`. As of late 2025, Quasar has 26,000+ GitHub stars and 150,000+ weekly downloads.

**Why Capacitor 6 (not 7):** Quasar CLI defaults to Capacitor 6 as of Feb 2025. While Capacitor 7 is available, staying on 6.x avoids version mismatch issues with plugins. Upgrade to 7 can happen later when ecosystem stabilizes.

Sources:
- [Quasar Framework Official](https://quasar.dev)
- [Capacitor Version Support - Quasar](https://quasar.dev/quasar-cli-vite/developing-capacitor-apps/capacitor-version-support/)

---

## State Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Pinia** | ^2.2+ | Vue 3 state management | Official Vue recommendation, 40% less boilerplate than Vuex, full TypeScript support |

**Rationale:** Pinia is the **official state management solution for Vue 3** since 2022. It replaced Vuex as the recommended option. Key advantages:
- No mutations (direct state updates)
- Composition API friendly
- Modular stores by design
- DevTools integration with time-travel debugging

**Store Organization for El Templo:**
```
stores/
  useAuthStore.ts       # User session, tokens
  useSessionStore.ts    # Current workout session state
  useTimerStore.ts      # EMOM/AMRAP/ForTime timer state
  useProgressStore.ts   # User progress, levels, RPE history
  useBranchStore.ts     # Multi-branch data
```

**Confidence:** HIGH - Official Vue documentation explicitly recommends Pinia for Vue 3.

Sources:
- [Vue 3 + Pinia: Complete Guide 2025](https://medium.com/@dedikusniadi/vue-3-pinia-the-complete-guide-to-state-management-in-2025-712cc3cd691c)
- [Pinia Introduction](https://pinia.vuejs.org/introduction.html)

---

## Backend Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Fastify** | ^5.x | HTTP framework | 2x faster than Express, built-in JSON schema validation, TypeScript-first |

**Rationale:** Fastify v5 is the modern choice for Node.js APIs in 2025:
- **Performance:** 76,000+ requests/second (vs Express ~15,000)
- **Schema-based validation:** JSON Schema compiled to performant functions
- **TypeScript:** Type Providers for static type inference from schemas
- **Logging:** Built-in Pino logging (fastest JSON logger)
- **Plugin ecosystem:** Mature, well-maintained

**Why not Express:** Express is legacy. Still works, but Fastify offers meaningful performance improvements with similar DX.

**Why not Hono:** Hono excels for edge/serverless. For a self-hosted MySQL backend (monolithic), Fastify is more appropriate.

**Confidence:** HIGH - Multiple 2025 benchmarks confirm Fastify's performance advantage.

Sources:
- [Fastify Official](https://fastify.dev/)
- [Beyond Express: Fastify vs Hono](https://dev.to/alex_aslam/beyond-express-fastify-vs-hono-which-wins-for-high-throughput-apis-373i)
- [Fastify TypeScript Docs](https://fastify.dev/docs/latest/Reference/TypeScript/)

---

## Database & ORM

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| MySQL | 8.x | Relational database (constrained) | Project requirement |
| **Drizzle ORM** | ^0.38+ | TypeScript ORM for MySQL | SQL-like syntax, type-safe, 7.4kb bundle, zero deps |
| mysql2 | ^3.x | MySQL driver | Drizzle's native MySQL driver |

**Rationale:** Drizzle ORM is the 2025 recommendation for MySQL with TypeScript:

| Criterion | Drizzle | Prisma | TypeORM |
|-----------|---------|--------|---------|
| Bundle size | 7.4kb | Large (Rust binary) | Medium |
| Query style | SQL-like TypeScript | Proprietary DSL | Decorator-based |
| Performance | Best (14x faster joins) | Good | Slower |
| MySQL support | Native | Good | Good |
| Migrations | `drizzle-kit` | `prisma migrate` | Built-in |
| Learning curve | Requires SQL knowledge | Low | Medium |

**Why Drizzle over Prisma:**
- No proprietary DSL lock-in
- Better performance for complex joins
- Smaller bundle, faster cold starts
- SQL knowledge transfers directly

**Why Drizzle over TypeORM:**
- TypeORM has maintenance issues (bugs sit unresolved)
- Drizzle is actively developed, modern design
- Better type inference

**Migration workflow:**
```bash
npx drizzle-kit generate  # Generate SQL from schema changes
npx drizzle-kit migrate   # Apply migrations
npx drizzle-kit push      # Direct push (dev only)
```

**Confidence:** HIGH - Drizzle is consistently recommended for new projects in 2025.

Sources:
- [Drizzle ORM MySQL](https://orm.drizzle.team/docs/get-started/mysql-new)
- [Node.js ORMs in 2025](https://thedataguy.pro/blog/2025/12/nodejs-orm-comparison-2025/)
- [Drizzle vs Prisma](https://betterstack.com/community/guides/scaling-nodejs/drizzle-vs-prisma/)

---

## Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **jose** | ^5.x | JWT signing/verification | Zero deps, ESM, works everywhere |
| **argon2** | ^0.41+ | Password hashing | OWASP 2025 recommendation, GPU-resistant |

**JWT Strategy:** Use `jose` library directly instead of Passport.js.

**Why not Passport.js:**
- Passport adds unnecessary abstraction for JWT-only auth
- Lacks built-in key rotation and revocation
- jose is lighter, more modern, works in all runtimes

**Password Hashing:** Argon2id is the 2025 gold standard.

| Algorithm | Recommendation |
|-----------|---------------|
| Argon2id | Use for new projects |
| bcrypt | Acceptable for legacy (cost factor 12+) |
| SHA-256/MD5 | NEVER use |

**OWASP Argon2id config:**
- Memory: 19 MiB minimum (128 MiB for high security)
- Iterations: 2 minimum
- Parallelism: 1

**Confidence:** HIGH - OWASP and security community consensus.

Sources:
- [jose GitHub](https://github.com/panva/jose)
- [Password Hashing Guide 2025](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/)
- [Stop using Passport for JWT](https://medium.com/@agentwhs/stop-using-passport-for-node-js-authentication-with-jwt-89e8971872b3)

---

## API Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Zod** | ^3.24+ | Schema validation | TypeScript-first, 2kb core, infers types from schemas |

**Rationale:** Zod eliminates duplicate type declarations:
- Define schema once, get runtime validation AND TypeScript types
- Works with Fastify via `fastify-zod-openapi` or custom
- Environment variable validation
- API request/response validation

**Example:**
```typescript
import { z } from 'zod';

const SessionSchema = z.object({
  userId: z.string().uuid(),
  blockType: z.enum(['initium', 'nucleus', 'deuteros', 'athlos', 'epikos']),
  duration: z.number().min(0),
  rpe: z.number().min(1).max(10).optional(),
});

type Session = z.infer<typeof SessionSchema>; // TypeScript type auto-generated
```

**Confidence:** HIGH - De facto standard for TypeScript validation in 2025.

Sources:
- [Zod Official](https://zod.dev/)
- [Zod Complete Guide](https://betterstack.com/community/guides/scaling-nodejs/zod-explained/)

---

## Vue Utilities

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **VueUse** | ^14.0+ | Vue composition utilities | 200+ composables, de facto standard |

**Note:** VueUse 14.0+ requires Vue 3.5+.

**Useful composables for El Templo:**
- `useIntervalFn` - Timer intervals
- `useStorage` - Reactive localStorage with SSR safety
- `useWakeLock` - Screen wake lock API (web)
- `useNetwork` - Network status for offline handling
- `useDark` - Dark mode toggle
- `refDebounced` - Debounced search inputs

**Confidence:** HIGH - VueUse is the de facto utility library for Vue 3.

Sources:
- [VueUse Official](https://vueuse.org/)
- [Top 10 Vue.js Libraries 2025](https://dev.to/jacobandrewsky/top-10-vuejs-libraries-you-should-be-using-in-2025-4bop)

---

## HTTP Client

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Axios** | ^1.7+ | HTTP client | Built-in interceptors, auto JSON, error handling |

**Rationale:** For Vue.js apps with authentication:
- Request interceptors for auth tokens
- Response interceptors for error handling
- Automatic JSON transformation
- Well-documented Vue integration

**Why not native Fetch:** Fetch requires more boilerplate for interceptors and error handling. Axios provides these out of the box.

**Note:** Create a centralized API client:
```typescript
// src/api/client.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

**Confidence:** MEDIUM - Axios is mature but some prefer native fetch. For auth-heavy apps, Axios DX wins.

Sources:
- [Axios vs Fetch 2025](https://blog.logrocket.com/axios-vs-fetch-2025/)
- [Using Axios to Consume APIs - Vue](https://v2.vuejs.org/v2/cookbook/using-axios-to-consume-apis.html)

---

## Capacitor Plugins

| Plugin | Version | Purpose | Why |
|--------|---------|---------|-----|
| @capacitor/preferences | ^6.x | Key-value storage | Replaces localStorage (OS can clear localStorage) |
| @capacitor-community/keep-awake | ^6.x | Screen wake lock | Essential for workout timers |
| @capacitor/splash-screen | ^6.x | Splash screen | Standard UX |
| @capacitor/status-bar | ^6.x | Status bar control | Theme integration |
| @capacitor/haptics | ^6.x | Vibration feedback | Timer alerts, RPE logging |
| @capacitor/local-notifications | ^6.x | Local notifications | Rest period alerts |

**Why @capacitor/preferences over localStorage:**
> Mobile OSs may periodically clear data set in `window.localStorage`, so this API should be used instead.
- Uses UserDefaults (iOS) and SharedPreferences (Android)
- 100% persistent, not subject to OS cleanup

**Why keep-awake is essential:**
Workout timers must keep the screen on. Without this, the device dims/locks mid-workout.

**Confidence:** HIGH - Official Capacitor plugins are well-maintained.

Sources:
- [Capacitor Preferences API](https://capacitorjs.com/docs/apis/preferences)
- [Capacitor Storage Guide](https://capacitorjs.com/docs/guides/storage)
- [Keep Awake Plugin](https://github.com/capacitor-community/keep-awake)

---

## Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Vitest** | ^3.x | Unit/integration testing | 10-20x faster than Jest in watch mode, Vue ecosystem native |
| @vue/test-utils | ^2.4+ | Vue component testing | Official Vue testing library |
| Playwright | ^1.50+ | E2E testing | Cross-browser, mobile emulation |

**Rationale:** Vitest is the 2025 standard for Vue 3 projects:
- Created by Vite team (same as Vue creator)
- Native ESM, TypeScript support
- Jest-compatible API (easy migration)
- Blazing fast watch mode with HMR

**Why not Jest:**
> Vue.js official documentation states they only recommend Jest if you have an existing Jest test suite that needs to be migrated over to a Vite-based project.

**Confidence:** HIGH - Official Vue recommendation for new projects.

Sources:
- [Vue.js Testing Guide](https://vuejs.org/guide/scaling-up/testing.html)
- [Vitest vs Jest 2025](https://medium.com/@ruverd/jest-vs-vitest-which-test-runner-should-you-use-in-2025-5c85e4f2bda9)

---

## Scheduling (Backend)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **node-cron** | ^3.x | Scheduled tasks | Lightweight, pure JS, crontab syntax |

**Use cases for El Templo:**
- Daily session generation from SPOM rules
- Weekly progress calculations
- Level progression checks
- Database cleanup/maintenance

**Confidence:** HIGH - Standard for Node.js scheduling.

Sources:
- [Node-cron npm](https://www.npmjs.com/package/node-cron)
- [Job Scheduling in Node.js](https://betterstack.com/community/guides/scaling-nodejs/node-cron-scheduled-tasks/)

---

## Timer Implementation (Frontend)

**No external library recommended.** Build custom timer composables.

**Rationale:**
- WebSearch found no standalone npm packages for EMOM/AMRAP timers
- Existing solutions are full apps, not libraries
- Timer logic is app-specific (block structure, transitions)

**Recommended approach:**
```typescript
// composables/useWorkoutTimer.ts
export function useEMOMTimer(rounds: number, intervalSeconds: number) {
  const currentRound = ref(0);
  const secondsRemaining = ref(intervalSeconds);
  const isRunning = ref(false);
  // ... implementation using setInterval + requestAnimationFrame for accuracy
}
```

**Key considerations:**
- Use `requestAnimationFrame` for visual updates (smoother than setInterval alone)
- Use `setInterval` for the actual timing (more reliable for background)
- Integrate with `@capacitor-community/keep-awake` to prevent screen lock
- Use `@capacitor/haptics` for round transitions

**Confidence:** MEDIUM - Custom implementation required; no off-the-shelf solution found.

---

## What NOT to Use

| Technology | Why Avoid |
|------------|-----------|
| **Vuex** | Legacy, replaced by Pinia as official recommendation |
| **Express** | Legacy, Fastify is faster with better TypeScript support |
| **TypeORM** | Maintenance issues, performance problems, decorator complexity |
| **Prisma** | Vendor lock-in with proprietary DSL, larger bundle, slower cold starts |
| **jsonwebtoken** | Use `jose` instead - zero deps, modern ESM |
| **Passport.js** | Overkill for JWT-only auth, use `jose` directly |
| **bcrypt** | Acceptable but Argon2 is superior for new projects |
| **Jest** | Use Vitest for Vue 3 + Vite projects |
| **localStorage directly** | Use @capacitor/preferences for mobile persistence |
| **Cordova** | Legacy, Capacitor is the modern replacement |
| **Moment.js** | Deprecated, use native Date or date-fns if needed |

---

## Installation Commands

### Frontend (Quasar project)
```bash
# Core (already included in Quasar)
# Vue 3, TypeScript, Quasar CLI

# State & Utilities
npm install pinia @vueuse/core

# HTTP Client
npm install axios

# Add Capacitor mode (from Quasar project root)
quasar mode add capacitor

# In src-capacitor/:
npm install @capacitor/preferences@6 @capacitor/haptics@6 @capacitor/local-notifications@6
npm install @capacitor-community/keep-awake@6
```

### Backend
```bash
# Core framework
npm install fastify

# Database
npm install drizzle-orm mysql2
npm install -D drizzle-kit

# Authentication
npm install jose argon2

# Validation
npm install zod

# Scheduling
npm install node-cron

# Types
npm install -D @types/node
```

### Testing
```bash
# Frontend
npm install -D vitest @vue/test-utils happy-dom

# E2E
npm install -D @playwright/test

# Backend
npm install -D vitest
```

---

## Version Compatibility Matrix

| Package | Min Version | Works With |
|---------|-------------|------------|
| Quasar | 2.18.x | Vue 3.5+ |
| Vue | 3.5+ | VueUse 14+, Pinia 2.2+ |
| VueUse | 14.0+ | Vue 3.5+ (required) |
| Capacitor | 6.x | Quasar CLI default |
| Node.js | 20.x+ | Capacitor 6+, Fastify 5+ |
| Drizzle | 0.38+ | mysql2 3.x |

---

## Confidence Summary

| Area | Confidence | Notes |
|------|------------|-------|
| State Management (Pinia) | HIGH | Official Vue recommendation |
| Backend Framework (Fastify) | HIGH | Performance benchmarks verified |
| ORM (Drizzle) | HIGH | 2025 consensus for TypeScript + MySQL |
| Auth (jose + Argon2) | HIGH | Security standards verified |
| Validation (Zod) | HIGH | TypeScript ecosystem standard |
| Testing (Vitest) | HIGH | Official Vue recommendation |
| Capacitor Plugins | HIGH | Official plugins |
| Timer Implementation | MEDIUM | Custom build required |
| HTTP Client (Axios) | MEDIUM | Preference varies; recommendation solid |

---

## Sources

### Official Documentation
- [Quasar Framework](https://quasar.dev)
- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Fastify Documentation](https://fastify.dev/docs/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Pinia Documentation](https://pinia.vuejs.org/)
- [VueUse](https://vueuse.org/)
- [Zod](https://zod.dev/)
- [Vitest](https://vitest.dev/)

### Comparison Articles
- [Node.js ORMs in 2025](https://thedataguy.pro/blog/2025/12/nodejs-orm-comparison-2025/)
- [Drizzle vs Prisma](https://betterstack.com/community/guides/scaling-nodejs/drizzle-vs-prisma/)
- [Express vs Fastify vs Hono](https://dev.to/alex_aslam/beyond-express-fastify-vs-hono-which-wins-for-high-throughput-apis-373i)
- [Vitest vs Jest 2025](https://medium.com/@ruverd/jest-vs-vitest-which-test-runner-should-you-use-in-2025-5c85e4f2bda9)
- [Password Hashing Guide 2025](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/)

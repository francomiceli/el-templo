# Architecture Patterns

**Project:** El Templo - Modular Fitness Super-App
**Researched:** 2026-01-22
**Confidence:** HIGH (grounded in official Vue 3, Quasar, Capacitor, and Fastify documentation)

---

## Executive Summary

El Templo's architecture is a **shell + modules pattern** where the central shell (temple-nest) provides authentication, global state, navigation, event bus, and module orchestration. Modules (Training, Academy, Agora) register via manifests and are lazy-loaded. This pattern balances:

1. **Cohesion** - Modules are self-contained with clear boundaries
2. **Sharing** - Single global state, shared utilities, common UI components
3. **Extensibility** - New modules added without touching core shell
4. **Performance** - Lazy loading keeps initial bundle small

---

## System Architecture Overview

```
+------------------------------------------------------------------+
|                         EL TEMPLO APP                             |
+------------------------------------------------------------------+
|                                                                    |
|  +------------------------+     +-----------------------------+   |
|  |     TEMPLE SHELL       |     |        MODULES              |   |
|  |------------------------|     |-----------------------------|   |
|  | - Authentication       |     | [Training Module]           |   |
|  | - Global State (Pinia) |<--->| - SPOM Engine               |   |
|  | - Module Registry      |     | - Day Player                |   |
|  | - Event Bus            |     | - Timers                    |   |
|  | - Router               |     | - Session Completion        |   |
|  | - Shared Components    |     +-----------------------------+   |
|  | - API Client           |     | [Academy Module] (future)   |   |
|  +------------------------+     +-----------------------------+   |
|           |                     | [Agora Module] (future)     |   |
|           |                     +-----------------------------+   |
|           v                                                        |
|  +------------------------+                                        |
|  |    CAPACITOR BRIDGE    |                                        |
|  | - keep-awake           |                                        |
|  | - preferences          |                                        |
|  | - haptics              |                                        |
|  +------------------------+                                        |
|                                                                    |
+------------------------------------------------------------------+
           |
           | HTTPS/REST
           v
+------------------------------------------------------------------+
|                       BACKEND (Node.js)                           |
+------------------------------------------------------------------+
|                                                                    |
|  +------------------------+     +-----------------------------+   |
|  |    FASTIFY CORE        |     |        DOMAIN PLUGINS       |   |
|  |------------------------|     |-----------------------------|   |
|  | - Auth Plugin          |<--->| [Training Plugin]           |   |
|  | - Database (Drizzle)   |     | - Session Generation        |   |
|  | - Validation (Zod)     |     | - SPOM Logic                |   |
|  | - Event Logging        |     | - Exercise Queries          |   |
|  | - Error Handling       |     +-----------------------------+   |
|  +------------------------+     | [Academy Plugin] (future)   |   |
|                                 +-----------------------------+   |
|                                 | [Agora Plugin] (future)     |   |
|                                 +-----------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
           |
           v
+------------------------------------------------------------------+
|                     MySQL DATABASE                                |
+------------------------------------------------------------------+
| - Global tables (users, branches, credentials)                    |
| - Module tables (sessions, exercises, progress)                   |
| - Event log (full audit trail)                                    |
+------------------------------------------------------------------+
```

---

## Frontend Architecture

### Recommended Project Structure

```
src/
├── App.vue                          # Root component
├── boot/                            # Quasar boot files
│   ├── axios.ts                     # HTTP client setup
│   ├── modules.ts                   # Module registration system
│   └── capacitor.ts                 # Capacitor plugin init
│
├── router/
│   ├── index.ts                     # Router instance
│   └── routes.ts                    # Route definitions (imports module routes)
│
├── stores/                          # Pinia stores (global)
│   ├── index.ts                     # Pinia initialization
│   ├── useAuthStore.ts              # Authentication state
│   ├── useUserStore.ts              # User profile, branch, level
│   └── useEventBusStore.ts          # Cross-component events
│
├── components/                      # Shared components
│   ├── layout/
│   │   ├── ShellLayout.vue          # Main app layout
│   │   ├── ModuleLayout.vue         # Layout wrapper for modules
│   │   └── AppHeader.vue
│   ├── common/
│   │   ├── LoadingSpinner.vue
│   │   ├── ErrorBoundary.vue
│   │   └── ConfirmDialog.vue
│   └── ui/                          # Reusable UI primitives
│       ├── TimerDisplay.vue
│       ├── ProgressBar.vue
│       └── LevelBadge.vue
│
├── composables/                     # Shared composables
│   ├── useApi.ts                    # API wrapper
│   ├── useTimer.ts                  # Timer logic (EMOM, AMRAP, ForTime)
│   ├── useCapacitor.ts              # Capacitor feature detection
│   └── useEventLog.ts               # Event logging helper
│
├── api/                             # API client layer
│   ├── client.ts                    # Axios instance
│   ├── auth.api.ts                  # Auth endpoints
│   └── training.api.ts              # Training module endpoints
│
├── types/                           # TypeScript definitions
│   ├── models.ts                    # Domain models
│   ├── module.ts                    # Module manifest types
│   └── api.ts                       # API response types
│
├── modules/                         # Feature modules
│   └── training/                    # Training module
│       ├── index.ts                 # Module manifest + registration
│       ├── routes.ts                # Module routes
│       ├── stores/                  # Module-specific stores
│       │   ├── useSessionStore.ts
│       │   └── useTimerStore.ts
│       ├── components/
│       │   ├── WeeklyView.vue
│       │   ├── DayPlayer.vue
│       │   ├── BlockCard.vue
│       │   ├── ExerciseCard.vue
│       │   ├── SessionComplete.vue
│       │   └── timers/
│       │       ├── EMOMTimer.vue
│       │       ├── AMRAPTimer.vue
│       │       └── ForTimeTimer.vue
│       ├── pages/
│       │   ├── TrainingHome.vue
│       │   ├── SessionPage.vue
│       │   └── HistoryPage.vue
│       └── composables/
│           └── useSessionGeneration.ts
│
├── pages/                           # Shell pages
│   ├── LoginPage.vue
│   ├── RegisterPage.vue
│   └── ProfilePage.vue
│
└── css/
    ├── quasar.variables.sass
    └── app.scss
```

### Component Boundaries

| Component Layer | Responsibility | Communicates With |
|-----------------|----------------|-------------------|
| **Shell** | Auth, navigation, global state, module orchestration | All modules via registry |
| **Module** | Feature-specific UI, routes, stores | Shell via manifest, global stores via Pinia |
| **Shared Components** | Reusable UI primitives | Any component that imports them |
| **Composables** | Reusable logic | Components, stores |
| **API Layer** | HTTP communication | Backend |
| **Pinia Stores** | State management | Components, composables, other stores |

---

## Module Registration System

### Module Manifest Pattern

Each module exports a manifest that the shell uses to register it.

```typescript
// types/module.ts
export interface ModuleManifest {
  id: string;                         // Unique module ID
  name: string;                       // Display name
  icon: string;                       // Quasar icon name
  version: string;                    // Module version
  requiredRole?: UserRole;            // Minimum role to access
  requiredLevel?: MemberLevel;        // Minimum training level (for Academy)
  routes: RouteRecordRaw[];           // Module routes
  stores?: Record<string, StoreDefinition>;  // Module stores
  navItems?: NavItem[];               // Navigation items
  initialize?: (app: App) => void;    // Optional init hook
}

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: () => number;               // Dynamic badge count
}
```

### Module Registration (Boot File)

```typescript
// boot/modules.ts
import type { ModuleManifest } from '../types/module';

const moduleRegistry = new Map<string, ModuleManifest>();

export function registerModule(manifest: ModuleManifest): void {
  if (moduleRegistry.has(manifest.id)) {
    console.warn(`Module ${manifest.id} already registered`);
    return;
  }

  moduleRegistry.set(manifest.id, manifest);

  // Lazy-add routes to router
  manifest.routes.forEach(route => {
    router.addRoute(route);
  });

  // Optional initialization
  if (manifest.initialize) {
    manifest.initialize(app);
  }
}

export function getModules(): ModuleManifest[] {
  return Array.from(moduleRegistry.values());
}

export function getModuleById(id: string): ModuleManifest | undefined {
  return moduleRegistry.get(id);
}
```

### Module Entry Point Example

```typescript
// modules/training/index.ts
import type { ModuleManifest } from '@/types/module';
import routes from './routes';

export const trainingModule: ModuleManifest = {
  id: 'training',
  name: 'Training',
  icon: 'fitness_center',
  version: '1.0.0',
  routes,
  navItems: [
    { label: 'This Week', icon: 'calendar_today', route: '/training' },
    { label: 'History', icon: 'history', route: '/training/history' },
  ],
};

// Export for lazy loading
export default trainingModule;
```

### Lazy Loading Modules

```typescript
// router/routes.ts
import { RouteRecordRaw } from 'vue-router';

// Shell routes (always loaded)
const shellRoutes: RouteRecordRaw[] = [
  { path: '/login', component: () => import('../pages/LoginPage.vue') },
  { path: '/register', component: () => import('../pages/RegisterPage.vue') },
];

// Module routes (lazy loaded)
const moduleRoutes: RouteRecordRaw[] = [
  {
    path: '/training',
    component: () => import('../components/layout/ModuleLayout.vue'),
    children: [], // Populated by module registration
    meta: { module: 'training' },
  },
];

export default [...shellRoutes, ...moduleRoutes];
```

---

## State Management Architecture

### Global vs Module Stores

**Principle:** Single global state, no duplication. Modules extend global state with module-specific stores.

| Store Type | Location | Scope | Example |
|------------|----------|-------|---------|
| **Global** | `src/stores/` | Entire app | `useAuthStore`, `useUserStore` |
| **Module** | `src/modules/[name]/stores/` | Module only | `useSessionStore`, `useTimerStore` |

### Store Organization

```typescript
// stores/useAuthStore.ts (Global)
import { defineStore } from 'pinia';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null);
  const isAuthenticated = computed(() => !!token.value);

  async function login(email: string, password: string) {
    // ...
  }

  async function logout() {
    token.value = null;
    // Clear module stores
    useSessionStore().$reset();
  }

  return { token, isAuthenticated, login, logout };
});
```

```typescript
// stores/useUserStore.ts (Global)
import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', () => {
  const profile = ref<UserProfile | null>(null);
  const branch = computed(() => profile.value?.branch);
  const level = computed(() => profile.value?.level);
  const role = computed(() => profile.value?.role);

  return { profile, branch, level, role };
});
```

```typescript
// modules/training/stores/useSessionStore.ts (Module)
import { defineStore } from 'pinia';
import { useUserStore } from '@/stores/useUserStore';

export const useSessionStore = defineStore('training:session', () => {
  // Access global store
  const userStore = useUserStore();

  const currentSession = ref<Session | null>(null);
  const currentBlockIndex = ref(0);

  // Session is generated based on user's level (from global store)
  const exercises = computed(() =>
    filterExercisesByLevel(currentSession.value?.exercises, userStore.level)
  );

  return { currentSession, currentBlockIndex, exercises };
});
```

### Cross-Store Communication

Per Pinia official documentation, stores can safely call other stores inside actions and getters:

```typescript
// Module store accessing global store
export const useSessionStore = defineStore('training:session', () => {
  const userStore = useUserStore(); // Call at top level

  async function generateSession() {
    // Safe to access userStore here
    const session = await api.generateSession({
      level: userStore.level,
      branch: userStore.branch,
    });
    currentSession.value = session;
  }

  return { generateSession };
});
```

---

## Event Bus Architecture

### Use Case

Cross-component communication for events that don't fit neatly into state:

- Timer tick events
- Session completion events
- Navigation triggers
- Error broadcasts

### Implementation with VueUse

```typescript
// stores/useEventBusStore.ts
import { useEventBus } from '@vueuse/core';
import type { EventBusKey } from '@vueuse/core';

// Type-safe event keys
export const SESSION_COMPLETE: EventBusKey<{ sessionId: string; rpe: number }> = Symbol('session-complete');
export const TIMER_TICK: EventBusKey<{ seconds: number; round: number }> = Symbol('timer-tick');
export const BLOCK_COMPLETE: EventBusKey<{ blockIndex: number }> = Symbol('block-complete');

// Export buses for use across app
export const sessionCompleteBus = useEventBus(SESSION_COMPLETE);
export const timerTickBus = useEventBus(TIMER_TICK);
export const blockCompleteBus = useEventBus(BLOCK_COMPLETE);
```

```typescript
// Usage in component
import { sessionCompleteBus } from '@/stores/useEventBusStore';

// Emit
sessionCompleteBus.emit({ sessionId: '123', rpe: 7 });

// Listen (auto-unsubscribes on component unmount)
sessionCompleteBus.on((event) => {
  console.log(`Session ${event.sessionId} completed with RPE ${event.rpe}`);
});
```

---

## Backend Architecture

### Project Structure

```
backend/
├── src/
│   ├── index.ts                     # Fastify app entry
│   ├── app.ts                       # App configuration
│   │
│   ├── plugins/                     # Fastify plugins
│   │   ├── auth.ts                  # JWT verification
│   │   ├── database.ts              # Drizzle connection
│   │   ├── error-handler.ts         # Global error handling
│   │   └── event-logger.ts          # Audit trail plugin
│   │
│   ├── db/
│   │   ├── schema/                  # Drizzle schemas
│   │   │   ├── users.ts
│   │   │   ├── branches.ts
│   │   │   ├── exercises.ts
│   │   │   ├── sessions.ts
│   │   │   └── events.ts
│   │   ├── migrations/              # Generated migrations
│   │   └── index.ts                 # DB client export
│   │
│   ├── modules/                     # Domain modules
│   │   ├── auth/
│   │   │   ├── routes.ts
│   │   │   ├── service.ts
│   │   │   └── schemas.ts           # Zod schemas
│   │   │
│   │   └── training/
│   │       ├── routes.ts
│   │       ├── service.ts
│   │       ├── schemas.ts
│   │       └── spom/                # SPOM engine
│   │           ├── engine.ts
│   │           ├── rules.ts
│   │           └── generator.ts
│   │
│   ├── shared/
│   │   ├── middleware/
│   │   │   ├── auth-guard.ts
│   │   │   └── role-guard.ts
│   │   └── utils/
│   │       ├── jwt.ts
│   │       └── password.ts
│   │
│   └── types/
│       └── index.ts
│
├── drizzle.config.ts                # Drizzle-kit config
├── package.json
└── tsconfig.json
```

### Fastify Plugin Pattern

Per Fastify documentation, "everything is a plugin." Modules register as encapsulated plugins:

```typescript
// src/app.ts
import Fastify from 'fastify';
import { databasePlugin } from './plugins/database';
import { authPlugin } from './plugins/auth';
import { eventLoggerPlugin } from './plugins/event-logger';
import { authModule } from './modules/auth/routes';
import { trainingModule } from './modules/training/routes';

export async function buildApp() {
  const app = Fastify({ logger: true });

  // Core plugins (available everywhere)
  await app.register(databasePlugin);
  await app.register(authPlugin);
  await app.register(eventLoggerPlugin);

  // Domain modules (encapsulated)
  await app.register(authModule, { prefix: '/api/auth' });
  await app.register(trainingModule, { prefix: '/api/training' });

  return app;
}
```

```typescript
// src/modules/training/routes.ts
import { FastifyPluginAsync } from 'fastify';
import { TrainingService } from './service';

export const trainingModule: FastifyPluginAsync = async (fastify) => {
  const service = new TrainingService(fastify.db);

  fastify.get('/session/today', {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const session = await service.generateTodaySession(request.user);
      return session;
    },
  });

  fastify.post('/session/:id/complete', {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      // Event logging handled by plugin
      fastify.logEvent('session_completed', request.user.id, request.body);
      const result = await service.completeSession(request.params.id, request.body);
      return result;
    },
  });
};
```

---

## Data Flow

### Session Generation Flow

```
┌─────────────────┐
│   Frontend      │
│   (Weekly View) │
└────────┬────────┘
         │ GET /api/training/session/today
         v
┌─────────────────┐
│   Auth Plugin   │──> Verify JWT, extract user
└────────┬────────┘
         v
┌─────────────────┐
│ Training Module │
│  (routes.ts)    │
└────────┬────────┘
         v
┌─────────────────┐
│ TrainingService │──> Get user's level, branch
└────────┬────────┘
         v
┌─────────────────┐
│  SPOM Engine    │
│  (generator.ts) │
└────────┬────────┘
         │ Query: current SPOM week, intensity, route
         v
┌─────────────────┐
│ Exercise Query  │──> Filter by pattern, level, contraction type
└────────┬────────┘
         v
┌─────────────────┐
│ Build Session   │──> Assemble 4 blocks with exercises
└────────┬────────┘
         │ Return session JSON
         v
┌─────────────────┐
│   Frontend      │──> Render in Day Player
└─────────────────┘
```

### Event Logging Flow

Every user interaction is logged for audit trail:

```
┌─────────────────┐
│ User Action     │ (e.g., complete block)
└────────┬────────┘
         v
┌─────────────────┐
│ Frontend        │
│ useEventLog()   │──> Capture timestamp, context
└────────┬────────┘
         │ POST /api/events
         v
┌─────────────────┐
│ Event Logger    │
│ Plugin          │
└────────┬────────┘
         v
┌─────────────────┐
│ events table    │──> user_id, event_type, payload, timestamp
└─────────────────┘
```

---

## Database Schema Design

### Global Tables (Shell)

```typescript
// db/schema/users.ts
import { mysqlTable, varchar, int, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int().primaryKey().autoincrement(),
  email: varchar({ length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: mysqlEnum(['member', 'coach', 'ot', 'admin', 'superadmin']).default('member'),
  branchId: int('branch_id').references(() => branches.id),
  level: mysqlEnum(['alfa', 'delta', 'sigma', 'omega', 'spartan']).default('alfa'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const branches = mysqlTable('branches', {
  id: int().primaryKey().autoincrement(),
  name: varchar({ length: 255 }).notNull(),
  code: varchar({ length: 10 }).notNull().unique(),
  isActive: boolean('is_active').default(true),
});
```

### Module Tables (Training)

```typescript
// db/schema/sessions.ts
export const sessions = mysqlTable('sessions', {
  id: int().primaryKey().autoincrement(),
  userId: int('user_id').references(() => users.id).notNull(),
  branchId: int('branch_id').references(() => branches.id).notNull(),
  spomWeek: int('spom_week').notNull(),
  intensity: int().notNull(), // 55-95
  route: varchar({ length: 50 }).notNull(),
  status: mysqlEnum(['generated', 'in_progress', 'completed', 'skipped']).default('generated'),
  rpe: int(), // 1-10
  notes: text(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const sessionBlocks = mysqlTable('session_blocks', {
  id: int().primaryKey().autoincrement(),
  sessionId: int('session_id').references(() => sessions.id).notNull(),
  blockType: mysqlEnum(['initium', 'nucleus', 'deuteros', 'athlos', 'epikos']).notNull(),
  blockIndex: int('block_index').notNull(),
  pattern: varchar({ length: 50 }).notNull(),
  timerType: mysqlEnum(['emom', 'amrap', 'fortime', 'straight']),
  timerConfig: json('timer_config'), // { rounds, duration, etc. }
  status: mysqlEnum(['pending', 'in_progress', 'completed', 'skipped']).default('pending'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
});
```

### Event Log Table

```typescript
// db/schema/events.ts
export const events = mysqlTable('events', {
  id: int().primaryKey().autoincrement(),
  userId: int('user_id').references(() => users.id),
  sessionId: int('session_id').references(() => sessions.id),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: json(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIndex: index('idx_events_user').on(table.userId),
  typeIndex: index('idx_events_type').on(table.eventType),
  dateIndex: index('idx_events_date').on(table.createdAt),
}));
```

---

## Data Boundaries

### Branch-Scoped vs Global

| Data Type | Scope | Example |
|-----------|-------|---------|
| **Global** | Entire app | User credentials, SPOM rules, exercise database |
| **Branch** | Per-branch | Classes, check-ins, coach assignments |
| **User** | Per-user | Sessions, progress, RPE history, level |

### Access Control Matrix

| Role | Own Data | Branch Data | Global Data | Admin Functions |
|------|----------|-------------|-------------|-----------------|
| Member | Read/Write | Read (own branch) | Read (exercises, SPOM) | None |
| Coach | Read/Write | Read/Write (own branch members) | Read | Promote members |
| OT | Read/Write | Read/Write (all branches) | Read | Moderate Agora |
| Admin | All | All | Read/Write | All except super |
| Superadmin | All | All | All | All |

---

## Patterns to Follow

### Pattern 1: Composition over Inheritance

Use Vue 3 composables for reusable logic instead of mixins or inheritance.

**Example:**
```typescript
// composables/useTimer.ts
export function useEMOMTimer(rounds: number, intervalSeconds: number) {
  const currentRound = ref(0);
  const secondsRemaining = ref(intervalSeconds);
  const isRunning = ref(false);
  const isPaused = ref(false);

  function start() { /* ... */ }
  function pause() { /* ... */ }
  function resume() { /* ... */ }
  function reset() { /* ... */ }

  return {
    currentRound: readonly(currentRound),
    secondsRemaining: readonly(secondsRemaining),
    isRunning: readonly(isRunning),
    isPaused: readonly(isPaused),
    start,
    pause,
    resume,
    reset,
  };
}
```

### Pattern 2: Explicit Module Boundaries

Modules should only import from:
1. Their own internal files
2. Global shared code (`src/stores`, `src/composables`, `src/components/common`)
3. External packages

**Never:**
- Import from one module into another module
- Access another module's internal stores directly

### Pattern 3: API Layer Abstraction

All HTTP calls go through the API layer, never directly from components.

```typescript
// api/training.api.ts
import { api } from './client';
import type { Session, SessionComplete } from '@/types/models';

export const trainingApi = {
  getTodaySession: () => api.get<Session>('/training/session/today'),
  completeSession: (id: string, data: SessionComplete) =>
    api.post<void>(`/training/session/${id}/complete`, data),
  getHistory: (page: number) =>
    api.get<Session[]>('/training/history', { params: { page } }),
};
```

### Pattern 4: Type-Safe Event Logging

```typescript
// types/events.ts
export type EventType =
  | 'session_started'
  | 'session_completed'
  | 'block_started'
  | 'block_completed'
  | 'timer_paused'
  | 'timer_resumed'
  | 'level_promoted';

export interface EventPayload {
  session_started: { sessionId: string };
  session_completed: { sessionId: string; rpe: number; duration: number };
  block_started: { sessionId: string; blockIndex: number };
  block_completed: { sessionId: string; blockIndex: number; skipped: boolean };
  timer_paused: { sessionId: string; blockIndex: number; secondsRemaining: number };
  timer_resumed: { sessionId: string; blockIndex: number };
  level_promoted: { oldLevel: string; newLevel: string; promotedBy: string };
}

// composables/useEventLog.ts
export function useEventLog() {
  async function log<T extends EventType>(type: T, payload: EventPayload[T]) {
    await api.post('/events', { type, payload, timestamp: Date.now() });
  }
  return { log };
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Prop Drilling Through Module Boundaries

**What:** Passing data through many intermediate components instead of using stores.

**Why bad:** Creates tight coupling, makes refactoring painful.

**Instead:** Use Pinia stores for shared state. Use provide/inject for component-tree-scoped data.

### Anti-Pattern 2: Duplicated State

**What:** Storing the same data in multiple places (e.g., user level in both auth store and training store).

**Why bad:** State gets out of sync, bugs are hard to track.

**Instead:** Single source of truth. Training module reads level from global `useUserStore`, never copies it.

### Anti-Pattern 3: Fat Components

**What:** Components that do data fetching, state management, and rendering.

**Why bad:** Untestable, hard to reuse, hard to maintain.

**Instead:**
- Smart components (pages) orchestrate
- Dumb components (UI) receive props, emit events
- Composables handle logic
- API layer handles HTTP

### Anti-Pattern 4: Direct Capacitor Calls in Components

**What:** Calling Capacitor plugins directly in components.

**Why bad:** Breaks when running in web-only mode, hard to mock for testing.

**Instead:** Wrap in composables with feature detection:

```typescript
// composables/useCapacitor.ts
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export function useHaptics() {
  const isNative = Capacitor.isNativePlatform();

  function impact(style: ImpactStyle = ImpactStyle.Medium) {
    if (isNative) {
      Haptics.impact({ style });
    }
  }

  return { impact };
}
```

### Anti-Pattern 5: Monolithic Route Files

**What:** All routes in a single file.

**Why bad:** Hard to maintain, no code splitting benefit.

**Instead:** Each module defines its own routes. Shell aggregates them.

---

## Build Order (Dependencies)

Based on component dependencies, recommended build order:

```
Phase 1: Foundation
├── 1.1 Backend skeleton (Fastify + Drizzle + MySQL)
├── 1.2 Frontend skeleton (Quasar + Pinia + Router)
├── 1.3 Database schema (global tables)
└── 1.4 Auth system (JWT, login, register)

Phase 2: Shell
├── 2.1 Global stores (useAuthStore, useUserStore)
├── 2.2 Module registry system
├── 2.3 Shell layout components
├── 2.4 API client with interceptors
└── 2.5 Capacitor bridge setup

Phase 3: SPOM Engine
├── 3.1 Exercise database import
├── 3.2 SPOM rules import
├── 3.3 Session generation logic
└── 3.4 Weekly state management

Phase 4: Training Module UI
├── 4.1 Module manifest + routes
├── 4.2 Training stores (useSessionStore, useTimerStore)
├── 4.3 Weekly view component
├── 4.4 Day Player component
└── 4.5 Timer components (EMOM, AMRAP, ForTime)

Phase 5: Session Completion
├── 5.1 Block completion flow
├── 5.2 Session completion screen
├── 5.3 RPE input
├── 5.4 Event logging
└── 5.5 Session history

Phase 6: Progression System
├── 6.1 Level display in UI
├── 6.2 RPE trend tracking
├── 6.3 Coach member view
├── 6.4 Level promotion flow
└── 6.5 Coach override capability
```

**Rationale:**
- Phase 1 must come first (everything depends on auth and data persistence)
- Phase 2 establishes the shell that modules plug into
- Phase 3 can parallel Phase 2 (backend SPOM vs frontend shell)
- Phase 4 needs Phase 2 (module system) and Phase 3 (SPOM data)
- Phase 5 needs Phase 4 (can't complete sessions without playing them)
- Phase 6 needs Phase 5 (progression based on completed sessions)

---

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| **Session Generation** | Generate on demand | Cache daily sessions | Pre-generate + CDN |
| **Exercise Database** | Load all in memory | Index on pattern/level | Database query + caching |
| **Event Logging** | Sync to DB | Batch writes | Queue (Redis) + async |
| **API** | Single Fastify | Load balancer + replicas | Horizontal scaling |
| **Database** | Single MySQL | Read replicas | Sharding by branch |

---

## Sources

### Official Documentation (HIGH Confidence)
- [Quasar Directory Structure](https://quasar.dev/quasar-cli-vite/directory-structure)
- [Quasar Boot Files](https://quasar.dev/quasar-cli-vite/boot-files)
- [Quasar State Management with Pinia](https://quasar.dev/quasar-cli-vite/state-management-with-pinia)
- [Vue 3 State Management](https://vuejs.org/guide/scaling-up/state-management.html)
- [Vue 3 Provide/Inject](https://vuejs.org/guide/components/provide-inject.html)
- [Vue 3 Plugin System](https://vuejs.org/guide/reusability/plugins.html)
- [Vue Router Lazy Loading](https://router.vuejs.org/guide/advanced/lazy-loading.html)
- [Pinia Composing Stores](https://pinia.vuejs.org/cookbook/composing-stores.html)
- [VueUse useEventBus](https://vueuse.org/core/useEventBus/)
- [Capacitor Development Workflow](https://capacitorjs.com/docs/basics/workflow)
- [Fastify Plugin Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/)
- [Drizzle ORM Schema Declaration](https://orm.drizzle.team/docs/sql-schema-declaration)

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|------------|-----------|
| Project Structure | HIGH | Based on official Quasar documentation |
| Module System | HIGH | Based on Vue 3 plugin patterns + Quasar boot files |
| State Management | HIGH | Official Pinia documentation patterns |
| Event Bus | HIGH | VueUse official documentation |
| Backend Structure | HIGH | Fastify official plugin patterns |
| Database Schema | HIGH | Drizzle ORM documentation |
| Build Order | MEDIUM | Logical from dependencies, not validated empirically |
| Scalability | MEDIUM | Standard patterns, not project-specific validation |

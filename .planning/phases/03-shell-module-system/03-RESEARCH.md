# Phase 3: Shell & Module System - Research

**Researched:** 2026-01-22
**Domain:** Vue 3 + Quasar modular architecture with lazy-loaded plugins
**Confidence:** HIGH

## Summary

A shell and module system in Vue 3 with Quasar is best implemented using **Vue's plugin API** combined with **Vue Router's dynamic route registration** (`router.addRoute()`) and **Vite's automatic code splitting** via dynamic imports. Modules register themselves through a manifest pattern that declares routes, navigation items, and dependencies. The shell provides access to global resources (Pinia stores, API client) through Vue's provide/inject mechanism and Quasar's boot file system.

The standard approach leverages Quasar boot files to discover and register modules before app instantiation, ensuring proper initialization order. Each module is a self-contained Vue plugin with its own routes, components, and stores that can access shell-provided resources. Vite automatically creates separate chunks for lazy-loaded routes, optimizing initial load time.

**Primary recommendation:** Use Quasar boot files for module discovery → Vue plugins for module registration → `router.addRoute()` for dynamic routes → dynamic imports for lazy loading → provide/inject for resource sharing.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vue Router | 4.x | Route management and lazy loading | Built-in support for dynamic route registration via `addRoute()` |
| Pinia | 3.x | State management across modules | Native composability pattern allows stores to access each other safely |
| Vite | 5.x | Build tool with code splitting | Automatic chunk creation for dynamic imports, no configuration needed |
| Quasar Boot Files | 2.x | Pre-instantiation module loading | Execute before Vue app creation, ensuring proper initialization order |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vite:preloadError | Built-in | Dynamic import error handling | Recovery from chunk load failures after deployments |
| Vue provide/inject | Built-in | Dependency injection | Sharing API clients and services to modules |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Quasar boot files | Manual main.js setup | Boot files provide better separation and lifecycle hooks |
| router.addRoute() | Static route configuration | Static routes don't support runtime module registration |
| Plugin pattern | Direct module imports | Plugins standardize module interface and lifecycle |

**Installation:**
```bash
# Already present in the current stack
# No additional dependencies required
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── boot/
│   └── modules.ts           # Module discovery and registration boot file
├── modules/
│   ├── training/
│   │   ├── index.ts         # Module plugin with manifest
│   │   ├── routes.ts        # Module routes (lazy-loaded)
│   │   ├── pages/           # Module pages
│   │   ├── components/      # Module-specific components
│   │   └── stores/          # Module-specific Pinia stores
│   └── [future-modules]/
├── stores/                  # Global/shell stores (auth, user)
├── router/
│   └── index.ts            # Shell router setup
└── layouts/
    └── MainLayout.vue      # Shell layout with navigation
```

### Pattern 1: Module Manifest via Plugin
**What:** Each module exports a Vue plugin with metadata describing its routes, navigation, and requirements.

**When to use:** Always for pluggable modules that need to register themselves with the shell.

**Example:**
```typescript
// Source: https://vuejs.org/guide/reusability/plugins.html
// modules/training/index.ts
import type { Plugin } from 'vue'
import type { Router } from 'vue-router'

export interface ModuleManifest {
  name: string
  label: string
  icon: string
  routes: () => Promise<RouteRecordRaw[]>
}

export const manifest: ModuleManifest = {
  name: 'training',
  label: 'Entrenamiento',
  icon: 'fitness_center',
  routes: () => import('./routes').then(m => m.default)
}

export const trainingModule: Plugin = {
  install(app, options: { router: Router }) {
    const { router } = options

    // Register module routes dynamically
    manifest.routes().then(routes => {
      routes.forEach(route => {
        router.addRoute('home', route) // Add as child of main layout
      })
    })

    // Module can access global services via inject
    // app.provide('trainingService', new TrainingService())
  }
}

export default trainingModule
```

### Pattern 2: Boot File Module Discovery
**What:** Quasar boot file discovers and registers all modules before app instantiation.

**When to use:** Always for module registration to ensure proper initialization order.

**Example:**
```typescript
// Source: https://quasar.dev/quasar-cli-vite/boot-files
// src/boot/modules.ts
import { boot } from 'quasar/wrappers'
import trainingModule from 'src/modules/training'

export default boot(({ app, router }) => {
  // Modules have access to router and can register routes
  app.use(trainingModule, { router })

  // Future modules register here
  // app.use(scheduleModule, { router })
  // app.use(membersModule, { router })
})
```

### Pattern 3: Lazy-Loaded Module Routes
**What:** Module routes use dynamic imports for automatic code splitting.

**When to use:** Always for module routes to minimize initial bundle size.

**Example:**
```typescript
// Source: https://router.vuejs.org/guide/advanced/lazy-loading.html
// modules/training/routes.ts
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'training',
    name: 'training',
    // Dynamic import creates separate chunk automatically
    component: () => import('./pages/TrainingIndex.vue'),
    children: [
      {
        path: 'plans',
        name: 'training-plans',
        component: () => import('./pages/TrainingPlans.vue')
      }
    ]
  }
]

export default routes
```

### Pattern 4: Module Access to Global Stores
**What:** Modules import and use global Pinia stores directly via composition pattern.

**When to use:** When modules need authentication, user profile, or other shell-managed state.

**Example:**
```typescript
// Source: https://pinia.vuejs.org/cookbook/composing-stores.html
// modules/training/pages/TrainingPlans.vue
import { useAuthStore } from 'stores/useAuthStore'
import { useTrainingStore } from '../stores/useTrainingStore'

export default defineComponent({
  setup() {
    // Access global store - works because Pinia instance is shared
    const authStore = useAuthStore()

    // Access module store
    const trainingStore = useTrainingStore()

    // Module store can also access global stores
    // See Pattern 5
  }
})
```

### Pattern 5: Module Store Accessing Global Stores
**What:** Module Pinia stores can compose global stores by calling them in actions/getters.

**When to use:** When module logic needs user context or authentication state.

**Example:**
```typescript
// Source: https://pinia.vuejs.org/cookbook/composing-stores.html
// modules/training/stores/useTrainingStore.ts
import { defineStore } from 'pinia'
import { useAuthStore } from 'stores/useAuthStore'
import { api } from 'boot/axios'

export const useTrainingStore = defineStore('training', () => {
  const plans = ref([])

  async function fetchPlans() {
    // Access global auth store inside action
    const authStore = useAuthStore()

    // API client already has auth interceptor from boot/axios.ts
    // Token is automatically injected
    const response = await api.get('/training/plans')
    plans.value = response.data
  }

  return { plans, fetchPlans }
})
```

### Pattern 6: Navigation Registration
**What:** MainLayout reads module manifests to dynamically build navigation menu.

**When to use:** When modules need to appear in shell navigation.

**Example:**
```typescript
// layouts/MainLayout.vue
import { manifest as trainingManifest } from 'src/modules/training'

const modules = [
  trainingManifest,
  // Future modules added here
]

// Build navigation items from manifests
const navItems = modules.map(m => ({
  label: m.label,
  icon: m.icon,
  to: `/${m.name}`
}))
```

### Anti-Patterns to Avoid
- **Module manifest in separate JSON files:** Keep manifest with module code for type safety and colocation
- **Static route imports:** Always use dynamic imports for module routes to enable code splitting
- **Global store access at module setup time:** Call `useStore()` inside functions/actions, not at module scope
- **Router.replace() in module registration:** Let navigation happen naturally, don't force route changes during module loading

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dynamic route registration | Custom route registry with hot-reload | `router.addRoute()` | Vue Router handles ordering, matching, and removal correctly |
| Code splitting configuration | Manual webpack chunks | Vite automatic splitting | Dynamic imports are automatically chunked with zero config |
| Module load retry logic | Custom chunk retry system | `vite:preloadError` event | Built-in Vite event for handling chunk failures |
| Store dependency injection | Custom DI container | Pinia composing pattern | Native store composition prevents circular dependencies |
| Module lifecycle hooks | Custom event emitter | Vue plugin install() | Standardized, runs at correct initialization phase |
| Navigation guard coordination | Custom guard registry | Vue Router beforeEach | Guards can call stores safely inside guard functions |

**Key insight:** Vue 3 + Quasar + Vite already provide all primitives needed for module systems. Custom abstractions add complexity without benefit.

## Common Pitfalls

### Pitfall 1: Store Access Before Pinia Initialization
**What goes wrong:** Calling `useStore()` at module scope (before Pinia installation) throws errors.

**Why it happens:** Stores require the Pinia instance to be injected first. Module imports execute before boot files.

**How to avoid:**
- Call stores inside functions (actions, guards, setup()) that execute after boot
- Never declare `const store = useStore()` at module top level

**Warning signs:**
- "getActivePinia()" errors
- Store undefined in module imports

**Example:**
```typescript
// ❌ BAD - Called at import time
import { useAuthStore } from 'stores/useAuthStore'
const authStore = useAuthStore() // ERROR: Pinia not installed yet

export const myModule = { /* ... */ }

// ✅ GOOD - Called inside function
import { useAuthStore } from 'stores/useAuthStore'

export const myModule = {
  install(app, { router }) {
    router.beforeEach(() => {
      const authStore = useAuthStore() // SAFE: Pinia installed by now
    })
  }
}
```

### Pitfall 2: Circular Store Dependencies
**What goes wrong:** Two stores that access each other's state in setup functions create infinite loops.

**Why it happens:** Store setup executes synchronously, so mutual state reads never resolve.

**How to avoid:**
- Access other stores only in actions/getters, not setup
- Use computed properties for cross-store reactive values

**Warning signs:**
- Maximum call stack exceeded
- Stores showing undefined properties

**Example:**
```typescript
// ❌ BAD - Circular setup dependency
export const useStoreA = defineStore('a', () => {
  const storeB = useStoreB()
  const value = storeB.someValue // ERROR: Circular read
  return { value }
})

export const useStoreB = defineStore('b', () => {
  const storeA = useStoreA()
  const value = storeA.someValue // ERROR: Circular read
  return { value }
})

// ✅ GOOD - Access in getters/actions
export const useStoreA = defineStore('a', () => {
  const data = ref('a')

  function getValue() {
    const storeB = useStoreB() // SAFE: Called on-demand
    return storeB.data
  }

  return { data, getValue }
})
```

### Pitfall 3: Forgetting to Await Async Routes
**What goes wrong:** Module routes array is empty because async import wasn't awaited.

**Why it happens:** `manifest.routes()` returns Promise, but code registers routes synchronously.

**How to avoid:** Always await route loading before calling `router.addRoute()`.

**Warning signs:**
- Routes don't appear in router.getRoutes()
- Navigation to module routes shows 404

**Example:**
```typescript
// ❌ BAD - No await
manifest.routes().then(routes => {
  routes.forEach(route => router.addRoute(route))
})
// Code continues before routes are loaded

// ✅ GOOD - Proper async handling
await manifest.routes().then(routes => {
  routes.forEach(route => router.addRoute('home', route))
})
```

### Pitfall 4: Module Routes Not Nested Under Layout
**What goes wrong:** Module routes don't show MainLayout or are inaccessible.

**Why it happens:** `router.addRoute(route)` adds top-level routes, bypassing layout hierarchy.

**How to avoid:** Specify parent route name as first parameter to nest properly.

**Warning signs:**
- Module pages render without navigation/header
- Auth guards don't apply to module routes

**Example:**
```typescript
// ❌ BAD - Top-level route
router.addRoute(route) // Renders without MainLayout

// ✅ GOOD - Nested under parent
router.addRoute('home', route) // Renders as child of MainLayout route
```

### Pitfall 5: Vite Barrel Export Circular Dependencies
**What goes wrong:** Using `index.ts` barrel exports causes Vite circular dependency warnings.

**Why it happens:** Barrel exports create implicit module graphs that can form cycles during bundling.

**How to avoid:** Import directly from source files, not through index.ts re-exports.

**Warning signs:**
- Vite build warnings about circular dependencies
- Components undefined at runtime despite correct exports

**Example:**
```typescript
// ❌ BAD - Barrel export
// modules/training/index.ts
export { default as TrainingPage } from './pages/TrainingPage.vue'
export { useTrainingStore } from './stores/useTrainingStore'

// other-file.ts
import { TrainingPage, useTrainingStore } from 'src/modules/training'

// ✅ GOOD - Direct imports
import TrainingPage from 'src/modules/training/pages/TrainingPage.vue'
import { useTrainingStore } from 'src/modules/training/stores/useTrainingStore'
```

## Code Examples

Verified patterns from official sources:

### Quasar Boot File with Proper Lifecycle
```typescript
// Source: https://quasar.dev/quasar-cli-vite/boot-files
// src/boot/modules.ts
import { boot } from 'quasar/wrappers'

export default boot(async ({ app, router }) => {
  // Runs after Pinia installed, before Vue instantiation
  // Perfect timing for module registration

  // Import module (code-split, but boot files can await)
  const trainingModule = await import('src/modules/training')

  // Register with router access
  app.use(trainingModule.default, { router })
})
```

### Module Routes with Vite Automatic Chunking
```typescript
// Source: https://router.vuejs.org/guide/advanced/lazy-loading.html
// modules/training/routes.ts
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'training',
    name: 'training',
    // Vite automatically creates 'TrainingIndex-[hash].js' chunk
    component: () => import('./pages/TrainingIndex.vue'),
    meta: { requiresAuth: true }
  }
]

export default routes
```

### Dynamic Route Registration Pattern
```typescript
// Source: https://router.vuejs.org/guide/advanced/dynamic-routing
// modules/training/index.ts
import type { Plugin } from 'vue'

const trainingModule: Plugin = {
  async install(app, { router }) {
    // Load routes dynamically
    const { default: routes } = await import('./routes')

    // Register each route under 'home' parent (MainLayout)
    routes.forEach(route => {
      router.addRoute('home', route)
    })
  }
}

export default trainingModule
```

### API Client Access in Module
```typescript
// Source: Current codebase pattern (boot/axios.ts)
// modules/training/composables/useTraining.ts
import { api } from 'boot/axios'

export function useTraining() {
  async function fetchPlans() {
    // api instance already has auth interceptor
    // Token automatically injected from localStorage
    const response = await api.get('/training/plans')
    return response.data
  }

  return { fetchPlans }
}
```

### Error Handling for Chunk Load Failures
```typescript
// Source: https://vite.dev/guide/build.html
// router/index.ts or boot/modules.ts
window.addEventListener('vite:preloadError', (event) => {
  // Chunk failed to load (e.g., after deployment with cleared old chunks)
  console.error('Module failed to load:', event)

  // Reload page to get fresh chunks
  window.location.reload()
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Webpack code splitting with magic comments | Vite automatic splitting via dynamic imports | Vite 2.0 (2021) | Zero configuration needed, works out of box |
| Vue CLI with Vue 2 | Quasar CLI with Vue 3 + Vite | Quasar 2.0 (2022) | Faster builds, better dev experience |
| Vuex modules | Pinia stores with composition | Pinia 2.0 (2022) | Better TypeScript, simpler API |
| router.addRoutes() | router.addRoute() | Vue Router 4.0 (2021) | Singular form for better control |

**Deprecated/outdated:**
- `router.addRoutes()`: Removed in Vue Router 4, use `addRoute()` singular form
- Webpack magic comments for chunk naming: Still works but Vite uses natural names from import paths
- Vue 2 plugin pattern with Vue global: Use app instance in Vue 3
- Vuex modules: Pinia stores are preferred, simpler API with better TypeScript

## Open Questions

Things that couldn't be fully resolved:

1. **Module loading order dependencies**
   - What we know: Boot files execute in order specified in quasar.config.js
   - What's unclear: Best practice when Module B depends on Module A being loaded first
   - Recommendation: Modules should be independent; if ordering matters, handle in single boot file

2. **Module hot-reload during development**
   - What we know: Vite HMR works for components and routes
   - What's unclear: Whether newly added modules auto-register without restart
   - Recommendation: Assume dev restart needed for new modules, optimize dev experience later

3. **Module unloading/disabling at runtime**
   - What we know: `router.removeRoute()` exists for dynamic removal
   - What's unclear: Whether module disable/enable is needed for this phase
   - Recommendation: Defer to future phase if admin module management needed

## Sources

### Primary (HIGH confidence)
- [Vue Router Lazy Loading](https://router.vuejs.org/guide/advanced/lazy-loading.html) - Official lazy loading patterns
- [Vue Router Dynamic Routing](https://router.vuejs.org/guide/advanced/dynamic-routing) - router.addRoute() documentation
- [Vue 3 Plugins](https://vuejs.org/guide/reusability/plugins.html) - Plugin install() pattern
- [Pinia Composing Stores](https://pinia.vuejs.org/cookbook/composing-stores.html) - Store access patterns
- [Pinia Outside Components](https://pinia.vuejs.org/core-concepts/outside-component-usage.html) - Store timing requirements
- [Quasar Boot Files](https://quasar.dev/quasar-cli-vite/boot-files) - Boot file lifecycle and usage
- [Vite Build Guide](https://vite.dev/guide/build.html) - Code splitting and chunk configuration

### Secondary (MEDIUM confidence)
- [Vue 3 Architecture 2026](https://fivejars.com/insights/vue-nuxt-vite-status-for-2026-risks-priorities-architecture-updates/) - Ecosystem status
- [Modular Vue 3 Architecture](https://medium.com/@darwishdev.com/building-scalable-vue-js-applications-a-modular-approach-11287e7a674c) - Module organization patterns
- [Vue 3 Micro Frontends](https://dev.to/lmlonghuynh/building-a-micro-frontend-architecture-with-vue-3-vite-and-module-federation-1bb1) - Advanced module patterns

### Tertiary (LOW confidence)
- [Vite Circular Dependencies](https://github.com/vitejs/vite/discussions/14090) - Build-time circular dependency warnings (GitHub discussion)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All packages are already in use (Vue Router 4, Pinia 3, Vite 5, Quasar 2)
- Architecture: HIGH - Patterns verified from official documentation
- Pitfalls: HIGH - Based on official docs warnings and common issues

**Research date:** 2026-01-22
**Valid until:** 2026-02-22 (30 days - stable ecosystem)

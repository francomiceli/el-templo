# Phase 14: Admin Session Review UI - Research

**Researched:** 2026-02-05
**Domain:** Quasar Vue 3 Admin App, Session Review Workflow
**Confidence:** HIGH

## Summary

This research covers building a separate Quasar SPA for admin session review. The admin app is architecturally independent from the member app but shares the same API backend with role-based access control. Key areas researched include: Quasar project scaffolding, QTable for session lists with filtering/sorting, QTabs for day navigation, approval workflow state management, and database schema extensions for session status tracking.

The existing project provides excellent patterns to follow: Pinia composition API stores, axios with interceptors, JWT authentication with role checking, and Fastify module-based routes. The admin app can reuse these patterns while establishing its own codebase for simplified maintenance.

**Primary recommendation:** Create a new Quasar SPA in `el-templo-admin/` using QTable with server-side pagination for session lists, QTabs for day navigation, and extend the sessions table with status/approval columns. The admin app connects to the same API with admin-specific endpoints that check role permissions.

## Standard Stack

The established libraries/tools for this phase:

### Core (Same as Member App)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Quasar Framework | ^2.18.x | Vue 3 UI framework | Project standard, 70+ Material components |
| Vue 3 | ^3.5+ | Reactive UI framework | Composition API, script setup |
| TypeScript | ^5.5+ | Type safety | Project standard |
| Pinia | ^2.2+ | State management | Vue official recommendation |
| Axios | ^1.7+ | HTTP client | Interceptors for auth |
| Vite | ^5.x | Build tool | Fast dev server, tree-shaking |

### Admin-Specific UI Components (Built-in Quasar)
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| QTable | Session list with pagination, filtering, sorting | Main sessions view |
| QTabs + QTabPanels | Day-by-day navigation | Daily tab navigation |
| QExpansionItem | Week grouping, algorithm details toggle | Collapsible sections |
| QBadge | Status indicators, pending count | Visual status markers |
| QDialog (plugin) | Confirmation dialogs | Bulk approve, discard confirm |
| QChip | Format type badges, contraction labels | Metadata display |
| QBanner | Low session alert | Warning when running low |

### Not Needed for Admin App
| Library | Why Not |
|---------|---------|
| Capacitor | Web-only admin app (per CONTEXT.md: mobile browser support, not native app) |
| @capacitor/preferences | Use localStorage directly for web-only |
| @vueuse/core | Minimal utility needs, avoid extra dependency |

**Installation for new admin project:**
```bash
# Create new Quasar project
npm create quasar

# In el-templo-admin/
npm install pinia axios
npm install -D typescript @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
el-templo-admin/
├── src/
│   ├── boot/
│   │   ├── axios.ts           # API client with auth interceptor
│   │   ├── auth.ts            # Auth store initialization
│   │   └── pinia.ts           # Pinia initialization
│   │
│   ├── router/
│   │   ├── index.ts           # Router instance
│   │   └── routes.ts          # Route definitions with guards
│   │
│   ├── stores/
│   │   ├── useAuthStore.ts    # Authentication state
│   │   └── useAdminStore.ts   # Admin-specific state (pending count, alerts)
│   │
│   ├── pages/
│   │   ├── LoginPage.vue      # Admin login
│   │   ├── SessionsPage.vue   # Main sessions list
│   │   ├── SessionDetailPage.vue  # Single session review
│   │   ├── DiscardedPage.vue  # Discarded sessions bucket
│   │   └── GeneratePage.vue   # Session generation trigger
│   │
│   ├── components/
│   │   ├── sessions/
│   │   │   ├── SessionsTable.vue     # QTable with filters
│   │   │   ├── SessionRow.vue        # Row detail display
│   │   │   ├── DayTabs.vue           # Mon-Sat tabs
│   │   │   ├── WeekAccordion.vue     # Expandable week groups
│   │   │   ├── BlockCard.vue         # Block detail display
│   │   │   └── StatusBadge.vue       # pending/approved/auto-approved
│   │   │
│   │   ├── dialogs/
│   │   │   ├── ApproveConfirmDialog.vue   # Bulk approve confirmation
│   │   │   ├── DiscardDialog.vue          # Discard with optional reason
│   │   │   └── RegenerateDialog.vue       # Regeneration options
│   │   │
│   │   └── layout/
│   │       ├── AdminHeader.vue
│   │       └── AdminDrawer.vue
│   │
│   ├── composables/
│   │   ├── useSessionsApi.ts        # Sessions CRUD operations
│   │   └── usePendingCount.ts       # Pending badge count polling
│   │
│   ├── types/
│   │   ├── session.ts               # Session types (duplicated from API)
│   │   └── admin.ts                 # Admin-specific types
│   │
│   └── layouts/
│       └── AdminLayout.vue          # Clean admin layout
│
├── quasar.config.js
└── package.json
```

### Pattern 1: Session Status Model
**What:** Three-state workflow: pending_review -> approved | discarded
**When to use:** All session status transitions

The status model matches CONTEXT.md decisions:
- Generated sessions start as `pending_review`
- Admin actions: approve, discard (with optional reason), revert (approved -> pending)
- Auto-approve sets `approved_by_system: true` to distinguish from manual approval

```typescript
// types/admin.ts
export type SessionStatus = 'pending_review' | 'approved' | 'discarded';

export interface AdminSession {
  id: number;
  dayId: string;
  week: number;
  day: string;
  levelGroup: string;
  memberLevel: string;
  status: SessionStatus;
  approvedAt: string | null;
  approvedBy: number | null;     // User ID of approving admin
  approvedBySystem: boolean;     // True if auto-approved
  discardedAt: string | null;
  discardedReason: string | null;
  blocks: AdminBlock[];
}

export interface AdminBlock {
  blockId: string;
  role: string;
  route: string;
  format: string;
  intensity: number;
  repsBudget: number;
  exerciseCount: number;
  avgDifficulty: number;         // Algorithm transparency
  contractionMix: string;        // e.g., "2 CON, 1 EXC, 1 ISO"
  exercises: AdminExercise[];
}
```

### Pattern 2: QTable with Server-Side Operations
**What:** Session list with server-side pagination, filtering, sorting
**When to use:** SessionsTable component

```typescript
// Source: https://quasar.dev/vue-components/table/
// composables/useSessionsApi.ts
export function useSessionsApi() {
  const loading = ref(false);
  const sessions = ref<AdminSession[]>([]);
  const pagination = ref({
    sortBy: 'day',
    descending: false,
    page: 1,
    rowsPerPage: 20,
    rowsNumber: 0
  });

  async function fetchSessions(props: {
    pagination: typeof pagination.value;
    filter: SessionFilter;
  }) {
    loading.value = true;
    try {
      const { data } = await api.get('/admin/sessions', {
        params: {
          page: props.pagination.page,
          limit: props.pagination.rowsPerPage,
          sortBy: props.pagination.sortBy,
          descending: props.pagination.descending,
          ...props.filter
        }
      });
      sessions.value = data.sessions;
      pagination.value.rowsNumber = data.total;
    } finally {
      loading.value = false;
    }
  }

  return { loading, sessions, pagination, fetchSessions };
}
```

### Pattern 3: Day Tabs with Level Groups
**What:** Tab per day showing level groups within
**When to use:** DayTabs component

```vue
<!-- Source: https://quasar.dev/vue-components/tabs/ -->
<template>
  <q-tabs v-model="selectedDay" align="justify" narrow-indicator>
    <q-tab name="lunes" label="Lun" />
    <q-tab name="martes" label="Mar" />
    <q-tab name="miercoles" label="Mie" />
    <q-tab name="jueves" label="Jue" />
    <q-tab name="viernes" label="Vie" />
    <q-tab name="sabado" label="Sab" />
  </q-tabs>

  <q-tab-panels v-model="selectedDay" animated>
    <q-tab-panel v-for="day in days" :key="day" :name="day">
      <level-group-sessions :week="selectedWeek" :day="day" />
    </q-tab-panel>
  </q-tab-panels>
</template>
```

### Pattern 4: Confirmation Dialogs
**What:** Dialog plugin for approve/discard confirmation
**When to use:** Bulk actions, destructive operations

```typescript
// Source: https://quasar.dev/quasar-plugins/dialog/
import { useQuasar } from 'quasar';

function confirmBulkApprove(count: number) {
  $q.dialog({
    title: 'Aprobar Sesiones',
    message: `Aprobar ${count} sesiones pendientes para este dia?`,
    cancel: true,
    persistent: true
  }).onOk(async () => {
    await approveSessions(selectedSessionIds.value);
    $q.notify({ type: 'positive', message: 'Sesiones aprobadas' });
  });
}
```

### Anti-Patterns to Avoid

- **Shared codebase with member app:** Per CONTEXT.md, admin is fully separate. Do not try to share code between apps; duplicate types as needed for cleaner maintenance.

- **Complex state machines:** Simple status column with enum is sufficient. XState adds unnecessary complexity for this linear workflow.

- **Polling for real-time updates:** Per CONTEXT.md, manual refresh button only. Do not implement auto-refresh.

- **Editing in list view:** Phase 14 is view/approve only. Session editing is Phase 15.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Data table with pagination | Custom table component | QTable | Built-in server-side pagination, sorting, filtering |
| Confirmation dialogs | Custom modal component | Quasar Dialog plugin | Promise-based API, consistent styling |
| Tab navigation | Custom tab system | QTabs + QTabPanels | Built-in, animated, mobile-friendly |
| Collapsible sections | Custom accordion | QExpansionItem | Group mode, animation, accessibility |
| Status badges | Custom styled spans | QBadge | Floating, colors, consistent sizing |
| Date/time handling | Custom date parsing | date-fns or Intl | Timezone handling, localization |

**Key insight:** Quasar provides all needed UI components. Focus implementation effort on business logic (approval workflow, generation triggers) not UI primitives.

## Common Pitfalls

### Pitfall 1: Timezone Confusion
**What goes wrong:** Sessions display on wrong day when admin timezone differs from branch timezone
**Why it happens:** Dates stored as strings (YYYY-MM-DD) without timezone context
**How to avoid:**
- Store dates as ISO strings with timezone: `2026-02-05T00:00:00-03:00`
- Display relative to branch timezone (from branches table)
- CONTEXT.md specifies branch-specific timezone for past/current/future determination
**Warning signs:** "Yesterday's session" showing on wrong day

### Pitfall 2: Role Check Only on Frontend
**What goes wrong:** Non-admin users access admin endpoints via direct API calls
**Why it happens:** Relying solely on UI hiding of admin features
**How to avoid:**
- Check `request.user.role` on every admin endpoint
- Return 403 Forbidden, not 401 Unauthorized
- Existing pattern in sessions routes shows role check
**Warning signs:** Admin-only data visible in network requests

### Pitfall 3: Bulk Operations Without Transaction
**What goes wrong:** Partial approval - some sessions approved, others fail
**Why it happens:** Individual INSERT/UPDATE statements without transaction
**How to avoid:**
- Wrap bulk operations in database transaction
- Drizzle supports transactions: `db.transaction(async (tx) => { ... })`
- Roll back entire batch on any failure
**Warning signs:** "5 of 12 sessions approved" error messages

### Pitfall 4: N+1 Query for Session Details
**What goes wrong:** Session list is slow, one query per session for blocks/exercises
**Why it happens:** Loading blocks/exercises separately for each session
**How to avoid:**
- Use Drizzle relations or JOIN queries
- Load summary data only in list view
- Fetch full details only when viewing single session
**Warning signs:** Network waterfall of API calls in list view

### Pitfall 5: Stale Pending Count Badge
**What goes wrong:** Badge shows wrong count after approvals
**Why it happens:** Badge count not updated after status changes
**How to avoid:**
- Fetch pending count after any status mutation
- Use Pinia action that updates count after approve/discard
- Or compute from store's sessions array if all loaded
**Warning signs:** Badge says "5 pending" but list shows 0

## Code Examples

Verified patterns from existing codebase and Quasar documentation:

### Admin API Endpoint Pattern
```typescript
// Source: el-templo-api/src/modules/sessions/routes.ts pattern
// New admin routes would follow same structure

export const adminSessionRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /admin/sessions - List with filters
  fastify.get('/sessions', {
    onRequest: [fastify.authenticate],
    schema: getAdminSessionsSchema,
  }, async (request, reply) => {
    // Role check
    if (!['admin', 'superadmin', 'coach'].includes(request.user.role)) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const { week, day, levelGroup, status, page, limit, sortBy } = request.query;
    // Query sessions with filters and pagination
    const sessions = await sessionService.getAdminSessions({
      week, day, levelGroup, status, page, limit, sortBy
    });
    return sessions;
  });

  // POST /admin/sessions/:id/approve
  fastify.post('/sessions/:id/approve', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    if (!['admin', 'superadmin', 'coach'].includes(request.user.role)) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const { id } = request.params;
    await sessionService.approveSession(id, request.user.userId);
    return { success: true };
  });

  // POST /admin/sessions/:id/discard
  fastify.post('/sessions/:id/discard', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    if (!['admin', 'superadmin', 'coach'].includes(request.user.role)) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const { id } = request.params;
    const { reason } = request.body;  // Optional rejection notes
    await sessionService.discardSession(id, request.user.userId, reason);
    return { success: true };
  });
};
```

### Database Schema Extension
```typescript
// Source: el-templo-api/src/db/schema/sessions.ts extension
import { mysqlTable, int, varchar, timestamp, json, index, boolean } from 'drizzle-orm/mysql-core';

export const sessions = mysqlTable('sessions', {
  id: int('id').primaryKey().autoincrement(),
  dayId: varchar('day_id', { length: 50 }).notNull().unique(),
  week: int('week').notNull(),
  day: varchar('day', { length: 20 }).notNull(),
  levelGroup: varchar('level_group', { length: 20 }).notNull(),
  memberLevel: varchar('member_level', { length: 20 }),
  blockCount: int('block_count').notNull(),
  traceJson: json('trace_json'),

  // New columns for admin workflow
  status: varchar('status', { length: 20 }).default('pending_review').notNull(),
  approvedAt: timestamp('approved_at'),
  approvedBy: int('approved_by').references(() => users.id),
  approvedBySystem: boolean('approved_by_system').default(false),
  discardedAt: timestamp('discarded_at'),
  discardedReason: text('discarded_reason'),

  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('sessions_week_day_level_idx').on(table.week, table.day, table.levelGroup),
  index('sessions_status_idx').on(table.status),
]);
```

### Auth Store for Admin App
```typescript
// Source: el-templo-app/src/stores/useAuthStore.ts pattern
// Duplicated and simplified for admin app

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../boot/axios';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('adminToken'));
  const user = ref<AdminUser | null>(null);

  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const isAdmin = computed(() =>
    user.value?.role && ['admin', 'superadmin', 'coach'].includes(user.value.role)
  );

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password });
    // Verify admin role before accepting login
    if (!['admin', 'superadmin', 'coach'].includes(data.user.role)) {
      throw new Error('Acceso denegado. Solo administradores.');
    }
    token.value = data.token;
    user.value = data.user;
    localStorage.setItem('adminToken', data.token);
  }

  async function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('adminToken');
  }

  return { token, user, isAuthenticated, isAdmin, login, logout };
});
```

### Sessions Table Component
```vue
<!-- Pattern from Quasar docs + project conventions -->
<template>
  <q-table
    :rows="sessions"
    :columns="columns"
    row-key="id"
    :loading="loading"
    :pagination="pagination"
    @request="onRequest"
    binary-state-sort
  >
    <!-- Status column with badge -->
    <template #body-cell-status="props">
      <q-td :props="props">
        <status-badge :status="props.row.status" :by-system="props.row.approvedBySystem" />
      </q-td>
    </template>

    <!-- Actions column -->
    <template #body-cell-actions="props">
      <q-td :props="props" class="q-gutter-xs">
        <q-btn
          v-if="props.row.status === 'pending_review'"
          flat
          dense
          color="positive"
          icon="check"
          @click="approve(props.row.id)"
        />
        <q-btn
          v-if="props.row.status !== 'discarded'"
          flat
          dense
          color="negative"
          icon="delete"
          @click="showDiscardDialog(props.row.id)"
        />
        <q-btn
          flat
          dense
          icon="visibility"
          @click="viewDetails(props.row.id)"
        />
      </q-td>
    </template>
  </q-table>
</template>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vuex for state | Pinia | 2022 | Simpler API, better TS support |
| Options API | Composition API + script setup | Vue 3.2 | Cleaner code, better type inference |
| Separate Vue CLI admin | Same Quasar stack as member | N/A | Consistency, shared knowledge |
| Real-time updates | Manual refresh | Per CONTEXT.md | Simpler, avoids WebSocket complexity |

**Deprecated/outdated:**
- Vuex: Replaced by Pinia as official Vue 3 state management
- Options API: Still supported but Composition API preferred for new code
- @fastify/jwt v5: Current project uses @fastify/jwt, verify version compatibility

## Open Questions

Things that couldn't be fully resolved:

1. **Branch timezone storage**
   - What we know: CONTEXT.md requires branch-specific timezone
   - What's unclear: Current `branches` table has no timezone column
   - Recommendation: Add `timezone` varchar column (e.g., 'America/Argentina/Buenos_Aires') in Phase 14 schema migration

2. **Auto-approve cron job**
   - What we know: CONTEXT.md specifies auto-approve by midnight before session day
   - What's unclear: Where to run the cron (API server, separate process)
   - Recommendation: Use node-cron in API server, similar to existing patterns. Schedule daily at 23:59 branch timezone.

3. **In-progress session protection**
   - What we know: CONTEXT.md specifies members mid-workout keep original session
   - What's unclear: How to track "in-progress" state
   - Recommendation: Check `completed_sessions.started_at` without `completed_at` to identify in-progress sessions. Regeneration should not affect these.

## Sources

### Primary (HIGH confidence)
- [Quasar Table Component](https://quasar.dev/vue-components/table/) - Server-side pagination, filtering, slots
- [Quasar Tabs Component](https://quasar.dev/vue-components/tabs/) - Tab navigation patterns
- [Quasar Dialog Plugin](https://quasar.dev/quasar-plugins/dialog/) - Confirmation dialogs
- [Quasar Expansion Item](https://quasar.dev/vue-components/expansion-item/) - Collapsible sections
- Existing codebase: `el-templo-api/src/modules/sessions/routes.ts` - API patterns
- Existing codebase: `el-templo-app/src/stores/useAuthStore.ts` - Pinia patterns

### Secondary (MEDIUM confidence)
- [Vue 3 State Management](https://vuejs.org/guide/scaling-up/state-management.html) - Pinia recommendation
- [Quasar Admin Templates](https://github.com/pratik227/quasar-admin) - Layout patterns
- [Dev.to User Roles Quasar](https://dev.to/rachel_cheuk/part-1-user-roles-and-management-quasar-8jp) - Role-based access patterns

### Tertiary (LOW confidence)
- WebSearch results on workflow patterns - General guidance, verify with docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Same as existing member app, well-documented
- Architecture: HIGH - Follows existing project patterns
- UI components: HIGH - All built-in Quasar components
- Database schema: MEDIUM - Extension of existing schema, needs verification of migration approach
- Auto-approve logic: MEDIUM - Cron pattern clear, timezone handling needs validation

**Research date:** 2026-02-05
**Valid until:** 60 days (stable Quasar patterns, minimal external dependencies)

# Phase 12: Progression & Coach Functions - Research

**Researched:** 2026-01-29
**Domain:** Vue 3 charting, Drizzle aggregations, member progression tracking
**Confidence:** HIGH

## Summary

This research covers the technical implementation of the "Mi Camino" page - a member-facing progression tracking system combining profile information, level display, RPE trend visualization, training stats, and coach evaluation requests. The scope has been narrowed from the original roadmap: coach management functions (member list, promotions, block overrides) are deferred to a future phase.

The standard approach uses:
1. **vue-chart-3** with Chart.js 4 for RPE line chart visualization
2. **Drizzle ORM aggregations** using `avg()`, `count()`, and date range filtering on the existing `completed_sessions` table
3. **Pinia composition API store** for progression state management
4. **Quasar QBadge** with `floating` prop for evaluation eligibility notification
5. New API endpoint `/api/progression/stats` to aggregate training data

**Primary recommendation:** Create a single "Mi Camino" page that fetches all progression data in one API call, then visualizes with vue-chart-3 for the RPE trend chart. Use existing completed_sessions table without schema changes; all needed data (RPE, dates, userId) already exists.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vue-chart-3 | latest | Chart.js 4 wrapper for Vue 3 | TypeScript-first, Composition API native, tree-shakable |
| chart.js | 4.x | Underlying chart rendering | Industry standard, lightweight, well-documented |
| Quasar QBadge | Built-in | Notification indicator on nav item | Already in project, supports floating badges |
| Drizzle ORM | 0.45.1 | Database aggregation queries | Already in project, supports avg(), count(), groupBy |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Pinia | 3.0.4 | Progression state management | Store user stats, evaluation eligibility |
| date-fns | optional | Date calculations (week start, streak) | If complex date math needed; otherwise use native |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vue-chart-3 | vue-chartjs | Both viable; vue-chart-3 has better TypeScript/Composition API |
| vue-chart-3 | ApexCharts | ApexCharts heavier but more chart types; overkill for simple line chart |
| Custom chart | vue-chart-3 | Don't hand-roll; canvas rendering is complex |

**Installation:**
```bash
cd el-templo-app
pnpm add vue-chart-3 chart.js
```

## Architecture Patterns

### Recommended Project Structure
```
el-templo-app/src/
├── modules/
│   └── progression/
│       ├── pages/
│       │   └── MiCamino.vue          # Main page combining all sections
│       ├── components/
│       │   ├── LevelDisplay.vue      # Greek letter + level name badge
│       │   ├── RpeTrendChart.vue     # Line chart wrapper
│       │   ├── TrainingStats.vue     # Stats cards (cumulative + recent)
│       │   └── EvaluationRequest.vue # Request button + status
│       ├── stores/
│       │   └── progressionStore.ts   # Stats, eligibility, request state
│       ├── composables/
│       │   └── useProgressionApi.ts  # API calls for progression data
│       └── routes.ts                 # /mi-camino route

el-templo-api/src/
├── modules/
│   └── progression/
│       ├── routes.ts                 # GET /stats, POST /request-evaluation
│       ├── service.ts                # Business logic, threshold checks
│       └── schemas.ts                # Request/response validation
```

### Pattern 1: Progression Stats API Response
**What:** Single endpoint returns all progression data the frontend needs
**When to use:** Initial page load for Mi Camino
**Example:**
```typescript
// API Response shape for GET /api/progression/stats
interface ProgressionStatsResponse {
  level: {
    current: 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan';
    displayName: string;    // "Delta"
    greekLetter: string;    // "Δ"
  };
  stats: {
    totalSessions: number;      // All-time completed sessions
    totalDaysTrained: number;   // Unique dates trained
    sessionsThisWeek: number;   // Sessions in current week
    currentStreak: number;      // Consecutive training days
  };
  rpeTrend: {
    labels: string[];    // ["Jan 6", "Jan 7", ...] for last 4 weeks
    data: (number | null)[];  // RPE values, null for days without sessions
    averageRpe: number;  // Average over period
  };
  evaluation: {
    eligible: boolean;        // RPE <= 6 for 2+ weeks
    averageRpeLast2Weeks: number | null;
    pendingRequest: boolean;  // Request already submitted
    requestedAt: string | null;
  };
}
```

### Pattern 2: Drizzle Aggregation for RPE Stats
**What:** Query completed_sessions with avg() and date filtering
**When to use:** Building the progression stats endpoint
**Example:**
```typescript
// Source: https://orm.drizzle.team/docs/select
import { eq, gte, lte, sql, count, avg } from 'drizzle-orm';
import * as schema from '../../db/schema';

// Get average RPE for last 2 weeks
const twoWeeksAgo = new Date();
twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];

const [avgResult] = await db
  .select({
    avgRpe: sql<number>`CAST(AVG(${schema.completedSessions.rpe}) AS DECIMAL(3,1))`,
    sessionCount: count(),
  })
  .from(schema.completedSessions)
  .where(
    and(
      eq(schema.completedSessions.userId, userId),
      gte(schema.completedSessions.date, twoWeeksAgoStr),
      sql`${schema.completedSessions.rpe} IS NOT NULL`
    )
  );

// Get RPE trend data (daily values for chart)
const fourWeeksAgo = new Date();
fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
const fourWeeksAgoStr = fourWeeksAgo.toISOString().split('T')[0];

const rpeData = await db
  .select({
    date: schema.completedSessions.date,
    rpe: schema.completedSessions.rpe,
  })
  .from(schema.completedSessions)
  .where(
    and(
      eq(schema.completedSessions.userId, userId),
      gte(schema.completedSessions.date, fourWeeksAgoStr)
    )
  )
  .orderBy(schema.completedSessions.date);
```

### Pattern 3: Vue-Chart-3 Line Chart Setup
**What:** Register Chart.js components and create reactive line chart
**When to use:** RpeTrendChart component
**Example:**
```typescript
// Source: https://vue-chart-3.netlify.app/guide/
<template>
  <LineChart
    :chart-data="chartData"
    :options="chartOptions"
    :height="200"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js';
import { LineChart } from 'vue-chart-3';

// Register required Chart.js components (tree-shaking)
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler
);

const props = defineProps<{
  labels: string[];
  data: (number | null)[];
}>();

const chartData = computed(() => ({
  labels: props.labels,
  datasets: [{
    label: 'RPE',
    data: props.data,
    fill: true,
    backgroundColor: 'rgba(184, 149, 108, 0.1)', // Bronze with opacity
    borderColor: '#b8956c',                       // Bronze solid
    borderWidth: 2,
    pointBackgroundColor: '#2c3e5c',              // Navy
    pointBorderColor: '#b8956c',
    pointRadius: 4,
    tension: 0.3,  // Smooth curve
    spanGaps: true, // Connect across null values
  }],
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: { display: false },
  },
  scales: {
    y: {
      min: 1,
      max: 10,
      ticks: {
        stepSize: 2,
        color: '#8E8E8E', // Gris Piedra
      },
      grid: {
        color: 'rgba(44, 62, 92, 0.1)',
      },
    },
    x: {
      ticks: {
        color: '#8E8E8E',
        maxRotation: 45,
      },
      grid: { display: false },
    },
  },
};
</script>
```

### Pattern 4: Evaluation Request Table Schema
**What:** New table to track evaluation requests
**When to use:** Persist request status between coach processing
**Example:**
```typescript
// New schema: src/db/schema/evaluation-requests.ts
import { mysqlTable, int, varchar, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';
import { users } from './users';

export const evaluationRequestStatus = mysqlEnum('status', ['pending', 'approved', 'denied']);

export const evaluationRequests = mysqlTable('evaluation_requests', {
  id: int('id').primaryKey().autoincrement(),
  userId: int('user_id').notNull().references(() => users.id),
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  status: evaluationRequestStatus.default('pending').notNull(),
  averageRpeAtRequest: int('average_rpe_at_request'), // Store snapshot
  processedAt: timestamp('processed_at'),
  processedBy: int('processed_by').references(() => users.id), // Coach who processed
  notes: varchar('notes', { length: 500 }), // Coach notes on decision
});
```

### Pattern 5: Notification Badge on Navigation
**What:** Show badge on Mi Camino nav item when eligible for evaluation
**When to use:** MainLayout drawer navigation
**Example:**
```vue
<!-- MainLayout.vue drawer item -->
<q-item clickable to="/mi-camino">
  <q-item-section avatar>
    <q-icon name="trending_up">
      <q-badge
        v-if="progressionStore.evaluationEligible"
        color="secondary"
        floating
        rounded
      />
    </q-icon>
  </q-item-section>
  <q-item-section>Mi Camino</q-item-section>
</q-item>
```

### Pattern 6: Streak Calculation Logic
**What:** Calculate consecutive training days
**When to use:** In progression service
**Example:**
```typescript
// Streak calculation: consecutive calendar days with sessions
function calculateStreak(sessions: { date: string }[]): number {
  if (sessions.length === 0) return 0;

  // Sort by date descending (most recent first)
  const sortedDates = sessions
    .map(s => s.date)
    .sort((a, b) => b.localeCompare(a));

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Check if most recent session is today or yesterday
  const mostRecent = sortedDates[0];
  if (mostRecent !== today && mostRecent !== yesterday) {
    return 0; // Streak broken
  }

  // Count consecutive days
  let streak = 1;
  let currentDate = new Date(mostRecent);

  for (let i = 1; i < sortedDates.length; i++) {
    const expectedDate = new Date(currentDate);
    expectedDate.setDate(expectedDate.getDate() - 1);
    const expectedStr = expectedDate.toISOString().split('T')[0];

    if (sortedDates[i] === expectedStr) {
      streak++;
      currentDate = expectedDate;
    } else {
      break;
    }
  }

  return streak;
}
```

### Anti-Patterns to Avoid
- **Fetching RPE data on every component mount:** Fetch once in page, pass down via props or store
- **Computing averages in frontend:** Do aggregations in database for accuracy and performance
- **Hardcoding threshold values:** Define eligibility threshold (RPE <= 6, 2 weeks) as constants
- **Large chart.js bundle:** Use tree-shaking, only register components actually used
- **Multiple API calls for stats:** Combine all stats into single endpoint response

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line chart rendering | Canvas drawing code | vue-chart-3 + Chart.js | Complex math, responsive handling, touch interaction |
| Date aggregations | JavaScript loops | Drizzle SQL avg(), groupBy | Database is faster, more accurate |
| Chart responsiveness | Manual resize listeners | Chart.js responsive: true | Handles edge cases, debouncing built-in |
| Greek letter mapping | Unicode lookup each time | Pre-defined constant map | Simpler, no runtime lookup errors |

**Key insight:** RPE trend visualization and stat aggregation are well-solved problems. Chart.js handles canvas rendering complexities; Drizzle handles SQL aggregation. Focus implementation effort on the business logic (eligibility thresholds, request flow).

## Common Pitfalls

### Pitfall 1: Chart.js Bundle Size
**What goes wrong:** Importing all of Chart.js increases bundle by ~200KB
**Why it happens:** Not using tree-shaking, importing from 'chart.js' directly
**How to avoid:**
- Import only needed components: `CategoryScale, LinearScale, LineElement, PointElement`
- Register explicitly with `Chart.register()`
- Don't use `import Chart from 'chart.js/auto'`
**Warning signs:** Bundle analyzer shows chart.js as large chunk

### Pitfall 2: Null RPE Values in Average
**What goes wrong:** Average includes null as 0, skewing results low
**Why it happens:** Not filtering out null RPE values in SQL query
**How to avoid:**
- Add `WHERE rpe IS NOT NULL` to aggregation queries
- Use `sql\`${column} IS NOT NULL\`` in Drizzle where clause
**Warning signs:** Average RPE suspiciously low (many users skip RPE rating)

### Pitfall 3: Timezone Issues with Date Comparisons
**What goes wrong:** Sessions on boundary dates included/excluded incorrectly
**Why it happens:** Comparing UTC dates with local dates
**How to avoid:**
- Store dates as YYYY-MM-DD strings (no timezone component)
- Do date comparisons in application code with consistent format
- Current schema uses `date: varchar('date', { length: 10 })` - correct approach
**Warning signs:** Stats different in different timezones

### Pitfall 4: Reactive Chart Not Updating
**What goes wrong:** Chart doesn't re-render when data changes
**Why it happens:** Chart.js caches data, needs explicit update
**How to avoid:**
- Use computed() for chartData in vue-chart-3
- Component handles reactivity automatically in vue-chart-3
- If using vue-chartjs, may need manual chart.update()
**Warning signs:** Data changes but chart stays the same

### Pitfall 5: Evaluation Request Race Condition
**What goes wrong:** User submits multiple requests before first completes
**Why it happens:** No debouncing, no optimistic UI state
**How to avoid:**
- Disable button immediately on click (loading state)
- Check for pending request before allowing new one
- Store tracks `requestPending: boolean` locally
**Warning signs:** Multiple evaluation_requests rows for same user

### Pitfall 6: Nav Badge Flickers on Page Load
**What goes wrong:** Badge briefly shows then disappears (or vice versa)
**Why it happens:** Store loads asynchronously, initial state incorrect
**How to avoid:**
- Initialize store eligibility as `null` (unknown), not `false`
- Only render badge when `eligibility !== null && eligibility === true`
- Load eligibility status on app mount (auth boot file)
**Warning signs:** Badge appears/disappears on navigation

## Code Examples

### Progression Store (Pinia Composition API)
```typescript
// Source: Existing pattern from weekStore.ts
// src/modules/progression/stores/progressionStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface ProgressionStats {
  totalSessions: number;
  totalDaysTrained: number;
  sessionsThisWeek: number;
  currentStreak: number;
}

export interface RpeTrend {
  labels: string[];
  data: (number | null)[];
  averageRpe: number;
}

export interface EvaluationStatus {
  eligible: boolean;
  averageRpeLast2Weeks: number | null;
  pendingRequest: boolean;
  requestedAt: string | null;
}

export const useProgressionStore = defineStore('progression', () => {
  // State
  const level = ref<string | null>(null);
  const stats = ref<ProgressionStats | null>(null);
  const rpeTrend = ref<RpeTrend | null>(null);
  const evaluation = ref<EvaluationStatus | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const evaluationEligible = computed(() =>
    evaluation.value?.eligible === true && !evaluation.value?.pendingRequest
  );

  const greekLetter = computed(() => {
    const map: Record<string, string> = {
      alfa: '\u03B1',    // α
      delta: '\u0394',   // Δ
      sigma: '\u03A3',   // Σ
      omega: '\u03A9',   // Ω
      spartan: '\u03A3', // Σ (or custom)
    };
    return level.value ? map[level.value] || level.value : '';
  });

  // Actions
  function setProgressionData(data: {
    level: string;
    stats: ProgressionStats;
    rpeTrend: RpeTrend;
    evaluation: EvaluationStatus;
  }) {
    level.value = data.level;
    stats.value = data.stats;
    rpeTrend.value = data.rpeTrend;
    evaluation.value = data.evaluation;
  }

  function setEvaluationPending() {
    if (evaluation.value) {
      evaluation.value.pendingRequest = true;
      evaluation.value.requestedAt = new Date().toISOString();
    }
  }

  function reset() {
    level.value = null;
    stats.value = null;
    rpeTrend.value = null;
    evaluation.value = null;
    loading.value = false;
    error.value = null;
  }

  return {
    // State
    level,
    stats,
    rpeTrend,
    evaluation,
    loading,
    error,
    // Getters
    evaluationEligible,
    greekLetter,
    // Actions
    setProgressionData,
    setEvaluationPending,
    reset,
  };
});
```

### API Route Pattern (Fastify)
```typescript
// Source: Pattern from sessions/routes.ts
// src/modules/progression/routes.ts
import { FastifyPluginAsync } from 'fastify';
import { eq, gte, and, sql, count } from 'drizzle-orm';
import * as schema from '../../db/schema';

export const progressionRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /progression/stats - Get member's progression data
  fastify.get('/stats', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;

    // Get user level
    const [user] = await fastify.db
      .select({ level: schema.users.level })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Calculate date boundaries
    const today = new Date();
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(today.getDate() - 14);
    const fourWeeksAgo = new Date(today);
    fourWeeksAgo.setDate(today.getDate() - 28);

    // Get stats - parallel queries for performance
    const [totalResult, weekResult, avgRpeResult, rpeDataResult] = await Promise.all([
      // Total sessions and days
      fastify.db
        .select({
          totalSessions: count(),
          totalDays: sql<number>`COUNT(DISTINCT date)`,
        })
        .from(schema.completedSessions)
        .where(eq(schema.completedSessions.userId, userId)),

      // Sessions this week (last 7 days)
      fastify.db
        .select({ count: count() })
        .from(schema.completedSessions)
        .where(and(
          eq(schema.completedSessions.userId, userId),
          gte(schema.completedSessions.date, new Date(today.getTime() - 7 * 86400000).toISOString().split('T')[0])
        )),

      // Average RPE last 2 weeks
      fastify.db
        .select({
          avgRpe: sql<number>`CAST(AVG(rpe) AS DECIMAL(3,1))`,
        })
        .from(schema.completedSessions)
        .where(and(
          eq(schema.completedSessions.userId, userId),
          gte(schema.completedSessions.date, twoWeeksAgo.toISOString().split('T')[0]),
          sql`rpe IS NOT NULL`
        )),

      // RPE data for chart (last 4 weeks)
      fastify.db
        .select({
          date: schema.completedSessions.date,
          rpe: schema.completedSessions.rpe,
        })
        .from(schema.completedSessions)
        .where(and(
          eq(schema.completedSessions.userId, userId),
          gte(schema.completedSessions.date, fourWeeksAgo.toISOString().split('T')[0])
        ))
        .orderBy(schema.completedSessions.date),
    ]);

    // Check for pending evaluation request
    const [pendingRequest] = await fastify.db
      .select({ id: schema.evaluationRequests.id, requestedAt: schema.evaluationRequests.requestedAt })
      .from(schema.evaluationRequests)
      .where(and(
        eq(schema.evaluationRequests.userId, userId),
        eq(schema.evaluationRequests.status, 'pending')
      ));

    // Build response
    const avgRpe = avgRpeResult[0]?.avgRpe ?? null;
    const eligible = avgRpe !== null && avgRpe <= 6;

    return {
      level: {
        current: user.level,
        displayName: user.level.charAt(0).toUpperCase() + user.level.slice(1),
        greekLetter: { alfa: 'α', delta: 'Δ', sigma: 'Σ', omega: 'Ω', spartan: 'Σ' }[user.level] || user.level,
      },
      stats: {
        totalSessions: totalResult[0]?.totalSessions ?? 0,
        totalDaysTrained: totalResult[0]?.totalDays ?? 0,
        sessionsThisWeek: weekResult[0]?.count ?? 0,
        currentStreak: 0, // Calculate separately with streak logic
      },
      rpeTrend: {
        labels: rpeDataResult.map(r => formatDateLabel(r.date)),
        data: rpeDataResult.map(r => r.rpe),
        averageRpe: avgRpe ?? 0,
      },
      evaluation: {
        eligible,
        averageRpeLast2Weeks: avgRpe,
        pendingRequest: !!pendingRequest,
        requestedAt: pendingRequest?.requestedAt?.toISOString() ?? null,
      },
    };
  });

  // POST /progression/request-evaluation - Submit evaluation request
  fastify.post('/request-evaluation', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;

    // Check if already has pending request
    const [existing] = await fastify.db
      .select({ id: schema.evaluationRequests.id })
      .from(schema.evaluationRequests)
      .where(and(
        eq(schema.evaluationRequests.userId, userId),
        eq(schema.evaluationRequests.status, 'pending')
      ));

    if (existing) {
      return reply.status(400).send({ error: 'Already have a pending evaluation request' });
    }

    // Verify eligibility (RPE <= 6 for last 2 weeks)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const [avgResult] = await fastify.db
      .select({
        avgRpe: sql<number>`CAST(AVG(rpe) AS DECIMAL(3,1))`,
      })
      .from(schema.completedSessions)
      .where(and(
        eq(schema.completedSessions.userId, userId),
        gte(schema.completedSessions.date, twoWeeksAgo.toISOString().split('T')[0]),
        sql`rpe IS NOT NULL`
      ));

    const avgRpe = avgResult?.avgRpe;
    if (avgRpe === null || avgRpe > 6) {
      return reply.status(400).send({ error: 'Not eligible for evaluation request' });
    }

    // Create request
    const [result] = await fastify.db.insert(schema.evaluationRequests).values({
      userId,
      averageRpeAtRequest: Math.round(avgRpe),
    });

    return {
      success: true,
      requestId: result.insertId,
    };
  });
};

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
}
```

### Mi Camino Page Component
```vue
<!-- src/modules/progression/pages/MiCamino.vue -->
<template>
  <q-page padding class="mi-camino">
    <q-spinner-dots v-if="loading" size="50px" color="primary" class="absolute-center" />

    <template v-else-if="stats">
      <!-- Level Display -->
      <div class="level-section q-mb-lg text-center">
        <div class="level-badge-large">
          {{ progressionStore.greekLetter }}
        </div>
        <div class="text-h5 level-name">{{ levelDisplayName }}</div>
      </div>

      <!-- Stats Cards -->
      <TrainingStats :stats="stats" class="q-mb-lg" />

      <!-- RPE Trend Chart -->
      <q-card class="q-mb-lg">
        <q-card-section>
          <div class="text-h6 section-title">Tendencia de Esfuerzo (4 semanas)</div>
          <RpeTrendChart
            v-if="rpeTrend"
            :labels="rpeTrend.labels"
            :data="rpeTrend.data"
          />
          <div class="text-center text-grey-7 q-mt-sm">
            Promedio: {{ rpeTrend?.averageRpe?.toFixed(1) || '-' }}
          </div>
        </q-card-section>
      </q-card>

      <!-- Evaluation Request Section -->
      <EvaluationRequest
        v-if="evaluation"
        :eligible="evaluation.eligible"
        :pending="evaluation.pendingRequest"
        :average-rpe="evaluation.averageRpeLast2Weeks"
        @request="onRequestEvaluation"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useProgressionStore } from '../stores/progressionStore';
import { useProgressionApi } from '../composables/useProgressionApi';
import TrainingStats from '../components/TrainingStats.vue';
import RpeTrendChart from '../components/RpeTrendChart.vue';
import EvaluationRequest from '../components/EvaluationRequest.vue';

const progressionStore = useProgressionStore();
const { fetchStats, requestEvaluation, loading } = useProgressionApi();

const stats = computed(() => progressionStore.stats);
const rpeTrend = computed(() => progressionStore.rpeTrend);
const evaluation = computed(() => progressionStore.evaluation);
const levelDisplayName = computed(() =>
  progressionStore.level
    ? progressionStore.level.charAt(0).toUpperCase() + progressionStore.level.slice(1)
    : ''
);

async function onRequestEvaluation() {
  await requestEvaluation();
}

onMounted(async () => {
  await fetchStats();
});
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.mi-camino {
  max-width: 600px;
  margin: 0 auto;
}

.level-badge-large {
  font-size: 64px;
  font-weight: 700;
  color: $secondary;
  font-family: 'Cinzel', serif;
  line-height: 1;
}

.level-name {
  font-family: 'Cinzel', serif;
  color: $primary;
  letter-spacing: 0.1em;
}

.section-title {
  font-family: 'Cinzel', serif;
  color: $primary;
  letter-spacing: 0.05em;
}
</style>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| vue-chartjs mixins | vue-chart-3 Composition API | 2023+ | Simpler, TypeScript-native |
| Separate profile/stats pages | Combined "journey" page | UX trend | Better mobile UX, fewer navigations |
| Polling for eligibility | Fetch on page load + store | Standard | Simpler, less server load |
| jQuery/D3 charts | Chart.js 4 tree-shaking | 2023+ | Much smaller bundle |

**Deprecated/outdated:**
- vue-chartjs with mixins (for Vue 3): Use vue-chart-3 or Composition API pattern
- chart.js/auto import: Imports everything, defeats tree-shaking
- Separate XHR calls for each stat: Combine into single endpoint

## Open Questions

1. **Streak Definition**
   - What we know: User decided "consecutive days" means training days
   - What's unclear: Should weekends count against streak if user normally rests?
   - Recommendation: Use calendar days for simplicity; consecutive means no gaps

2. **RPE Chart Empty State**
   - What we know: New users have no RPE data
   - What's unclear: What to show when no data exists?
   - Recommendation: Show placeholder message "Completa sesiones para ver tu tendencia"

3. **Eligibility Re-check Timing**
   - What we know: Check eligibility when loading Mi Camino page
   - What's unclear: Should eligibility badge update without visiting page?
   - Recommendation: Check on app boot (auth success) and store in progressionStore

4. **Request Cancellation**
   - What we know: User can request evaluation
   - What's unclear: Can user cancel a pending request?
   - Recommendation: Defer to future phase; for now, requests are final

## Sources

### Primary (HIGH confidence)
- [vue-chart-3 Documentation](https://vue-chart-3.netlify.app/guide/) - Chart component setup
- [Chart.js Documentation](https://www.chartjs.org/docs/latest/) - Chart configuration
- [Drizzle ORM Select](https://orm.drizzle.team/docs/select) - Aggregation queries
- [Quasar Badge](https://quasar.dev/vue-components/badge/) - Notification badge component
- Existing codebase: sessions/routes.ts, weekStore.ts, useUserStore.ts - Project patterns

### Secondary (MEDIUM confidence)
- [Drizzle ORM Discussion #2893](https://github.com/drizzle-team/drizzle-orm/discussions/2893) - Date grouping patterns
- [vue-chartjs GitHub](https://github.com/apertureless/vue-chartjs) - Alternative implementation reference

### Tertiary (LOW confidence)
- Web search results for Vue profile page patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - vue-chart-3 and Chart.js well-documented, Drizzle already in use
- Architecture: HIGH - Follows existing project patterns (stores, routes, composables)
- API design: HIGH - Follows existing sessions module pattern exactly
- Pitfalls: MEDIUM - Combination of Chart.js docs and community experience

**Research date:** 2026-01-29
**Valid until:** 2026-03-01 (Chart.js and Drizzle stable, patterns unlikely to change)

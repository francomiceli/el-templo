import type { RouteRecordRaw } from 'vue-router'

/**
 * Goal Plan module route configuration.
 *
 * Routes:
 * - /goal-plan/session — Goal plan session player
 *
 * Note: DurationPicker route removed per D-29 (duration picker concept eliminated).
 */
const routes: RouteRecordRaw[] = [
  {
    path: 'goal-plan/session',
    name: 'goalPlan-session',
    component: () => import('./pages/GoalPlanSession.vue'),
    meta: { requiresAuth: true },
  },
]

export default routes

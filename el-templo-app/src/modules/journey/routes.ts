import type { RouteRecordRaw } from 'vue-router'

/**
 * Journey module route configuration.
 *
 * Routes:
 * - /journey — Journey selection (or redirect to duration if already active)
 * - /journey/overview/:type — Journey details before confirming
 * - /journey/duration — Session duration picker (20/40/60 min)
 * - /journey/session — Journey session player (placeholder for Plan 05)
 */
const routes: RouteRecordRaw[] = [
  {
    path: 'journey',
    name: 'journey-selection',
    component: () => import('./pages/JourneySelection.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: 'journey/overview/:type',
    name: 'journey-overview',
    component: () => import('./pages/JourneyOverview.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: 'journey/duration',
    name: 'journey-duration',
    component: () => import('./pages/DurationPicker.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: 'journey/session',
    name: 'journey-session',
    component: () => import('./pages/JourneySession.vue'),
    meta: { requiresAuth: true },
  },
]

export default routes

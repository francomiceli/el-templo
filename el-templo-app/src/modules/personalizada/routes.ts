import type { RouteRecordRaw } from 'vue-router'

/**
 * Personalizada module route configuration.
 *
 * Routes:
 * - /personalizada — Personalizada selection (or redirect to duration if already active)
 * - /personalizada/overview/:type — Personalizada details before confirming
 * - /personalizada/duration — Session duration picker (20/40/60 min)
 * - /personalizada/session — Personalizada session player
 */
const routes: RouteRecordRaw[] = [
  {
    path: 'personalizada',
    name: 'personalizada-selection',
    component: () => import('./pages/PersonalizadaSelection.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: 'personalizada/overview/:type',
    name: 'personalizada-overview',
    component: () => import('./pages/PersonalizadaOverview.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: 'personalizada/duration',
    name: 'personalizada-duration',
    component: () => import('./pages/DurationPicker.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: 'personalizada/session',
    name: 'personalizada-session',
    component: () => import('./pages/PersonalizadaSession.vue'),
    meta: { requiresAuth: true },
  },
]

export default routes

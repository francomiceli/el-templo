import type { RouteRecordRaw } from 'vue-router'

/**
 * Personalizada module route configuration.
 *
 * Routes:
 * - /personalizada/duration — Session duration picker (20/40/60 min)
 * - /personalizada/session — Personalizada session player
 */
const routes: RouteRecordRaw[] = [
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

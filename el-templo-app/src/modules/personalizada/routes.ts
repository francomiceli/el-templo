import type { RouteRecordRaw } from 'vue-router'

/**
 * Personalizada module route configuration.
 *
 * Routes:
 * - /personalizada/session — Personalizada session player
 *
 * Duration selection is handled inline by TrainingIndex.vue.
 */
const routes: RouteRecordRaw[] = [
  {
    path: 'personalizada/session',
    name: 'personalizada-session',
    component: () => import('./pages/PersonalizadaSession.vue'),
    meta: { requiresAuth: true },
  },
]

export default routes

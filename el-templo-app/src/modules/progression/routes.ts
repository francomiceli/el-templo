import type { RouteRecordRaw } from 'vue-router'

/**
 * Progression module route configuration
 *
 * Provides the /mi-templo route for member progression tracking.
 */
export const progressionRoutes: RouteRecordRaw[] = [
  {
    path: 'mi-templo',
    name: 'mi-templo',
    component: () => import('./pages/MiTemplo.vue'),
    meta: { requiresAuth: true },
  },
]

export default progressionRoutes

import type { RouteRecordRaw } from 'vue-router';

/**
 * Progression module route configuration
 *
 * Provides the /mi-camino route for member progression tracking.
 */
export const progressionRoutes: RouteRecordRaw[] = [
  {
    path: 'mi-camino',
    name: 'mi-camino',
    component: () => import('./pages/MiCamino.vue'),
    meta: { requiresAuth: true },
  },
];

export default progressionRoutes;

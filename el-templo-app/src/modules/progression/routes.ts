import type { RouteRecordRaw } from 'vue-router'

/**
 * Progression module route configuration
 *
 * Provides the /mi-templo route for member progression tracking and the
 * /mi-arbol route for the skill-tree advancement view (Phase 127, TREE-06).
 */
export const progressionRoutes: RouteRecordRaw[] = [
  {
    path: 'mi-templo',
    name: 'mi-templo',
    component: () => import('./pages/MiTemplo.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: 'mi-arbol',
    name: 'mi-arbol',
    component: () => import('./pages/MiArbol.vue'),
    meta: { requiresAuth: true },
  },
]

export default progressionRoutes

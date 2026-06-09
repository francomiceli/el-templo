import type { RouteRecordRaw } from 'vue-router'
import { MEMBER_TREE_ENABLED } from 'src/config/featureFlags'

/**
 * Progression module route configuration
 *
 * Provides the /mi-templo route for member progression tracking and the
 * /mi-arbol route for the skill-tree advancement view (Phase 127, TREE-06).
 *
 * /mi-arbol is registered only when MEMBER_TREE_ENABLED — gated off for members
 * until the v5.1 training-data rollout runs (deferred). With the flag off the
 * route does not exist, so deep links fall through to the not-found handler.
 */
export const progressionRoutes: RouteRecordRaw[] = [
  {
    path: 'mi-templo',
    name: 'mi-templo',
    component: () => import('./pages/MiTemplo.vue'),
    meta: { requiresAuth: true },
  },
  ...(MEMBER_TREE_ENABLED
    ? [
        {
          path: 'mi-arbol',
          name: 'mi-arbol',
          component: () => import('./pages/MiArbol.vue'),
          meta: { requiresAuth: true },
        } satisfies RouteRecordRaw,
      ]
    : []),
]

export default progressionRoutes

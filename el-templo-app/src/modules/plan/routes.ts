import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'planes',
    name: 'planes',
    component: () => import('./pages/PlanesPage.vue'),
    meta: { requiresAuth: true },
  },
]

export default routes

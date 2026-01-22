import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'training',
    name: 'training',
    component: () => import('./pages/TrainingIndex.vue'),
    meta: { requiresAuth: true }
  }
]

export default routes

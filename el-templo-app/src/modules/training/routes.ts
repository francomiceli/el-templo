import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'training',
    name: 'training',
    component: () => import('./pages/TrainingIndex.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: 'training/session/:date',
    name: 'day-player',
    component: () => import('./pages/DayPlayer.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: 'training/guia',
    name: 'guia',
    component: () => import('./pages/GuiaPage.vue'),
    meta: { requiresAuth: true },
  },
]

export default routes

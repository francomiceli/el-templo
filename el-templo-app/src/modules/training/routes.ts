import type { RouteRecordRaw } from 'vue-router'
import { FREE_BLOCKS_ENABLED } from 'src/config/featureFlags'

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
  // Fase 197 D-15: modo bloque libre (Session sintética de 1 bloque, dayId `XB-{blockId}`).
  // Con FREE_BLOCKS_ENABLED apagado la ruta no existe (igual que /mi-arbol).
  ...(FREE_BLOCKS_ENABLED
    ? [
        {
          path: 'training/libre/:blockId',
          name: 'free-block-player',
          component: () => import('./pages/FreeBlockPlayer.vue'),
          meta: { requiresAuth: true },
        } satisfies RouteRecordRaw,
      ]
    : []),
  {
    path: 'training/resumen',
    name: 'session-summary',
    component: () => import('./pages/SessionSummaryPage.vue'),
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

import type { RouteRecordRaw } from 'vue-router'
import { ANATOMIA_ALUMNOS_ENABLED, FREE_BLOCKS_ENABLED } from 'src/config/featureFlags'

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
  // Fase 201 D-22: el camino de niveles de Conquer se abre desde Inicio (la tab vive en /training)
  {
    path: 'training/conquer/niveles',
    name: 'conquer-niveles',
    component: () => import('src/modules/conquer/pages/ConquerLevelsPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: 'training/guia',
    name: 'guia',
    component: () => import('./pages/GuiaPage.vue'),
    meta: { requiresAuth: true },
  },
  // Fase 200 P1/D13: la portada de la Guía y Tu cuerpo viven en rutas NUEVAS bajo /training/guia/…
  // La ruta `guia` de arriba sigue siendo las historias (deep links, avisos, auto-abrir de socios
  // nuevos). Con ANATOMIA_ALUMNOS_ENABLED apagado estas tres rutas no existen.
  ...(ANATOMIA_ALUMNOS_ENABLED
    ? [
        {
          path: 'training/guia/inicio',
          name: 'guia-inicio',
          component: () => import('src/modules/anatomy/pages/GuiaHomePage.vue'),
          meta: { requiresAuth: true },
        } satisfies RouteRecordRaw,
        {
          path: 'training/guia/cuerpo',
          name: 'tu-cuerpo',
          component: () => import('src/modules/anatomy/pages/TuCuerpoPage.vue'),
          meta: { requiresAuth: true },
        } satisfies RouteRecordRaw,
        {
          path: 'training/guia/cuerpo/:slug',
          name: 'tu-cuerpo-ficha',
          component: () => import('src/modules/anatomy/pages/TuCuerpoFichaPage.vue'),
          meta: { requiresAuth: true },
        } satisfies RouteRecordRaw,
      ]
    : []),
]

export default routes

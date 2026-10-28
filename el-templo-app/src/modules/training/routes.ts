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
  // Fase 201 DA-23: la guía "¿Cómo funciona?" (la tab la abre una vez después del día 0; sin flag)
  {
    path: 'training/conquer/como-funciona',
    name: 'conquer-guia',
    component: () => import('src/modules/conquer/pages/ConquerGuidePage.vue'),
    meta: { requiresAuth: true },
  },
  // Fase 201 §7.1 Hoy: la sesión del día de Conquer (query `day` opcional, D-16)
  {
    path: 'training/conquer/hoy',
    name: 'conquer-hoy',
    component: () => import('src/modules/conquer/pages/ConquerTodayPage.vue'),
    meta: { requiresAuth: true },
  },
  // Fase 201 §7.1 Progreso: Subir, calibraciones y figura de la semana
  {
    path: 'training/conquer/progreso',
    name: 'conquer-progreso',
    component: () => import('src/modules/conquer/pages/ConquerProgressPage.vue'),
    meta: { requiresAuth: true },
  },
  // Fase 201 §7.1 Sábado: combos de Toro (el nombre lo usan Inicio y Hoy con `hasRoute`)
  {
    path: 'training/conquer/sabado',
    name: 'conquer-sabado',
    component: () => import('src/modules/conquer/pages/ConquerSaturdayPage.vue'),
    meta: { requiresAuth: true },
  },
  // Fase 201 §6, D-15: control físico (día 0 con query `dia0=1`, o el periódico de cada 4 semanas)
  {
    path: 'training/conquer/control',
    name: 'conquer-control',
    component: () => import('src/modules/conquer/pages/ConquerBodyCheckPage.vue'),
    meta: { requiresAuth: true },
  },
  // Fase 201 §6, §7.1 Evolución: antes y después, y permiso de publicación
  {
    path: 'training/conquer/evolucion',
    name: 'conquer-evolucion',
    component: () => import('src/modules/conquer/pages/ConquerEvolutionPage.vue'),
    meta: { requiresAuth: true },
  },
  // Fase 201 D-26: correcciones con video del alumno
  {
    path: 'training/conquer/correcciones',
    name: 'conquer-correcciones',
    component: () => import('src/modules/conquer/pages/ConquerCorrectionsPage.vue'),
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

import { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  // Public routes (no layout)
  {
    path: '/login',
    name: 'login',
    component: () => import('pages/LoginPage.vue'),
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('pages/RegisterPage.vue'),
  },
  // Magic-link landing (Phase 180, D-03). Path EXACTO: los `.well-known`
  // (assetlinks + AASA) de la fase 119 ya lo cubren — cambiarlo rompe el
  // deep link nativo.
  {
    path: '/r/trial',
    name: 'magic-link',
    component: () => import('pages/MagicLinkPage.vue'),
  },

  // Protected routes (with MainLayout)
  {
    path: '/',
    name: 'layout',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'home',
        redirect: '/mi-templo',
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('pages/ProfilePage.vue'),
      },
      {
        path: 'check-in',
        name: 'check-in',
        component: () => import('pages/CheckInPage.vue'),
      },
      {
        path: 'reservas',
        name: 'reservas',
        component: () => import('pages/ReservasPage.vue'),
      },
      {
        // Destino de bajas / prueba-no-convertida (D-13, Phase 180). Dentro
        // del layout protegido: se llega ya logueado por el canje del
        // magic-link.
        path: '/volver',
        name: 'volver',
        component: () => import('pages/VolverPage.vue'),
      },
      {
        path: 'change-password',
        name: 'change-password',
        component: () => import('pages/ChangePasswordPage.vue'),
      },
      {
        path: 'mis-referidos',
        name: 'mis-referidos',
        component: () => import('pages/MisReferidosPage.vue'),
      },
      {
        path: 'proponer-mejora',
        name: 'proponer-mejora',
        component: () => import('pages/ProponerMejoraPage.vue'),
      },
      {
        path: 'desafio-barra',
        name: 'desafio-barra-explicacion',
        component: () => import('src/modules/bar-challenge/pages/Explicacion.vue'),
      },
      {
        path: 'desafio-barra/timer',
        name: 'desafio-barra-timer',
        component: () => import('src/modules/bar-challenge/pages/Timer.vue'),
      },
      {
        path: 'desafio-barra/resultado',
        name: 'desafio-barra-resultado',
        component: () => import('src/modules/bar-challenge/pages/Resultado.vue'),
      },
    ],
  },

  // Catch-all
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes

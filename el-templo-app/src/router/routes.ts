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
        path: 'change-password',
        name: 'change-password',
        component: () => import('pages/ChangePasswordPage.vue'),
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

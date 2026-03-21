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
        redirect: '/mi-camino',
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
    ],
  },

  // Catch-all
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes

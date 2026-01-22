import { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  // Public routes (no layout) - pages created in 02-03
  {
    path: '/login',
    name: 'login',
    component: () => import('pages/ErrorNotFound.vue'), // Placeholder until LoginPage.vue exists
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('pages/ErrorNotFound.vue'), // Placeholder until RegisterPage.vue exists
  },

  // Protected routes (with MainLayout)
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('pages/IndexPage.vue'),
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('pages/ErrorNotFound.vue'), // Placeholder until ProfilePage.vue exists
      },
    ],
  },

  // Catch-all
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;

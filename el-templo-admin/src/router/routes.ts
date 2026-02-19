import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: () => import('pages/LoginPage.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('layouts/AdminLayout.vue'),
    children: [
      { path: '', redirect: '/sessions' },
      { path: 'sessions', component: () => import('pages/SessionsPage.vue') },
      { path: 'sessions/edit', component: () => import('pages/SessionEditPage.vue') },
      { path: 'sessions/:id', component: () => import('pages/SessionEditLegacyRedirect.vue') },
      { path: 'generate', component: () => import('pages/GeneratePage.vue') },
      { path: 'exercises', component: () => import('pages/ExercisesPage.vue') },
    ],
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;

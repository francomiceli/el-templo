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
      { path: 'alumnos', component: () => import('pages/AlumnosPage.vue') },
      {
        path: 'alumnos/:userId',
        component: () => import('pages/AlumnoDetailPage.vue'),
      },
      {
        path: 'blog',
        component: () => import('pages/BlogListPage.vue'),
        meta: { allowedRoles: ['admin', 'superadmin'] },
      },
      {
        path: 'blog/new',
        component: () => import('pages/BlogEditorPage.vue'),
        meta: { allowedRoles: ['admin', 'superadmin'] },
      },
      {
        path: 'blog/:id',
        component: () => import('pages/BlogEditorPage.vue'),
        meta: { allowedRoles: ['admin', 'superadmin'] },
      },
      {
        path: 'gladius',
        component: () => import('pages/GladiusProductsPage.vue'),
        meta: { allowedRoles: ['admin', 'superadmin'] },
      },
      {
        path: 'academy',
        component: () => import('pages/AcademyInquiriesPage.vue'),
        meta: { allowedRoles: ['admin', 'superadmin'] },
      },
      {
        path: 'app-waitlist',
        component: () => import('pages/AppWaitlistPage.vue'),
        meta: { allowedRoles: ['admin', 'superadmin'] },
      },
      {
        path: 'labs-inquiries',
        component: () => import('pages/LabsInquiriesPage.vue'),
        meta: { allowedRoles: ['admin', 'superadmin'] },
      },
      {
        path: 'franquicias',
        component: () => import('pages/FranchiseListPage.vue'),
        meta: { allowedRoles: ['superadmin'] },
      },
      {
        path: 'franquicias/:id',
        component: () => import('pages/FranchiseDetailPage.vue'),
        meta: { allowedRoles: ['superadmin'] },
      },
    ],
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;

import type { RouteRecordRaw } from 'vue-router';
import type { AdminRole } from 'src/types/admin';

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
      {
        path: 'sessions',
        component: () => import('pages/SessionsPage.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[] },
      },
      {
        path: 'sessions/edit',
        component: () => import('pages/SessionEditPage.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[] },
      },
      {
        path: 'sessions/:id',
        component: () => import('pages/SessionEditLegacyRedirect.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[] },
      },
      {
        path: 'generate',
        component: () => import('pages/GeneratePage.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[] },
      },
      {
        path: 'exercises',
        component: () => import('pages/ExercisesPage.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[] },
      },
      {
        path: 'proposals',
        component: () => import('pages/ProposalReviewPage.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[] },
      },
      {
        path: 'tree-editor',
        component: () => import('pages/TreeEditorPage.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[] },
      },
      {
        path: 'alumnos',
        component: () => import('pages/AlumnosPage.vue'),
        meta: {
          allowedRoles: ['coach', 'admin', 'owner', 'gestion', 'recepcion'] as AdminRole[],
        },
      },
      {
        path: 'alumnos/:userId',
        component: () => import('pages/AlumnoDetailPage.vue'),
        meta: {
          allowedRoles: ['coach', 'admin', 'owner', 'gestion', 'recepcion'] as AdminRole[],
        },
      },
      {
        path: 'planes',
        component: () => import('pages/PlanesPage.vue'),
        meta: { allowedRoles: ['gestion', 'admin', 'owner'] as AdminRole[] },
      },
      {
        path: 'programas',
        component: () => import('pages/ProgramasPage.vue'),
        meta: { allowedRoles: ['gestion', 'admin', 'owner'] as AdminRole[] },
      },
      {
        path: 'caja',
        component: () => import('pages/CajaPage.vue'),
        meta: { allowedRoles: ['gestion', 'admin', 'owner'] as AdminRole[] },
      },
      {
        path: 'horarios',
        component: () => import('pages/HorariosPage.vue'),
        meta: {
          allowedRoles: ['coach', 'admin', 'owner', 'gestion', 'recepcion'] as AdminRole[],
        },
      },
      {
        path: 'deudas',
        component: () => import('pages/DeudasPage.vue'),
        meta: {
          allowedRoles: ['coach', 'gestion', 'admin', 'owner'] as AdminRole[],
        },
      },
      {
        path: 'analiticas',
        component: () => import('pages/AnaliticasPage.vue'),
        meta: { allowedRoles: ['admin', 'owner'] as AdminRole[] },
      },
      {
        path: 'reportes',
        component: () => import('pages/ReportesPage.vue'),
        meta: { allowedRoles: ['gestion', 'admin', 'owner'] as AdminRole[] },
      },
      {
        path: 'campanias',
        component: () => import('pages/CampaniasPage.vue'),
        meta: { allowedRoles: ['admin', 'owner'] as AdminRole[] },
      },
      {
        path: 'blog',
        component: () => import('pages/BlogListPage.vue'),
        meta: { allowedRoles: ['owner'] as AdminRole[] },
      },
      {
        path: 'blog/new',
        component: () => import('pages/BlogEditorPage.vue'),
        meta: { allowedRoles: ['owner'] as AdminRole[] },
      },
      {
        path: 'blog/:id',
        component: () => import('pages/BlogEditorPage.vue'),
        meta: { allowedRoles: ['owner'] as AdminRole[] },
      },
      {
        path: 'gladius',
        component: () => import('pages/GladiusProductsPage.vue'),
        meta: { allowedRoles: ['owner'] as AdminRole[] },
      },
      {
        path: 'academy',
        component: () => import('pages/AcademyInquiriesPage.vue'),
        meta: { allowedRoles: ['owner'] as AdminRole[] },
      },
      {
        path: 'app-waitlist',
        component: () => import('pages/AppWaitlistPage.vue'),
        meta: { allowedRoles: ['owner'] as AdminRole[] },
      },
      {
        path: 'labs-inquiries',
        component: () => import('pages/LabsInquiriesPage.vue'),
        meta: { allowedRoles: ['owner'] as AdminRole[] },
      },
      {
        path: 'franquicias',
        component: () => import('pages/FranchiseListPage.vue'),
        meta: { allowedRoles: ['owner'] as AdminRole[] },
      },
      {
        path: 'franquicias/:id',
        component: () => import('pages/FranchiseDetailPage.vue'),
        meta: { allowedRoles: ['owner'] as AdminRole[] },
      },
      {
        path: 'usuarios',
        component: () => import('pages/UsuariosPage.vue'),
        meta: { allowedRoles: ['owner'] as AdminRole[] },
      },
      {
        path: 'configuracion',
        component: () => import('pages/ConfiguracionPage.vue'),
        meta: { allowedRoles: ['admin', 'owner'] as AdminRole[] },
      },
      {
        path: 'notificaciones',
        component: () => import('pages/NotificacionesPage.vue'),
        meta: { allowedRoles: ['admin', 'owner'] as AdminRole[] },
      },
    ],
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;

import type { RouteRecordRaw } from 'vue-router';
import type { AdminRole } from 'src/types/admin';
import { useAuthStore } from 'stores/useAuthStore';
import { canAccessTraining } from 'src/utils/trainingAccess';
import {
  PLANES_READ_ROLES,
  PAGOS_ROLES,
  DUENO_ROLES,
  TV_CONTROL_ROLES,
} from 'src/config/templo-config';

/**
 * Landing por rol al entrar en '/' (D-14). Orden CRÍTICO (Pitfall 2):
 * canAccessTraining devuelve true para CUALQUIER owner, por eso el coach
 * exclusivo (Fran) se resuelve ANTES del bloque dueño — así el owner NO cae
 * en /sessions sino en /alumnos.
 *   1. coach + canAccessTraining → /sessions (sólo Fran, no el owner)
 *   2. owner/admin               → /alumnos  (dueño)
 *   3. resto (coach no-Fran/gestion/recepcion) → /cobros (empleado)
 */
export function landingForRole(): string {
  const authStore = useAuthStore();
  const user = authStore.user;
  if (user?.role === 'coach' && canAccessTraining(user)) {
    return '/sessions';
  }
  if (user && DUENO_ROLES.includes(user.role)) {
    return '/alumnos';
  }
  return '/cobros';
}

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
      // Fallback estático pre-auth: el redirect de route-record se resuelve
      // durante el matching, ANTES de checkAuth (user aún null → landing
      // incorrecto, WR-01). Con un destino estático accesible a todo el staff
      // (/cobros) el guard toma el control y re-resuelve por rol vía
      // landingForRole() en el beforeEach post-checkAuth (index.ts).
      { path: '', redirect: '/cobros' },
      {
        path: 'sessions',
        component: () => import('pages/SessionsPage.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[], trainingOnly: true },
      },
      {
        path: 'sessions/edit',
        component: () => import('pages/SessionEditPage.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[], trainingOnly: true },
      },
      {
        path: 'sessions/:id',
        component: () => import('pages/SessionEditLegacyRedirect.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[], trainingOnly: true },
      },
      {
        path: 'generate',
        component: () => import('pages/GeneratePage.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[], trainingOnly: true },
      },
      {
        path: 'exercises',
        component: () => import('pages/ExercisesPage.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[], trainingOnly: true },
      },
      {
        path: 'tree-map',
        component: () => import('pages/TreeMapPage.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[], trainingOnly: true },
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
        // Widening D-10: todo el staff entra a Planes en modo lectura (ve qué
        // incluye + precios). La edición se oculta en PlanesPage (canEditPlans)
        // y la API bloquea los writes (Plan 01, PLANES_WRITE_ROLES).
        meta: { allowedRoles: PLANES_READ_ROLES },
      },
      {
        path: 'programas',
        component: () => import('pages/ProgramasPage.vue'),
        // Dueño-only (D-15): angostado de gestion/admin/owner a admin/owner para
        // cerrar el lado router de la puerta trasera de Programas. Consistente
        // con el nav (Plan 03) y la API (Plan 01, PROGRAMAS_ROLES). Un gestion
        // que navega a /programas por URL directa es rebotado por el guard.
        meta: { allowedRoles: DUENO_ROLES },
      },
      {
        path: 'caja',
        component: () => import('pages/CajaPage.vue'),
        // Rollout: gestión queda excluida de Caja (saldos) por ahora → admin/owner.
        meta: { allowedRoles: ['admin', 'owner'] as AdminRole[] },
      },
      {
        path: 'cobros',
        component: () => import('pages/CobrosPage.vue'),
        // Phase 140 (CARGA-04): opens the coach PoS load surface (ruta /cobros,
        // ex /pagos, ex /cargar). El coach (PoS profe, fase 148) entra junto con
        // gestion/admin/owner. Widening D-14: recepcion incluida vía PAGOS_ROLES
        // (espeja FINANCE_LOAD_ROLES de la API). Sincronizado con el nav (Plan 03).
        meta: { allowedRoles: PAGOS_ROLES },
      },
      // Phase 151 (COBRO-01): /pagos renombrado a /cobros. Redirect para que los
      // enlaces viejos (bookmarks, landing pre-151) sigan resolviendo.
      { path: 'pagos', redirect: '/cobros' },
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
        // Fase 164 — panel de televisores de sucursal. Dueño + coach vía
        // TV_CONTROL_ROLES (espejo del set homónimo del API, D-01); el gate real
        // sigue siendo el API.
        //
        // CRÍTICO: el path es 'tv/devices', NUNCA 'tv'. El kiosco es un artefacto
        // estático (`public/tv/index.html`) servido por nginx con `index
        // index.html` sobre el directorio; una ruta 'tv' en el SPA se comería esa
        // resolución y anularía toda la estrategia de compatibilidad del
        // televisor (D-24). '/tv/devices' no existe como archivo ni como
        // directorio, así que nginx la manda al fallback '/index.html' y el SPA
        // la resuelve. En desarrollo el kiosco se abre en '/tv/index.html'.
        path: 'tv/devices',
        component: () => import('pages/TvDevicesPage.vue'),
        meta: { allowedRoles: TV_CONTROL_ROLES },
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
        path: 'configuracion/precios',
        component: () => import('pages/ConfiguracionPreciosPage.vue'),
        meta: { allowedRoles: ['owner'] as AdminRole[] },
      },
      {
        path: 'notificaciones',
        component: () => import('pages/NotificacionesPage.vue'),
        meta: { allowedRoles: ['admin', 'owner'] as AdminRole[] },
      },
      {
        // Feedback del alumno: Clases / Profes / Sugerencias en tabs.
        // Dueño-only (decisión 2026-07-16); qué tab ve cada rol se decide
        // en la página (el gate real sigue siendo el API por endpoint).
        path: 'feedback',
        component: () => import('pages/FeedbackPage.vue'),
        meta: { allowedRoles: ['admin', 'owner'] as AdminRole[] },
      },
      // Rutas viejas de puntuaciones/propuestas → tabs de Feedback.
      { path: 'puntuaciones', redirect: { path: '/feedback', query: { tab: 'profes' } } },
      { path: 'propuestas', redirect: { path: '/feedback', query: { tab: 'sugerencias' } } },
    ],
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;

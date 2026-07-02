import { defineRouter } from '#q-app/wrappers';
import { createRouter, createWebHistory } from 'vue-router';
import routes, { landingForRole } from './routes';
import { useAuthStore } from 'stores/useAuthStore';
import type { AdminRole } from 'src/types/admin';
import { canAccessTraining } from 'src/utils/trainingAccess';

export default defineRouter(function () {
  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createWebHistory(),
  });

  Router.onError((error, to) => {
    const chunkErrors = [
      'Failed to fetch dynamically imported module',
      'Importing a module script failed',
    ];
    if (chunkErrors.some((msg) => error.message.includes(msg))) {
      window.location.href = to.fullPath;
    }
  });

  Router.beforeEach(async (to) => {
    // Public routes don't require authentication
    if (to.meta.public) {
      return true;
    }

    const authStore = useAuthStore();

    // Check authentication
    const isValid = await authStore.checkAuth();
    if (!isValid) {
      return '/login';
    }

    // D-14 landing por rol: cuando la navegación nace en la raíz (login →
    // router.push('/') o carga fría/refresh de '/'), resolver el destino AHORA
    // que checkAuth ya cargó authStore.user. Esto corrige CR-02 (login) y WR-01
    // (carga fría, donde el redirect estático del índice caía en /pagos para
    // todos). El guard `dest !== to.path` evita el loop infinito cuando el
    // destino ya coincide con la ubicación actual.
    if (to.path === '/' || to.redirectedFrom?.path === '/') {
      const dest = landingForRole();
      if (dest !== to.path) {
        return dest;
      }
    }

    // Role-based access: if route specifies allowedRoles, check user's role
    const allowedRoles = to.meta.allowedRoles;
    if (allowedRoles && !allowedRoles.includes(authStore.user?.role as AdminRole)) {
      // Redirect to role's default landing page
      const role = authStore.user?.role as AdminRole;
      // D-14 landing por rol: dueño (owner/admin) → /alumnos; empleado
      // (coach/gestion/recepcion) → /pagos. El bounce trainingOnly (abajo)
      // se conserva para el coach exclusivo que sí entra a Entrenamiento.
      const defaultPages: Record<string, string> = {
        owner: '/alumnos',
        admin: '/alumnos',
        coach: '/pagos',
        gestion: '/pagos',
        recepcion: '/pagos',
      };
      return defaultPages[role] || '/pagos';
    }

    // Entrenamiento surface: even when allowedRoles lets a coach through, only
    // the owner or the exclusive training coach may enter. Non-training staff
    // (including other coaches) land on /alumnos — a page every staff role can
    // access — to avoid a redirect loop (a plain coach's default is /sessions,
    // which is itself trainingOnly).
    if (to.meta.trainingOnly && !canAccessTraining(authStore.user)) {
      return '/alumnos';
    }

    return true;
  });

  return Router;
});

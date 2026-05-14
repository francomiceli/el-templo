import { defineRouter } from '#q-app/wrappers';
import { createRouter, createWebHistory } from 'vue-router';
import routes from './routes';
import { useAuthStore } from 'stores/useAuthStore';
import type { AdminRole } from 'src/types/admin';

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

    // Role-based access: if route specifies allowedRoles, check user's role
    const allowedRoles = to.meta.allowedRoles;
    if (allowedRoles && !allowedRoles.includes(authStore.user?.role as AdminRole)) {
      // Redirect to role's default landing page
      const role = authStore.user?.role as AdminRole;
      const defaultPages: Record<string, string> = {
        owner: '/sessions',
        admin: '/alumnos',
        coach: '/sessions',
        gestion: '/alumnos',
        recepcion: '/alumnos',
      };
      return defaultPages[role] || '/sessions';
    }

    return true;
  });

  return Router;
});

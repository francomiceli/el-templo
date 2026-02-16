import { defineRouter } from '#q-app/wrappers';
import { createRouter, createWebHistory } from 'vue-router';
import routes from './routes';
import { useAuthStore } from 'stores/useAuthStore';

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
    const authStore = useAuthStore();

    // Public routes don't require authentication
    if (to.meta.public) {
      return true;
    }

    // Check authentication
    const isValid = await authStore.checkAuth();
    if (!isValid) {
      return '/login';
    }

    return true;
  });

  return Router;
});

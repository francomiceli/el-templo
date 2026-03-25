import { defineRouter } from '#q-app/wrappers'
import { createRouter, createWebHistory } from 'vue-router'
import routes from './routes'
import { useAuthStore } from 'stores/useAuthStore'
import { useUserStore } from 'stores/useUserStore'

export default defineRouter(function () {
  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createWebHistory(),
  })

  Router.onError((error, to) => {
    const chunkErrors = [
      'Failed to fetch dynamically imported module',
      'Importing a module script failed',
    ]
    if (chunkErrors.some((msg) => error.message.includes(msg))) {
      window.location.href = to.fullPath
    }
  })

  Router.beforeEach((to) => {
    const authStore = useAuthStore()

    // Public routes that don't require authentication
    const publicRoutes = ['login', 'register']
    const isPublicRoute = publicRoutes.includes(to.name as string)

    // If not authenticated and trying to access protected route
    if (!authStore.isAuthenticated && !isPublicRoute) {
      return { name: 'login' }
    }

    // If authenticated and trying to access login/register, redirect to home
    if (authStore.isAuthenticated && isPublicRoute) {
      return { name: 'home' }
    }

    // Onboarding guard - mandatory for members who haven't completed it (D-15, D-17)
    const userStore = useUserStore()
    if (
      authStore.isAuthenticated &&
      to.name !== 'onboarding' &&
      userStore.profile?.role === 'member' &&
      !userStore.onboardingCompleted
    ) {
      return { name: 'onboarding' }
    }

    // Allow navigation
    return true
  })

  return Router
})

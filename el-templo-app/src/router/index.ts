import { defineRouter } from '#q-app/wrappers'
import { createRouter, createWebHistory } from 'vue-router'
import routes from './routes'
import { useAuthStore } from 'stores/useAuthStore'

export default defineRouter(function () {
  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createWebHistory(),
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

    // Allow navigation
    return true
  })

  return Router
})

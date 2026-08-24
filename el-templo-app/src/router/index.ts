import { defineRouter } from '#q-app/wrappers'
import { createRouter, createWebHistory } from 'vue-router'
import routes from './routes'
import { useAuthStore } from 'stores/useAuthStore'
import { useUserStore } from 'stores/useUserStore'
import { hasPersistedActiveAttempt } from 'src/modules/bar-challenge/stores/useBarChallengeStore'
import { resolveGuardRedirect } from './guards'
import { isMagicLinkOnboardingBypass } from 'src/composables/useMagicLink'

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

  Router.beforeEach((to, from) => {
    const authStore = useAuthStore()
    const userStore = useUserStore()

    // Adaptador delgado: lee stores + persistencia y delega la decisión en
    // la función pura `resolveGuardRedirect` (Phase 180, D-21). Sin lógica
    // de decisión acá — ver src/router/guards.ts.
    return resolveGuardRedirect({
      toName: to.name as string | undefined,
      toPath: to.path,
      fromName: from.name as string | undefined,
      isAuthenticated: authStore.isAuthenticated,
      role: userStore.profile?.role,
      onboardingCompleted: userStore.onboardingCompleted,
      isFreemium: isMagicLinkOnboardingBypass(authStore.user?.id),
      hasActiveBarAttempt: hasPersistedActiveAttempt(),
    })
  })

  return Router
})

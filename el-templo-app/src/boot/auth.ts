import { boot } from 'quasar/wrappers'
import { useAuthStore } from 'stores/useAuthStore'
import { useUserStore } from 'stores/useUserStore'
import { api } from './axios'
import { useTokenStorage } from 'src/composables/useTokenStorage'

export default boot(async () => {
  const authStore = useAuthStore()
  const userStore = useUserStore()
  const { getToken, removeToken } = useTokenStorage()

  const token = await getToken()

  if (token) {
    // Set token in store immediately so axios interceptor can use it
    authStore.token = token

    try {
      // Verify token is still valid by calling /me
      const response = await api.get('/auth/me')
      authStore.setAuth(token, {
        id: response.data.id,
        email: response.data.email,
        role: response.data.role,
      })
      userStore.setProfile(response.data)
      // Phase 99: load persisted level selection for this user before boot
      // resolves — Quasar awaits this function, so the first MainLayout render
      // and the first session fetch see the hydrated selectedLevel.
      await userStore.hydrateSelection()
    } catch {
      // Token invalid or expired, clear it
      authStore.clearAuth()
      await removeToken()
    }
  }
})

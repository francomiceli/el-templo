import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from 'boot/axios'
import { useTokenStorage } from 'src/composables/useTokenStorage'
import { useUserStore } from './useUserStore'
import { extractError } from 'src/utils/extract-error'

export interface AuthUser {
  id: number
  email: string
  role: 'member' | 'coach' | 'admin' | 'superadmin'
}

export const useAuthStore = defineStore('auth', () => {
  // State
  const token = ref<string | null>(null)
  const user = ref<AuthUser | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)

  // Token storage composable (Phase 116: dual-key access + refresh).
  const { setTokens, clearTokens } = useTokenStorage()

  // Getters
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const isCoach = computed(
    () =>
      user.value?.role === 'coach' ||
      user.value?.role === 'admin' ||
      user.value?.role === 'superadmin',
  )
  const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'superadmin')
  const isSuperadmin = computed(() => user.value?.role === 'superadmin')

  // Actions
  async function login(email: string, password: string) {
    loading.value = true
    error.value = null

    try {
      const response = await api.post('/auth/login', { email, password })
      const { accessToken, refreshToken, user: userData } = response.data

      // Phase 116: persist the new access+refresh pair (D-03 cleanup of the
      // legacy authToken happens inside setTokens). Without this the
      // refreshToken would never be stored and the interceptor would log the
      // user out on the first 401.
      await setTokens(accessToken, refreshToken)
      token.value = accessToken
      user.value = {
        id: userData.id,
        email: userData.email,
        role: userData.role,
      }

      const userStore = useUserStore()
      userStore.setProfile(userData)
      // Phase 99: rehydrate any previously-persisted level selection for this
      // user BEFORE the caller navigates — ensures the first session fetch
      // carries the right ?level= param.
      await userStore.hydrateSelection()
    } catch (err: unknown) {
      error.value = extractError(err, 'Error de inicio de sesión')
      throw err
    } finally {
      loading.value = false
    }
  }

  async function register(data: {
    email: string
    password: string
    firstName: string
    lastName: string
    dni?: string
    phone?: string
    gender: string
    branchId?: number
    promoCode?: string
  }): Promise<{ promoApplied?: boolean } | undefined> {
    loading.value = true
    error.value = null

    try {
      const response = await api.post('/auth/register', data)
      const { accessToken, refreshToken, user: userData, promoApplied } = response.data

      // Phase 116: persist access+refresh (legacy authToken cleaned up inside setTokens).
      await setTokens(accessToken, refreshToken)
      token.value = accessToken
      user.value = {
        id: userData.id,
        email: userData.email,
        role: userData.role,
      }

      const userStore = useUserStore()
      userStore.setProfile(userData)
      // Phase 99: rehydrate any previously-persisted level selection for this
      // user BEFORE returning to the caller (and before any navigation).
      await userStore.hydrateSelection()

      return { promoApplied }
    } catch (err: unknown) {
      error.value = extractError(err, 'Error de registro')
      throw err
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await clearTokens()
    const userStore = useUserStore()
    // Phase 99: wipe the user-scoped level-selection storage BEFORE nulling
    // user/profile refs — clearSelection resolves userId defensively from
    // whichever ref is still populated, but removing the key while the
    // context is still intact is the safest order (Pitfall 3 in research).
    await userStore.clearSelection()
    token.value = null
    user.value = null
    userStore.clearProfile()
  }

  async function deleteAccount(password: string) {
    await api.post('/auth/me/delete-account', { password })
    await logout()
  }

  function setAuth(newToken: string, newUser: AuthUser) {
    token.value = newToken
    user.value = newUser
    error.value = null
  }

  function clearAuth() {
    token.value = null
    user.value = null
  }

  function setInitialized(value: boolean) {
    initialized.value = value
  }

  function setError(message: string) {
    error.value = message
  }

  function setLoading(state: boolean) {
    loading.value = state
  }

  return {
    // State
    token,
    user,
    loading,
    error,
    initialized,
    // Getters
    isAuthenticated,
    isCoach,
    isAdmin,
    isSuperadmin,
    // Actions
    login,
    register,
    logout,
    deleteAccount,
    setAuth,
    clearAuth,
    setInitialized,
    setError,
    setLoading,
  }
})

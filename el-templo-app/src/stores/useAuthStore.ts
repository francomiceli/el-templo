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

  // Token storage composable
  const { setToken, removeToken } = useTokenStorage()

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
      const { token: newToken, user: userData } = response.data

      await setToken(newToken)
      token.value = newToken
      user.value = {
        id: userData.id,
        email: userData.email,
        role: userData.role,
      }

      const userStore = useUserStore()
      userStore.setProfile(userData)
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
    dni: string
    phone: string
    branchId?: number
  }) {
    loading.value = true
    error.value = null

    try {
      const response = await api.post('/auth/register', data)
      const { token: newToken, user: userData } = response.data

      await setToken(newToken)
      token.value = newToken
      user.value = {
        id: userData.id,
        email: userData.email,
        role: userData.role,
      }

      const userStore = useUserStore()
      userStore.setProfile(userData)
    } catch (err: unknown) {
      error.value = extractError(err, 'Error de registro')
      throw err
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await removeToken()
    token.value = null
    user.value = null
    const userStore = useUserStore()
    userStore.clearProfile()
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
    setAuth,
    clearAuth,
    setInitialized,
    setError,
    setLoading,
  }
})

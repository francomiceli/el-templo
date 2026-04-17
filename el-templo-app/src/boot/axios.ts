import { boot } from 'quasar/wrappers'
import axios, { AxiosInstance } from 'axios'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance
    $api: AxiosInstance
  }
}

const TOKEN_KEY = 'authToken'

async function getToken(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: TOKEN_KEY })
    return value
  }
  return localStorage.getItem(TOKEN_KEY)
}

// Create API instance with base URL from environment
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - add auth token to requests (async for Capacitor Preferences)
api.interceptors.request.use(
  async (config) => {
    const token = await getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // Ensure mutating requests always carry a body so axios attaches
    // Content-Type: application/json. Capacitor Android WebView drops the
    // default Content-Type when data is undefined, causing the API to return
    // 415 Unsupported Media Type.
    const method = config.method?.toUpperCase()
    if (method && ['POST', 'PUT', 'PATCH'].includes(method) && config.data === undefined) {
      config.data = {}
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

export default boot(({ app, router }) => {
  // Response interceptor - handle 401 unauthorized (needs router for Capacitor-safe navigation)
  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        // Clear auth state
        if (Capacitor.isNativePlatform()) {
          await Preferences.remove({ key: TOKEN_KEY })
        } else {
          localStorage.removeItem(TOKEN_KEY)
        }
        // Don't redirect if already on login page
        if (router.currentRoute.value.path !== '/login') {
          await router.push('/login')
        }
      }
      return Promise.reject(error)
    },
  )

  // Make axios available globally via this.$axios and this.$api
  app.config.globalProperties.$axios = axios
  app.config.globalProperties.$api = api
})

// Export for use in stores and composables
export { api }

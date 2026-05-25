import { boot } from 'quasar/wrappers'
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import { Capacitor } from '@capacitor/core'
import { useTokenStorage } from 'src/composables/useTokenStorage'
import { createLogger } from 'src/utils/logger'

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance
    $api: AxiosInstance
  }
}

// Augment the axios request config with our internal retry/redirect flags so we
// don't reach for `any` (CLAUDE.md: no `any`).
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    __isRetry?: boolean
    __authRedirected?: boolean
  }
}

const log = createLogger('axios')

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

// Create API instance with base URL from environment
const api = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// A bare axios instance WITHOUT our interceptors, used to call /auth/refresh so
// the refresh request itself never re-enters the 401 handler (loop prevention).
const refreshClient = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ---------------------------------------------------------------------------
// Refresh lock (D-02): single shared Promise in module scope (NOT per-request).
// The first 401 of a storm triggers one POST /auth/refresh; concurrent requests
// await the same promise and retry once with the new access token.
// ---------------------------------------------------------------------------
let refreshPromise: Promise<string | null> | null = null

/**
 * Returns the shared in-flight refresh promise, creating it on first call.
 * Resolves to the new access token on success, or null on failure.
 * Always resets the lock in `finally` so the next storm can refresh again.
 */
export function runRefresh(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise
  }
  const { getRefreshToken, setTokens, clearTokens } = useTokenStorage()
  refreshPromise = (async (): Promise<string | null> => {
    const refreshToken = await getRefreshToken()
    if (!refreshToken) {
      return null
    }
    try {
      const { data } = await refreshClient.post('/auth/refresh', {
        refreshToken,
      })
      const accessToken = data?.accessToken as string | undefined
      const newRefresh = data?.refreshToken as string | undefined
      if (!accessToken || !newRefresh) {
        log.warn('Refresh response missing tokens')
        await clearTokens()
        return null
      }
      await setTokens(accessToken, newRefresh)
      return accessToken
    } catch (err: unknown) {
      // 401 (revoked/expired/reuse) or network error after the call.
      log.warn('Silent refresh failed', {
        status: err instanceof AxiosError ? err.response?.status : undefined,
      })
      await clearTokens()
      return null
    }
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

// Test-only reset so a fresh test can assert lock behaviour from a clean slate.
export function __resetRefreshLock(): void {
  refreshPromise = null
}

const REFRESH_URL = '/auth/refresh'

function isRefreshRequest(config?: InternalAxiosRequestConfig): boolean {
  return !!config?.url && config.url.includes(REFRESH_URL)
}

// Request interceptor - add auth token to requests (async for Capacitor Preferences)
api.interceptors.request.use(
  async (config) => {
    const { getAccessToken } = useTokenStorage()
    const token = await getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // Ensure mutating requests always carry a body so axios attaches
    // Content-Type: application/json. Capacitor Android WebView drops the
    // default Content-Type when data is undefined, causing the API to return
    // 415 Unsupported Media Type.
    const method = config.method?.toUpperCase()
    if (
      method &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
      config.data === undefined
    ) {
      config.data = {}
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

/**
 * Builds the 401 response error handler. Factored out (and exported) so the unit
 * test can exercise the lock/retry logic without booting the whole Quasar app.
 *
 * onRedirect runs the app-specific clear+navigate side effect.
 */
export function createAuthErrorHandler(instance: AxiosInstance, onRedirect: () => Promise<void>) {
  return async (error: AxiosError): Promise<unknown> => {
    const config = error.config as InternalAxiosRequestConfig | undefined
    if (error.response?.status !== 401 || !config) {
      return Promise.reject(error)
    }

    // (a) Whitelist: a 401 from /auth/refresh itself must not trigger another
    // refresh — clear + redirect, no loop.
    if (isRefreshRequest(config)) {
      await onRedirect()
      return Promise.reject(error)
    }

    // (b) Already retried once after a refresh — give up.
    if (config.__isRetry) {
      await onRedirect()
      return Promise.reject(error)
    }

    const { getRefreshToken, hasLegacyOnly } = useTokenStorage()

    // (c) No refresh available (legacy-only token or no refresh token at all):
    // behave as before (clear + redirect).
    const refreshToken = await getRefreshToken()
    if (!refreshToken || (await hasLegacyOnly())) {
      await onRedirect()
      return Promise.reject(error)
    }

    // (d) Normal case: run the shared refresh, then retry this request once.
    const newAccess = await runRefresh()
    if (newAccess) {
      config.__isRetry = true
      config.headers.Authorization = `Bearer ${newAccess}`
      return instance(config)
    }

    await onRedirect()
    return Promise.reject(error)
  }
}

export default boot(({ app, router }) => {
  const { clearTokens } = useTokenStorage()

  const onRedirect = async (): Promise<void> => {
    await clearTokens()
    if (router.currentRoute.value.path !== '/login') {
      await router.push('/login')
    }
  }

  // Response interceptor - handle 401 with refresh lock + single retry.
  api.interceptors.response.use((response) => response, createAuthErrorHandler(api, onRedirect))

  // Make axios available globally via this.$axios and this.$api
  app.config.globalProperties.$axios = axios
  app.config.globalProperties.$api = api
})

// Export for use in stores and composables
export { api }

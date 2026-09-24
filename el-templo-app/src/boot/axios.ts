import { boot } from 'quasar/wrappers'
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import { Capacitor } from '@capacitor/core'
import { useTokenStorage } from 'src/composables/useTokenStorage'
import { createLogger } from 'src/utils/logger'
import { NETWORK_ERROR_MESSAGE } from 'src/utils/network-error'

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

/**
 * Discriminated result of a refresh attempt (App 1.7.9, causa raíz de
 * deslogueos): un refresh puede fallar por dos motivos MUY distintos, y
 * solo uno de ellos significa "la sesión terminó":
 *  - 'rejected': el servidor respondió 401/403 — el refresh token está
 *    revocado, expiró, o fue detectado como replay. Ahí sí no hay sesión.
 *  - 'network': la llamada no pudo completarse (sin respuesta — sin
 *    internet, timeout — o 5xx del server). El refresh token PODRÍA seguir
 *    siendo válido; nunca lo sabemos porque el server nunca contestó. No es
 *    motivo para cerrar sesión.
 */
export type RefreshResult = { kind: 'ok'; token: string } | { kind: 'rejected' } | { kind: 'network' }

/** 401/403 = el servidor rechazó explícitamente la sesión. Cualquier otro
 * código (o ausencia de respuesta) es un problema transitorio, no una
 * decisión del servidor sobre la sesión. */
export function isSessionRejectedStatus(status: number | undefined): boolean {
  return status === 401 || status === 403
}

let refreshPromise: Promise<RefreshResult> | null = null

/**
 * Returns the shared in-flight refresh promise, creating it on first call.
 * Always resets the lock in `finally` so the next storm can refresh again.
 */
export function runRefresh(): Promise<RefreshResult> {
  if (refreshPromise) {
    return refreshPromise
  }
  const { getRefreshToken, setTokens, clearTokens } = useTokenStorage()
  refreshPromise = (async (): Promise<RefreshResult> => {
    const refreshToken = await getRefreshToken()
    if (!refreshToken) {
      // Nada que intentar — no es un rechazo del servidor, pero tampoco hay
      // refresh posible. Los call sites de runRefresh ya filtran este caso
      // antes de llamar (interceptor rama (c), boot chequea refreshToken),
      // así que en la práctica no se alcanza; se cubre por completitud.
      return { kind: 'rejected' }
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
        return { kind: 'rejected' }
      }
      await setTokens(accessToken, newRefresh)
      return { kind: 'ok', token: accessToken }
    } catch (err: unknown) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      if (isSessionRejectedStatus(status)) {
        log.warn('Refresh rechazado por el servidor', { status })
        await clearTokens()
        return { kind: 'rejected' }
      }
      // Sin response (red/timeout) o 5xx: transitorio. NO se borran los
      // tokens — el próximo intento (próxima request o próxima oleada de
      // 401s) vuelve a refrescar con la red ya recuperada.
      log.warn('Refresh no se pudo completar (red/servidor); se mantiene la sesión', {
        status,
      })
      return { kind: 'network' }
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
    // Sin respuesta del servidor = problema de red (sin internet, server caído
    // o timeout): axios deja `message` en inglés ("Network Error", "timeout of
    // …"). Se traduce acá, en el único choke-point de respuestas, para que TODO
    // consumidor de `err.message` / extractError muestre castellano al alumno.
    // Se excluyen las cancelaciones (ERR_CANCELED), que no son fallas de red y
    // no se muestran al usuario.
    if (!error.response && error.code !== 'ERR_CANCELED') {
      error.message = NETWORK_ERROR_MESSAGE
    }

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
    const result = await runRefresh()

    if (result.kind === 'ok') {
      config.__isRetry = true
      config.headers.Authorization = `Bearer ${result.token}`
      return instance(config)
    }

    if (result.kind === 'network') {
      // El refresh no se pudo completar por un problema transitorio (sin
      // response, timeout, o 5xx) — NO es el servidor diciendo "esta sesión
      // terminó". Se rechaza SOLO la request original, sin tocar tokens ni
      // redirigir a login: el socio sigue logueado y el próximo intento
      // vuelve a refrescar. Se traduce el mensaje para que se lea como lo
      // que es (una falla de red), no como una sesión inválida.
      error.message = NETWORK_ERROR_MESSAGE
      return Promise.reject(error)
    }

    // result.kind === 'rejected': el servidor rechazó explícitamente el
    // refresh (401/403) — ahí sí no hay sesión que mantener.
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

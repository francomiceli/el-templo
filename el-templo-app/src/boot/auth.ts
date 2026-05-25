import { boot } from 'quasar/wrappers'
import { useAuthStore } from 'stores/useAuthStore'
import { useUserStore } from 'stores/useUserStore'
import { api } from './axios'
import { useTokenStorage } from 'src/composables/useTokenStorage'
import { createLogger } from 'src/utils/logger'

const log = createLogger('boot/auth')

/**
 * Returns true if the JWT's `exp` claim is in the past.
 * On any parse/decode failure returns the value of `failClosed`:
 * we only treat an undecodable token as expired when a refresh token is
 * available (so a corrupt access token gets refreshed instead of silently
 * logging the user out). A legacy authToken (no refresh) is left alone.
 */
function isJwtExpired(token: string, failClosed: boolean): boolean {
  try {
    const payload = token.split('.')[1]
    if (!payload) {
      return failClosed
    }
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(
      decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      ),
    ) as { exp?: number }
    if (typeof json.exp !== 'number') {
      return failClosed
    }
    return json.exp * 1000 <= Date.now()
  } catch {
    return failClosed
  }
}

export default boot(async () => {
  const authStore = useAuthStore()
  const userStore = useUserStore()
  const { getAccessToken, getRefreshToken, setTokens, clearTokens, hasLegacyOnly } =
    useTokenStorage()

  let accessToken = await getAccessToken()
  const refreshToken = await getRefreshToken()

  if (!accessToken) {
    return
  }

  // Legacy single-key token: no `exp` worth refreshing and no refresh token —
  // it is still valid up to 7d, so skip the silent refresh and go straight to
  // /auth/me (D-03). If /auth/me rejects, the catch below clears as before.
  const legacyOnly = await hasLegacyOnly()

  // Req 11: if the access token is expired and we have a refresh token, refresh
  // silently BEFORE calling /auth/me so an active user is never logged out.
  if (!legacyOnly && refreshToken && isJwtExpired(accessToken, true)) {
    try {
      const { data } = await api.post('/auth/refresh', { refreshToken })
      if (data?.accessToken && data?.refreshToken) {
        await setTokens(data.accessToken, data.refreshToken)
        accessToken = data.accessToken
      } else {
        log.warn('Boot refresh returned no tokens')
        authStore.clearAuth()
        await clearTokens()
        return
      }
    } catch {
      // Refresh token invalid/revoked/expired — clear and stop.
      authStore.clearAuth()
      await clearTokens()
      return
    }
  }

  // Set the (valid or freshly-renewed) access token so the axios interceptor
  // attaches it on /auth/me.
  authStore.token = accessToken

  try {
    // Verify token is still valid by calling /me
    const response = await api.get('/auth/me')
    authStore.setAuth(accessToken, {
      id: response.data.id,
      email: response.data.email,
      role: response.data.role,
    })
    userStore.setProfile(response.data)
    // Phase 99: load persisted level selection for this user before boot
    // resolves — Quasar awaits this function, so the first MainLayout render
    // and the first session fetch see the hydrated selectedLevel.
    await userStore.hydrateSelection()
    // Hydrate subscription at boot so anything that depends on
    // hasActiveSubscription (e.g. the check-in QR FAB on /mi-templo) works
    // on first render, without requiring a visit to /reservas first.
    void userStore.loadSubscription()
  } catch {
    // Token invalid or expired, clear it
    authStore.clearAuth()
    await clearTokens()
  }
})

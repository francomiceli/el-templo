import { boot } from 'quasar/wrappers'
import { AxiosError } from 'axios'
import { useAuthStore } from 'stores/useAuthStore'
import type { AuthUser } from 'stores/useAuthStore'
import { useUserStore } from 'stores/useUserStore'
import { api, runRefresh, isSessionRejectedStatus } from './axios'
import { useTokenStorage } from 'src/composables/useTokenStorage'
import { createLogger } from 'src/utils/logger'

const log = createLogger('boot/auth')

/**
 * Decodes a JWT's payload (base64url → JSON) without verifying the
 * signature — this token was already issued and stored by OUR server on a
 * prior successful login/refresh, so its claims are trustworthy for reading;
 * verification happens server-side on every authenticated request. Returns
 * null on any parse/decode failure.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) {
      return null
    }
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(
      decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      ),
    ) as Record<string, unknown>
    return json
  } catch {
    return null
  }
}

/**
 * Returns true if the JWT's `exp` claim is in the past.
 * On any parse/decode failure returns the value of `failClosed`:
 * we only treat an undecodable token as expired when a refresh token is
 * available (so a corrupt access token gets refreshed instead of silently
 * logging the user out). A legacy authToken (no refresh) is left alone.
 */
function isJwtExpired(token: string, failClosed: boolean): boolean {
  const json = decodeJwtPayload(token)
  if (!json || typeof json.exp !== 'number') {
    return failClosed
  }
  return json.exp * 1000 <= Date.now()
}

const VALID_ROLES = new Set<AuthUser['role']>(['member', 'coach', 'admin', 'superadmin'])

/**
 * App 1.7.9 (boot optimista, causa raíz de deslogueos): reconstruye el
 * `AuthUser` mínimo (id/email/role) a partir de los claims del access token
 * YA guardado (`fastify.jwt.sign({ userId, email, role }, ...)` en el
 * server — ver el-templo-api/src/modules/auth/routes.ts), SIN red. Se usa
 * cuando el refresh o `/auth/me` no se pudieron completar por un problema
 * transitorio (no cuando el servidor rechazó la sesión): permite arrancar la
 * app en el área logueada con el último token válido conocido, en vez de
 * desloguear a un socio con sesión activa por un corte de red. El perfil
 * rico (nombre, nivel, etc.) queda sin cargar hasta que se pueda reintentar
 * `/auth/me` con la red de vuelta (ver `useUserStore.retryProfileLoad`,
 * disparado desde el router en la primera navegación).
 */
function decodeAuthUser(token: string): AuthUser | null {
  const claims = decodeJwtPayload(token)
  if (!claims) return null
  const { userId, email, role } = claims
  if (typeof userId !== 'number' || typeof email !== 'string') return null
  if (typeof role !== 'string' || !VALID_ROLES.has(role as AuthUser['role'])) return null
  return { id: userId, email, role: role as AuthUser['role'] }
}

/**
 * Core boot logic, exported (unwrapped from `boot()`) so the unit test can
 * exercise it directly — same pattern as `createAuthErrorHandler` in
 * `boot/axios.ts`.
 */
export async function runAuthBoot(): Promise<void> {
  const authStore = useAuthStore()
  const userStore = useUserStore()
  const { getAccessToken, getRefreshToken, clearTokens, hasLegacyOnly } = useTokenStorage()

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
  // Reuses the SAME shared refresh (lock + discrimination) as the axios
  // interceptor — one place decides "rejected vs. network", never two.
  if (!legacyOnly && refreshToken && isJwtExpired(accessToken, true)) {
    const result = await runRefresh()
    if (result.kind === 'ok') {
      accessToken = result.token
    } else if (result.kind === 'rejected') {
      // El servidor rechazó la sesión (revocada/replay) — sin sesión.
      authStore.clearAuth()
      await clearTokens()
      return
    } else {
      // kind === 'network': no se pudo refrescar por un problema transitorio.
      // El access token sigue expirado — llamar a /auth/me ahora devolvería
      // un 401 indistinguible de "sesión revocada" y desloguearía a un socio
      // con sesión válida por un simple corte de red (la causa raíz de esta
      // fase). Boot OPTIMISTA en su lugar: se decodifican los claims del
      // token ya emitido por nuestro server para poblar la sesión sin red.
      const optimisticUser = decodeAuthUser(accessToken)
      if (optimisticUser) {
        authStore.token = accessToken
        authStore.setAuth(accessToken, optimisticUser)
        userStore.markProfileStale()
      }
      // Sin claims decodificables no hay nada seguro que mostrar — se deja
      // como estaba (sin sesión), en vez de arriesgar un estado a medias.
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
  } catch (err: unknown) {
    const status = err instanceof AxiosError ? err.response?.status : undefined
    if (isSessionRejectedStatus(status)) {
      // El servidor rechazó la sesión (401/403) — recién ahí desloguear.
      authStore.clearAuth()
      await clearTokens()
    } else {
      // Red/timeout/5xx: no sabemos si la sesión sigue viva, pero el
      // servidor tampoco dijo que no — se mantiene logueado (boot
      // optimista) con el `AuthUser` mínimo de los claims del token, y el
      // perfil rico queda marcado para reintentar cuando vuelva la red.
      log.warn('No se pudo verificar la sesión (/auth/me); se mantiene logueado', { status })
      const optimisticUser = decodeAuthUser(accessToken)
      if (optimisticUser) {
        authStore.setAuth(accessToken, optimisticUser)
      }
      userStore.markProfileStale()
    }
  }
}

export default boot(runAuthBoot)

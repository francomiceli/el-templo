/**
 * useMagicLink() — canje token→sesión compartido por la ruta web (`/r/trial`,
 * `MagicLinkPage.vue`) y, a futuro, el listener nativo de deep links
 * (Phase 180, D-03/D-04/D-05/D-21).
 *
 * `exchange(token)` llama a `POST /campaigns/exchange` (plan 180-06) y:
 *   - D-04: si ya había sesión de OTRO usuario (o ninguna), hace `logout()`
 *     COMPLETO antes de persistir la nueva — nunca `setTokens` sobre estado
 *     Pinia ajeno. Si la sesión ya era del MISMO usuario, no toca tokens ni
 *     perfil (evita un re-login innecesario).
 *   - D-05: un token vencido/inválido/de tracking nunca lanza — el caller
 *     decide la navegación de degradación (MagicLinkPage → `/login`).
 *   - D-21: tras un canje exitoso, marca un bypass del guard de onboarding
 *     (ver `isMagicLinkOnboardingBypass` más abajo) para que el freemium
 *     recién logueado no quede atrapado en el onboarding intermedio.
 *   - T-180-27: el token NUNCA se loguea, ni siquiera un prefijo.
 */

import { AxiosError } from 'axios'
import { api } from 'src/boot/axios'
import { useAuthStore } from 'src/stores/useAuthStore'
import { useUserStore, type UserProfile } from 'src/stores/useUserStore'
import { useTokenStorage } from 'src/composables/useTokenStorage'
import { createLogger } from 'src/utils/logger'

const log = createLogger('useMagicLink')

/**
 * Traducción de la CLAVE simbólica que devuelve la API (D-13) a una ruta
 * interna. Por el cable nunca viaja una URL — solo una de estas 3 claves
 * (anti open-redirect, T-180-51/T-180-28).
 */
export const MAGIC_LINK_ROUTE_BY_DESTINATION = {
  'reservas-prueba': '/reservas?trial=1',
  volver: '/volver',
  reservas: '/reservas',
} as const

const FALLBACK_ROUTE = '/reservas?trial=1'

/**
 * Resuelve una clave de destino a una ruta interna. Clave desconocida (o un
 * hint `?d=` manipulado en el camino de degradación de `MagicLinkPage`) cae
 * siempre al fallback fijo — nunca se navega a algo derivado del input.
 */
export function resolveMagicLinkRoute(destination: string): string {
  if (Object.prototype.hasOwnProperty.call(MAGIC_LINK_ROUTE_BY_DESTINATION, destination)) {
    return MAGIC_LINK_ROUTE_BY_DESTINATION[
      destination as keyof typeof MAGIC_LINK_ROUTE_BY_DESTINATION
    ]
  }
  return FALLBACK_ROUTE
}

// ---------------------------------------------------------------------------
// D-21: bypass del guard de onboarding.
//
// El perfil del socio (`UserProfile`) NO expone un campo `status`/`freemium`
// (verificado: `grep -rn "status" src/stores/useUserStore.ts` solo devuelve
// `SubscriptionStatus`, sin relación con el freemium). Por eso el bypass es
// una bandera de SESIÓN, module-scope de este composable — no un campo de
// `useAuthStore` (fuera de `files_modified` de este plan) — y se ata al
// `userId` exacto que acaba de canjear, no a un booleano global:
//
//   - Evita fuga en device compartido: si después del canje otro socio hace
//     un login NORMAL (no magic-link) en el mismo tab, su `userId` no
//     coincide con `bypassUserId` ⇒ el bypass NO se extiende a él, sin
//     necesitar que `logout()` (fuera de scope de este plan) lo resetee
//     explícitamente.
//   - Una vez que ese mismo socio completa el onboarding, el guard deja de
//     mirar el bypass (el `if` de onboarding ni siquiera se evalúa), así que
//     no hay forma de que la bandera "reviva" un bypass indebido más tarde.
// ---------------------------------------------------------------------------
let bypassUserId: number | null = null

/** Usado por `router/index.ts` para armar el input de `resolveGuardRedirect`. */
export function isMagicLinkOnboardingBypass(currentUserId: number | undefined): boolean {
  return bypassUserId !== null && bypassUserId === currentUserId
}

/** Test-only reset so a fresh test starts from a clean slate. */
export function __resetMagicLinkBypass(): void {
  bypassUserId = null
}

interface ExchangeResponseUser {
  id: number
  email: string | null
  firstName: string | null
  lastName: string | null
  role: 'member' | 'coach' | 'admin' | 'superadmin'
  level: string
  branchId: number
  branchName: string | null
  branchIsVirtual: boolean
  branchCountry: string
  gender: string | null
  dateOfBirth: string | null
  onboardingCompleted: boolean
}

interface ExchangeResponseData {
  accessToken: string
  refreshToken: string
  user: ExchangeResponseUser
  destination: string
}

export type MagicLinkExchangeOutcome = { ok: true; destination: string } | { ok: false }

export function useMagicLink() {
  let abortController: AbortController | null = null

  function getSignal(): AbortSignal {
    abortController = new AbortController()
    return abortController.signal
  }

  async function exchange(token: string): Promise<MagicLinkExchangeOutcome> {
    const authStore = useAuthStore()
    const userStore = useUserStore()
    const { setTokens } = useTokenStorage()

    try {
      const response = await api.post<ExchangeResponseData>(
        '/campaigns/exchange',
        { token },
        { signal: getSignal() },
      )
      const { accessToken, refreshToken, user, destination } = response.data

      const sameUser = !!authStore.user && authStore.user.id === user.id
      if (!sameUser) {
        // D-04: logout COMPLETO (tokens + selección + perfil) ANTES de
        // persistir la sesión nueva. Nunca setTokens sobre estado ajeno.
        await authStore.logout()
        await setTokens(accessToken, refreshToken)
        authStore.setAuth(accessToken, {
          id: user.id,
          email: user.email ?? '',
          role: user.role,
        })
        const profile: UserProfile = {
          id: user.id,
          email: user.email ?? '',
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          level: user.level as UserProfile['level'],
          branchId: user.branchId,
          branchName: user.branchName ?? '',
          branchIsVirtual: user.branchIsVirtual,
          branchCountry: (user.branchCountry as UserProfile['branchCountry']) ?? 'AR',
          segment: null,
          onboardingCompleted: user.onboardingCompleted,
          gender: user.gender as UserProfile['gender'],
          dateOfBirth: user.dateOfBirth,
          barChallengeCompleted: null,
          barChallengeSeconds: null,
          barChallengeAttemptedAt: null,
        }
        userStore.setProfile(profile)
        await userStore.hydrateSelection()
      }

      // D-21: cualquier canje exitoso (misma sesión o reemplazo) activa el
      // bypass del guard de onboarding para ESTE userId.
      bypassUserId = user.id

      return { ok: true, destination }
    } catch (err: unknown) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      if (status === 401) {
        // Camino normal de un link viejo/vencido (D-05) — warn, no error
        // (evita ruido en Sentry por cada link viejo clickeado).
        log.warn('Token de magic link invalido o vencido')
        return { ok: false }
      }
      log.error('Fallo inesperado al canjear el magic link', {
        status: status ?? null,
        error: err instanceof Error ? err.message : String(err),
      })
      return { ok: false }
    } finally {
      abortController = null
    }
  }

  function cleanup() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  return {
    exchange,
    cleanup,
  }
}

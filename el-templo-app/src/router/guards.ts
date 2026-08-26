/**
 * Decisión pura del guard global de navegación (Phase 180, D-21).
 *
 * `resolveGuardRedirect` es un MOVE mecánico de la lógica que vivía en el
 * `beforeEach` de `router/index.ts` (auth, home-si-público, onboarding,
 * crash-recovery del bar challenge) + los dos casos nuevos de esta fase:
 *
 *   - `authAgnosticRoutes` (`magic-link`, la ruta `/r/trial`): NO se suma a
 *     `publicRoutes` a propósito. Si lo hiciera, el segundo `if`
 *     (`authenticated && isPublicRoute → home`) mandaría a home al usuario
 *     que YA está logueado — exactamente el caso D-04 "misma sesión" —
 *     perdiendo el destino que el canje todavía tiene que resolver. Por eso
 *     este caso se resuelve ANTES de ambos `if` de auth: ni login (sin
 *     sesión, el canje todavía no ocurrió) ni home (con sesión).
 *
 *   - Excepción de onboarding (D-21, T-180-52): el `isFreemium` del input
 *     exceptúa el guard de onboarding SOLO cuando es `true` — un socio
 *     `member` sin onboarding que NO es freemium sigue yendo a `onboarding`
 *     sin cambios. El caller decide cómo deriva `isFreemium` (ver
 *     `src/composables/useMagicLink.ts#isMagicLinkOnboardingBypass`).
 *
 * Sin dependencias de Pinia ni del router: función pura, testeable con
 * inputs planos (`test/router-guard.test.ts`).
 */

export const publicRoutes = ['login', 'register']

/** Rutas que se saltean AMBOS `if` de auth — ni login ni home (D-03/D-04). */
export const authAgnosticRoutes = ['magic-link']

export interface GuardInput {
  toName?: string
  toPath: string
  fromName?: string
  isAuthenticated: boolean
  role?: string
  onboardingCompleted: boolean
  /** D-21: true cuando el usuario acaba de canjear un magic-link como freemium. */
  isFreemium: boolean
  hasActiveBarAttempt: boolean
}

export function resolveGuardRedirect(input: GuardInput): { name: string } | true {
  const {
    toName,
    toPath,
    fromName,
    isAuthenticated,
    role,
    onboardingCompleted,
    isFreemium,
    hasActiveBarAttempt,
  } = input

  // D-03/D-04: la ruta del canje no es ni pública-solo-sin-sesión ni
  // protegida — se saltea la decisión de auth por completo.
  const isAuthAgnosticRoute = !!toName && authAgnosticRoutes.includes(toName)
  if (isAuthAgnosticRoute) {
    return true
  }

  const isPublicRoute = !!toName && publicRoutes.includes(toName)

  // No autenticado intentando acceder a una ruta protegida.
  if (!isAuthenticated && !isPublicRoute) {
    return { name: 'login' }
  }

  // Autenticado intentando acceder a login/register.
  if (isAuthenticated && isPublicRoute) {
    return { name: 'home' }
  }

  // Onboarding guard — mandatorio para members que no lo completaron
  // (D-15, D-17), EXCEPTO cuando `isFreemium` (D-21, T-180-52): el objetivo
  // de la fase es eliminar pasos entre el click del magic-link y la reserva,
  // así que un freemium recién canjeado no se topa con el onboarding
  // intermedio. Un member NO freemium sin onboarding sigue yendo a onboarding.
  if (
    isAuthenticated &&
    toName !== 'onboarding' &&
    role === 'member' &&
    !onboardingCompleted &&
    !isFreemium
  ) {
    return { name: 'onboarding' }
  }

  // Bar Challenge crash-recovery guard (post-launch 2026-05-22): en iOS,
  // abrir la cámara nativa puede matar el WKWebView. Cuando Capacitor
  // relanza, aterriza en `/` → home. Si hay un intento activo persistido,
  // redirigimos al timer en vez de mostrar Mi Templo.
  //
  // SÓLO en navegación inicial (`fromName` undefined). Evita interceptar al
  // usuario cuando navega intencionalmente fuera del timer.
  const isInitialNav = fromName === undefined
  const isHomeBound = toName === 'home' || toPath === '/' || toPath === '/mi-templo'
  if (isAuthenticated && isInitialNav && isHomeBound && hasActiveBarAttempt) {
    return { name: 'desafio-barra-timer' }
  }

  return true
}

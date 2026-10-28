/**
 * Fase 203 (D-07, D-09): qué dice la fila "Tu plan" de Perfil (hacia /planes).
 *
 * `resolveProfileSubscriptionView(input)` es PURA: sin stores, sin red, sin reloj.
 *
 * Regla de fondo (D-09): "todavía no sé" nunca se dibuja como "no". "Sin plan activo" es una
 * afirmación; solo sale con la suscripción llegada y sin falla de red.
 *
 *  - 'content': hay un plan activo (active|paused): se muestra su nombre. También en un refresco
 *    que falló: es el último dato bueno que conserva el store.
 *  - 'skeleton': la suscripción todavía no llegó y el tope no venció.
 *  - 'unknown': "No pudimos cargar tu plan". Una falla de red es "no sé" y sale al instante, sin
 *    esperar el tope (D-07: el tope es solo para lo que TARDA). Pasado el tope sin respuesta
 *    también es 'unknown'.
 *  - 'none': llegó sin plan activo y sin falla: "Sin plan activo".
 *
 * El nombre y el tipo se conservan aunque hoy gobiernan la fila "Tu plan" y no una card.
 */

export type ProfileSubscriptionView = 'skeleton' | 'content' | 'none' | 'unknown'

export interface ProfileSubscriptionViewInput {
  /** `userStore.subscriptionLoaded` (true también tras una falla; ver `subscriptionFailed`). */
  subscriptionLoaded: boolean
  /** `userStore.subscriptionFailed`: falló con algo distinto de 404. */
  subscriptionFailed: boolean
  /** `userStore.hasActiveSubscription`: status active|paused. */
  hasActivePlan: boolean
  /** Venció el tope de carga (`useLoadDeadline().passed`). */
  deadlinePassed: boolean
}

export function resolveProfileSubscriptionView(
  i: ProfileSubscriptionViewInput,
): ProfileSubscriptionView {
  if (i.hasActivePlan) return 'content'
  if (!i.subscriptionLoaded) return i.deadlinePassed ? 'unknown' : 'skeleton'
  if (i.subscriptionFailed) return 'unknown'
  return 'none'
}

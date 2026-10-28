/**
 * Fase 203 (D-07, D-08, D-09): qué muestra la pestaña Entrenar mientras carga el socio.
 *
 * `resolveTrainingIndexView(input)` es PURA: sin stores, sin red, sin reloj. Todo (incluido el
 * tope de carga ya vencido o no) entra por `input`, así cada combinación se prueba sin montar nada.
 *
 * Regla de fondo (D-09): "todavía no sé" nunca se dibuja como "no". La vidriera ("Activá tu plan")
 * es una afirmación de que el socio no tiene con qué entrenar; solo se muestra con TODOS los datos
 * llegados y sin ninguna falla. Un socio solo-online jamás la ve un instante.
 *
 * Precedencia (en este orden):
 *  1. Perfil primero, espera SIEMPRE. D-08 manda sobre D-07 para el perfil: sin perfil no hay
 *     sede ni zona horaria ni nada con qué decidir, así que 'loading' aunque haya vencido el
 *     tope (lo resuelve `retryProfileLoad`).
 *  2. Estado del socio (suscripción, programa, inscripciones): espera hasta el tope (D-07). Pasado
 *     el tope se muestra Entrenar, nunca la vidriera: EntrenarView pide `/sessions/weekly`, que el
 *     server gatea, así que no se expone nada sin permiso.
 *  3. Fallas: salen al instante, sin esperar el tope (D-07 literal "falla O tarda": un pedido que
 *     falló no va a llegar más tarde). Una falla es "no sé", nunca "no": si no se puede afirmar
 *     que no entra, se muestra Entrenar. El tope queda solo para lo que TARDA.
 *
 * Con todo llegado y `canEnterTraining`, siempre 'entrenar': el dato previo que el store conserva
 * tras una falla alcanza para afirmar que entra.
 */

export type TrainingIndexView = 'loading' | 'vidriera' | 'entrenar'

export interface TrainingIndexViewInput {
  /** `userStore.profile !== null`. */
  profileLoaded: boolean
  /** `userStore.memberStateLoaded`: respondieron las fuentes de la carga del socio. */
  memberStateLoaded: boolean
  /** `userStore.subscriptionFailed`: falló la suscripción con algo distinto de 404. */
  subscriptionFailed: boolean
  /** `userStore.programFailed`: falló my-progress o current-program / inscripciones. */
  programFailed: boolean
  /** `hasPresencialPlan || allActiveEnrollments.length > 0`. */
  canEnterTraining: boolean
  /** Venció el tope de carga (`useLoadDeadline().passed`). */
  deadlinePassed: boolean
}

export function resolveTrainingIndexView(i: TrainingIndexViewInput): TrainingIndexView {
  // 1. Sin perfil: espera siempre, con o sin tope (D-08 manda sobre D-07).
  if (!i.profileLoaded) return 'loading'

  // 2. Estado del socio sin llegar: espera hasta el tope; vencido, Entrenar (nunca la vidriera).
  if (!i.memberStateLoaded) return i.deadlinePassed ? 'entrenar' : 'loading'

  // Todo llegado y entra (aun con una falla: queda el último dato bueno).
  if (i.canEnterTraining) return 'entrenar'

  // 3. Una falla es "no sé", nunca "no": Entrenar al instante, sin esperar el tope.
  if (i.subscriptionFailed || i.programFailed) return 'entrenar'

  // Todo llegado, sin fallas y sin con qué entrar: la vidriera es una afirmación verdadera.
  return 'vidriera'
}

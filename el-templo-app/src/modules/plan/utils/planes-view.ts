/**
 * Fase 203 (D-04, D-07, D-08): qué muestra cada sección de la página Planes mientras carga.
 *
 * `resolvePlanesView(input)` es PURA: sin stores, sin red, sin reloj. Todo (incluido el tope
 * de carga ya vencido o no) entra por `input`, así cada combinación se prueba sin montar nada.
 *
 * Reglas:
 *  - D-04, la página aparece completa de una vez: mientras falte alguna fuente y el tope no
 *    venció, `page` es 'skeleton' (las tres secciones en esqueleto, en su orden). Nunca se ven
 *    los planes regulares solos arriba de "Planes por objetivos".
 *  - Nunca cambia el orden: una sección pendiente conserva su lugar con un esqueleto y se
 *    completa sola cuando llega su dato (Tu plan -> Planes por objetivos -> Planes regulares).
 *  - Un fallo nunca se dibuja como "No hay planes": los planes caídos son 'error' (con
 *    Reintentar), distinto de 'empty' (el server respondió 2xx sin planes).
 *  - Las fallas cuentan como resueltas: salen al instante, sin esperar el tope. El tope (D-07)
 *    es solo para lo que TARDA: pasado el tope, cada sección que falta conserva su esqueleto.
 *  - D-08 manda sobre D-07 para el perfil: sin la zona de la sede no hay "hoy" real, así que
 *    Tu plan queda en esqueleto aunque pase el tope.
 *  - La pill "Tu plan" de los regulares cruza el resumen con la lista de planes: los regulares
 *    no se dibujan hasta que llegaron los dos (un resumen caído cuenta como resuelto y
 *    simplemente no hay pill), así la pill nunca aparece después.
 *  - Una falla de my-progress sin inscripción conocida es "no sé", nunca "no inscripto".
 */

export type SectionState = 'skeleton' | 'show' | 'hide'
export type TuPlanState = 'skeleton' | 'show' | 'error'
export type RegularesState = 'skeleton' | 'content' | 'empty' | 'error'

export interface PlanesViewInput {
  /** Ya respondió plan-summary, bien o mal. */
  summarySettled: boolean
  /** La última carga del resumen falló y no hay resumen previo. */
  summaryFailed: boolean
  /** El socio tocó "Reintentar" en Tu plan y el pedido está en vuelo. */
  summaryRetrying: boolean
  /** `userStore.profile !== null`: la zona de la sede para calcular "hoy". */
  profileReady: boolean
  /** Ya respondió `/members/subscription/plans`, bien o mal. */
  plansSettled: boolean
  /** La última carga de planes falló y no hay planes previos. */
  plansFailed: boolean
  /** El socio tocó "Reintentar" en los regulares y el pedido está en vuelo. */
  plansRetrying: boolean
  /** Cantidad de planes de `/members/subscription/plans`. */
  plansCount: number
  /** Ya respondió `getCatalog()`, bien o mal. */
  catalogSettled: boolean
  /** Cantidad de objetivos de `getCatalog()` (0 si falló). */
  catalogCount: number
  /** `userStore.myProgressLoaded`. */
  myProgressSettled: boolean
  /** `userStore.myProgressFailed`. */
  myProgressFailed: boolean
  /** Hay `userStore.myProgress?.programId`. */
  hasEnrollment: boolean
  /** Venció el tope de carga (`useLoadDeadline().passed`). */
  deadlinePassed: boolean
}

export interface PlanesView {
  page: 'skeleton' | 'sections'
  tuPlan: TuPlanState
  objetivos: SectionState
  regulares: RegularesState
  /** 'unknown': no se afirma "inscripto" ni "no inscripto" en las cards de Por objetivos. */
  enrollment: 'known' | 'unknown'
}

export function resolvePlanesView(i: PlanesViewInput): PlanesView {
  const allIn =
    i.summarySettled && i.profileReady && i.plansSettled && i.catalogSettled && i.myProgressSettled

  if (!allIn && !i.deadlinePassed) {
    return {
      page: 'skeleton',
      tuPlan: 'skeleton',
      objetivos: 'skeleton',
      regulares: 'skeleton',
      enrollment: 'unknown',
    }
  }

  let tuPlan: TuPlanState
  if (i.summaryRetrying || !i.summarySettled) tuPlan = 'skeleton'
  else if (i.summaryFailed) tuPlan = 'error'
  else if (!i.profileReady) tuPlan = 'skeleton'
  else tuPlan = 'show'

  let objetivos: SectionState
  if (!i.catalogSettled) objetivos = 'skeleton'
  else objetivos = i.catalogCount > 0 ? 'show' : 'hide'

  // Primero lo pendiente (esqueleto), después la falla, después vacío / contenido.
  let regulares: RegularesState
  if (!i.plansSettled || i.plansRetrying || !i.summarySettled) regulares = 'skeleton'
  else if (i.plansFailed) regulares = 'error'
  else regulares = i.plansCount === 0 ? 'empty' : 'content'

  const enrollment =
    !i.myProgressSettled || (i.myProgressFailed && !i.hasEnrollment) ? 'unknown' : 'known'

  return { page: 'sections', tuPlan, objetivos, regulares, enrollment }
}

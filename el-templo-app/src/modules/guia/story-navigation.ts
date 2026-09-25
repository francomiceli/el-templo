/**
 * Lógica pura de navegación de las historias "Empezá acá" (SPEC B). Separada
 * de `EmpezaAcaPage.vue` a propósito: es la parte con reglas (qué significa
 * "siguiente" en el último slide, qué significa "completado") y por eso es la
 * que vale la pena poder testear sin montar un componente Vue.
 */

export type StoryAction = 'next' | 'prev' | 'close'

export interface StoryNavResult {
  /** Índice del slide después de aplicar la acción. */
  index: number
  /** true si la acción debe cerrar la pantalla de historias. */
  closed: boolean
  /** true si el cierre ocurre porque el socio llegó al final (tap derecho / CTA en el último slide). */
  completed: boolean
}

/**
 * Reduce el estado de navegación dado el slide actual, el total de slides y
 * la acción del socio (tap derecha, tap izquierda, cerrar/swipe-down/X).
 *
 * - `close`: cierra sin marcar completado (el socio se fue antes del final).
 * - `prev`: retrocede un slide, sin pasar de 0.
 * - `next` en el último slide: cierra Y marca completado (llegó al final).
 * - `next` en cualquier otro slide: avanza uno.
 */
export function reduceStoryNav(
  current: number,
  total: number,
  action: StoryAction,
): StoryNavResult {
  if (total <= 0) {
    return { index: 0, closed: true, completed: false }
  }

  if (action === 'close') {
    return { index: current, closed: true, completed: false }
  }

  if (action === 'prev') {
    return { index: Math.max(current - 1, 0), closed: false, completed: false }
  }

  // action === 'next'
  if (current >= total - 1) {
    return { index: current, closed: true, completed: true }
  }
  return { index: current + 1, closed: false, completed: false }
}

/** true si `index` es el último slide de `total`. */
export function isLastSlide(index: number, total: number): boolean {
  return total > 0 && index === total - 1
}

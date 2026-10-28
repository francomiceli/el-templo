/**
 * Regla única de carga para un lugar de card (fase 203, D-01/D-02/D-07).
 *
 * Utils PURO: no lee stores ni relojes; el llamador pasa el estado. Tabla cerrada (única fuente
 * de verdad, la consumen todas las pantallas tal cual):
 *
 * - `settled`                                   → `hasContent === true ? 'content' : 'hidden'`
 * - `!settled && reserve === 'always'`          → `deadlinePassed ? 'hidden' : 'skeleton'`
 * - `!settled && reserve === 'if-had-content'`  → `hadContentLastTime === true && !deadlinePassed
 *                                                    ? 'skeleton' : 'hidden'`
 *
 * Las excepciones de una pantalla (p. ej. "Para vos" con el tope vencido → 'content') se
 * resuelven en el LLAMADOR antes de llamar a `resolveSlot`, nunca cambiando esta tabla.
 */

export type SlotState = 'skeleton' | 'content' | 'hidden'

export interface SlotInput {
  /**
   * `always`: la card siempre tiene contenido (D-01), se reserva el lugar mientras carga.
   * `if-had-content`: la card puede terminar vacía (D-02), solo se reserva el lugar si la
   * última vez tuvo contenido.
   */
  reserve: 'always' | 'if-had-content'
  /** La fuente ya respondió (bien o mal). Un error cuenta como `settled` sin contenido. */
  settled: boolean
  /**
   * Afirmación EXPLÍCITA de que hay algo para dibujar. Sin ella (`undefined`) no se dibuja
   * nada: el llamador que sabe que siempre hay contenido pasa `true`.
   */
  hasContent?: boolean
  /** Flag guardado en el teléfono (`useCardHadContentStore.hadContent`). */
  hadContentLastTime?: boolean
  /** El tope de D-07 (`useLoadDeadline().passed`) ya venció. */
  deadlinePassed?: boolean
}

/**
 * Decide si un lugar muestra esqueleto, contenido u oculto. Tope vencido sin dato → 'hidden'
 * (D-07: no se inventa nada; el lugar se completa solo cuando llega el dato). Los stores son
 * fail-open: un error se trata como `settled` sin contenido, así nunca queda un esqueleto
 * colgado.
 */
export function resolveSlot(i: SlotInput): SlotState {
  if (i.settled) return i.hasContent === true ? 'content' : 'hidden'
  if (i.reserve === 'always') return i.deadlinePassed === true ? 'hidden' : 'skeleton'
  return i.hadContentLastTime === true && i.deadlinePassed !== true ? 'skeleton' : 'hidden'
}

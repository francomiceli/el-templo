/**
 * Desplazamiento horizontal de un texto que no entra en su ancho (`MarqueeText.vue`).
 *
 * Ciclo: pausa al inicio, el texto se desliza hasta mostrar su final, pausa y vuelve al inicio.
 * Funciones puras: sin reloj, sin DOM.
 */

/** Pausa quieta al inicio y al final del recorrido. */
export const MARQUEE_HOLD_MS = 1500
/** Velocidad del recorrido (px por segundo). */
export const MARQUEE_PX_PER_S = 40
/** Lo que tarda en volver al inicio. */
export const MARQUEE_RETURN_MS = 600

/** Diferencia de ancho que se ignora (redondeos de subpíxel). */
const OVERFLOW_TOLERANCE_PX = 1

/** Cuántos px de ancho le sobran al texto respecto de su contenedor (0 si entra, tolerancia 1 px). */
export function horizontalOverflowPx(textWidth: number, boxWidth: number): number {
  const diff = textWidth - boxWidth
  if (diff <= OVERFLOW_TOLERANCE_PX) return 0
  return Math.ceil(diff)
}

/** Duración de un ciclo completo para un texto que desborda `overflowPx` px (0 = no hay ciclo). */
export function marqueeCycleMs(overflowPx: number): number {
  if (overflowPx <= 0) return 0
  const travelMs = Math.ceil((overflowPx / MARQUEE_PX_PER_S) * 1000)
  return MARQUEE_HOLD_MS + travelMs + MARQUEE_HOLD_MS + MARQUEE_RETURN_MS
}

/** Keyframes del ciclo (pausa, recorrido lineal, pausa, vuelta). `[]` si el texto no desborda. */
export function marqueeKeyframes(overflowPx: number): Keyframe[] {
  const cycle = marqueeCycleMs(overflowPx)
  if (cycle <= 0) return []
  const travelMs = cycle - 2 * MARQUEE_HOLD_MS - MARQUEE_RETURN_MS
  const startMove = MARQUEE_HOLD_MS / cycle
  const endMove = (MARQUEE_HOLD_MS + travelMs) / cycle
  const startBack = (2 * MARQUEE_HOLD_MS + travelMs) / cycle
  const end = `translateX(-${overflowPx}px)`
  return [
    { transform: 'translateX(0)', offset: 0 },
    { transform: 'translateX(0)', offset: startMove, easing: 'linear' },
    { transform: end, offset: endMove },
    { transform: end, offset: startBack, easing: 'ease-in-out' },
    { transform: 'translateX(0)', offset: 1 },
  ]
}

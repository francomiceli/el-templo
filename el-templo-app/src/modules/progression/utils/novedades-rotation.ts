/**
 * Reloj único de la card de Novedades (UAT D13 barra de progreso + D19 texto largo).
 *
 * Una novedad se muestra `novedadDwellMs(overflowPx)` milisegundos. Ese mismo valor
 * gobierna el `setTimeout` de la rotación, la `animation-duration` de la barra y la
 * duración del desplazamiento horizontal: "la barra dura lo mismo que el
 * desplazamiento" se cumple por construcción (confirmación C3 de Franco).
 *
 * Por qué la duración se estira: a 4,5 s fijos, una novedad de 200 caracteres (el
 * máximo del API) correría a ~350 px/s, ilegible. Con desbordamiento el tiempo
 * crece para que el desplazamiento vaya a ~`MARQUEE_PX_PER_S`, con una pausa
 * `MARQUEE_HOLD_MS` al inicio y otra al final para poder leer los extremos.
 *
 * Funciones puras: sin reloj, sin DOM.
 */

/** Tiempo de exhibición de una novedad que entra en una línea (D-8). */
export const NOVEDAD_ROTATE_MS = 4500
/** Pausa quieta al inicio y al final del desplazamiento. */
export const MARQUEE_HOLD_MS = 900
/** Velocidad del desplazamiento (px por segundo). */
export const MARQUEE_PX_PER_S = 45

/** Diferencia de ancho que se ignora (redondeos de subpíxel). */
const OVERFLOW_TOLERANCE_PX = 1

/** Cuántos px sobra el texto respecto del contenedor (0 si entra, tolerancia 1 px). */
export function marqueeOverflowPx(scrollWidth: number, clientWidth: number): number {
  const diff = scrollWidth - clientWidth
  if (diff <= OVERFLOW_TOLERANCE_PX) return 0
  return Math.ceil(diff)
}

/** Cuánto se muestra una novedad que desborda `overflowPx` px (0 = entra). */
export function novedadDwellMs(overflowPx: number): number {
  if (overflowPx <= 0) return NOVEDAD_ROTATE_MS
  const travelMs = Math.ceil((overflowPx / MARQUEE_PX_PER_S) * 1000)
  return Math.max(NOVEDAD_ROTATE_MS, 2 * MARQUEE_HOLD_MS + travelMs)
}

/** Keyframes del desplazamiento: pausa, recorrido lineal, pausa. `[]` si no desborda. */
export function marqueeKeyframes(overflowPx: number, dwellMs: number): Keyframe[] {
  if (overflowPx <= 0 || dwellMs <= 0) return []
  const hold = MARQUEE_HOLD_MS / dwellMs
  const end = `translateX(-${overflowPx}px)`
  return [
    { transform: 'translateX(0)', offset: 0 },
    { transform: 'translateX(0)', offset: hold },
    { transform: end, offset: 1 - hold },
    { transform: end, offset: 1 },
  ]
}

/**
 * Reloj único de la card de Novedades (UAT D13 barra de progreso + D19 texto largo).
 *
 * Una novedad se muestra `novedadDwellMs(overflowPx)` milisegundos. Ese mismo valor
 * gobierna el `setTimeout` de la rotación, la `animation-duration` de la barra y la
 * duración del desplazamiento: "la barra dura lo mismo que el desplazamiento" se
 * cumple por construcción (confirmación C3 de Franco).
 *
 * 2026-10-18: el texto ocupa DOS líneas (sin la línea de sede/fecha). Si no entra,
 * se desplaza hacia arriba (`translateY`), ya no de costado: el desplazamiento
 * horizontal no funciona con texto en más de una línea.
 *
 * Por qué la duración se estira: a 4,5 s fijos, una novedad de 120 caracteres (el
 * máximo del API) no se llega a leer. Con desbordamiento el tiempo crece para que
 * el texto suba a ~`MARQUEE_PX_PER_S` (una línea de ~20 px cada ~2 s), con una
 * pausa `MARQUEE_HOLD_MS` al inicio (leer las dos primeras líneas) y otra al final.
 *
 * Funciones puras: sin reloj, sin DOM.
 */

/** Tiempo de exhibición de una novedad que entra en las dos líneas (D-8). */
export const NOVEDAD_ROTATE_MS = 4500
/** Pausa quieta al inicio y al final del desplazamiento. */
export const MARQUEE_HOLD_MS = 1500
/** Velocidad del desplazamiento vertical (px por segundo): ~2 s por línea de lectura. */
export const MARQUEE_PX_PER_S = 10

/** Diferencia de ancho que se ignora (redondeos de subpíxel). */
const OVERFLOW_TOLERANCE_PX = 1

/** Cuántos px de alto sobra el texto respecto del contenedor (0 si entra, tolerancia 1 px). */
export function marqueeOverflowPx(scrollHeight: number, clientHeight: number): number {
  const diff = scrollHeight - clientHeight
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
  const end = `translateY(-${overflowPx}px)`
  return [
    { transform: 'translateY(0)', offset: 0 },
    { transform: 'translateY(0)', offset: hold },
    { transform: end, offset: 1 - hold },
    { transform: end, offset: 1 },
  ]
}

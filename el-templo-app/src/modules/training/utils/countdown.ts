/**
 * Tiempos del 3-2-1 (`CountdownOverlay`). Las constantes viven acá para que el contrato con las
 * páginas (DayPlayer, FreeBlockPlayer, GoalPlanSession: esperan `done` y recién ahí arrancan el
 * bloque) quede testeado y el cartel nuevo no lo mueva.
 *
 * Línea de tiempo (igual que antes del cartel "tallado en piedra"): el 3 sale a t=0, el 2 a 1 s,
 * el 1 a 2 s y "¡VAMOS!" a 3 s; el tick siguiente (4 s) programa `done`, que sale a 5 s.
 */

/** Primer número de la cuenta */
export const COUNTDOWN_START = 3

/** Un número por segundo */
export const COUNTDOWN_TICK_MS = 1000

/** Espera entre el tick que ve el 0 y la emisión de `done` */
export const GO_DONE_DELAY_MS = 1000

/**
 * Duración de la animación del cartel (palabra 0,55 s, columna 0,2–0,8 s, destello 0,45–1,25 s). El
 * CSS de `CountdownOverlay` usa estos mismos tiempos. Tope del pedido: 1,4 s.
 */
export const GO_ANIMATION_MS = 1250

/** Tope de la animación del cartel */
export const GO_ANIMATION_MAX_MS = 1400

/** Cuánto está "¡VAMOS!" a la vista: el tick que lo muestra → `done`. */
export const GO_VISIBLE_MS = COUNTDOWN_TICK_MS + GO_DONE_DELAY_MS

/** Instante (desde el montaje) en que sale `done`. */
export const COUNTDOWN_DONE_AT_MS = (COUNTDOWN_START + 1) * COUNTDOWN_TICK_MS + GO_DONE_DELAY_MS

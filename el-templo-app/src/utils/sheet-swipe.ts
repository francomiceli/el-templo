/**
 * Reglas del gesto "arrastrar hacia abajo para cerrar" de las hojas que salen de abajo
 * (`useSheetSwipeDismiss`). Funciones puras: se prueban sin DOM.
 */

/** Movimiento mínimo (px) antes de tomar el gesto: por debajo es un toque y los botones andan. */
export const SWIPE_SLOP_PX = 8

/** Arrastre (px) que cierra la hoja aunque se suelte despacio. */
export const SWIPE_DISMISS_DISTANCE_PX = 90

/** Un tirón corto cierra si supera esta velocidad (px/ms) y el arrastre mínimo de abajo. */
export const SWIPE_DISMISS_VELOCITY = 0.5
export const SWIPE_FLICK_MIN_PX = 30

/** Cuánto se corre la hoja mientras se arrastra: solo hacia abajo, nunca hacia arriba. */
export function sheetDragOffset(dy: number): number {
  return dy > 0 ? dy : 0
}

/** ¿Ya es un arrastre (y no un toque)? Solo cuenta hacia abajo y más vertical que horizontal. */
export function isSwipeStart(dy: number, dx: number): boolean {
  return dy > SWIPE_SLOP_PX && dy > Math.abs(dx)
}

/** ¿Al soltar se cierra? Lejos, o un tirón rápido hacia abajo. */
export function shouldDismissSheet(dy: number, durationMs: number): boolean {
  if (dy <= 0) return false
  if (dy >= SWIPE_DISMISS_DISTANCE_PX) return true
  const velocity = dy / Math.max(durationMs, 1)
  return dy >= SWIPE_FLICK_MIN_PX && velocity >= SWIPE_DISMISS_VELOCITY
}

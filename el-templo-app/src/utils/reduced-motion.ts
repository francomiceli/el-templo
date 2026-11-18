/**
 * `true` si el sistema pidió menos movimiento (`prefers-reduced-motion: reduce`).
 * Sirve para poner duración 0 a los `q-dialog` y cortar animaciones. Sin `window` (tests, SSR)
 * devuelve `false`.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Constantes y utilidades del carrusel de patrocinadores de Mi Templo (Fase 199, D-23).
 */

/**
 * Cada cuánto avanza solo el carrusel a la marca siguiente.
 * D-23: 4 s, decisión de Franco en el UAT de 199-21 (D1).
 * Cambiar SOLO esta constante.
 */
export const SPONSOR_ADVANCE_MS = 4000

/** Tras tocar o arrastrar el carrusel, el auto-avance retoma a los 3 s (D-23). */
export const SPONSOR_TOUCH_PAUSE_MS = 3000

/**
 * Monograma de la marca cuando no tiene logo ni ícono: iniciales de las 2 primeras
 * palabras; con una sola palabra, sus 2 primeras letras. Mayúsculas.
 * Misma regla que `monogram` del admin, así la card de la app se ve igual que la vista previa.
 */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return Array.from(words[0]!).slice(0, 2).join('').toUpperCase()
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join('')
    .toUpperCase()
}

/** Piso del tamaño del beneficio (px): bajo este valor solo queda la elipsis del CSS. */
export const SPONSOR_BENEFIT_MIN_PX = 16

/**
 * Tamaño inicial (px) del beneficio según su largo en caracteres (no en bytes):
 * hasta 8 → 30, 9-10 → 26, 11 o más → 22.
 *
 * El beneficio nunca se corta (UAT D6): arranca en un escalón por largo y se ajusta
 * midiendo el elemento real (`fitBenefitFontPx`), porque glifos anchos (M, W) no entran
 * con un tamaño fijo. La elipsis del CSS queda solo como red bajo el piso.
 * Espejo de `utils/sponsors.ts` del admin: la vista previa tiene que verse igual
 * que la card. Cambiar los dos juntos.
 */
export function sponsorBenefitFontPx(benefit: string): number {
  const len = Array.from(benefit.trim()).length
  if (len <= 8) return 30
  if (len <= 10) return 26
  return 22
}

/**
 * Ajuste por medición: devuelve el primer tamaño desde `startPx` bajando de a 1 px
 * para el que `fits(px)` es verdadero. Si ninguno entra, devuelve `floorPx`. Nunca
 * devuelve más que `startPx`.
 * Espejo de `utils/sponsors.ts` del admin.
 */
export function fitBenefitFontPx(
  startPx: number,
  fits: (px: number) => boolean,
  floorPx = SPONSOR_BENEFIT_MIN_PX,
): number {
  if (startPx <= floorPx) return startPx
  for (let px = startPx; px >= floorPx; px--) {
    if (fits(px)) return px
  }
  return floorPx
}

/** Qué muestra la pastilla de canje de una card (D-21/D-23). */
export interface SponsorRedeemPill {
  icon: 'sell' | 'card_membership' | 'lock'
  label: string
}

/**
 * Pastilla de canje: `sell` + código si el socio puede canjear, `card_membership` +
 * "Mostrá tu carnet" para marcas de carnet, `lock` + "Socios con plan" si es un código
 * y el socio no puede canjear (el server no manda el código sin plan activo).
 */
export function sponsorRedeemPill(
  sponsor: { redeemType: 'code' | 'carnet'; redeemCode: string | null },
  canRedeem: boolean,
): SponsorRedeemPill {
  if (sponsor.redeemType === 'carnet') return { icon: 'card_membership', label: 'Mostrá tu carnet' }
  const code = sponsor.redeemCode?.trim()
  if (canRedeem && code) return { icon: 'sell', label: code }
  return { icon: 'lock', label: 'Socios con plan' }
}

/**
 * ¿Un `click` sobre una card es un tap (abre la marca) o el final de un swipe (se descarta)?
 * - `detail === 0`: click sintético (teclado, lector de pantalla): siempre es una activación,
 *   aunque el carrusel haya avanzado solo desde el último pointerdown.
 * - Sin `downScrollLeft` (no hubo pointerdown pendiente): no hay con qué comparar, es un tap.
 * - Con pointerdown: es tap si el track se movió `slopPx` o menos.
 */
export function isCardTap(
  scrollLeft: number,
  downScrollLeft: number | null,
  detail: number,
  slopPx: number,
): boolean {
  if (detail === 0) return true
  if (downScrollLeft === null) return true
  return Math.abs(scrollLeft - downScrollLeft) <= slopPx
}

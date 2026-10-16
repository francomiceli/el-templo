/**
 * Constantes y utilidades del carrusel de patrocinadores de Mi Templo (Fase 199, D-23).
 */

/**
 * Cada cuánto avanza solo el carrusel a la marca siguiente.
 * D-23: 2 s según el brief; el sketch probó 2 s / 4 s — se decide en UAT con Franco.
 * Cambiar SOLO esta constante.
 */
export const SPONSOR_ADVANCE_MS = 2000

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

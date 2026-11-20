import type { CelebrationMovement, CelebrationResponse } from 'src/types/aura-celebration'
import { formatAura } from 'src/utils/aura-format'

/**
 * Textos y datos de la tarjeta de celebración de Aura (fase 215, #33, boceto 037 variante D).
 * Todo es puro. Reglas:
 *  - Un solo movimiento: su texto. Un regalo dice quién dio y el motivo; sin nombre (anónimo) dice
 *    "Te dieron N de Aura por X", nunca "Alguien".
 *  - Varios: "Sumaste N de Aura", los dos últimos motivos y "y N más".
 */

export interface TextSegment {
  text: string
  bold?: boolean
}

export type CelebrationFace =
  | { kind: 'initials'; text: string; coach: boolean }
  | { kind: 'icon'; name: string }
  | { kind: 'spark' }

export interface CelebrationCardView {
  /** El mensaje, en segmentos para poner en negrita lo importante. */
  segments: TextSegment[]
  /** Los dos últimos motivos (solo con varios movimientos). */
  reasons: string[]
  /** "y N más" (solo con varios y más de dos). */
  more: string | null
  /** Lo que va en la pastilla de la derecha: "+N". */
  pill: string
  /** Puntos que se suman (para el "+N" de la ficha y el conteo). */
  amount: number
  face: CelebrationFace
  /** Texto plano para lectores de pantalla. */
  announcement: string
}

const ICON_BY_SOURCE: Readonly<Record<string, string>> = {
  streak_bonus: 'local_fire_department',
  profile_photo: 'photo_camera',
  tenure_milestone: 'workspace_premium',
  program_completion: 'emoji_events',
  program_week_completion: 'emoji_events',
}

/** Ícono de la cara para fuentes que no son regalo; sin ícono propio, la chispa. */
export function celebrationFace(movement: CelebrationMovement): CelebrationFace {
  const gift = movement.gift
  if (gift) {
    if (gift.anonymous) return { kind: 'spark' }
    const text = faceInitials(gift.name, gift.kind === 'profe' ? 1 : 2)
    return text === ''
      ? { kind: 'spark' }
      : { kind: 'initials', text, coach: gift.kind === 'profe' }
  }
  const icon = ICON_BY_SOURCE[movement.source]
  return icon ? { kind: 'icon', name: icon } : { kind: 'spark' }
}

/** Iniciales de un nombre ("Juan P." da "JP", "Fran" con tope 1 da "F"). Sin nombre, vacío. */
export function faceInitials(name: string | null, max: 1 | 2): string {
  if (!name) return ''
  const letters = name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase())
    .filter((letter) => letter !== '')
  return letters.slice(0, max).join('')
}

function singleSegments(movement: CelebrationMovement): TextSegment[] {
  const gift = movement.gift
  if (!gift) return [{ text: movement.label, bold: true }]
  if (gift.anonymous) {
    return [
      { text: 'Te dieron ' },
      { text: String(movement.amount), bold: true },
      { text: ' de Aura por ' },
      { text: gift.reason, bold: true },
    ]
  }
  const reason: TextSegment[] = [{ text: ' te dio Aura por ' }, { text: gift.reason, bold: true }]
  if (gift.kind === 'profe') {
    return gift.name === null
      ? [{ text: 'Tu profe' }, ...reason]
      : [{ text: 'Tu profe ' }, { text: gift.name, bold: true }, ...reason]
  }
  return [{ text: gift.name ?? '', bold: true }, ...reason]
}

/** Motivo corto de un movimiento para la lista de "varios" (sin nombrar a nadie). */
export function shortReason(movement: CelebrationMovement): string {
  return movement.gift ? `Regalo: ${movement.gift.reason}` : movement.label
}

/**
 * Tarjeta de la respuesta del servidor, o null si no hay nada para celebrar. Con varios, el total
 * del mensaje es `sum` (todos los movimientos, no solo los 20 de la lista).
 */
export function celebrationCard(response: CelebrationResponse): CelebrationCardView | null {
  const { movements, count, sum } = response
  const newest = movements[0]
  if (count <= 0 || !newest) return null

  if (count === 1) {
    const segments = singleSegments(newest)
    return {
      segments,
      reasons: [],
      more: null,
      pill: `+${newest.amount}`,
      amount: newest.amount,
      face: celebrationFace(newest),
      announcement: `${segments.map((s) => s.text).join('')}. Sumaste ${newest.amount} de Aura.`,
    }
  }

  const reasons = movements.slice(0, 2).map(shortReason)
  const extra = count - reasons.length
  const more = extra > 0 ? `y ${extra} más` : null
  return {
    segments: [{ text: 'Sumaste ' }, { text: formatAura(sum), bold: true }, { text: ' de Aura' }],
    reasons,
    more,
    pill: `+${sum}`,
    amount: sum,
    face: { kind: 'spark' },
    announcement: `Sumaste ${formatAura(sum)} de Aura. ${[...reasons, ...(more ? [more] : [])].join(', ')}.`,
  }
}

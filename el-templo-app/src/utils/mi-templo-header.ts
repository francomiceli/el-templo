/**
 * Línea de abajo del nombre en el encabezado de Mi Templo (revisión 2026-11-18, #17).
 *
 * - Sin foto (ni propia aprobada, ni de la ficha, ni una en revisión): "Subí tu foto y sumá Aura",
 *   que lleva a subirla. Solo si el módulo de Aura está prendido: sin Aura la frase prometería algo
 *   que no existe.
 * - Con foto, o con la foto en revisión: la antigüedad, como siempre. Sin antigüedad, nada.
 *
 * El nombre y la ficha de Aura no dependen de esta función: sin nombre sigue "Atleta" y con Aura en
 * 0 la ficha muestra el 0.
 */

export const PHOTO_CTA_TEXT = 'Subí tu foto y sumá Aura'

export type HeaderSubline = { kind: 'cta'; text: string } | { kind: 'tenure'; text: string } | null

export interface HeaderSublineInput {
  /** Hay una foto para mostrar: la propia aprobada o la de la ficha (`photo.url`). */
  hasShownPhoto: boolean
  /** Hay una foto propia en revisión (`photo.pendingUrl`). */
  hasPendingPhoto: boolean
  /** El módulo de Aura está prendido para este gimnasio. */
  auraVisible: boolean
  /** Antigüedad ya formateada; null o vacía si no hay dato. */
  tenure: string | null
}

export function headerSubline(input: HeaderSublineInput): HeaderSubline {
  const noPhotoAtAll = !input.hasShownPhoto && !input.hasPendingPhoto
  if (noPhotoAtAll && input.auraVisible) return { kind: 'cta', text: PHOTO_CTA_TEXT }
  const tenure = input.tenure?.trim() ?? ''
  return tenure !== '' ? { kind: 'tenure', text: tenure } : null
}

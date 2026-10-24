/**
 * Pie del video del player (sketch 026): sobre un fade a negro va el ejercicio de AHORA con su
 * insignia de contracción, el nombre y la cantidad grande (como la TV). Función pura, sin Vue: acá
 * se decide QUÉ se muestra (ejercicio, movilidad o nada); `StoryFooter.vue` solo lo pinta.
 *
 * El descanso activo es un slide más de la historia (la movilidad del bloque): se muestra igual que
 * cualquier ejercicio, con su nombre y su dosis ("40″"). No hay un modo aparte.
 */
import { contractionBadge, type ContractionKind } from './contraction'
import { plateValue } from './exerciseCard'

/** Lo que el pie necesita saber de un ejercicio (o de la movilidad) */
export interface FooterSource {
  name: string
  contraction?: string | null
  /** Dosis compacta ("8 REPS", "30 SEG", "PAUSA"): la misma que alimentaba la placa de la lista */
  quickDose: string
}

export interface FooterBadge {
  label: string
  /** Define la clase de color; 'mov' = movilidad sin contracción cargada (borde dorado) */
  kind: ContractionKind | 'mov'
}

/** Tamaño de la cantidad: los valores largos (pirámides, rangos) no entran a 58 px */
export type FooterValueSize = 'xl' | 'lg' | 'md' | 'sm'

export interface PlayerFooter {
  kind: 'exercise' | 'mobility'
  badge: FooterBadge | null
  /** Rótulo chico junto a la insignia; solo la movilidad lo lleva */
  label: string | null
  name: string
  /** Cantidad lista para mostrar ("8", "30″", "10-12-10"). Vacía = sin dosis */
  value: string
  valueSize: FooterValueSize
}

export interface PlayerFooterInput {
  isMobilitySlide: boolean
  exercise: FooterSource | null
  mobility: FooterSource | null
  /** Hay video para el slide. Sin video la app ya muestra el nombre grande centrado: no se repite */
  hasVideo: boolean
  /** "Bloque completo" / "Sesión completa" tapa el video: el pie no se muestra */
  blockDone: boolean
}

/** Rótulo de la movilidad (era el "DESCANSO ACTIVO" de la lista) */
export const MOBILITY_LABEL = 'Descanso activo'

/**
 * Tamaño según el largo del texto (Cinzel a 58 px mide ~40 px por carácter y la cantidad tiene
 * poco más de la mitad del ancho): "12″" entra grande, "10-12-10″" ya no.
 */
export function footerValueSize(value: string): FooterValueSize {
  const len = value.length
  if (len <= 3) return 'xl'
  if (len <= 5) return 'lg'
  if (len <= 8) return 'md'
  return 'sm'
}

/** Qué muestra el pie para el slide actual. `null` = no se muestra nada. */
export function playerFooter(input: PlayerFooterInput): PlayerFooter | null {
  if (input.blockDone || !input.hasVideo) return null

  const isMobility = input.isMobilitySlide
  const source = isMobility ? input.mobility : input.exercise
  const name = source?.name.trim() ?? ''
  if (!source || !name) return null

  const value = plateValue(source.quickDose)
  const badge: FooterBadge | null =
    contractionBadge(source.contraction) ?? (isMobility ? { label: 'MOV', kind: 'mov' } : null)

  return {
    kind: isMobility ? 'mobility' : 'exercise',
    badge,
    label: isMobility ? MOBILITY_LABEL : null,
    name,
    value,
    valueSize: footerValueSize(value),
  }
}

/**
 * Indicaciones del profe para el slide actual (las que expandía la lista con "Indicaciones").
 * Vacío si no hay, o si es el marcador "PAUSA" (ya se ve como cantidad).
 */
export function slideNotes(notes: string | null | undefined): string {
  const text = (notes ?? '').trim()
  return text === 'PAUSA' ? '' : text
}

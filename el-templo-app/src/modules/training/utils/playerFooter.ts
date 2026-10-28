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
  /** "Bloque completo" / "Sesión completa" tapa el video: el pie no se muestra */
  blockDone: boolean
}

/** Rótulo de la movilidad (era el "DESCANSO ACTIVO" de la lista) */
export const MOBILITY_LABEL = 'Descanso activo'

/**
 * Tamaño según el largo del texto (los cortes se midieron con Cinzel, ~40 px por carácter a 58 px;
 * Nunito Sans, la fuente actual, es más angosta y entra holgada): "12″" entra grande, "10-12-10″" ya no.
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
  // Con o sin video: sin video el pie va sobre el fondo oscuro, con la misma visual (pedido de Franco)
  if (input.blockDone) return null

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

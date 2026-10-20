/**
 * Lógica de presentación de la tab Libre (fase 197 D-04). Funciones puras.
 */
import {
  ZONE_GROUPS,
  ZONE_GROUP_LABELS,
  ZONE_GROUP_ORDER,
  type ZoneGroup,
} from 'src/components/anatomy/zones'

const LABEL_TODAY = 'Para complementar lo de hoy'
const LABEL_WEEK = 'Esta semana trabajaste poco'

/**
 * Sugerencia de la tarjeta salvia (D-04). Grupo sugerido = menos de la mitad de sus zonas están
 * en la base. Base = zonas de la sesión de hoy; sin plani hoy (`null`, o sin zonas cargadas) =
 * zonas de lo completado en la semana. Devuelve `null` si no queda ningún grupo por sugerir.
 */
export function complementSuggestion(i: {
  todayZones: string[] | null
  weekWorkedZones: string[]
}): { label: string; groups: ZoneGroup[] } | null {
  const hasToday = i.todayZones !== null && i.todayZones.length > 0
  const baseZones = hasToday && i.todayZones ? i.todayZones : i.weekWorkedZones
  const base = new Set(baseZones)
  const groups = ZONE_GROUP_ORDER.filter((group) => {
    const zones = ZONE_GROUPS[group]
    const worked = zones.filter((zone) => base.has(zone)).length
    return worked / zones.length < 0.5
  })
  if (groups.length === 0) return null
  return { label: hasToday ? LABEL_TODAY : LABEL_WEEK, groups }
}

/** "1 bloque", "12 bloques", "12 bloques de espalda". */
export function basketCountLabel(n: number, group: ZoneGroup | null): string {
  const base = `${n} ${n === 1 ? 'bloque' : 'bloques'}`
  return group ? `${base} de ${ZONE_GROUP_LABELS[group].toLowerCase()}` : base
}

/** Estado vacío de la lista (D-04). */
export function emptyBasketText(group: ZoneGroup | null): string {
  return group
    ? 'Todavía no hay bloques de esta zona en las planis de tu nivel.'
    : 'Todavía no hay bloques en las planis de tu nivel.'
}

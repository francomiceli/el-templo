/**
 * Lógica de presentación de la tab Libre (fase 197 D-04). Funciones puras.
 */
import { ZONE_GROUP_LABELS, type ZoneGroup } from 'src/components/anatomy/zones'

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

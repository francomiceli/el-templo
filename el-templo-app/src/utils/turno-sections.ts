import type { WeeklySlotView } from 'src/types/scheduling'

/** Secciones de la grilla de Reservas, en el orden en que se muestran. */
export type TurnoKey = 'morning' | 'especiales' | 'afternoon'

/**
 * Franja "entre turnos" (2026-10-01): las actividades especiales que arrancan
 * desde las 10:00 y antes de las 17:00 (ej. yoga de Moreno) no son ni del turno
 * mañana ni del turno tarde — van a una sección propia "Especiales", sin profe
 * de turno (varía). Las especiales fuera de la franja (ej. Verticales a otra
 * hora) siguen en su turno.
 */
export const ESPECIALES_FROM = '10:00'
export const ESPECIALES_TO = '17:00'

/** Corte mañana/tarde de siempre. */
const AFTERNOON_FROM = '12:00'

export function isEntreTurnosEspecial(slot: Pick<WeeklySlotView, 'startTime' | 'isSpecial'>) {
  // startTime viene "HH:MM" o "HH:MM:SS": la comparación de strings sirve igual.
  return slot.isSpecial && slot.startTime >= ESPECIALES_FROM && slot.startTime < ESPECIALES_TO
}

/**
 * Agrupa los slots de un día (ya ordenados por hora) en secciones. Solo
 * devuelve las secciones con al menos un slot, en orden mañana → especiales →
 * tarde.
 */
export function splitDaySections<T extends Pick<WeeklySlotView, 'startTime' | 'isSpecial'>>(
  slots: readonly T[],
): { turno: TurnoKey; slots: T[] }[] {
  const morning: T[] = []
  const especiales: T[] = []
  const afternoon: T[] = []
  for (const slot of slots) {
    if (isEntreTurnosEspecial(slot)) especiales.push(slot)
    else if (slot.startTime < AFTERNOON_FROM) morning.push(slot)
    else afternoon.push(slot)
  }
  const sections: { turno: TurnoKey; slots: T[] }[] = [
    { turno: 'morning', slots: morning },
    { turno: 'especiales', slots: especiales },
    { turno: 'afternoon', slots: afternoon },
  ]
  return sections.filter((s) => s.slots.length > 0)
}

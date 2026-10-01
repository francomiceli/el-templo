import type { WeeklySlotView } from 'src/types/scheduling'

/** Secciones de la grilla de Reservas, en el orden en que se muestran. */
export type TurnoKey = 'morning' | 'especiales' | 'afternoon'

/**
 * Sección "Especiales" (2026-10-01): las actividades especiales que caen ENTRE
 * los turnos (ej. yoga de Moreno a las 11 o a las 16, con turnos 7-10 y 17-20)
 * no son ni del turno mañana ni del tarde — van a una sección propia, sin profe
 * de turno (varía).
 *
 * "Entre turnos" se decide con los horarios regulares del MISMO día: la
 * especial arranca dentro de la franja 10:00–17:00, DESPUÉS de la última clase
 * regular de la mañana y ANTES de la primera regular de la tarde. Una especial
 * intercalada con clases regulares (ej. sábado 10:00 entre ROM 9/10/11) se
 * queda en su turno. Con esta regla las secciones siempre quedan en orden
 * cronológico.
 */
export const ESPECIALES_FROM = '10:00'
export const ESPECIALES_TO = '17:00'

/** Corte mañana/tarde de siempre. */
const AFTERNOON_FROM = '12:00'

type SectionSlot = Pick<WeeklySlotView, 'startTime' | 'isSpecial'>

/**
 * Agrupa los slots de un día (ya ordenados por hora) en secciones. Solo
 * devuelve las secciones con al menos un slot, en orden mañana → especiales →
 * tarde. startTime viene "HH:MM" o "HH:MM:SS": la comparación de strings sirve
 * igual.
 */
export function splitDaySections<T extends SectionSlot>(
  slots: readonly T[],
): { turno: TurnoKey; slots: T[] }[] {
  let lastRegularMorning: string | null = null
  let firstRegularAfternoon: string | null = null
  for (const slot of slots) {
    if (slot.isSpecial) continue
    if (slot.startTime < AFTERNOON_FROM) {
      if (lastRegularMorning === null || slot.startTime > lastRegularMorning) {
        lastRegularMorning = slot.startTime
      }
    } else if (firstRegularAfternoon === null || slot.startTime < firstRegularAfternoon) {
      firstRegularAfternoon = slot.startTime
    }
  }

  const isEntreTurnos = (slot: T): boolean =>
    slot.isSpecial &&
    slot.startTime >= ESPECIALES_FROM &&
    slot.startTime < ESPECIALES_TO &&
    (lastRegularMorning === null || slot.startTime > lastRegularMorning) &&
    (firstRegularAfternoon === null || slot.startTime < firstRegularAfternoon)

  const morning: T[] = []
  const especiales: T[] = []
  const afternoon: T[] = []
  for (const slot of slots) {
    if (isEntreTurnos(slot)) especiales.push(slot)
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

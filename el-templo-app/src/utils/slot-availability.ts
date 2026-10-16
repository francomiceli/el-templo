/**
 * Disponibilidad de un horario de Reservas (nivel + copy del chip de cupo). Lógica PURA extraída de
 * ReservasPage.vue para poder probarla sin montar la página.
 *
 * Niveles (umbral ABSOLUTO, igual que la grilla de Horarios del admin): 0 lugares → 'full',
 * 1 → 'last', 2-4 → 'few', 5+ → 'available'.
 *
 * Copy: con lugar de sobra el chip muestra cuánta gente YA se anotó (prueba social, salvia);
 * cuando queda poco pasa a mostrar los lugares RESTANTES (urgencia, ocre); sin lugar, "Completo".
 */

export type AvailabilityLevel = 'available' | 'few' | 'last' | 'full'

export const FEW_THRESHOLD = 5

/** Campos del horario que alimentan la disponibilidad (subconjunto de `WeeklySlotView`). */
export interface SlotAvailabilityInput {
  isFull: boolean
  maxCapacity: number
  bookedCount: number
  trialSpotsRemaining: number
}

/**
 * En modo prueba (freemium eligiendo SP) la disponibilidad NO es la del cupo general de la clase
 * sino la del cupo ESPECIAL de SP (`trialSpotsRemaining`).
 */
export function slotIsFull(slot: SlotAvailabilityInput, trialMode: boolean): boolean {
  if (trialMode) return slot.trialSpotsRemaining <= 0
  return slot.isFull
}

export function spotsLeft(slot: SlotAvailabilityInput, trialMode: boolean): number {
  if (trialMode) return Math.max(0, slot.trialSpotsRemaining)
  return Math.max(0, slot.maxCapacity - slot.bookedCount)
}

export function availabilityLevel(
  slot: SlotAvailabilityInput,
  trialMode: boolean,
): AvailabilityLevel {
  const left = spotsLeft(slot, trialMode)
  if (slotIsFull(slot, trialMode) || left <= 0) return 'full'
  if (left === 1) return 'last'
  if (left < FEW_THRESHOLD) return 'few'
  return 'available'
}

export function availabilityText(slot: SlotAvailabilityInput, trialMode: boolean): string {
  const level = availabilityLevel(slot, trialMode)
  if (level === 'full') return 'Completo'
  if (level === 'last') return 'Queda 1 lugar'
  if (level === 'few') return `Quedan ${spotsLeft(slot, trialMode)} lugares`
  // 'available': prueba social. (En modo prueba nunca se llega acá: el tope de SP es 3, siempre
  // < FEW_THRESHOLD, así que cae en 'few'/'last'/'full'.)
  const booked = Math.max(0, slot.bookedCount)
  if (booked === 0) return 'Sé el primero'
  if (booked === 1) return '1 anotado'
  return `${booked} anotados`
}

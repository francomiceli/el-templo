import { formatAura } from 'src/utils/aura-format'
import { parseDateParts } from 'src/utils/tz'

/**
 * Textos y reglas puras de la hoja "Quiénes van" (fase 214, plan 25, UI-SPEC Pantalla 3).
 * La app no reordena ni filtra a los anotados: acá solo se arman textos de lo que manda el servidor.
 */

const DAYS_LONG_CAP = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** Subconjunto de `Attendee` que alimenta el nombre. */
export interface AttendeeNameInput {
  firstName: string
  lastInitial: string | null
  isMe: boolean
}

/** "Sofía M." / "Sofía" (sin inicial) / "Vos" (uno mismo). Nunca el apellido completo. */
export function attendeeName(a: AttendeeNameInput): string {
  if (a.isMe) return 'Vos'
  const initial = a.lastInitial?.trim() ?? ''
  return initial ? `${a.firstName} ${initial}.` : a.firstName
}

/** `aria-label` de la celda: "Sofía M., 320 de Aura" o solo el nombre si `aura` es null. */
export function attendeeAriaLabel(a: AttendeeNameInput & { aura: number | null }): string {
  const name = attendeeName(a)
  return a.aura === null ? name : `${name}, ${formatAura(a.aura)} de Aura`
}

/** Hora como la muestra la card de Reservas: sin cero a la izquierda ("8:30"), sin segundos. */
function displayTime(time: string): string {
  const parts = time.split(':')
  return `${parseInt(parts[0], 10)}:${parts[1]}`
}

/** "Viernes 20 · 18:00" a partir de la fecha ("YYYY-MM-DD", ya en la zona de la sede) y la hora. */
export function sheetTitle(date: string, startTime: string): string {
  const { y, m, d } = parseDateParts(date)
  const weekday = DAYS_LONG_CAP[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${weekday} ${d} · ${displayTime(startTime)}`
}

/**
 * Estado del horario que ya calcula `ReservasPage`:
 * - `isBooked`: reservado o ya asistido (`isSlotBooked` / `isSlotAttended`).
 * - `isPast`, `isHoliday`: `isSlotPast` / `isSlotHoliday`.
 * - `isFull`: `slot.isFull`.
 * - `canJoinWaitlist`: `canJoinWaitlist(slot)`.
 * - `specialBlocked`: actividad especial cuyo estado no es 'reservable'.
 */
export interface SheetFooterInput {
  startTime: string
  isBooked: boolean
  isPast: boolean
  isHoliday: boolean
  isFull: boolean
  canJoinWaitlist: boolean
  specialBlocked: boolean
}

export type SheetFooterAction =
  | { kind: 'reserve'; label: string }
  | { kind: 'waitlist'; label: string }
  | { kind: 'close'; label: string }

export function sheetFooterAction(s: SheetFooterInput): SheetFooterAction {
  const close: SheetFooterAction = { kind: 'close', label: 'Cerrar' }
  if (s.isBooked || s.isPast || s.isHoliday || s.specialBlocked) return close
  if (s.isFull) {
    return s.canJoinWaitlist ? { kind: 'waitlist', label: 'Anotarme en la lista de espera' } : close
  }
  return { kind: 'reserve', label: `Reservar ${displayTime(s.startTime)}` }
}

import type { BookingStatus } from 'src/types/scheduling'

/**
 * Reglas puras de cómo se muestra una reserva en lista de espera en Reservas (2026-11-25).
 *
 * Caso: un alumno en lista de espera veía la clase con el tilde verde "Reservado" y como
 * "Tu próxima clase"; fue igual creyendo que tenía lugar. Una reserva `lista_espera` NO es un
 * lugar: se muestra con su propio cartel y no cuenta como próxima clase ni como día con reserva.
 */

/** Reservas que son un lugar en la clase (no la lista de espera). */
const HOLDS_SPOT_STATUSES: readonly BookingStatus[] = ['reservado', 'qr_escaneado', 'confirmado']

/** Para "Tu próxima clase": lugar tomado y todavía sin asistir. */
const NEXT_CLASS_STATUSES: readonly BookingStatus[] = ['reservado', 'qr_escaneado']

export function holdsSpot(status: BookingStatus): boolean {
  return HOLDS_SPOT_STATUSES.includes(status)
}

export function countsAsNextClass(status: BookingStatus): boolean {
  return NEXT_CLASS_STATUSES.includes(status)
}

export function isWaitlistStatus(status: BookingStatus): boolean {
  return status === 'lista_espera'
}

/** Cartel de la tarjeta del horario: "Lista de espera · #2" (sin puesto si no vino). */
export function waitlistChipLabel(position: number | null): string {
  return position !== null && position > 0 ? `Lista de espera · #${position}` : 'Lista de espera'
}

/** Pregunta del diálogo de cancelar: reserva o salida de la lista de espera. */
export function cancelPromptMessage(
  status: BookingStatus,
  dayLabelLower: string,
  time: string,
): string {
  return isWaitlistStatus(status)
    ? `¿Salir de la lista de espera del ${dayLabelLower} a las ${time}?`
    : `¿Cancelar tu reserva del ${dayLabelLower} a las ${time}?`
}

/** Aviso tras cancelar. */
export function cancelSuccessMessage(status: BookingStatus): string {
  return isWaitlistStatus(status) ? 'Saliste de la lista de espera' : 'Reserva cancelada'
}

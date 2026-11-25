/**
 * Lista de espera en el detalle de la clase (Horarios / panel del profe) — 2026-11-25.
 *
 * El profe tiene que ver de un vistazo quién está en lista de espera (cartel violeta "LE #2")
 * y, si le da el presente a alguien que no tiene lugar, confirmarlo sabiendo cómo está el cupo:
 * el backend lo acepta y lo pasa a confirmado aunque la clase esté llena.
 */

/** Cartel corto junto al nombre: "LE #2" (solo "LE" si no vino el puesto). */
export function waitlistBadgeLabel(position: number | null | undefined): string {
  return position && position > 0 ? `LE #${position}` : 'LE';
}

export interface WaitlistCheckInInput {
  memberName: string;
  position: number | null | undefined;
  /** Reservas que ocupan lugar (sin SP ni lista de espera). */
  booked: number;
  maxCapacity: number;
}

/** Pregunta antes de darle el presente a alguien de la lista de espera. */
export function waitlistCheckInMessage(input: WaitlistCheckInInput): string {
  const where =
    input.position && input.position > 0
      ? `está en lista de espera (puesto ${input.position})`
      : 'está en lista de espera';
  const cupo =
    input.maxCapacity > 0
      ? ` y la clase tiene ${input.booked}/${input.maxCapacity}${
          input.booked >= input.maxCapacity ? ' (completa)' : ''
        }`
      : '';
  return `${input.memberName} ${where}${cupo}. ¿Darle el presente igual?`;
}

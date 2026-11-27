/**
 * Qué muestra cada fila de la asistencia de una clase sobre el regalo de Aura del profe (fase 215,
 * D-15). Funciones puras: la API decide quién puede dar y a quién; acá solo se traduce a la vista.
 *
 * La API (`GET /attendance/slot`) manda `gift` por alumno:
 *  - `null`: quien mira no puede dar (no es profe de la sede de la clase, o el módulo está apagado
 *    para el gimnasio). Todo el staff ve el botón gris con la nota (#26).
 *  - `disponible`: botón "Dar Aura".
 *  - `dado` / `anulado`: chip con lo que pasó hoy.
 *  - `no_participa` (fuera de la ventana de hoy/ayer, oculto, etc.): nada.
 * Sin asistencia marcada no hay regalo posible: nada.
 */
// Imports relativos: los tests del admin corren sin el alias `src/`.
import { giftReasonLabel } from '../config/gift-reasons';
import type { SlotAttendanceGift } from '../types/attendance';

export type CoachGiftCellKind = 'give' | 'disabled' | 'given' | 'voided' | 'none';

export function coachGiftCellKind(input: {
  /** Módulo de Aura del gimnasio prendido (y El Templo habilitado en el admin). */
  enabled: boolean;
  attendanceId: number | null;
  gift: SlotAttendanceGift | null | undefined;
}): CoachGiftCellKind {
  if (!input.enabled || !input.attendanceId) return 'none';
  const gift = input.gift;
  // `undefined`: una API vieja sin el campo. No se promete nada.
  if (gift === undefined) return 'none';
  if (gift === null) return 'disabled';
  switch (gift.state) {
    case 'disponible':
      return 'give';
    case 'dado':
      return 'given';
    case 'anulado':
      return 'voided';
    default:
      return 'none';
  }
}

/**
 * Nota del botón gris. A quien regala (profe, admin de sede, admin o con el permiso por persona)
 * pero mira una clase de otra sede le dice "de esta sede".
 */
export function coachGiftDisabledNote(canGiveCoachGift: boolean): string {
  return canGiveCoachGift
    ? 'Solo los profes de esta sede pueden dar Aura'
    : 'Solo los profes pueden dar Aura';
}

/** Tooltip del chip de un regalo ya dado hoy. */
export function coachGiftGivenTooltip(reason: string | null): string {
  return reason ? `Ya le diste Aura hoy · ${giftReasonLabel(reason)}` : 'Ya le diste Aura hoy';
}

/** Nombre de pila para la ventana de dar Aura ("Dar Aura a Juan"). */
export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

import { ACTIVE_SLOT_BOOKING_STATUSES } from "../../db/schema/bookings";

/**
 * Una fila por alumno en el roster de un turno (horario + fecha).
 *
 * Desde la mig 0360 el índice único (alumno, horario, día) solo cubre las
 * reservas vivas: las canceladas/no_show quedan como historial y conviven con
 * la reserva nueva del mismo turno (caso María Eugenia Rossi, 2026-11-25).
 * Antes existía una sola fila por alumno y turno, así que el roster nunca
 * mostraba al alumno dos veces. Para conservar eso:
 *  - si el alumno tiene una reserva viva, se muestra la viva (y solo esa),
 *  - si no, la muerta más reciente (mayor id).
 *
 * Mantiene el orden de entrada de las filas que quedan.
 */
export function dedupeRosterRows<
  T extends { id: number; memberId: number; status: string },
>(rows: readonly T[]): T[] {
  const isLive = (status: string) =>
    (ACTIVE_SLOT_BOOKING_STATUSES as readonly string[]).includes(status);

  const keepByMember = new Map<number, T>();
  for (const row of rows) {
    const kept = keepByMember.get(row.memberId);
    if (!kept) {
      keepByMember.set(row.memberId, row);
      continue;
    }
    const keptLive = isLive(kept.status);
    const rowLive = isLive(row.status);
    if (rowLive && !keptLive) {
      keepByMember.set(row.memberId, row);
    } else if (rowLive === keptLive && row.id > kept.id) {
      keepByMember.set(row.memberId, row);
    }
  }

  const keepIds = new Set([...keepByMember.values()].map((r) => r.id));
  return rows.filter((r) => keepIds.has(r.id));
}

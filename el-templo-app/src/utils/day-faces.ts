/**
 * Caras de los anotados de la fila "N anotados" de la Reservas (2026-11-20, D-59 revisada).
 *
 * El servidor responde por día y sede; la pantalla guarda el resultado junto con la clave
 * (fecha + sede) con la que se pidió. Una cara solo se dibuja si la clave guardada es la del
 * día que se está mirando: así un cambio rápido de día nunca pinta las caras del día anterior.
 */
import type { DayAttendees, DayFace } from 'src/types/community'

export interface DayFacesState {
  key: string
  bySchedule: Map<number, DayFace[]>
}

const NO_FACES: DayFace[] = []

/** Clave de un pedido: el día (YYYY-MM-DD) y la sede (`null` = la del alumno). */
export function dayFacesKey(date: string, branchId: number | null): string {
  return `${date}|${branchId ?? 'propia'}`
}

/** Caras por horario. Sin permiso para ver caras (`canSeeFaces` falso) no hay ninguna. */
export function facesBySchedule(data: DayAttendees): Map<number, DayFace[]> {
  const map = new Map<number, DayFace[]>()
  if (!data.canSeeFaces) return map
  for (const slot of data.slots) {
    if (slot.faces.length > 0) map.set(slot.scheduleId, slot.faces)
  }
  return map
}

/** Las caras de un horario para el día que se mira; vacío si son de otro día o no hay. */
export function facesForSlot(
  state: DayFacesState | null,
  currentKey: string,
  scheduleId: number,
): DayFace[] {
  if (!state || state.key !== currentKey) return NO_FACES
  return state.bySchedule.get(scheduleId) ?? NO_FACES
}

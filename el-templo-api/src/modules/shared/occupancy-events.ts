/**
 * Bus mínimo de cambios de ocupación de slots (schedule + fecha).
 *
 * Integración Wellhub (2026-07): cuando cambia la cantidad de reservas
 * activas de una clase, hay que empujar el total_booked actualizado a
 * Wellhub (pool compartido de cupos). BookingService emite acá DESPUÉS del
 * commit en las operaciones de un solo slot (reserve, cancel, promote,
 * admin add/remove); las operaciones masivas (cancelaciones por schedule,
 * restauraciones) NO emiten — las reconcilia el cron de sincronización.
 *
 * Sin listeners registrados (Wellhub apagado, tests) emitir es un no-op.
 * Los listeners no deben lanzar: cualquier error se traga y loguea del lado
 * del listener — un fallo de push a Wellhub jamás debe romper una reserva.
 */

export interface OccupancyChange {
  scheduleId: number;
  /** YYYY-MM-DD (fecha lógica de la clase). */
  date: string;
}

type OccupancyListener = (change: OccupancyChange) => void;

const listeners = new Set<OccupancyListener>();

/** Registra un listener; devuelve la función para desregistrarlo. */
export function onOccupancyChange(listener: OccupancyListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitOccupancyChange(change: OccupancyChange): void {
  for (const listener of listeners) {
    listener(change);
  }
}

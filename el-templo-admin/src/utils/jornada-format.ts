/** Formateadores compartidos de la página de jornadas (CheckInPage + tablero). */

/** Hora local `HH:mm` de un ISO. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/** `90` -> `1h 30min`; `45` -> `45min`. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}

/** `150` -> `2,5 h` (horas decimales, es-AR). */
export function formatHoursDecimal(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`;
}

/**
 * `YYYY-MM-DD` -> `DD/MM/YYYY`. Split manual (no `new Date(dateStr)`): una
 * fecha pura no debe pasar por conversión de timezone del navegador.
 */
export function formatShiftDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** Fecha LOCAL `YYYY-MM-DD` (a diferencia de `toISOString`, no corre el día por UTC). */
export function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

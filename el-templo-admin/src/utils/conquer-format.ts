/**
 * Fase 201 (Conquer): helpers de texto y fecha compartidos por el tablero, los pedidos y (201-22/23)
 * la ficha. Puros: sin Vue, sin red.
 */

const DAY_MS = 86_400_000;

/** Número de día (desde 1970) en calendario local, para restar fechas sin lío de horas. */
function localDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

/**
 * Días enteros desde `value` hasta `now`. Acepta `YYYY-MM-DD` (fecha sin hora) o un ISO-8601.
 * Nunca negativo. `null` si el valor no se puede leer.
 */
export function daysSince(value: string | null, now: Date = new Date()): number | null {
  if (value === null) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  let thenDay: number;
  if (dateOnly) {
    thenDay = Math.floor(
      Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) / DAY_MS
    );
  } else {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    thenDay = localDayNumber(parsed);
  }
  return Math.max(0, localDayNumber(now) - thenDay);
}

/** "hoy", "ayer" o "hace N días". */
export function agoText(days: number): string {
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

/** Nombre completo para listas; vacío si el alumno no tiene ni nombre ni apellido. */
export function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

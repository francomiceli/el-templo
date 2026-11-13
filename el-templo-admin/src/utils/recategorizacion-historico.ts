/**
 * Helpers puros del histórico de recategorizaciones (Reportes → Recategorización).
 *
 * Los eventos se agrupan por mes en UTC: el cron corre el día 1 a las 07:00 UTC
 * (04:00 AR), así que el mes UTC es el mes "del cron" en cualquier zona.
 */
import type { MultibranchReassignmentRow } from 'src/composables/useReportsApi';

export interface ReassignmentMonthGroup {
  /** `YYYY-MM` (UTC). */
  key: string;
  /** "Noviembre 2026". */
  label: string;
  rows: MultibranchReassignmentRow[];
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "2026-11" → "Noviembre 2026". */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[Number(month) - 1] ?? key} ${year}`;
}

/**
 * Agrupa por mes, el más nuevo primero. Dentro de cada mes conserva el orden de
 * entrada (la API ya devuelve fecha descendente).
 */
export function groupReassignmentsByMonth(
  rows: MultibranchReassignmentRow[]
): ReassignmentMonthGroup[] {
  const byKey = new Map<string, MultibranchReassignmentRow[]>();
  for (const row of rows) {
    const key = monthKey(row.reassignedAt);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, groupRows]) => ({ key, label: monthLabel(key), rows: groupRows }));
}

/** "20 alumnos" / "1 alumno". */
export function studentsCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'alumno' : 'alumnos'}`;
}

/** "8 de 10 (80%)". Con 0 asistencias totales no hay porcentaje: "0 de 0". */
export function formatAttendanceRatio(toBranch: number, total: number): string {
  if (total <= 0) return `${toBranch} de ${total}`;
  return `${toBranch} de ${total} (${Math.round((toBranch / total) * 100)}%)`;
}

/** ISO → "dd/mm" (UTC, ver el docblock del archivo). */
export function formatReassignmentDay(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/**
 * Nombre del Excel: `recategorizaciones-AAAA-MM.xlsx` para un mes puntual o
 * `recategorizaciones-total-AAAA-MM-DD.xlsx` (fecha de hoy, hora local) para el
 * período completo. Mismo criterio que el nombre que manda la API.
 */
export function reassignmentsExportFilename(monthKey?: string, today: Date = new Date()): string {
  if (monthKey) return `recategorizaciones-${monthKey}.xlsx`;
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `recategorizaciones-total-${yyyy}-${mm}-${dd}.xlsx`;
}

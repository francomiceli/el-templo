/**
 * Helpers de fechas `YYYY-MM-DD` de la sede, sin conversión de zona (la API ya las devuelve en
 * hora de la sede). Los usan Regalos de Aura y su cuadro de regalos por profe.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parte "YYYY-MM-DD" en números, o null si no tiene esa forma. */
export function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "10/11 al 16/11" a partir del lunes de la semana. */
export function weekLabel(weekStart: string): string {
  const parts = parseYmd(weekStart);
  if (!parts) return weekStart;
  const start = Date.UTC(parts.y, parts.m - 1, parts.d);
  const end = new Date(start + 6 * DAY_MS);
  return `${pad2(parts.d)}/${pad2(parts.m)} al ${pad2(end.getUTCDate())}/${pad2(end.getUTCMonth() + 1)}`;
}

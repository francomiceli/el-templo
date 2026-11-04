/**
 * Tiempo relativo en español rioplatense para la línea de tiempo de Oficina
 * (fase 205 D-21): "recién", "hace 5 min", "hace 2 h", "ayer", "hace 3 días" y,
 * pasada la semana, fecha corta (`dd/mm`, con año si es de otro año).
 *
 * "Ayer" se decide por día calendario en hora local del navegador (no por 24 h). El atajo
 * por minutos va primero: un mensaje de las 23:50 visto a las 00:10 dice "hace 20 min"
 * (no "ayer"); pasada la hora, el cambio de día calendario manda y se ve "ayer".
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const diff = now.getTime() - then.getTime();
  if (diff < 0) return 'ahora';
  if (diff < MINUTE_MS) return 'recién';
  if (diff < HOUR_MS) return `hace ${Math.floor(diff / MINUTE_MS)} min`;

  const dayDiff = Math.round((startOfLocalDay(now) - startOfLocalDay(then)) / 86_400_000);
  if (dayDiff === 0) return `hace ${Math.floor(diff / HOUR_MS)} h`;
  if (dayDiff === 1) return 'ayer';
  if (dayDiff < 7) return `hace ${dayDiff} días`;

  const short = `${pad2(then.getDate())}/${pad2(then.getMonth() + 1)}`;
  if (then.getFullYear() === now.getFullYear()) return short;
  return `${short}/${pad2(then.getFullYear() % 100)}`;
}

/**
 * Fase 201: calendario de Conquer (puro).
 *
 * - D-16: "que dia toca" = el primer dia del plan que falta en la semana
 *   calendario lunes-domingo en curso. Sin dias faltantes: "Semana completa".
 * - Sintesis §3.2 / A11: la semana del bloque cuenta semanas calendario desde la
 *   activacion (sin rotacion).
 * - D-14: Subir en los combos tras N semanas calendario seguidas con el objetivo.
 * - Sintesis §2.2 / A13: paso de nivel con 4 semanas calendario seguidas con todos
 *   los dias del plan y sin molestia de 4 o mas.
 *
 * A16: las fechas son strings YYYY-MM-DD y toda la aritmetica es UTC (nunca la
 * hora local del proceso). La fecha de "hoy" la calcula el servidor con la zona
 * horaria de la sede; nunca llega del cliente.
 *
 * CERO imports: corre con node por type-stripping (ver test/conquer/oracle-check.mjs).
 * Sin enum, sin namespace, sin clases ni parameter properties.
 */

const DAY_MS = 86_400_000;

/** Milisegundos UTC de la medianoche de un YYYY-MM-DD. */
function utcMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** `date` + `days` dias (puede ser negativo). */
export function addDaysIso(date: string, days: number): string {
  return new Date(utcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Lunes de la semana calendario (lunes-domingo) de `date`. */
export function mondayOfIso(date: string): string {
  const dow = new Date(utcMs(date)).getUTCDay(); // 0 = domingo
  return addDaysIso(date, -((dow + 6) % 7));
}

/** `to` - `from` en dias (negativo si `to` es anterior). */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

/**
 * A11: semana del bloque (1 = la semana calendario de la activacion). Minimo 1.
 */
export function blockWeek(activationDate: string, today: string): number {
  const weeks = Math.floor(
    daysBetweenIso(mondayOfIso(activationDate), mondayOfIso(today)) / 7,
  );
  return Math.max(1, weeks + 1);
}

/**
 * D-16: primer dia del plan (en el orden del plan) que no esta hecho esta
 * semana. `null` = "Semana completa".
 */
export function nextPendingDay(
  planKeys: readonly string[],
  doneKeys: readonly string[],
): string | null {
  const done = new Set(doneKeys);
  for (const key of planKeys) {
    if (!done.has(key)) return key;
  }
  return null;
}

/**
 * D-14: `true` si en las ultimas `n` semanas calendario seguidas (lunes
 * consecutivos, 7 dias entre cada uno) se cumplio el objetivo. Una semana que
 * falta en la lista corta la secuencia.
 */
export function comboSubirReady(
  weeks: readonly { monday: string; hit: boolean }[],
  n: number,
): boolean {
  if (n < 1) return false;
  const sorted = [...weeks].sort((a, b) => a.monday.localeCompare(b.monday));
  const last = sorted.slice(-n);
  if (last.length < n) return false;
  for (let i = 0; i < last.length; i++) {
    if (!last[i].hit) return false;
    if (i > 0 && daysBetweenIso(last[i - 1].monday, last[i].monday) !== 7) {
      return false;
    }
  }
  return true;
}

/**
 * §2.2 / A13: racha de semanas completas consecutivas. Una semana esta completa
 * con `daysDone >= daysCount` y `maxPain < painLimit`. La racha termina en
 * `currentMonday` si esa semana ya esta completa, o en la semana anterior si no
 * (la semana en curso todavia puede completarse). Una semana ausente corta.
 */
export function levelUpStreak(
  weeks: readonly { monday: string; daysDone: number; maxPain: number }[],
  daysCount: number,
  painLimit: number,
  currentMonday: string,
): number {
  const complete = new Set<string>();
  for (const w of weeks) {
    if (w.daysDone >= daysCount && w.maxPain < painLimit)
      complete.add(w.monday);
  }
  let cursor = complete.has(currentMonday)
    ? currentMonday
    : addDaysIso(currentMonday, -7);
  let streak = 0;
  while (complete.has(cursor)) {
    streak += 1;
    cursor = addDaysIso(cursor, -7);
  }
  return streak;
}

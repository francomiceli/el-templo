/**
 * Rótulos y aritmética de fechas de la tab Semana (fase 197 D-03).
 *
 * Todo trabaja sobre strings "YYYY-MM-DD" de la sede (nunca la zona del teléfono): se parsean con
 * `Date.UTC` y se formatean con `Intl` en `timeZone: 'UTC'` (mismo patrón que `today-card.ts`).
 * Sin `new Date(string)` local.
 */

/** Lunes de la semana 1 del ciclo: no se navega más atrás (D-03). */
const FIRST_WEEK_MONDAY = '2026-02-23'

const MONTH_FMT = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', month: 'long' })
const WEEKDAY_FMT = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long' })

function parseYmd(dateStr: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

function utcMs(dateStr: string): number | null {
  const p = parseYmd(dateStr)
  return p ? Date.UTC(p.y, p.m - 1, p.d) : null
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function ymdOf(ms: number): string {
  const dt = new Date(ms)
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

/** Suma `n` días (puede ser negativo) a una fecha "YYYY-MM-DD". Fecha inválida: se devuelve igual. */
export function addDays(date: string, n: number): string {
  const ms = utcMs(date)
  if (ms === null) return date
  return ymdOf(ms + n * 86_400_000)
}

/** Lunes de la semana de `date` (el domingo pertenece a la semana que termina en él). */
export function mondayOfDate(date: string): string {
  const ms = utcMs(date)
  if (ms === null) return date
  const dow = new Date(ms).getUTCDay() // 0 = domingo
  return addDays(date, -((dow + 6) % 7))
}

/** Las 7 fechas de la semana que arranca en `monday` (lunes a domingo). */
export function weekDatesFrom(monday: string): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(monday, n))
}

function dayAndMonth(date: string): { d: number; month: string } | null {
  const p = parseYmd(date)
  if (!p) return null
  return { d: p.d, month: MONTH_FMT.format(Date.UTC(p.y, p.m - 1, p.d)) }
}

/**
 * "12 al 18 de octubre"; si cruza de mes "28 de septiembre al 4 de octubre" (también de año).
 * El CSS lo pasa a mayúsculas (D-03).
 */
export function weekRangeLabel(monday: string): string {
  const from = dayAndMonth(monday)
  const to = dayAndMonth(addDays(monday, 6))
  if (!from || !to) return monday
  if (from.month === to.month) return `${from.d} al ${to.d} de ${to.month}`
  return `${from.d} de ${from.month} al ${to.d} de ${to.month}`
}

/** "viernes" (minúscula, como lo devuelve Intl). Fecha inválida: "". */
export function weekdayLong(date: string): string {
  const ms = utcMs(date)
  return ms === null ? '' : WEEKDAY_FMT.format(ms)
}

/** "Hoy · viernes 16" si es hoy; si no "miércoles 14" (D-03). El CSS lo pasa a mayúsculas. */
export function dayKicker(date: string, today: string): string {
  const p = parseYmd(date)
  if (!p) return date
  const base = `${weekdayLong(date)} ${p.d}`
  return date === today ? `Hoy · ${base}` : base
}

/** Chip de la tira: { short: "MIÉ", n: 14 }. Tres letras, mayúsculas y sin punto. */
export function dayChip(date: string): { short: string; n: number } {
  const p = parseYmd(date)
  return { short: weekdayLong(date).slice(0, 3).toUpperCase(), n: p ? p.d : 0 }
}

/** "Disponible el sábado" (CTA deshabilitado de un día futuro). */
export function availableLabel(date: string): string {
  return `Disponible el ${weekdayLong(date)}`
}

/** No se retrocede antes de la semana 1 del ciclo. */
export function canGoPrevWeek(monday: string): boolean {
  return monday > FIRST_WEEK_MONDAY
}

/** Se puede avanzar hasta 1 semana después de la actual. */
export function canGoNextWeek(monday: string, todayMonday: string): boolean {
  return monday < addDays(todayMonday, 7)
}

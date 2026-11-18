import { daysBetween } from 'src/utils/short-date'
import { parseDateParts, todayInTz } from 'src/utils/tz'

/**
 * Formato de la Aura en pantalla (fase 214, UI-SPEC "Fecha" y "Todos los números de Aura").
 * Todo es puro: el reloj y la zona de la sede entran por parámetro.
 */

const MONTHS_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

// Índice 0 = domingo (getUTCDay).
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/**
 * Número con separador de miles es-AR ("1.240"). A mano y no con `Intl.NumberFormat('es-AR')`:
 * el CLDR de `es` no agrupa los números de 4 cifras ("1240") y la ficha tiene que decir "1.240".
 */
export function formatAura(n: number): string {
  const sign = n < 0 ? '-' : ''
  return sign + String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

interface LocalDay {
  date: string
  daysAgo: number
  sameYear: boolean
  weekday: number
  y: number
  m: number
  d: number
}

/** Día calendario de `createdAt` en la zona de la sede, comparado con el "hoy" de esa zona. */
function localDay(createdAt: string, tz: string, now: Date): LocalDay | null {
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return null
  const date = todayInTz(tz, created)
  const today = todayInTz(tz, now)
  const { y, m, d } = parseDateParts(date)
  return {
    date,
    daysAgo: daysBetween(date, today),
    sameYear: y === parseDateParts(today).y,
    weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
    y,
    m,
    d,
  }
}

/** "Hoy", "Ayer", "Mar 10 nov" (más el año si no es el actual: "Lun 10 nov 2025"). */
export function formatMovementDate(createdAt: string, tz: string, now: Date = new Date()): string {
  const day = localDay(createdAt, tz, now)
  if (!day) return ''
  if (day.daysAgo === 0) return 'Hoy'
  if (day.daysAgo === 1) return 'Ayer'
  const base = `${DAYS_SHORT[day.weekday]} ${day.d} ${MONTHS_SHORT[day.m - 1]}`
  return day.sameYear ? base : `${base} ${day.y}`
}

/** Versión para lectores de pantalla: "hoy", "ayer", "jueves 6 de noviembre" (+ " de 2025"). */
export function formatMovementDateLong(
  createdAt: string,
  tz: string,
  now: Date = new Date(),
): string {
  const day = localDay(createdAt, tz, now)
  if (!day) return ''
  if (day.daysAgo === 0) return 'hoy'
  if (day.daysAgo === 1) return 'ayer'
  const base = `${DAYS_LONG[day.weekday]} ${day.d} de ${MONTHS_LONG[day.m - 1]}`
  return day.sameYear ? base : `${base} de ${day.y}`
}

/** "Asistencia a clase, hoy, más 5" / "Asistencia anulada, jueves 6 de noviembre, menos 5". */
export function movementAriaLabel(m: { label: string; amount: number }, dateLong: string): string {
  const sign = m.amount < 0 ? 'menos' : 'más'
  return `${m.label}, ${dateLong.toLowerCase()}, ${sign} ${formatAura(Math.abs(m.amount))}`
}

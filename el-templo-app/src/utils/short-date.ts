import { parseDateParts } from 'src/utils/tz'

const MONTHS_ES = [
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

/**
 * Fecha corta en español: "16 nov". El año aparece SOLO si no es el año en curso
 * ("15 ene 2027"). `date` y `today` son "YYYY-MM-DD" (día calendario de la sede):
 * nunca se pasa por `new Date('YYYY-MM-DD')`, que corre un día en la Argentina.
 */
export function formatShortDateEs(date: string, today: string): string {
  const { y, m, d } = parseDateParts(date)
  const base = `${d} ${MONTHS_ES[m - 1] ?? ''}`
  return y === parseDateParts(today).y ? base : `${base} ${y}`
}

/**
 * Días enteros de `from` a `to` ("YYYY-MM-DD"). Positivo si `to` es posterior, 0 si es el mismo
 * día, negativo si ya pasó. Aritmética en UTC sobre el día calendario: sin zona del teléfono ni DST.
 */
export function daysBetween(from: string, to: string): number {
  const a = parseDateParts(from)
  const b = parseDateParts(to)
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)
  return Math.round(ms / 86_400_000)
}

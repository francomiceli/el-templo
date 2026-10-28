// Ventana de check-in y helpers de fecha para el botón QR condicional y la card
// de hoy (fase 199, D-04/D-06). Utils PUROS: `now` se inyecta, nada de reloj
// adentro, así los tests usan fechas fijas.

import { parseDateParts, zonedWallClockToUtc } from './tz'

/**
 * Zona por defecto: se define UNA vez en `utils/tz.ts` (plan 11) y se re-exporta
 * acá para los consumidores de la ventana.
 */
export { DEFAULT_BRANCH_TZ } from './tz'

/**
 * Espejo de `windowMs` en el-templo-api/src/modules/attendance/service.ts
 * (línea 124): el check-in solo se acepta a ±20 min del inicio de una reserva
 * `reservado` de hoy. Borde INCLUSIVO en ambos lados (`Math.abs(now - classTime)
 * <= windowMs`, línea 156). Si cambia allá, cambia acá (D-06).
 */
export const CHECK_IN_WINDOW_MS = 20 * 60 * 1000

/** Categoría por defecto cuando no hay reserva en ventana (igual que el server: sin reserva = regular). */
export const REGULAR_KIND = 'regular'

/**
 * Inicio de la clase como instante UTC, calculado en la zona de la SEDE DE LA
 * CLASE (`branchTimezone` de la reserva), igual que `buildClassDateTime` del
 * server. `startTime` puede ser "HH:MM" o "HH:MM:SS".
 */
export function classStartUtc(bookingDate: string, startTime: string, tz: string): Date {
  return zonedWallClockToUtc(bookingDate, startTime, tz)
}

export type CheckInWindowState = 'before' | 'open' | 'after'

/** `open` si `|now - inicio| <= 20 min` (inclusive, espejo del server); `before` si falta más; `after` si ya pasó. */
export function checkInWindowState(classStart: Date, now: Date): CheckInWindowState {
  const diff = now.getTime() - classStart.getTime()
  if (Math.abs(diff) <= CHECK_IN_WINDOW_MS) return 'open'
  return diff < 0 ? 'before' : 'after'
}

/** Minutos hasta el inicio, redondeando hacia arriba. Negativo (o 0 al redondear) si ya empezó. */
export function minutesUntil(classStart: Date, now: Date): number {
  const minutes = Math.ceil((classStart.getTime() - now.getTime()) / 60_000)
  // Evita el -0 de Math.ceil con valores entre -1 y 0.
  return minutes === 0 ? 0 : minutes
}

/** "19:00:00" -> "19:00". */
export function formatHHMM(startTime: string): string {
  return startTime.slice(0, 5)
}

/** Hora "HH:MM" de un instante ISO en la zona dada. */
export function formatTimeInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** Suma `days` (puede ser negativo) a un "YYYY-MM-DD" con aritmética UTC (sin deriva por zona). */
export function addDaysStr(dateStr: string, days: number): string {
  const { y, m, d } = parseDateParts(dateStr)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * Lunes de la semana de `todayStr` y lunes siguiente. El domingo pertenece a la
 * semana que empezó el lunes anterior.
 */
export function weekStartsFor(todayStr: string): [string, string] {
  const { y, m, d } = parseDateParts(todayStr)
  const utcDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=dom..6=sáb
  const sinceMonday = utcDow === 0 ? 6 : utcDow - 1
  const monday = addDaysStr(todayStr, -sinceMonday)
  return [monday, addDaysStr(monday, 7)]
}

/**
 * Categoría de asistencia de una reserva: `'regular'` o `'special:<línea>'`
 * (línea vacía = Aura).
 *
 * Espejo de `sameActivityKindSql` (el-templo-api/src/modules/scheduling/special-line.ts)
 * y de la guarda "One check-in per day, per activity category" de
 * attendance/service.ts: una asistencia por día POR CATEGORÍA. Si cambia allá,
 * cambia acá (D-06).
 */
export function activityKindKey(b: { isSpecial: boolean; specialLine: string | null }): string {
  if (!b.isSpecial) return REGULAR_KIND
  return `special:${b.specialLine ?? ''}`
}

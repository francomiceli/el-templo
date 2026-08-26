/**
 * Google Calendar "Add to calendar" link for a trial-class booking.
 *
 * The instant of the class is always computed from the BRANCH timezone via
 * `zonedWallClockToUtc` — never from the device's local time (`new Date(date +
 * 'T' + startTime)` would silently shift the event when the device's timezone
 * differs from the branch's). See src/utils/tz.ts.
 */

import { zonedWallClockToUtc } from './tz'

const DEFAULT_DURATION_MINUTES = 60
const CALENDAR_TEXT = 'Sesión de prueba — El Templo'
const CALENDAR_DETAILS = 'Llegá 10 minutos antes. Ropa cómoda y agua.'

export interface BuildGoogleCalendarUrlInput {
  date: string
  startTime: string
  timezone: string
  branchName: string
  branchAddress: string | null
  durationMinutes?: number
}

/** Format a UTC instant as `YYYYMMDDTHHmmssZ` (Google Calendar's `dates` param format). */
function toGoogleCalendarUtc(instant: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = instant.getUTCFullYear()
  const m = pad(instant.getUTCMonth() + 1)
  const d = pad(instant.getUTCDate())
  const hh = pad(instant.getUTCHours())
  const mm = pad(instant.getUTCMinutes())
  const ss = pad(instant.getUTCSeconds())
  return `${y}${m}${d}T${hh}${mm}${ss}Z`
}

export function buildGoogleCalendarUrl(input: BuildGoogleCalendarUrlInput): string {
  const { date, startTime, timezone, branchAddress } = input
  const durationMinutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES

  const startUtc = zonedWallClockToUtc(date, startTime, timezone)
  const endUtc = new Date(startUtc.getTime() + durationMinutes * 60_000)
  const dates = `${toGoogleCalendarUtc(startUtc)}/${toGoogleCalendarUtc(endUtc)}`

  const parts = [
    `text=${encodeURIComponent(CALENDAR_TEXT)}`,
    `dates=${encodeURIComponent(dates)}`,
    `details=${encodeURIComponent(CALENDAR_DETAILS)}`,
  ]
  // location = branch address only. branchName is part of the public interface
  // (a caller shows it elsewhere / future-proofing the signature) but the
  // Google Calendar TEMPLATE `location` param is best filled with the postal
  // address, not the venue name — Maps resolves the address directly.
  if (branchAddress) {
    parts.push(`location=${encodeURIComponent(branchAddress)}`)
  }

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&${parts.join('&')}`
}

import { describe, it, expect } from 'vitest'
import { buildGoogleCalendarUrl } from 'src/utils/calendar-link'

const BASE_INPUT = {
  date: '2026-09-03',
  startTime: '19:00',
  branchName: 'El Templo Palermo',
  branchAddress: 'Av. Santa Fe 1234, CABA',
}

describe('buildGoogleCalendarUrl', () => {
  it('produces a dates= param in UTC using the branch timezone (AR = UTC-3, 1h duration)', () => {
    const url = buildGoogleCalendarUrl({
      ...BASE_INPUT,
      timezone: 'America/Argentina/Buenos_Aires',
    })
    expect(url).toContain('dates=20260903T220000Z%2F20260903T230000Z')
  })

  it('uses the BRANCH timezone, not the device one: Europe/Madrid yields a different UTC instant', () => {
    const url = buildGoogleCalendarUrl({
      ...BASE_INPUT,
      timezone: 'Europe/Madrid',
    })
    // 19:00 in Madrid (CEST, UTC+2 in September) = 17:00 UTC
    expect(url).toContain('dates=20260903T170000Z%2F20260903T180000Z')
    expect(url).not.toContain('20260903T220000Z')
  })

  it('omits the location param when branchAddress is null', () => {
    const url = buildGoogleCalendarUrl({
      ...BASE_INPUT,
      timezone: 'America/Argentina/Buenos_Aires',
      branchAddress: null,
    })
    expect(url).not.toContain('location=')
  })

  it('URL-encodes text, details and location, with the fixed trial-class copy', () => {
    const url = buildGoogleCalendarUrl({
      ...BASE_INPUT,
      timezone: 'America/Argentina/Buenos_Aires',
    })
    expect(url).toBe(
      'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Sesi%C3%B3n%20de%20prueba%20%E2%80%94%20El%20Templo&dates=20260903T220000Z%2F20260903T230000Z&details=Lleg%C3%A1%2010%20minutos%20antes.%20Ropa%20c%C3%B3moda%20y%20agua.&location=Av.%20Santa%20Fe%201234%2C%20CABA',
    )
  })

  it('is a pure function: does not read the device timezone or an argument-less new Date()', () => {
    const source = buildGoogleCalendarUrl.toString()
    expect(source).not.toContain('resolvedOptions')
    expect(source).not.toMatch(/new Date\(\)/)
  })
})

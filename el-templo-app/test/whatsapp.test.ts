import { describe, it, expect } from 'vitest'
import { WHATSAPP_NUMBERS, getWhatsAppNumber, buildWhatsAppUrl } from 'src/utils/whatsapp'

describe('WHATSAPP_NUMBERS', () => {
  it('exposes AR and ES numbers', () => {
    expect(WHATSAPP_NUMBERS.AR).toBe('5492235820521')
    expect(WHATSAPP_NUMBERS.ES).toBe('34680774331')
  })
})

describe('getWhatsAppNumber', () => {
  it('returns the ES number for ES members (e.g. BCN)', () => {
    expect(getWhatsAppNumber('ES')).toBe('34680774331')
  })

  it('returns the AR number for AR members', () => {
    expect(getWhatsAppNumber('AR')).toBe('5492235820521')
  })

  it('defaults to AR when country is null (profile not yet loaded)', () => {
    expect(getWhatsAppNumber(null)).toBe('5492235820521')
  })

  it('defaults to AR when country is undefined', () => {
    expect(getWhatsAppNumber(undefined)).toBe('5492235820521')
  })
})

describe('buildWhatsAppUrl', () => {
  it('builds a wa.me URL with no text when none is provided', () => {
    expect(buildWhatsAppUrl('ES')).toBe('https://wa.me/34680774331')
  })

  it('appends url-encoded text when provided', () => {
    const url = buildWhatsAppUrl('AR', 'Hola! Quiero reservar')
    expect(url).toBe('https://wa.me/5492235820521?text=Hola!%20Quiero%20reservar')
  })

  it('encodes special characters including emoji', () => {
    const url = buildWhatsAppUrl('ES', 'Plan 💪')
    expect(url).toContain('https://wa.me/34680774331?text=')
    expect(url).toContain('Plan%20%F0%9F%92%AA')
  })

  it('falls back to AR when country is missing', () => {
    expect(buildWhatsAppUrl(null, 'Hola')).toBe('https://wa.me/5492235820521?text=Hola')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import {
  WHATSAPP_NUMBERS,
  getWhatsAppNumber,
  buildWhatsAppUrl,
  setServerSalesNumber,
  resetWhatsAppOverridesForTests,
} from '../whatsapp'

describe('whatsapp (D-21 — número del servidor con fallback al hardcode)', () => {
  beforeEach(() => {
    resetWhatsAppOverridesForTests()
  })

  it('sin número de servidor, AR y ES devuelven los hardcodeados', () => {
    expect(getWhatsAppNumber('AR')).toBe(WHATSAPP_NUMBERS.AR)
    expect(getWhatsAppNumber('ES')).toBe(WHATSAPP_NUMBERS.ES)
    expect(getWhatsAppNumber(null)).toBe(WHATSAPP_NUMBERS.AR)
    expect(getWhatsAppNumber(undefined)).toBe(WHATSAPP_NUMBERS.AR)
  })

  it('con setServerSalesNumber, AR y ES devuelven ese mismo número', () => {
    setServerSalesNumber('5491100000000')
    expect(getWhatsAppNumber('AR')).toBe('5491100000000')
    expect(getWhatsAppNumber('ES')).toBe('5491100000000')
  })

  it('un número con "+" o espacios NO pisa el fallback (fail-closed)', () => {
    setServerSalesNumber('+549 11 0000-0000')
    expect(getWhatsAppNumber('AR')).toBe(WHATSAPP_NUMBERS.AR)

    setServerSalesNumber('549 1100000000')
    expect(getWhatsAppNumber('ES')).toBe(WHATSAPP_NUMBERS.ES)

    // Muy corto / muy largo también quedan fuera del patrón ^[0-9]{8,15}$.
    setServerSalesNumber('1234567')
    expect(getWhatsAppNumber('AR')).toBe(WHATSAPP_NUMBERS.AR)

    setServerSalesNumber('1234567890123456')
    expect(getWhatsAppNumber('AR')).toBe(WHATSAPP_NUMBERS.AR)

    setServerSalesNumber(null)
    expect(getWhatsAppNumber('AR')).toBe(WHATSAPP_NUMBERS.AR)
  })

  it('buildWhatsAppUrl sigue escapando el texto con encodeURIComponent', () => {
    const url = buildWhatsAppUrl('AR', 'Hola! ¿Cómo va? 100% info & más')
    expect(url).toBe(
      `https://wa.me/${WHATSAPP_NUMBERS.AR}?text=${encodeURIComponent('Hola! ¿Cómo va? 100% info & más')}`,
    )
  })

  it('buildWhatsAppUrl sin texto no agrega query', () => {
    expect(buildWhatsAppUrl('ES')).toBe(`https://wa.me/${WHATSAPP_NUMBERS.ES}`)
  })

  it('buildWhatsAppUrl usa el número del servidor cuando está seteado', () => {
    setServerSalesNumber('5491100000000')
    expect(buildWhatsAppUrl('ES', 'hola')).toBe(
      `https://wa.me/5491100000000?text=${encodeURIComponent('hola')}`,
    )
  })
})

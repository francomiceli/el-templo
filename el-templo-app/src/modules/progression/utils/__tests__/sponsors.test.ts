import { describe, it, expect } from 'vitest'
import { monogram, SPONSOR_ADVANCE_MS, SPONSOR_TOUCH_PAUSE_MS } from '../sponsors'

describe('monogram (D-23)', () => {
  it('dos o más palabras: iniciales de las 2 primeras, en mayúsculas', () => {
    expect(monogram('verde vivo')).toBe('VV')
    expect(monogram('Kinesio Sur Plus')).toBe('KS')
  })

  it('una palabra: sus 2 primeras letras', () => {
    expect(monogram('Hierro')).toBe('HI')
  })

  it('ignora espacios de más y vacío devuelve cadena vacía', () => {
    expect(monogram('  Nuez   Dorada ')).toBe('ND')
    expect(monogram('   ')).toBe('')
  })
})

describe('constantes del carrusel (D-23)', () => {
  it('avanza cada 2 s y retoma a los 3 s del toque', () => {
    expect(SPONSOR_ADVANCE_MS).toBe(2000)
    expect(SPONSOR_TOUCH_PAUSE_MS).toBe(3000)
  })
})

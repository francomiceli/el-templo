import { describe, it, expect } from 'vitest'
import {
  monogram,
  sponsorRedeemPill,
  SPONSOR_ADVANCE_MS,
  SPONSOR_TOUCH_PAUSE_MS,
} from '../sponsors'

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

describe('sponsorRedeemPill (D-21/D-23)', () => {
  it('código con plan: sell + el código', () => {
    expect(sponsorRedeemPill({ redeemType: 'code', redeemCode: 'TEMPLO20' }, true)).toEqual({
      icon: 'sell',
      label: 'TEMPLO20',
    })
  })

  it('código sin plan: lock + "Socios con plan" (el server no manda el código)', () => {
    expect(sponsorRedeemPill({ redeemType: 'code', redeemCode: null }, false)).toEqual({
      icon: 'lock',
      label: 'Socios con plan',
    })
  })

  it('canRedeem pero sin código en el payload: no inventa uno, queda bloqueado', () => {
    expect(sponsorRedeemPill({ redeemType: 'code', redeemCode: '  ' }, true).icon).toBe('lock')
  })

  it('carnet: card_membership + "Mostrá tu carnet", con o sin plan', () => {
    const expected = { icon: 'card_membership', label: 'Mostrá tu carnet' }
    expect(sponsorRedeemPill({ redeemType: 'carnet', redeemCode: null }, true)).toEqual(expected)
    expect(sponsorRedeemPill({ redeemType: 'carnet', redeemCode: null }, false)).toEqual(expected)
  })
})

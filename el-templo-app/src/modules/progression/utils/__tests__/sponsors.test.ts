import { describe, it, expect } from 'vitest'
import {
  fitBenefitFontPx,
  isCardTap,
  monogram,
  sponsorBenefitFontPx,
  sponsorRedeemPill,
  SPONSOR_ADVANCE_MS,
  SPONSOR_BENEFIT_MIN_PX,
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
  it('avanza cada 4 s y retoma a los 3 s del toque', () => {
    expect(SPONSOR_ADVANCE_MS).toBe(4000)
    expect(SPONSOR_TOUCH_PAUSE_MS).toBe(3000)
  })
})

describe('sponsorBenefitFontPx (UAT D6)', () => {
  it('beneficios cortos (hasta 8 caracteres) arrancan en 30 px', () => {
    expect(sponsorBenefitFontPx('2x1')).toBe(30)
    expect(sponsorBenefitFontPx('20% OFF')).toBe(30)
    expect(sponsorBenefitFontPx('12345678')).toBe(30)
  })

  it('9 y 10 caracteres arrancan en 26 px', () => {
    expect(sponsorBenefitFontPx('123456789')).toBe(26)
    expect(sponsorBenefitFontPx('1234567890')).toBe(26)
  })

  it('11 caracteres o más arrancan en 22 px', () => {
    expect(sponsorBenefitFontPx('Envío gratis')).toBe(22)
    expect(sponsorBenefitFontPx('20% OFF TODO')).toBe(22)
    expect(sponsorBenefitFontPx('12345678901')).toBe(22)
  })

  it('cuenta sin espacios de los bordes', () => {
    expect(sponsorBenefitFontPx('  20% OFF  ')).toBe(30)
  })

  it('cuenta caracteres, no bytes', () => {
    expect(sponsorBenefitFontPx('ÁÉÍÓÚÑáéíóúñ')).toBe(22)
    expect(sponsorBenefitFontPx('ÁÉÍÓÚÑáé')).toBe(30)
  })

  it('un beneficio viejo de 15 caracteres también arranca en 22 px', () => {
    expect(sponsorBenefitFontPx('123456789012345')).toBe(22)
  })
})

describe('fitBenefitFontPx (UAT D6)', () => {
  // Ancho útil de una card a 360 px: 237 px. Modelo: ancho = largo * px * k.
  const USABLE_PX = 237
  const widthModel = (len: number, k: number) => (px: number) => len * px * k <= USABLE_PX

  it('peor caso M (12 × "M", k = 0.934): baja de 22 a 21 y ahí entra', () => {
    const fits = widthModel(12, 0.934)
    expect(fits(22)).toBe(false)
    const px = fitBenefitFontPx(22, fits)
    expect(px).toBe(21)
    expect(fits(px)).toBe(true)
  })

  it('peor caso W (12 × "W", k = 1.05): baja de 22 a 18 y ahí entra', () => {
    const fits = widthModel(12, 1.05)
    const px = fitBenefitFontPx(22, fits)
    expect(px).toBe(18)
    expect(fits(px)).toBe(true)
    expect(fits(px + 1)).toBe(false)
  })

  it('si entra al tamaño inicial no lo toca ("2x1" a 30 px)', () => {
    expect(fitBenefitFontPx(30, () => true)).toBe(30)
  })

  it('si nada entra devuelve el piso (16 px por defecto)', () => {
    expect(SPONSOR_BENEFIT_MIN_PX).toBe(16)
    expect(fitBenefitFontPx(22, () => false)).toBe(16)
  })

  it('respeta un piso propio', () => {
    expect(fitBenefitFontPx(22, () => false, 20)).toBe(20)
  })

  it('nunca devuelve más que el tamaño inicial', () => {
    expect(fitBenefitFontPx(22, () => true)).toBe(22)
    expect(fitBenefitFontPx(12, () => true)).toBeLessThanOrEqual(12)
    expect(fitBenefitFontPx(12, () => false)).toBeLessThanOrEqual(12)
  })

  it('mide de a 1 px y nunca por debajo del piso', () => {
    const probados: number[] = []
    fitBenefitFontPx(20, (px) => {
      probados.push(px)
      return false
    })
    expect(probados).toEqual([20, 19, 18, 17, 16])
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

describe('isCardTap (REVIEW-app WR-04)', () => {
  it('tap: el track no se movió o se movió dentro del margen', () => {
    expect(isCardTap(100, 100, 1, 8)).toBe(true)
    expect(isCardTap(108, 100, 1, 8)).toBe(true)
    expect(isCardTap(92, 100, 1, 8)).toBe(true)
  })

  it('swipe: el track se movió más que el margen (en cualquier sentido) → se descarta', () => {
    expect(isCardTap(109, 100, 1, 8)).toBe(false)
    expect(isCardTap(91, 100, 1, 8)).toBe(false)
  })

  it('click sintético (detail 0, teclado o lector) → siempre tap aunque el carrusel haya avanzado', () => {
    expect(isCardTap(900, 100, 0, 8)).toBe(true)
  })

  it('sin pointerdown pendiente → tap', () => {
    expect(isCardTap(900, null, 1, 8)).toBe(true)
  })
})

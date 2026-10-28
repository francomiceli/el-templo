import { describe, it, expect } from 'vitest'
import {
  SPONSOR_COPIES,
  buildSlidePlan,
  clampSlide,
  fitBenefitFontPx,
  isCardTap,
  jumpTarget,
  monogram,
  positionAfterCountChange,
  positionFromScroll,
  progressOffset,
  realIndex,
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

describe('buildSlidePlan — pista con copias al final (REVIEW-app WR-06)', () => {
  const plan = (count: number) =>
    buildSlidePlan(count).map(({ index, copy }) => `${index}${copy ? "'" : ''}`)

  it('0 marcas → pista vacía', () => {
    expect(plan(0)).toEqual([])
    expect(plan(-1)).toEqual([])
  })

  it('1 marca → sin copias (no hay a dónde avanzar)', () => {
    expect(plan(1)).toEqual(['0'])
  })

  it("2 marcas → A B A' B' (las dos se repiten)", () => {
    expect(plan(2)).toEqual(['0', '1', "0'", "1'"])
  })

  it('3 marcas → copias de las dos primeras', () => {
    expect(plan(3)).toEqual(['0', '1', '2', "0'", "1'"])
  })

  it('6 marcas → 6 reales + SPONSOR_COPIES copias de las primeras', () => {
    const slides = buildSlidePlan(6)
    expect(slides).toHaveLength(6 + SPONSOR_COPIES)
    expect(slides.slice(0, 6).every((x) => !x.copy)).toBe(true)
    expect(slides.slice(6)).toEqual([
      { index: 0, copy: true },
      { index: 1, copy: true },
    ])
  })
})

describe('realIndex (REVIEW-app WR-06)', () => {
  it('sin marcas → 0', () => {
    expect(realIndex(0, 0)).toBe(0)
    expect(realIndex(3, 0)).toBe(0)
  })

  it('1 marca → siempre 0', () => {
    expect(realIndex(0, 1)).toBe(0)
  })

  it('en una real devuelve la misma; en una copia, la marca de la que es copia', () => {
    expect(realIndex(1, 2)).toBe(1)
    expect(realIndex(2, 2)).toBe(0) // copia 0 con 2 marcas
    expect(realIndex(3, 2)).toBe(1) // copia 1 con 2 marcas
    expect(realIndex(6, 6)).toBe(0) // copia 0 con 6 marcas
    expect(realIndex(7, 6)).toBe(1) // copia 1 con 6 marcas
  })
})

describe('jumpTarget — salto copia → real (REVIEW-app WR-06)', () => {
  it('menos de 2 marcas → nunca salta', () => {
    expect(jumpTarget(0, 0)).toBeNull()
    expect(jumpTarget(0, 1)).toBeNull()
    expect(jumpTarget(1, 1)).toBeNull()
  })

  it('estando en una card real → no salta (incluida la última real)', () => {
    expect(jumpTarget(0, 2)).toBeNull()
    expect(jumpTarget(1, 2)).toBeNull()
    expect(jumpTarget(5, 6)).toBeNull()
  })

  it('en la copia 0 salta a la real 0; en la copia 1, a la real 1', () => {
    expect(jumpTarget(2, 2)).toBe(0)
    expect(jumpTarget(3, 2)).toBe(1)
    expect(jumpTarget(3, 3)).toBe(0)
    expect(jumpTarget(4, 3)).toBe(1)
    expect(jumpTarget(6, 6)).toBe(0)
    expect(jumpTarget(7, 6)).toBe(1)
  })

  it('el destino se ve igual que el origen (misma marca real)', () => {
    for (const count of [2, 3, 6]) {
      for (let position = count; position < count + SPONSOR_COPIES; position++) {
        const target = jumpTarget(position, count)
        expect(target).not.toBeNull()
        expect(realIndex(target!, count)).toBe(realIndex(position, count))
        expect(target!).toBeLessThan(count)
      }
    }
  })
})

describe('positionAfterCountChange — la lista se achica o crece (REVIEW-app WR-06)', () => {
  it('la posición sigue valiendo → se conserva', () => {
    expect(positionAfterCountChange(2, 6)).toBe(2)
    expect(positionAfterCountChange(7, 6)).toBe(7) // última copia de 6 marcas
  })

  it('queda fuera de rango → vuelve a 0', () => {
    expect(positionAfterCountChange(7, 3)).toBe(0) // 3 marcas → pista de 5
    expect(positionAfterCountChange(3, 2)).toBe(3) // 2 marcas → pista de 4: la copia 1 sigue
    expect(positionAfterCountChange(4, 2)).toBe(0)
  })

  it('pasa a 1 marca (sin copias) o a 0 → 0 si la posición no es la 0', () => {
    expect(positionAfterCountChange(1, 1)).toBe(0)
    expect(positionAfterCountChange(2, 1)).toBe(0)
    expect(positionAfterCountChange(0, 1)).toBe(0)
    expect(positionAfterCountChange(0, 0)).toBe(0)
    expect(positionAfterCountChange(3, 0)).toBe(0)
  })

  it('de 1 a 2 marcas la posición 0 se conserva', () => {
    expect(positionAfterCountChange(0, 2)).toBe(0)
  })
})

describe('clampSlide — avance automático (REVIEW-app WR-06)', () => {
  it('pista vacía → 0', () => {
    expect(clampSlide(1, 0)).toBe(0)
  })

  it('con 1 marca nunca sale de la 0', () => {
    expect(clampSlide(1, 1)).toBe(0)
  })

  it('de la última real pasa a la copia 0, y no se pasa de la última copia', () => {
    expect(clampSlide(2, 2)).toBe(2)
    expect(clampSlide(4, 2)).toBe(3)
    expect(clampSlide(-3, 6)).toBe(0)
    expect(clampSlide(6, 6)).toBe(6)
    expect(clampSlide(99, 6)).toBe(7)
  })
})

describe('positionFromScroll — swipe (REVIEW-app WR-06)', () => {
  // 4 cards (2 marcas + 2 copias), paso 100, scroll máximo 300.
  it('redondea a la card más cercana', () => {
    expect(positionFromScroll(0, 100, 300, 4)).toBe(0)
    expect(positionFromScroll(49, 100, 300, 4)).toBe(0)
    expect(positionFromScroll(51, 100, 300, 4)).toBe(1)
    expect(positionFromScroll(200, 100, 300, 4)).toBe(2)
  })

  it('al final del scroll cuenta la última aunque no llegue a su snap', () => {
    expect(positionFromScroll(299, 100, 300, 4)).toBe(3)
    expect(positionFromScroll(298, 100, 300, 4)).toBe(3)
    expect(positionFromScroll(240, 100, 300, 4)).toBe(2)
  })

  it('nunca sale de la pista', () => {
    expect(positionFromScroll(-40, 100, 300, 4)).toBe(0)
    expect(positionFromScroll(900, 100, 1000, 4)).toBe(3)
  })

  it('sin cards o sin paso → 0', () => {
    expect(positionFromScroll(120, 100, 300, 0)).toBe(0)
    expect(positionFromScroll(120, 0, 300, 4)).toBe(0)
  })

  it('con 1 sola card (sin scroll posible) → 0', () => {
    expect(positionFromScroll(0, 100, 0, 1)).toBe(0)
  })
})

describe('progressOffset — la línea de progreso sigue tras el salto (REVIEW-app WR-06)', () => {
  it('con el auto-avance corriendo continúa desde el tiempo de la vuelta', () => {
    expect(progressOffset(true, 1500, 4000)).toBe(1500)
  })

  it('no se pasa del intervalo', () => {
    expect(progressOffset(true, 4200, 4000)).toBe(4000)
  })

  it('un tiempo negativo (reloj raro) no da offset negativo', () => {
    expect(progressOffset(true, -5, 4000)).toBe(0)
  })

  it('sin correr (pausa, fuera de pantalla, reduced-motion) → 0', () => {
    expect(progressOffset(false, 1500, 4000)).toBe(0)
  })
})

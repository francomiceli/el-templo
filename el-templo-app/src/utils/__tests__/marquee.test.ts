import { describe, it, expect } from 'vitest'
import {
  MARQUEE_HOLD_MS,
  MARQUEE_PX_PER_S,
  MARQUEE_RETURN_MS,
  fitsInLines,
  horizontalOverflowPx,
  marqueeCycleMs,
  marqueeKeyframes,
} from '../marquee'

describe('horizontalOverflowPx', () => {
  it('0 si el texto entra o sobra 1 px o menos (subpíxel)', () => {
    expect(horizontalOverflowPx(100, 120)).toBe(0)
    expect(horizontalOverflowPx(100, 100)).toBe(0)
    expect(horizontalOverflowPx(100.8, 100)).toBe(0)
    expect(horizontalOverflowPx(101, 100)).toBe(0)
  })

  it('redondea hacia arriba lo que sobra', () => {
    expect(horizontalOverflowPx(101.2, 100)).toBe(2)
    expect(horizontalOverflowPx(150, 100)).toBe(50)
  })
})

describe('marqueeCycleMs', () => {
  it('sin desborde no hay ciclo', () => {
    expect(marqueeCycleMs(0)).toBe(0)
    expect(marqueeCycleMs(-5)).toBe(0)
  })

  it('suma pausa inicial, recorrido, pausa final y vuelta', () => {
    const overflow = MARQUEE_PX_PER_S * 2 // 2 s de recorrido
    expect(marqueeCycleMs(overflow)).toBe(2 * MARQUEE_HOLD_MS + 2000 + MARQUEE_RETURN_MS)
  })

  it('crece con el desborde', () => {
    expect(marqueeCycleMs(200)).toBeGreaterThan(marqueeCycleMs(20))
  })
})

describe('marqueeKeyframes', () => {
  it('sin desborde: sin keyframes', () => {
    expect(marqueeKeyframes(0)).toEqual([])
  })

  it('pausa, recorrido hasta -overflow, pausa y vuelta, con offsets crecientes', () => {
    const frames = marqueeKeyframes(80)
    expect(frames.map((f) => f.transform)).toEqual([
      'translateX(0)',
      'translateX(0)',
      'translateX(-80px)',
      'translateX(-80px)',
      'translateX(0)',
    ])
    const offsets = frames.map((f) => f.offset as number)
    expect(offsets[0]).toBe(0)
    expect(offsets[4]).toBe(1)
    for (let i = 1; i < offsets.length; i++) expect(offsets[i]).toBeGreaterThan(offsets[i - 1])
  })

  it('la pausa inicial dura MARQUEE_HOLD_MS del ciclo', () => {
    const overflow = 120
    const frames = marqueeKeyframes(overflow)
    expect((frames[1].offset as number) * marqueeCycleMs(overflow)).toBeCloseTo(MARQUEE_HOLD_MS, 5)
  })
})

describe('fitsInLines', () => {
  const box = (scrollWidth: number, scrollHeight: number) => ({
    scrollWidth,
    clientWidth: 150,
    scrollHeight,
  })

  it('entra en una o dos líneas de 30.8 px', () => {
    expect(fitsInLines(box(150, 31), 30.8, 2)).toBe(true)
    expect(fitsInLines(box(150, 62), 30.8, 2)).toBe(true)
  })

  it('no entra si hace falta una tercera línea', () => {
    expect(fitsInLines(box(150, 93), 30.8, 2)).toBe(false)
  })

  it('no entra si una palabra sola es más ancha que la caja', () => {
    expect(fitsInLines(box(180, 31), 30.8, 2)).toBe(false)
  })

  it('ignora el redondeo de subpíxel en ancho y alto', () => {
    expect(fitsInLines(box(151, 62.6), 30.8, 2)).toBe(true)
  })
})

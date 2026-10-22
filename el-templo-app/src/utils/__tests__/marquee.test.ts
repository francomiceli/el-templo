import { describe, it, expect } from 'vitest'
import {
  MARQUEE_HOLD_MS,
  MARQUEE_PX_PER_S,
  MARQUEE_RETURN_MS,
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

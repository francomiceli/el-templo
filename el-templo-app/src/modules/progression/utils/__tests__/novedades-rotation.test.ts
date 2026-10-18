import { describe, it, expect } from 'vitest'
import {
  MARQUEE_HOLD_MS,
  MARQUEE_PX_PER_S,
  NOVEDAD_ROTATE_MS,
  marqueeKeyframes,
  marqueeOverflowPx,
  novedadDwellMs,
} from '../novedades-rotation'

describe('constantes del reloj de Novedades', () => {
  it('conservan los valores de diseño (D-8, UAT D19, C3, desplazamiento vertical 2026-10-18)', () => {
    expect(NOVEDAD_ROTATE_MS).toBe(4500)
    expect(MARQUEE_HOLD_MS).toBe(1500)
    expect(MARQUEE_PX_PER_S).toBe(10)
  })
})

describe('marqueeOverflowPx', () => {
  it('0 cuando el texto entra o es más angosto', () => {
    expect(marqueeOverflowPx(300, 300)).toBe(0)
    expect(marqueeOverflowPx(200, 300)).toBe(0)
  })

  it('tolera 1 px de diferencia (subpíxel) y no más', () => {
    expect(marqueeOverflowPx(301, 300)).toBe(0)
    expect(marqueeOverflowPx(301.5, 300)).toBe(2)
  })

  it('redondea hacia arriba para que el final del texto siempre se vea', () => {
    expect(marqueeOverflowPx(420.4, 300)).toBe(121)
    expect(marqueeOverflowPx(450, 300)).toBe(150)
  })
})

describe('novedadDwellMs', () => {
  it('sin desbordamiento es el valor de siempre (4,5 s)', () => {
    expect(novedadDwellMs(0)).toBe(4500)
    expect(novedadDwellMs(-5)).toBe(4500)
  })

  it('un desbordamiento chico no baja del mínimo', () => {
    expect(novedadDwellMs(10)).toBe(4500)
  })

  it('un desbordamiento grande (3 líneas de más) se estira a ~10 px/s más las dos pausas', () => {
    expect(novedadDwellMs(60)).toBe(9000)
  })

  it('es monótona no decreciente en el desbordamiento', () => {
    let prev = 0
    for (let px = 0; px <= 200; px += 3) {
      const ms = novedadDwellMs(px)
      expect(ms).toBeGreaterThanOrEqual(prev)
      prev = ms
    }
  })

  it('el tramo de recorrido respeta la velocidad (no más rápido que 10 px/s)', () => {
    const px = 60
    const travelMs = novedadDwellMs(px) - 2 * MARQUEE_HOLD_MS
    expect(px / (travelMs / 1000)).toBeLessThanOrEqual(MARQUEE_PX_PER_S)
  })
})

describe('marqueeKeyframes', () => {
  it('sin desbordamiento no hay animación', () => {
    expect(marqueeKeyframes(0, 4500)).toEqual([])
  })

  it('con desbordamiento: pausa, recorrido, pausa (4 frames)', () => {
    const frames = marqueeKeyframes(21, 7500)
    expect(frames).toHaveLength(4)
    expect(frames.map((f) => f.offset)).toEqual([0, 0.2, 0.8, 1])
    expect(frames.map((f) => f.transform)).toEqual([
      'translateY(0)',
      'translateY(0)',
      'translateY(-21px)',
      'translateY(-21px)',
    ])
  })

  it('las pausas duran MARQUEE_HOLD_MS también con duraciones estiradas', () => {
    const frames = marqueeKeyframes(60, 9000)
    expect(frames[1]?.offset).toBeCloseTo(1500 / 9000, 10)
    expect(frames[2]?.offset).toBeCloseTo(1 - 1500 / 9000, 10)
  })

  it('la duración del dwell calculado produce offsets ordenados', () => {
    const dwell = novedadDwellMs(60)
    const offsets = marqueeKeyframes(60, dwell).map((f) => f.offset as number)
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets)
  })
})

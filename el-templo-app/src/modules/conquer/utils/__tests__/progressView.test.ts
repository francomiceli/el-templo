import { describe, it, expect } from 'vitest'
import {
  SPARK_PAD,
  accuracyText,
  calibrationKey,
  deltaText,
  sessionsText,
  sparklinePoints,
  subirComboKey,
  subirStepKey,
} from '../progressView'

describe('sparklinePoints', () => {
  it('un solo valor: un punto centrado', () => {
    const pts = sparklinePoints([4], 'reps', 300, 56)

    expect(pts).toHaveLength(1)
    expect(pts[0].x).toBe(150)
  })

  it('sin valores no hay puntos', () => {
    expect(sparklinePoints([], 'reps', 300, 56)).toEqual([])
  })

  it('con 300 x 56 reproduce la fórmula del prototipo (48 - ratio x 40)', () => {
    const pts = sparklinePoints([0, 4, 8], 'reps', 300, 56)

    expect(pts.map((p) => p.y)).toEqual([48, 28, 8])
    expect(pts.map((p) => p.x)).toEqual([8, 150, 292])
  })

  it('acota cada valor al techo: 12 reps queda a la altura de 8', () => {
    const pts = sparklinePoints([8, 12], 'reps', 300, 56)

    expect(pts[1].y).toBe(pts[0].y)
    expect(pts[1].y).toBe(SPARK_PAD)
  })

  it('el techo de los ejercicios en segundos es 12 s (no 8)', () => {
    const pts = sparklinePoints([8, 12, 20], 's', 300, 56)

    expect(pts[0].y).toBeGreaterThan(pts[1].y)
    expect(pts[1].y).toBe(SPARK_PAD)
    expect(pts[2].y).toBe(SPARK_PAD)
  })

  it('un valor negativo no se sale del piso', () => {
    expect(sparklinePoints([-3], 'reps', 300, 56)[0].y).toBe(48)
  })

  it('el primer punto cae en el margen izquierdo y el último en el derecho', () => {
    const pts = sparklinePoints([1, 2, 3, 4], 'reps', 200, 56)

    expect(pts[0].x).toBe(SPARK_PAD)
    expect(pts[3].x).toBeCloseTo(200 - SPARK_PAD, 6)
  })
})

describe('accuracyText', () => {
  it.each([
    [67, '67 %'],
    [0, '0 %'],
    [100, '100 %'],
    [null, '—'],
  ] as const)('accuracyText(%s) = %s', (pct, expected) => {
    expect(accuracyText(pct)).toBe(expected)
  })
})

describe('deltaText', () => {
  it.each([
    [-0.7, '−0,7'],
    [0.5, '+0,5'],
    [0, '0,0'],
    [-0.04, '0,0'],
    [12, '+12,0'],
    [null, '—'],
  ] as const)('deltaText(%s) = %s', (delta, expected) => {
    expect(deltaText(delta)).toBe(expected)
  })

  it('usa el signo menos tipográfico (U+2212), no el guion', () => {
    expect(deltaText(-1.2).charCodeAt(0)).toBe(0x2212)
  })
})

describe('sessionsText', () => {
  it.each([
    [0, '0 sesiones'],
    [1, '1 sesión'],
    [4, '4 sesiones'],
  ] as const)('sessionsText(%i) = %s', (count, expected) => {
    expect(sessionsText(count)).toBe(expected)
  })
})

describe('claves de acción', () => {
  it('son distintas por escalón, combo y calibración', () => {
    const keys = [
      subirStepKey(4, 'e1'),
      subirStepKey(4, 'e2'),
      subirStepKey(5, 'e1'),
      subirComboKey('push'),
      subirComboKey('pull'),
      calibrationKey(4),
    ]

    expect(new Set(keys).size).toBe(keys.length)
  })
})

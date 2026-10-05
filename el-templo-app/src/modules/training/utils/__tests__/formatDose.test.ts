import { describe, it, expect } from 'vitest'
import type { Prescription } from '../../types/session'
import {
  formatInlinePrescription,
  formatQuickDose,
  isPyramidBlock,
  pyramidSequence,
} from '../formatDose'

/**
 * Regresión de la pirámide (2026-10-05): el editor guarda inicio en
 * repsMax/secondsMax, paso en increment y pico en reps/seconds. La app (y el TV)
 * veían `increment` y dibujaban la escalera Death By tomando el PICO como
 * inicio: inicio 20 / paso 10 / pico 30 salía "30-40-50-..." en vez de
 * "20-30-20". Los casos usan los valores del NUCLEUS real de ese día.
 */
function rx(fields: Partial<Prescription>): Prescription {
  return {
    exerciseId: 1,
    exerciseName: 'EJ',
    contraction: 'CON',
    reps: 0,
    repsMax: null,
    seconds: 0,
    secondsMax: null,
    increment: null,
    rest: 0,
    notes: null,
    sortOrder: 0,
    videoUrl: null,
    ...fields,
  }
}

const isoPyramid = rx({ contraction: 'ISO', seconds: 30, secondsMax: 20, increment: 10 })
const conPyramid = rx({ reps: 12, repsMax: 10, increment: 2 })

describe('isPyramidBlock', () => {
  it('detecta por formatParams.type', () => {
    expect(isPyramidBlock({ format: 'Pyramid', formatParams: { type: 'pyramid' } })).toBe(true)
    expect(isPyramidBlock({ format: 'AMRAP', formatParams: { type: 'amrap' } })).toBe(false)
  })

  it('manda formatParams.type sobre el nombre', () => {
    expect(isPyramidBlock({ format: 'Pyramid', formatParams: { type: 'amrap' } })).toBe(false)
  })

  it('sin formatParams o con type stale "standard" cae al nombre del formato', () => {
    expect(isPyramidBlock({ format: 'Pyramid', formatParams: null })).toBe(true)
    expect(isPyramidBlock({ format: ' pyramid ', formatParams: { type: 'standard' } })).toBe(true)
    expect(isPyramidBlock({ format: 'Standard', formatParams: { type: 'standard' } })).toBe(false)
  })
})

describe('pyramidSequence', () => {
  it('ISO usa los campos de segundos: inicio 20, paso 10, pico 30 → 20-30-20', () => {
    expect(pyramidSequence(isoPyramid)).toBe('20-30-20')
  })

  it('CON/EXC usan los campos de reps', () => {
    expect(pyramidSequence(conPyramid)).toBe('10-12-10')
    expect(pyramidSequence(rx({ contraction: 'EXC', reps: 8, repsMax: 6, increment: 2 }))).toBe(
      '6-8-6',
    )
  })

  it('5 escalones exactos se muestran completos', () => {
    expect(pyramidSequence(rx({ reps: 10, repsMax: 6, increment: 2 }))).toBe('6-8-10-8-6')
  })

  it('más de 5 escalones se resumen con extremos y tope', () => {
    expect(pyramidSequence(rx({ reps: 10, repsMax: 2, increment: 2 }))).toBe('2-4...10...4-2')
  })

  it('si el paso no cae justo en el pico, el tope es el último escalón alcanzado', () => {
    expect(pyramidSequence(rx({ reps: 20, repsMax: 10, increment: 3 }))).toBe('10-13...19...13-10')
  })

  it('parámetros incompletos o inválidos → solo el pico', () => {
    expect(pyramidSequence(rx({ reps: 20, repsMax: null, increment: 2 }))).toBe('20')
    expect(pyramidSequence(rx({ reps: 20, repsMax: 10, increment: null }))).toBe('20')
    expect(pyramidSequence(rx({ reps: 12, repsMax: 14, increment: 2 }))).toBe('12')
  })

  it('sin pico → vacío', () => {
    expect(pyramidSequence(rx({ reps: 0, repsMax: 10, increment: 2 }))).toBe('')
    expect(pyramidSequence(rx({ reps: null, repsMax: 10, increment: 2 }))).toBe('')
  })
})

describe('formatInlinePrescription', () => {
  it('pirámide ISO → "20-30-20s ISO" (antes "30-40-50-...s ISO")', () => {
    expect(formatInlinePrescription(isoPyramid, true)).toBe('20-30-20s ISO')
  })

  it('pirámide CON → "10-12-10 · CON"', () => {
    expect(formatInlinePrescription(conPyramid, true)).toBe('10-12-10 · CON')
  })

  it('pirámide con parámetros inválidos → solo el pico, sin escalera ni rango', () => {
    expect(formatInlinePrescription(rx({ reps: 12, repsMax: 14, increment: 2 }), true)).toBe(
      '12 · CON',
    )
  })

  it('fuera de una pirámide, increment sigue siendo la escalera Death By', () => {
    expect(formatInlinePrescription(rx({ reps: 8, increment: 2 }))).toBe('8-10-12-... · CON')
  })

  it('PAUSA gana siempre', () => {
    expect(formatInlinePrescription(rx({ notes: 'PAUSA', reps: 12 }), true)).toBe('PAUSA')
  })

  it('conserva rango válido y descarta el stale (no "40-16")', () => {
    expect(formatInlinePrescription(rx({ reps: 40, repsMax: 45 }))).toBe('40-45 · CON')
    expect(formatInlinePrescription(rx({ reps: 40, repsMax: 16 }))).toBe('40 · CON')
    expect(formatInlinePrescription(rx({ contraction: 'ISO', seconds: 30, secondsMax: 20 }))).toBe(
      '30s ISO',
    )
  })
})

describe('formatQuickDose', () => {
  it('pirámide → serie con unidad', () => {
    expect(formatQuickDose(isoPyramid, true)).toBe('20-30-20 SEG')
    expect(formatQuickDose(conPyramid, true)).toBe('10-12-10 REPS')
  })

  it('pirámide con parámetros inválidos → solo el pico', () => {
    expect(formatQuickDose(rx({ reps: 20, repsMax: null, increment: 2 }), true)).toBe('20 REPS')
  })

  it('fuera de una pirámide, increment sigue siendo la escalera Death By', () => {
    expect(formatQuickDose(rx({ reps: 8, increment: 2 }))).toBe('8 - 10 - ...')
  })
})

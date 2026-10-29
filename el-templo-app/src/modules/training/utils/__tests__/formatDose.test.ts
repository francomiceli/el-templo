import { describe, it, expect } from 'vitest'
import type { Prescription } from '../../types/session'
import {
  doseShapeOf,
  formatDose,
  formatInlinePrescription,
  formatQuickDose,
  isLadderBlock,
  isPyramidBlock,
  ladderSequence,
  pyramidSequence,
  PYRAMID_DOSE,
  STANDARD_DOSE,
  type DoseShape,
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
    expect(formatInlinePrescription(isoPyramid, PYRAMID_DOSE)).toBe('20-30-20s ISO')
  })

  it('pirámide CON → "10-12-10 · CON"', () => {
    expect(formatInlinePrescription(conPyramid, PYRAMID_DOSE)).toBe('10-12-10 · CON')
  })

  it('pirámide con parámetros inválidos → solo el pico, sin escalera ni rango', () => {
    expect(
      formatInlinePrescription(rx({ reps: 12, repsMax: 14, increment: 2 }), PYRAMID_DOSE),
    ).toBe('12 · CON')
  })

  it('fuera de una pirámide, increment sigue siendo la escalera Death By', () => {
    expect(formatInlinePrescription(rx({ reps: 8, increment: 2 }))).toBe('8-10-12-... · CON')
  })

  it('PAUSA gana siempre', () => {
    expect(formatInlinePrescription(rx({ notes: 'PAUSA', reps: 12 }), PYRAMID_DOSE)).toBe('PAUSA')
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
    expect(formatQuickDose(isoPyramid, PYRAMID_DOSE)).toBe('20-30-20 SEG')
    expect(formatQuickDose(conPyramid, PYRAMID_DOSE)).toBe('10-12-10 REPS')
  })

  it('pirámide con parámetros inválidos → solo el pico', () => {
    expect(formatQuickDose(rx({ reps: 20, repsMax: null, increment: 2 }), PYRAMID_DOSE)).toBe(
      '20 REPS',
    )
  })

  it('fuera de una pirámide, increment sigue siendo la escalera Death By', () => {
    expect(formatQuickDose(rx({ reps: 8, increment: 2 }))).toBe('8 - 10 - ...')
  })
})

/**
 * Regresión del ladder (2026-10-29, reporte de un profe): el editor guarda
 * inicio en repsMax/secondsMax, paso en increment y RONDAS en reps/seconds. La
 * app y la TV veían `increment` y dibujaban Death By tomando las rondas como
 * inicio: inicio 20" / paso 5 / 3 rondas salía "3 - 8 - 13 - ...".
 */
const LADDER: Extract<DoseShape, { kind: 'ladder' }> = {
  kind: 'ladder',
  variant: 'ladder',
  blockSize: null,
  breakAfter: null,
}
const isoLadder = rx({ contraction: 'ISO', seconds: 3, secondsMax: 20, increment: 5 })
const conLadder = rx({ reps: 3, repsMax: 10, increment: 2 })

describe('isLadderBlock / doseShapeOf', () => {
  it('manda formatParams.type: las 4 variantes de ladder', () => {
    for (const type of ['ladder', 'ladder_corta', 'ladder_block', 'broken_ladder']) {
      expect(isLadderBlock({ format: 'X', formatParams: { type } })).toBe(true)
    }
    expect(isLadderBlock({ format: 'Ladder', formatParams: { type: 'amrap' } })).toBe(false)
  })

  it('sin type o con "standard" stale cae al nombre del formato', () => {
    expect(isLadderBlock({ format: 'Ladder', formatParams: null })).toBe(true)
    expect(isLadderBlock({ format: 'Ladder Corta', formatParams: { type: 'standard' } })).toBe(true)
    expect(isLadderBlock({ format: 'AMRAP', formatParams: { type: 'standard' } })).toBe(false)
  })

  it('doseShapeOf: pirámide, ladder con su variante y parámetros, o estándar', () => {
    expect(doseShapeOf({ format: 'Pyramid', formatParams: { type: 'pyramid' } })).toEqual(
      PYRAMID_DOSE,
    )
    expect(
      doseShapeOf({ format: 'Ladder Block', formatParams: { type: 'ladder_block', blockSize: 4 } }),
    ).toEqual({ kind: 'ladder', variant: 'ladder_block', blockSize: 4, breakAfter: null })
    expect(doseShapeOf({ format: 'AMRAP', formatParams: { type: 'amrap' } })).toEqual(STANDARD_DOSE)
  })
})

describe('ladderSequence', () => {
  it('ISO: inicio 20, paso 5, 3 rondas → 20-25-30 (el bug reportado)', () => {
    expect(ladderSequence(isoLadder, LADDER)).toBe('20-25-30')
  })

  it('CON: inicio 10, paso 2, 3 rondas → 10-12-14', () => {
    expect(ladderSequence(conLadder, LADDER)).toBe('10-12-14')
  })

  it('más de 7 rondas se resume con los 3 primeros y los 2 últimos', () => {
    expect(ladderSequence(rx({ reps: 10, repsMax: 1, increment: 1 }), LADDER)).toBe('1-2-3...9-10')
  })

  it('sin inicio ni paso usa los defaults del editor y del PDF', () => {
    expect(ladderSequence(rx({ reps: 4 }), LADDER)).toBe('1-2-3-4')
  })

  it('ladder_block y broken_ladder como el PDF y la TV', () => {
    expect(
      ladderSequence(rx({ reps: 3, repsMax: 2, increment: 2 }), {
        ...LADDER,
        variant: 'ladder_block',
        blockSize: 3,
      }),
    ).toBe('2x3-4x3-6x3...')
    expect(
      ladderSequence(rx({ reps: 5, repsMax: 1, increment: 1 }), {
        ...LADDER,
        variant: 'broken_ladder',
        breakAfter: 3,
      }),
    ).toBe('1-2-3 | 1-2-3 | ...')
  })
})

describe('dosis de un bloque ladder en cada vista', () => {
  it('inline (cards de bloque)', () => {
    expect(formatInlinePrescription(isoLadder, LADDER)).toBe('20-25-30s ISO')
    expect(formatInlinePrescription(conLadder, LADDER)).toBe('10-12-14 · CON')
  })

  it('compacta (player y transición)', () => {
    expect(formatQuickDose(isoLadder, LADDER)).toBe('20-25-30 SEG')
    expect(formatQuickDose(conLadder, LADDER)).toBe('10-12-14 REPS')
  })

  it('Semana y resumen (formatDose con la forma del bloque)', () => {
    expect(formatDose(isoLadder, LADDER)).toBe('20-25-30 SEG')
    expect(formatDose(conLadder, LADDER)).toBe('10-12-14 REPS')
  })

  it('PAUSA gana siempre', () => {
    expect(formatQuickDose(rx({ notes: 'PAUSA', reps: 3 }), LADDER)).toBe('PAUSA')
    expect(formatDose(rx({ notes: 'PAUSA', reps: 3 }), LADDER)).toBe('PAUSA')
  })

  it('fuera de un ladder, increment sigue siendo la escalera Death By', () => {
    expect(formatDose(rx({ reps: 8, increment: 2 }))).toBe('8 - 10 - 12 - ...')
  })
})

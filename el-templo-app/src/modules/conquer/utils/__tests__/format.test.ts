import { describe, it, expect } from 'vitest'
import {
  GREEK_STEP,
  LEVEL_INFO,
  calibrationText,
  canResolveCalibration,
  effortHint,
  estadoChip,
  failureHint,
  shortDate,
  unitText,
} from '../format'
import type { CalibrationProposal, Estado, Level, StepKey } from '../../types'

describe('GREEK_STEP', () => {
  it.each([
    ['e1', 'Α'],
    ['e2', 'Β'],
    ['e3', 'Γ'],
    ['hold', 'Ω'],
  ] as const)('el escalón %s se escribe %s', (step, letter) => {
    expect(GREEK_STEP[step]).toBe(letter)
  })
})

describe('LEVEL_INFO', () => {
  it.each([
    ['ternero', 'Ternero', 'Inicial'],
    ['novillo', 'Novillo', 'Intermedio'],
    ['toro', 'Toro', 'Avanzado'],
  ] as const)('el nivel %s se llama %s (%s)', (level, name, kicker) => {
    expect(LEVEL_INFO[level].name).toBe(name)
    expect(LEVEL_INFO[level].kicker).toBe(kicker)
    expect(LEVEL_INFO[level].text.length).toBeGreaterThan(20)
  })
})

describe('unitText', () => {
  it.each([
    [4, 'reps', false, '4 reps'],
    [1, 'reps', false, '1 rep'],
    [0, 'reps', false, '0 reps'],
    [6, 's', false, '6 s'],
    [4, 'reps', true, '4 por lado'],
    [1, 'reps', true, '1 por lado'],
    [6, 's', true, '6 s por lado'],
  ] as const)('unitText(%i, %s, unilateral=%s) = %s', (value, unit, unilateral, expected) => {
    expect(unitText(value, unit, unilateral)).toBe(expected)
  })
})

describe('estadoChip', () => {
  it.each([
    ['subir', 'Subir de progresión', 'subir'],
    ['techo1', 'Techo 1 de 2', 'techo'],
    ['bajo', 'Bajo el piso', 'bajo'],
    ['rango', 'En rango', 'rango'],
    ['sin_datos', 'Sin datos', 'neutro'],
  ] as const)('el estado %s dice "%s" con tono %s', (estado, label, tone) => {
    expect(estadoChip(estado as Estado)).toEqual({ label, tone })
  })

  it('un escalón sin estado (el hold) se muestra neutro', () => {
    expect(estadoChip(null)).toEqual({ label: 'Sin datos', tone: 'neutro' })
  })
})

describe('effortHint', () => {
  it.each([
    ['ternero', 'e1', 'Dejá 1 rep'],
    ['ternero', 'e2', 'Dejá 1 rep'],
    ['ternero', 'e3', 'Dejá 1 rep'],
    ['ternero', 'hold', 'Cortá antes del fallo'],
    ['novillo', 'e1', 'Dejá 1 rep'],
    ['novillo', 'e2', 'Dejá 1 rep'],
    ['novillo', 'e3', 'Al fallo'],
    ['novillo', 'hold', 'Al fallo'],
    ['toro', 'e1', 'Al fallo'],
    ['toro', 'e2', 'Al fallo'],
    ['toro', 'e3', 'Al fallo'],
    ['toro', 'hold', 'Al fallo'],
  ] as const)('%s en %s: "%s"', (level, step, hint) => {
    expect(effortHint(level as Level, step as StepKey)).toBe(hint)
  })
})

describe('failureHint', () => {
  it('brazos rectos: fallo técnico', () => {
    expect(failureHint(true)).toBe('Fallo técnico: cortá cuando se rompe la línea')
  })

  it('brazos flexionados: fallo muscular', () => {
    expect(failureHint(false)).toBe('Fallo muscular')
  })
})

describe('shortDate', () => {
  it.each([
    ['2026-10-21', '21/10'],
    ['2026-01-05', '5/1'],
    ['2026-12-31', '31/12'],
  ] as const)('shortDate(%s) = %s', (iso, expected) => {
    expect(shortDate(iso)).toBe(expected)
  })
})

function proposal(
  kind: CalibrationProposal['proposal'],
  toRungName: string | null,
): CalibrationProposal {
  return {
    exerciseId: 4,
    exerciseName: 'Front lever hold',
    proposal: kind,
    fromRungName: 'full',
    toRungName,
  }
}

describe('calibrationText', () => {
  it.each([
    [
      proposal('subir', 'half lay'),
      'Tu primera sesión de Front lever hold propone subir a half lay',
    ],
    [
      proposal('bajar', 'adv tuck'),
      'Tu primera sesión de Front lever hold propone bajar a adv tuck',
    ],
    [proposal('quedarse', null), 'Front lever hold: quedate en full'],
    [proposal('subir', null), 'Front lever hold: ya estás en la más difícil'],
    [proposal('bajar', null), 'Front lever hold: ya estás en la más fácil'],
  ] as const)('%j', (item, expected) => {
    expect(calibrationText({ ...item })).toBe(expected)
  })
})

describe('canResolveCalibration', () => {
  it.each([
    [proposal('subir', 'half lay'), true],
    [proposal('bajar', 'adv tuck'), true],
    [proposal('quedarse', null), false],
    [proposal('subir', null), false],
    [proposal('bajar', null), false],
  ] as const)('%j -> %s', (item, expected) => {
    expect(canResolveCalibration({ ...item })).toBe(expected)
  })
})

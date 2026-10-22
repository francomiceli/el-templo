import { describe, it, expect } from 'vitest'
import { buildTodayForm, counterMax, templeFilled, toSaveBody } from '../todayForm'
import type { ComboView, StepKey, TodayExercise, TodayResponse, TodayStep, Unit } from '../../types'

function step(key: StepKey, value: number): TodayStep {
  return {
    step: key,
    rungId: 10,
    rungName: 'tuck',
    mode: key === 'hold' ? 'hold' : 'completa',
    target: key === 'hold' ? null : value,
    estado: key === 'hold' ? null : 'rango',
    value,
    brazosRectos: false,
    unilateral: false,
  }
}

function exercise(exerciseId: number, unit: Unit, values: [number, number, number, number]) {
  const keys: StepKey[] = ['e1', 'e2', 'e3', 'hold']
  const ex: TodayExercise = {
    exerciseId,
    code: `ex_${exerciseId}`,
    name: `Ejercicio ${exerciseId}`,
    unit,
    rungs: [],
    steps: keys.map((k, i) => step(k, values[i])),
  }
  return ex
}

function opening(): ComboView {
  return {
    comboKey: 'plancha',
    label: 'Plancha',
    press: 'a',
    push: 'b',
    hold: 'c',
    rungs: [],
    rungId: 7,
    rungName: 'straddle',
    target: 3,
    value: 4,
    maxSeries: null,
    drops: null,
    subir: { ready: false, toRungName: null },
  }
}

function makeToday(withOpening: boolean): TodayResponse {
  return {
    weekMonday: '2026-10-19',
    plan: [{ dayKey: 'plancha', label: 'Plancha', done: false }],
    nextDayKey: 'plancha',
    weekComplete: false,
    date: '2026-10-21',
    dayKey: 'plancha',
    label: 'Plancha',
    alreadySaved: false,
    pain: 2,
    finisher: 'Remo',
    level: withOpening ? 'toro' : 'ternero',
    exercises: [
      exercise(1, 's', [5, 4, 3, 9]),
      exercise(2, 'reps', [6, 6, 5, 12]),
      exercise(3, 'reps', [3, 3, 3, 8]),
    ],
    opening: withOpening ? opening() : null,
    saturday: null,
  }
}

describe('buildTodayForm', () => {
  it('copia el valor de cada escalón de los 3 ejercicios y la molestia', () => {
    const form = buildTodayForm(makeToday(false))

    expect(form.pain).toBe(2)
    expect(form.values).toEqual({
      1: { e1: 5, e2: 4, e3: 3, hold: 9 },
      2: { e1: 6, e2: 6, e3: 5, hold: 12 },
      3: { e1: 3, e2: 3, e3: 3, hold: 8 },
    })
  })

  it('con combo de apertura arma { rungId, series: value }', () => {
    expect(buildTodayForm(makeToday(true)).opening).toEqual({ rungId: 7, series: 4 })
  })

  it('sin combo de apertura, opening es null', () => {
    expect(buildTodayForm(makeToday(false)).opening).toBeNull()
  })
})

describe('toSaveBody', () => {
  it('arma los 3 ejercicios con sus 4 valores, el dayKey y la molestia', () => {
    const today = makeToday(false)
    const body = toSaveBody(today, buildTodayForm(today))

    expect(body.dayKey).toBe('plancha')
    expect(body.pain).toBe(2)
    expect(body.exercises).toEqual([
      { exerciseId: 1, e1: 5, e2: 4, e3: 3, hold: 9 },
      { exerciseId: 2, e1: 6, e2: 6, e3: 5, hold: 12 },
      { exerciseId: 3, e1: 3, e2: 3, e3: 3, hold: 8 },
    ])
  })

  it('refleja lo que el alumno tocó', () => {
    const today = makeToday(false)
    const form = buildTodayForm(today)
    form.values[2].e3 = 9
    form.pain = 6

    const body = toSaveBody(today, form)

    expect(body.pain).toBe(6)
    expect(body.exercises?.[1]).toEqual({ exerciseId: 2, e1: 6, e2: 6, e3: 9, hold: 12 })
  })

  it('manda opening solo si el día lo trae', () => {
    const conCombo = makeToday(true)
    const sinCombo = makeToday(false)

    expect(toSaveBody(conCombo, buildTodayForm(conCombo)).opening).toEqual({
      rungId: 7,
      series: 4,
    })
    expect('opening' in toSaveBody(sinCombo, buildTodayForm(sinCombo))).toBe(false)
  })

  it('el opening sale del formulario (peldaño y series que eligió el alumno)', () => {
    const today = makeToday(true)
    const form = buildTodayForm(today)
    form.opening = { rungId: 9, series: 2 }

    expect(toSaveBody(today, form).opening).toEqual({ rungId: 9, series: 2 })
  })
})

describe('counterMax', () => {
  it.each([
    ['reps', 'e1', 100],
    ['reps', 'e3', 100],
    ['s', 'e1', 600],
    ['s', 'e2', 600],
    ['reps', 'hold', 600],
    ['s', 'hold', 600],
  ] as const)('counterMax(%s, %s) = %i', (unit, key, expected) => {
    expect(counterMax(unit, key)).toBe(expected)
  })
})

describe('templeFilled', () => {
  it.each([
    [{ e1: 5, e2: 0, e3: 3, hold: 9 }, 2],
    [{ e1: 0, e2: 0, e3: 0, hold: 0 }, 0],
    [{ e1: 0, e2: 0, e3: 0, hold: 30 }, 0],
    [{ e1: 1, e2: 1, e3: 1, hold: 0 }, 3],
    [{ e1: 7, e2: 0, e3: 0, hold: 0 }, 1],
  ] as const)('templeFilled(%j) = %i', (values, expected) => {
    expect(templeFilled({ ...values })).toBe(expected)
  })
})

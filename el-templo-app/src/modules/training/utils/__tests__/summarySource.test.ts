import { describe, it, expect } from 'vitest'
import { resolveSummarySource } from '../summarySource'
import type { TodayPresencial, TodaySession } from 'src/modules/progression/types'

const SESSION: TodaySession = {
  completed: true,
  rpe: 7,
  notes: 'Bien',
  durationMinutes: 45,
  blocksCompleted: ['NUCLEUS'],
}

const PRESENCIAL: TodayPresencial = {
  branchName: 'Moreno',
  blocksCompleted: ['INITIUM', 'NUCLEUS', 'DEUTEROS_1', 'ATHLOS'],
}

describe('resolveSummarySource', () => {
  it('sin sesión ni clase presencial → null (estado vacío)', () => {
    expect(resolveSummarySource(null, null)).toBeNull()
  })

  it('solo la sesión de la app → sus datos, no presencial', () => {
    expect(resolveSummarySource(SESSION, null)).toEqual({
      presencial: false,
      branchName: null,
      blocksCompleted: ['NUCLEUS'],
      durationMinutes: 45,
      rpe: 7,
      notes: 'Bien',
    })
  })

  it('solo la clase presencial → presencial con la sede, sin duración, RPE ni notas', () => {
    expect(resolveSummarySource(null, PRESENCIAL)).toEqual({
      presencial: true,
      branchName: 'Moreno',
      blocksCompleted: ['INITIUM', 'NUCLEUS', 'DEUTEROS_1', 'ATHLOS'],
      durationMinutes: null,
      rpe: null,
      notes: null,
    })
  })

  it('las dos el mismo día → manda la sesión de la app', () => {
    expect(resolveSummarySource(SESSION, PRESENCIAL)).toMatchObject({
      presencial: false,
      rpe: 7,
      blocksCompleted: ['NUCLEUS'],
    })
  })

  it('presencial sin sede conocida → branchName null', () => {
    expect(resolveSummarySource(null, { ...PRESENCIAL, branchName: null })?.branchName).toBeNull()
  })
})

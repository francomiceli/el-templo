import { describe, it, expect } from 'vitest'
import { resolveConquerView } from '../conquerView'
import type {
  BodyCheckSummary,
  ConquerMemberState,
  ConquerStateResponse,
  ConquerStatus,
} from '../../types'

function stateWith(status: ConquerStatus): ConquerStateResponse {
  return {
    status,
    requestedAt: status === 'pedido' ? '2026-10-21T12:00:00.000Z' : null,
    member: null,
  }
}

function bodyCheck(overrides: Partial<BodyCheckSummary>): BodyCheckSummary {
  return {
    hasDay0: false,
    day0Skipped: false,
    mustPromptDay0: false,
    day0Pending: false,
    lastCheckDate: null,
    nextDueDate: null,
    due: false,
    overdue: false,
    ...overrides,
  }
}

function activeWith(summary: BodyCheckSummary): ConquerStateResponse {
  const member: ConquerMemberState = {
    level: 'toro',
    daysCount: 4,
    incReps: 1,
    incS: 1,
    activationDate: '2026-10-19',
    blockWeek: 1,
    cutStage: 0,
    publishEnabled: false,
    publishNoFace: false,
    guideSeen: true,
    home: {
      weekMonday: '2026-10-19',
      plan: [],
      nextDayKey: null,
      weekComplete: false,
      lastByDay: [],
    },
    bodyCheck: summary,
  }
  return { status: 'activo', requestedAt: null, member }
}

describe('resolveConquerView', () => {
  it('sin estado todavía está cargando', () => {
    expect(resolveConquerView(null)).toBe('cargando')
  })

  it.each([
    ['bloqueado', 'bloqueado'],
    ['pedido', 'pedido'],
    ['activo', 'inicio'],
  ] as const)('el estado %s muestra la vista %s', (status, view) => {
    expect(resolveConquerView(stateWith(status))).toBe(view)
  })

  it('un activo al que el API le pide el día 0 ve primero el control (dia0, D-15)', () => {
    expect(resolveConquerView(activeWith(bodyCheck({ mustPromptDay0: true })))).toBe('dia0')
  })

  it.each([
    ['ya hizo el día 0', { hasDay0: true }],
    ['lo salteó (aviso fijo en Inicio, no pantalla)', { day0Skipped: true, day0Pending: true }],
    ['control vencido', { hasDay0: true, due: true, overdue: true }],
  ] as const)('si no hay que pedir el día 0 (%s) va a Inicio', (_caso, overrides) => {
    expect(resolveConquerView(activeWith(bodyCheck(overrides)))).toBe('inicio')
  })

  it('mustPromptDay0 solo cuenta para el estado activo', () => {
    const pedido: ConquerStateResponse = {
      ...activeWith(bodyCheck({ mustPromptDay0: true })),
      status: 'pedido',
    }
    expect(resolveConquerView(pedido)).toBe('pedido')
  })
})

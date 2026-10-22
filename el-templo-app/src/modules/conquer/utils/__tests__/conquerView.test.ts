import { describe, it, expect } from 'vitest'
import { resolveConquerView } from '../conquerView'
import type { ConquerStateResponse, ConquerStatus } from '../../types'

function stateWith(status: ConquerStatus): ConquerStateResponse {
  return {
    status,
    requestedAt: status === 'pedido' ? '2026-10-21T12:00:00.000Z' : null,
    member: null,
  }
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
})

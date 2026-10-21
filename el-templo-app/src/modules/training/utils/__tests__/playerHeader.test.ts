import { describe, it, expect } from 'vitest'
import type { Block } from '../../types/session'
import { playerFormatLine, playerHeaderLines, playerRoleLabel } from '../playerHeader'

function block(fields: Partial<Block>): Block {
  return {
    blockId: 'b1',
    role: 'NUCLEUS',
    route: 'PL',
    pattern: 'General',
    intensity: 5,
    repsBudget: 0,
    format: 'Cluster',
    formatParams: { type: 'cluster' },
    formatDescription: null,
    sortOrder: 0,
    exercises: [],
    mobilityExercise: null,
    ...fields,
  }
}

describe('playerRoleLabel', () => {
  it('INITIUM se rotula "Pyros" en el player (override intencional)', () => {
    expect(playerRoleLabel('INITIUM')).toBe('Pyros')
  })

  it('el resto usa el diccionario canónico', () => {
    expect(playerRoleLabel('NUCLEUS')).toBe('Nucleus')
    expect(playerRoleLabel('DEUTEROS_1')).toBe('Deuteros 1')
    expect(playerRoleLabel('ROM_LOWER')).toBe('Tren Inferior')
  })
})

describe('playerHeaderLines', () => {
  it('sesión: kicker = rol y nombre = ruta', () => {
    const lines = playerHeaderLines(block({ role: 'NUCLEUS', route: 'PL' }), 'session')
    expect(lines.kicker).toBe('Nucleus')
    expect(lines.name).toBe('Planche')
  })

  it('sesión: INITIUM conserva el kicker "Pyros"', () => {
    const lines = playerHeaderLines(block({ role: 'INITIUM', route: 'PL' }), 'session')
    expect(lines.kicker).toBe('Pyros')
  })

  it('sesión: los bloques ROM_* se llaman "ROM"', () => {
    const lines = playerHeaderLines(block({ role: 'ROM_CORE', route: 'PL' }), 'session')
    expect(lines.kicker).toBe('Zona Media')
    expect(lines.name).toBe('ROM')
  })

  it('libre: "Bloque libre · ROL" y el nombre visible del bloque', () => {
    const lines = playerHeaderLines(block({ role: 'NUCLEUS', route: 'PL' }), 'free')
    expect(lines.kicker).toBe('Bloque libre · Nucleus')
    expect(lines.name).toBe('Planche')
  })

  it('libre: INITIUM NO lleva el override (queda "Initium")', () => {
    const lines = playerHeaderLines(block({ role: 'INITIUM' }), 'free')
    expect(lines.kicker).toBe('Bloque libre · Initium')
    expect(lines.name).toBe('Entrada en calor')
  })
})

describe('playerFormatLine', () => {
  it('sin prefijo "Formato:"', () => {
    expect(playerFormatLine(block({ format: 'Cluster' }))).toBe('Cluster')
  })

  it('AMRAP Series arma "AMRAP · 10\' · 3 rondas"', () => {
    const line = playerFormatLine(
      block({
        format: 'AMRAP Series',
        formatParams: { type: 'amrap_series', minutes: 10, rounds: 3 },
      }),
    )
    expect(line).toBe("AMRAP · 10' · 3 rondas")
  })

  it('"Buy-in / Cash-out" no se parte en el guion', () => {
    const line = playerFormatLine(block({ format: 'Buy-in / Cash-out' }))
    expect(line).toBe('Buy-⁠in / Cash-⁠out')
  })
})

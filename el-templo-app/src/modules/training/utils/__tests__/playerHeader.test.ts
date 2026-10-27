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
  it('INITIUM se rotula "Pyros"', () => {
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

  it('sesión: INITIUM lleva el kicker "Pyros"', () => {
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

  it('libre: INITIUM también es "Pyros"', () => {
    const lines = playerHeaderLines(block({ role: 'INITIUM' }), 'free')
    expect(lines.kicker).toBe('Bloque libre · Pyros')
    expect(lines.name).toBe('Entrada en calor')
  })
})

describe('playerFormatLine', () => {
  it('sin prefijo "Formato:"', () => {
    expect(playerFormatLine(block({ format: 'Cluster' }), 'session')).toBe('Cluster')
    expect(playerFormatLine(block({ format: 'Cluster' }), 'free')).toBe('Cluster')
  })

  it('libre: AMRAP Series arma la línea corta "AMRAP · 10\' · 3 rondas"', () => {
    const line = playerFormatLine(
      block({
        format: 'AMRAP Series',
        formatParams: { type: 'amrap_series', minutes: 10, rounds: 3 },
      }),
      'free',
    )
    expect(line).toBe("AMRAP · 10' · 3 rondas")
  })

  it('"Buy-in / Cash-out" no se parte en el guion (en los dos modos)', () => {
    const b = block({ format: 'Buy-in / Cash-out', formatParams: { type: 'standard' } })
    expect(playerFormatLine(b, 'free')).toBe('Buy-\u2060in / Cash-\u2060out')
    expect(playerFormatLine(b, 'session')).toBe('Buy-\u2060in / Cash-\u2060out')
  })

  it('sesión: EMOM con minutos e intervalo', () => {
    const b = block({
      format: 'EMOM',
      formatParams: { type: 'emom', minutes: 12, intervalSeconds: 60 },
    })
    expect(playerFormatLine(b, 'session')).toBe('EMOM · 12 min · cada 60s')
  })

  it('sesión: trabajo/descanso, rondas, tempo, cap y objetivo', () => {
    const b = block({
      format: 'Tabata',
      formatParams: {
        type: 'tabata',
        workSeconds: 20,
        restSeconds: 10,
        totalRounds: 8,
        tempo: '3-1-1',
        timeCapMinutes: 15,
        target: 100,
        unit: 'reps',
      },
    })
    expect(playerFormatLine(b, 'session')).toBe(
      'Tabata · 20s/10s · 8 rondas · 3-1-1 · cap 15 min · 100 reps',
    )
  })

  it('sesión: ROM muestra rondas y descanso', () => {
    const b = block({ format: 'ROM', formatParams: { type: 'rom', rounds: 2, restSeconds: 30 } })
    expect(playerFormatLine(b, 'session')).toBe('ROM · 2 rondas · descanso 30s')
  })

  it('sesión: sin parámetros tipados, el detalle sale del slug', () => {
    const b = block({ format: 'amrap-series', formatParams: null })
    expect(playerFormatLine(b, 'session')).toBe('amrap · series')
  })
})

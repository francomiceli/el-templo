import { describe, it, expect } from 'vitest'
import { CONTRACTION_BADGE_WIDTH_PX, contractionBadge } from '../contraction'

describe('contractionBadge', () => {
  it('cada contracción conocida tiene su propio color (CON, EXC e ISO ya no comparten)', () => {
    expect(contractionBadge('CON')).toEqual({ label: 'CON', kind: 'con' })
    expect(contractionBadge('EXC')).toEqual({ label: 'EXC', kind: 'exc' })
    expect(contractionBadge('ISO')).toEqual({ label: 'ISO', kind: 'iso' })
    const kinds = new Set(['CON', 'EXC', 'ISO'].map((c) => contractionBadge(c)?.kind))
    expect(kinds.size).toBe(3)
  })

  it('tolera minúsculas y espacios', () => {
    expect(contractionBadge(' iso ')).toEqual({ label: 'ISO', kind: 'iso' })
    expect(contractionBadge('exc')).toEqual({ label: 'EXC', kind: 'exc' })
  })

  it('sin contracción no hay insignia', () => {
    expect(contractionBadge('')).toBeNull()
    expect(contractionBadge('   ')).toBeNull()
    expect(contractionBadge(null)).toBeNull()
    expect(contractionBadge(undefined)).toBeNull()
  })

  it('un valor desconocido conserva su rótulo y toma el color de CON (no se oculta el dato)', () => {
    expect(contractionBadge('plio')).toEqual({ label: 'PLIO', kind: 'con' })
  })

  it('el ancho fijo es el de la TV (42 px)', () => {
    expect(CONTRACTION_BADGE_WIDTH_PX).toBe(42)
  })
})

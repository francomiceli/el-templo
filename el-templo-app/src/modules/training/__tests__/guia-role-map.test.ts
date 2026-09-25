import { describe, it, expect } from 'vitest'
import { getGuiaLinkForRole } from '../guia-role-map'

describe('getGuiaLinkForRole (SPEC "Empezá acá" A1 / "La Guía pasa a ser las historias")', () => {
  it('mapea los 4 bloques documentados al slide "clase" ("Cada clase")', () => {
    expect(getGuiaLinkForRole('INITIUM')).toEqual({
      slide: 'clase',
      question: '¿Qué es Initium?',
    })
    expect(getGuiaLinkForRole('NUCLEUS')).toEqual({
      slide: 'clase',
      question: '¿Qué es Nucleus?',
    })
    expect(getGuiaLinkForRole('ATHLOS')).toMatchObject({ slide: 'clase' })
    expect(getGuiaLinkForRole('EPIKOS')).toMatchObject({ slide: 'clase' })
  })

  it('DEUTEROS_1 y DEUTEROS_2 apuntan al mismo slide (es una sola elección)', () => {
    const d1 = getGuiaLinkForRole('DEUTEROS_1')
    const d2 = getGuiaLinkForRole('DEUTEROS_2')
    expect(d1).not.toBeNull()
    expect(d1).toEqual(d2)
    expect(d1).toMatchObject({ slide: 'clase' })
  })

  it('roles sin slide documentado (ROM/COMBOS/TECNICA/STRETCHING) devuelven null', () => {
    expect(getGuiaLinkForRole('ROM_LOWER')).toBeNull()
    expect(getGuiaLinkForRole('ROM_CORE')).toBeNull()
    expect(getGuiaLinkForRole('ROM_UPPER')).toBeNull()
    expect(getGuiaLinkForRole('COMBOS_I')).toBeNull()
    expect(getGuiaLinkForRole('COMBOS_II')).toBeNull()
    expect(getGuiaLinkForRole('COMBOS_II_ALT')).toBeNull()
    expect(getGuiaLinkForRole('TECNICA_I')).toBeNull()
    expect(getGuiaLinkForRole('TECNICA_II')).toBeNull()
    expect(getGuiaLinkForRole('TECNICA_II_ALT')).toBeNull()
    expect(getGuiaLinkForRole('STRETCHING')).toBeNull()
  })

  it('un rol desconocido (string arbitrario) devuelve null, nunca lanza', () => {
    expect(getGuiaLinkForRole('ALGO_INVENTADO')).toBeNull()
  })
})

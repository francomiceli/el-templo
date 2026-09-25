import { describe, it, expect } from 'vitest'
import { getGuiaLinkForRole } from '../guia-role-map'

describe('getGuiaLinkForRole (SPEC "Empezá acá" A1)', () => {
  it('mapea los 4 bloques documentados en la Guía a su ítem', () => {
    expect(getGuiaLinkForRole('INITIUM')).toEqual({
      seccion: 'bloques',
      item: 'initium',
      question: '¿Qué es Initium?',
    })
    expect(getGuiaLinkForRole('NUCLEUS')).toEqual({
      seccion: 'bloques',
      item: 'nucleus',
      question: '¿Qué es Nucleus?',
    })
    expect(getGuiaLinkForRole('ATHLOS')).toMatchObject({ item: 'athlos-epikos' })
    expect(getGuiaLinkForRole('EPIKOS')).toMatchObject({ item: 'athlos-epikos' })
  })

  it('DEUTEROS_1 y DEUTEROS_2 apuntan al mismo ítem (es una sola elección)', () => {
    const d1 = getGuiaLinkForRole('DEUTEROS_1')
    const d2 = getGuiaLinkForRole('DEUTEROS_2')
    expect(d1).not.toBeNull()
    expect(d1).toEqual(d2)
  })

  it('roles sin ítem documentado (ROM/COMBOS/TECNICA/STRETCHING) devuelven null', () => {
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

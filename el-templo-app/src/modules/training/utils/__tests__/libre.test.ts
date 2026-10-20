import { describe, it, expect } from 'vitest'
import { ZONE_GROUPS, ZONE_GROUP_ORDER } from 'src/components/anatomy/zones'
import { basketCountLabel, complementSuggestion, emptyBasketText } from '../libre'

const ALL_ZONES = ZONE_GROUP_ORDER.flatMap((group) => [...ZONE_GROUPS[group]])

describe('complementSuggestion (D-04)', () => {
  it('con plani hoy: complementa lo que la sesión no trabaja', () => {
    const r = complementSuggestion({
      todayZones: ['quadriceps', 'gluteal', 'hamstring', 'adductors'],
      weekWorkedZones: [],
    })
    expect(r).not.toBeNull()
    expect(r?.label).toBe('Para complementar lo de hoy')
    expect(r?.groups).not.toContain('piernas')
    expect(r?.groups).toEqual(['hombros', 'pecho', 'espalda', 'core', 'brazos'])
  })

  it('un grupo con la mitad de sus zonas trabajadas ya no se sugiere', () => {
    // core = abs + obliques: 1 de 2 = 0,5 (no es "menos de la mitad")
    const r = complementSuggestion({ todayZones: ['abs'], weekWorkedZones: [] })
    expect(r?.groups).not.toContain('core')
    // espalda = 3 zonas: 1 de 3 sigue siendo menos de la mitad
    const r2 = complementSuggestion({ todayZones: ['trapezius'], weekWorkedZones: [] })
    expect(r2?.groups).toContain('espalda')
  })

  it('sin plani hoy: usa lo trabajado en la semana', () => {
    const r = complementSuggestion({ todayZones: null, weekWorkedZones: ['deltoids', 'chest'] })
    expect(r?.label).toBe('Esta semana trabajaste poco')
    expect(r?.groups).not.toContain('hombros')
    expect(r?.groups).not.toContain('pecho')
    expect(r?.groups).toContain('piernas')
  })

  it('sesión de hoy sin zonas cargadas: cae a lo de la semana', () => {
    const r = complementSuggestion({ todayZones: [], weekWorkedZones: ['deltoids'] })
    expect(r?.label).toBe('Esta semana trabajaste poco')
    expect(r?.groups).not.toContain('hombros')
  })

  it('con todas las zonas trabajadas no hay sugerencia', () => {
    expect(complementSuggestion({ todayZones: ALL_ZONES, weekWorkedZones: [] })).toBeNull()
    expect(complementSuggestion({ todayZones: null, weekWorkedZones: ALL_ZONES })).toBeNull()
  })

  it('semana sin nada completado: sugiere todos los grupos', () => {
    const r = complementSuggestion({ todayZones: null, weekWorkedZones: [] })
    expect(r?.groups).toEqual([...ZONE_GROUP_ORDER])
  })
})

describe('basketCountLabel', () => {
  it('singular, plural y con zona', () => {
    expect(basketCountLabel(1, null)).toBe('1 bloque')
    expect(basketCountLabel(12, null)).toBe('12 bloques')
    expect(basketCountLabel(12, 'espalda')).toBe('12 bloques de espalda')
    expect(basketCountLabel(1, 'core')).toBe('1 bloque de core')
    expect(basketCountLabel(0, 'piernas')).toBe('0 bloques de piernas')
  })
})

describe('emptyBasketText', () => {
  it('genérico por zona y global', () => {
    expect(emptyBasketText('brazos')).toBe(
      'Todavía no hay bloques de esta zona en las planis de tu nivel.',
    )
    expect(emptyBasketText(null)).toBe('Todavía no hay bloques en las planis de tu nivel.')
  })
})

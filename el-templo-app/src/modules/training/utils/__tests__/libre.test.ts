import { describe, it, expect } from 'vitest'
import { basketCountLabel, emptyBasketText } from '../libre'

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

import { describe, it, expect } from 'vitest'
import { needsExplicitGridLoad } from 'src/utils/reservas-initial-load'

describe('needsExplicitGridLoad', () => {
  it('misma sede (5 -> 5): el watch no dispara, hay que pedir a mano', () => {
    expect(needsExplicitGridLoad(5, 5)).toBe(true)
  })

  it('sin sede antes y después (null -> null): el watch no dispara, hay que pedir a mano', () => {
    expect(needsExplicitGridLoad(null, null)).toBe(true)
  })

  it('de sin sede a una sede (null -> 5): el watch ya pide', () => {
    expect(needsExplicitGridLoad(null, 5)).toBe(false)
  })

  it('cambia de sede (3 -> 5): el watch ya pide', () => {
    expect(needsExplicitGridLoad(3, 5)).toBe(false)
  })

  it('de una sede a ninguna (5 -> null): el watch ya pide', () => {
    expect(needsExplicitGridLoad(5, null)).toBe(false)
  })
})

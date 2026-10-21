import { describe, it, expect } from 'vitest'
import { resolvePlayerStart } from '../playerStart'

describe('resolvePlayerStart (197: "Empezar" va directo al 3-2-1)', () => {
  it('sin progreso previo: arranca con el 3-2-1', () => {
    const mode = resolvePlayerStart({ hasPriorProgress: false, needsDeuterosChoice: false })
    expect(mode).toBe('countdown')
  })

  it('sin progreso previo y con Deuteros por elegir: primero el selector', () => {
    const mode = resolvePlayerStart({ hasPriorProgress: false, needsDeuterosChoice: true })
    expect(mode).toBe('deuteros')
  })

  it('con progreso previo: retoma sin 3-2-1', () => {
    const mode = resolvePlayerStart({ hasPriorProgress: true, needsDeuterosChoice: false })
    expect(mode).toBe('resume')
  })

  it('con progreso previo y Deuteros pendiente: retoma (el selector aparece solo, sin 3-2-1)', () => {
    const mode = resolvePlayerStart({ hasPriorProgress: true, needsDeuterosChoice: true })
    expect(mode).toBe('resume')
  })
})

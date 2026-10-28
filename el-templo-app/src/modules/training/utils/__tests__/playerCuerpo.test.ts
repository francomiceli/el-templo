import { describe, expect, it } from 'vitest'
import { musculosResumidos } from '../playerCuerpo'

describe('musculosResumidos', () => {
  const dominadas = [
    'Dorsal ancho',
    'Trapecio inferior',
    'Redondo mayor',
    'Pectoral mayor',
    'Bíceps',
  ]

  it('hasta el máximo, todos con el separador', () => {
    expect(musculosResumidos(['Pectoral mayor', 'Tríceps'], 3)).toBe('Pectoral mayor · Tríceps')
    expect(musculosResumidos(dominadas.slice(0, 3), 3)).toBe(
      'Dorsal ancho · Trapecio inferior · Redondo mayor',
    )
  })

  it('con más, los primeros y "+N" con los que faltan', () => {
    expect(musculosResumidos(dominadas, 3)).toBe(
      'Dorsal ancho · Trapecio inferior · Redondo mayor +2',
    )
  })

  it('sin músculos, vacío', () => {
    expect(musculosResumidos([], 3)).toBe('')
  })
})

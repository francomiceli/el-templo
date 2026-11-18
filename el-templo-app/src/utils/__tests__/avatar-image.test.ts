import { describe, expect, it } from 'vitest'
import { AVATAR_QUALITY, AVATAR_SIDE, centerSquareCrop } from '../avatar-image'

describe('centerSquareCrop', () => {
  it('constantes de la foto de perfil: 480 px y JPEG 0,82', () => {
    expect(AVATAR_SIDE).toBe(480)
    expect(AVATAR_QUALITY).toBe(0.82)
  })

  it('foto apaisada: recorta los costados al centro', () => {
    expect(centerSquareCrop(4000, 3000, 480)).toEqual({ sx: 500, sy: 0, sSide: 3000, out: 480 })
  })

  it('foto vertical: recorta arriba y abajo al centro', () => {
    expect(centerSquareCrop(1080, 1920, 480)).toEqual({ sx: 0, sy: 420, sSide: 1080, out: 480 })
  })

  it('foto ya cuadrada: sin desplazamiento', () => {
    expect(centerSquareCrop(1000, 1000, 480)).toEqual({ sx: 0, sy: 0, sSide: 1000, out: 480 })
  })

  it('nunca agranda una foto chica', () => {
    expect(centerSquareCrop(300, 400, 480)).toEqual({ sx: 0, sy: 50, sSide: 300, out: 300 })
  })

  it('ancho o alto en cero tira error', () => {
    expect(() => centerSquareCrop(0, 400, 480)).toThrow()
    expect(() => centerSquareCrop(400, 0, 480)).toThrow()
  })

  it('medidas no finitas o negativas tiran error', () => {
    expect(() => centerSquareCrop(Number.NaN, 400, 480)).toThrow()
    expect(() => centerSquareCrop(-10, 400, 480)).toThrow()
  })
})

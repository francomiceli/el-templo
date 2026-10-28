import { describe, expect, it } from 'vitest'
import { rolesDeRuta } from '../rolesDeRuta'

describe('rolesDeRuta', () => {
  it('sin ruta no pinta nada', () => {
    expect(rolesDeRuta(null)).toEqual({})
  })

  it('una clave por zona y vista, con su grupo', () => {
    expect(
      rolesDeRuta({
        zonas: [
          { slug: 'upper-back', vista: 'back', grupo: 'fuerte' },
          { slug: 'forearm', vista: 'front', grupo: 'sostiene' },
        ],
      }),
    ).toEqual({ 'upper-back@back': 'fuerte', 'forearm@front': 'sostiene' })
  })

  it('"both" se abre en frente y espalda, y fuerte le gana a sostiene', () => {
    expect(
      rolesDeRuta({
        zonas: [
          { slug: 'deltoids', vista: 'both', grupo: 'sostiene' },
          { slug: 'deltoids', vista: 'front', grupo: 'fuerte' },
        ],
      }),
    ).toEqual({ 'deltoids@front': 'fuerte', 'deltoids@back': 'sostiene' })
  })
})

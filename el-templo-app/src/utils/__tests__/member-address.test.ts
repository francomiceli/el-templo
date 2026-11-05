import { describe, it, expect } from 'vitest'
import {
  ADDRESS_PROMPT_LOCALITY,
  composeAddress,
  shouldAskAddress,
  splitAddress,
} from '../member-address'

describe('composeAddress', () => {
  it('arma "Calle Altura"', () => {
    expect(composeAddress({ street: 'Av. Colón', number: '2450' })).toBe('Av. Colón 2450')
  })

  it('recorta y colapsa espacios', () => {
    expect(composeAddress({ street: '  Av.   Colón ', number: ' 2450 ' })).toBe('Av. Colón 2450')
  })

  it.each([
    ['sin calle', { street: '', number: '2450' }],
    ['sin altura', { street: 'Jujuy', number: '' }],
    ['calle solo espacios', { street: '   ', number: '2450' }],
    ['altura solo espacios', { street: 'Jujuy', number: '   ' }],
  ])('%s → null', (_caso, parts) => {
    expect(composeAddress(parts)).toBeNull()
  })
})

describe('splitAddress', () => {
  it('separa la altura final', () => {
    expect(splitAddress('Av. Colón 2450')).toEqual({ street: 'Av. Colón', number: '2450' })
  })

  it('calle con número en el nombre ("12 de Octubre 3000")', () => {
    expect(splitAddress('12 de Octubre 3000')).toEqual({ street: '12 de Octubre', number: '3000' })
  })

  it('altura con letra pegada ("Gascón 2450B")', () => {
    expect(splitAddress('Gascón 2450B')).toEqual({ street: 'Gascón', number: '2450B' })
  })

  it('sin altura (cargada a mano desde el admin) → todo a la calle', () => {
    expect(splitAddress('Barrio Los Pinares')).toEqual({ street: 'Barrio Los Pinares', number: '' })
  })

  it('solo un número → todo a la calle (no hay calle que separar)', () => {
    expect(splitAddress('2450')).toEqual({ street: '2450', number: '' })
  })

  it.each([null, undefined, ''])('%s → vacío', (value) => {
    expect(splitAddress(value)).toEqual({ street: '', number: '' })
  })

  it('ida y vuelta con composeAddress', () => {
    const original = 'Av. Juan B. Justo 3958'
    expect(composeAddress(splitAddress(original))).toBe(original)
  })
})

describe('shouldAskAddress', () => {
  const BASE = {
    role: 'member' as const,
    onboardingCompleted: true,
    branchIsVirtual: false,
    address: null,
    branchLocality: ADDRESS_PROMPT_LOCALITY,
  }

  it('socio de MdP sin dirección → sí', () => {
    expect(shouldAskAddress(BASE)).toBe(true)
  })

  it('sin perfil → no', () => {
    expect(shouldAskAddress(null)).toBe(false)
  })

  it('ya tiene dirección → no', () => {
    expect(shouldAskAddress({ ...BASE, address: 'Jujuy 1000' })).toBe(false)
  })

  it('API vieja sin el campo address (undefined) → no', () => {
    expect(shouldAskAddress({ ...BASE, address: undefined })).toBe(false)
  })

  it.each([
    ['Barcelona', 'Barcelona'],
    ['sin ciudad cargada', null],
    ['API vieja sin branchLocality', undefined],
  ])('sede de %s → no', (_caso, branchLocality) => {
    expect(shouldAskAddress({ ...BASE, branchLocality })).toBe(false)
  })

  it('sede virtual (Online) → no', () => {
    expect(shouldAskAddress({ ...BASE, branchIsVirtual: true })).toBe(false)
  })

  it('onboarding sin terminar → no', () => {
    expect(shouldAskAddress({ ...BASE, onboardingCompleted: false })).toBe(false)
  })

  it.each(['coach', 'admin', 'superadmin'] as const)('rol %s → no', (role) => {
    expect(shouldAskAddress({ ...BASE, role })).toBe(false)
  })
})

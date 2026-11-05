import { describe, it, expect } from 'vitest'
import {
  ADDRESS_PROMPT_LOCALITY,
  ADDRESS_PROMPT_MAX_SHOWS,
  canShowAddressPrompt,
  composeAddress,
  parseAddressPromptState,
  recordAddressPromptShown,
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

describe('cadencia del pop-up: primera vez + una segunda a los 14 días, después nunca', () => {
  const FIRST = new Date('2026-11-05T12:00:00.000Z')
  const DAY = 24 * 60 * 60 * 1000
  const at = (days: number) => new Date(FIRST.getTime() + days * DAY)

  it('nunca se mostró → sí', () => {
    expect(canShowAddressPrompt(null, FIRST)).toBe(true)
  })

  it('recién mostrado una vez → no, hasta cumplir 14 días', () => {
    const once = recordAddressPromptShown(null, FIRST)
    expect(once).toEqual({ shows: 1, lastShownAt: FIRST.toISOString() })
    expect(canShowAddressPrompt(once, at(0))).toBe(false)
    expect(canShowAddressPrompt(once, at(13))).toBe(false)
    expect(canShowAddressPrompt(once, new Date(at(14).getTime() - 1))).toBe(false)
  })

  it('a los 14 días exactos (o después) → sí, la segunda vez', () => {
    const once = recordAddressPromptShown(null, FIRST)
    expect(canShowAddressPrompt(once, at(14))).toBe(true)
    expect(canShowAddressPrompt(once, at(90))).toBe(true)
  })

  it('después de la segunda vez → nunca más, pase el tiempo que pase', () => {
    const twice = recordAddressPromptShown(recordAddressPromptShown(null, FIRST), at(14))
    expect(twice.shows).toBe(ADDRESS_PROMPT_MAX_SHOWS)
    expect(canShowAddressPrompt(twice, at(28))).toBe(false)
    expect(canShowAddressPrompt(twice, at(400))).toBe(false)
  })

  it('reloj del teléfono atrasado (última vez "en el futuro") → no', () => {
    const once = recordAddressPromptShown(null, FIRST)
    expect(canShowAddressPrompt(once, at(-30))).toBe(false)
  })

  it('fecha guardada ilegible → no', () => {
    expect(canShowAddressPrompt({ shows: 1, lastShownAt: 'basura' }, at(30))).toBe(false)
  })

  it('shows 0 → sí (equivale a nunca)', () => {
    expect(canShowAddressPrompt({ shows: 0, lastShownAt: '' }, FIRST)).toBe(true)
  })
})

describe('parseAddressPromptState', () => {
  it('null → null (nunca se mostró)', () => {
    expect(parseAddressPromptState(null)).toBeNull()
  })

  it('JSON válido → el estado', () => {
    const raw = JSON.stringify({ shows: 1, lastShownAt: '2026-11-05T12:00:00.000Z' })
    expect(parseAddressPromptState(raw)).toEqual({
      shows: 1,
      lastShownAt: '2026-11-05T12:00:00.000Z',
    })
  })

  it.each([
    ['JSON roto', '{shows:'],
    ['no es objeto', '"1"'],
    ['null literal', 'null'],
    ['sin lastShownAt', JSON.stringify({ shows: 1 })],
    ['shows negativo', JSON.stringify({ shows: -1, lastShownAt: '' })],
    ['shows decimal', JSON.stringify({ shows: 1.5, lastShownAt: '' })],
    ['shows string', JSON.stringify({ shows: '1', lastShownAt: '' })],
  ])('%s → agotado (ante la duda, no insistir)', (_caso, raw) => {
    const state = parseAddressPromptState(raw)
    expect(state?.shows).toBe(ADDRESS_PROMPT_MAX_SHOWS)
    expect(canShowAddressPrompt(state, new Date())).toBe(false)
  })
})

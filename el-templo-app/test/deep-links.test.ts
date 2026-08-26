import { describe, it, expect, vi } from 'vitest'

// deep-links.ts importa (transitivamente, via useAuthStore) `boot/axios` sin
// el prefijo `src` — solo `src` esta aliaseado en vitest.config.ts (mismo
// andamiaje que test/useMagicLink.test.ts). Se mockea unicamente para que el
// import-chain del modulo resuelva: las funciones puras bajo test no llaman
// a `api` en ningun momento.
const { apiMocks } = vi.hoisted(() => ({
  apiMocks: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('src/boot/axios', () => ({ api: apiMocks }))
vi.mock('boot/axios', () => ({ api: apiMocks }))

import { resolveDeepLinkRoute, extractDeepLinkToken } from 'src/boot/deep-links'

describe('resolveDeepLinkRoute', () => {
  it('URL de trial CON token/hint ⇒ resuelve la ruta del trial', () => {
    expect(resolveDeepLinkRoute('https://app.eltemplo.org/r/trial?t=abc.def&d=volver')).toBe(
      '/reservas?trial=1',
    )
  })

  it('URL de trial SIN query ⇒ resuelve la misma ruta del trial', () => {
    expect(resolveDeepLinkRoute('https://app.eltemplo.org/r/trial')).toBe('/reservas?trial=1')
  })

  it('path que no es el deep link de trial ⇒ null', () => {
    expect(resolveDeepLinkRoute('https://app.eltemplo.org/otra-ruta')).toBeNull()
  })

  it('host distinto (misma app, otro dominio) ⇒ null si el path no matchea', () => {
    expect(resolveDeepLinkRoute('https://otro-dominio.com/no-trial')).toBeNull()
  })

  it('string no parseable como URL ⇒ null', () => {
    expect(resolveDeepLinkRoute('no-es-una-url')).toBeNull()
  })
})

describe('extractDeepLinkToken', () => {
  it('URL con ?t=abc.def ⇒ devuelve el token', () => {
    expect(extractDeepLinkToken('https://app.eltemplo.org/r/trial?t=abc.def')).toBe('abc.def')
  })

  it('URL con t vacío ⇒ null', () => {
    expect(extractDeepLinkToken('https://app.eltemplo.org/r/trial?t=')).toBeNull()
  })

  it('URL sin query ⇒ null', () => {
    expect(extractDeepLinkToken('https://app.eltemplo.org/r/trial')).toBeNull()
  })

  it('string no parseable como URL ⇒ null', () => {
    expect(extractDeepLinkToken('no-es-una-url')).toBeNull()
  })

  it('token URL-encoded ⇒ se devuelve decodificado', () => {
    const encoded = 'https://app.eltemplo.org/r/trial?t=abc%2Bdef%3D'
    expect(extractDeepLinkToken(encoded)).toBe('abc+def=')
  })
})

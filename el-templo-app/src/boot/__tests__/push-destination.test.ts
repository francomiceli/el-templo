import { describe, it, expect, vi } from 'vitest'

// resolveTapRoute es una función pura (sin Capacitor); se importa junto al
// resto del boot file, así que mockeamos los plugins nativos con no-ops
// para que el import no falle en el entorno de test (mismo criterio que
// axios-refresh-lock.test.ts mockea '@capacitor/core').
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web',
  },
}))
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: { addListener: vi.fn(), checkPermissions: vi.fn(), register: vi.fn() },
}))
vi.mock('@capacitor-firebase/messaging', () => ({
  FirebaseMessaging: { addListener: vi.fn(), checkPermissions: vi.fn() },
}))
vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { resolveTapRoute } from '../push-notifications'

describe('resolveTapRoute (D-03/D-04 — destino nuevo con fallback, nunca 404)', () => {
  it('payload viejo con route → esa ruta (compat app vieja)', () => {
    expect(resolveTapRoute({ route: '/reservas' })).toBe('/reservas')
  })

  it('payload viejo vacío → /mi-templo', () => {
    expect(resolveTapRoute({})).toBe('/mi-templo')
    expect(resolveTapRoute(undefined)).toBe('/mi-templo')
  })

  it('destination app_section con sección curada conocida → su ruta', () => {
    expect(
      resolveTapRoute({ destination: 'app_section', destinationSection: 'referidos' }),
    ).toBe('/mis-referidos')
  })

  it('destination app_section con sección inventada cae al route (nunca 404)', () => {
    expect(
      resolveTapRoute({
        destination: 'app_section',
        destinationSection: 'inventada',
        route: '/reservas',
      }),
    ).toBe('/reservas')
  })

  it('destination whatsapp_sales → /contacto-ventas con el texto escapado', () => {
    const route = resolveTapRoute({ destination: 'whatsapp_sales', whatsappText: 'hola mundo' })
    expect(route.startsWith('/contacto-ventas?text=')).toBe(true)
    expect(route).toBe(`/contacto-ventas?text=${encodeURIComponent('hola mundo')}`)
  })

  it('destination whatsapp_sales sin texto → /contacto-ventas sin query', () => {
    expect(resolveTapRoute({ destination: 'whatsapp_sales' })).toBe('/contacto-ventas')
  })

  it('destination app_section sin destinationSection cae al route', () => {
    expect(resolveTapRoute({ destination: 'app_section', route: '/planes' })).toBe('/planes')
  })
})

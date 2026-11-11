import { describe, it, expect, vi } from 'vitest'

// Mismos mocks que push-destination.test.ts: el boot file importa los plugins nativos al cargarse.
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
// El boot importa el store de auth solo para leer `isAuthenticated`; acá se inyecta como dato.
vi.mock('src/stores/useAuthStore', () => ({
  useAuthStore: () => ({ isAuthenticated: false }),
}))

import { applyTapNavigation, decideTapNavigation, resolveTapRoute } from '../push-notifications'

const ESTIRAR = '/training/estirar?from=push'

describe('decideTapNavigation (P-13/H-4: el destino del push sobrevive al login)', () => {
  it('sin sesión → login y guarda el destino para retomarlo después', () => {
    expect(decideTapNavigation({ isAuthenticated: false, route: ESTIRAR })).toEqual({
      kind: 'login',
      pendingRoute: ESTIRAR,
    })
  })

  it('con sesión → navega directo al destino', () => {
    expect(decideTapNavigation({ isAuthenticated: true, route: ESTIRAR })).toEqual({
      kind: 'navigate',
      route: ESTIRAR,
    })
  })

  it('sin sesión con /mi-templo → login sin destino pendiente (es donde se aterriza)', () => {
    expect(decideTapNavigation({ isAuthenticated: false, route: '/mi-templo' })).toEqual({
      kind: 'login',
      pendingRoute: null,
    })
  })

  it('ruta vacía se trata como /mi-templo', () => {
    expect(decideTapNavigation({ isAuthenticated: false, route: '' })).toEqual({
      kind: 'login',
      pendingRoute: null,
    })
    expect(decideTapNavigation({ isAuthenticated: true, route: '   ' })).toEqual({
      kind: 'navigate',
      route: '/mi-templo',
    })
  })

  it('con sesión, los destinos existentes resuelven igual que antes (misma ruta que resolveTapRoute)', () => {
    const payloads: Array<Record<string, string> | undefined> = [
      undefined,
      {},
      { route: '/reservas' },
      { destination: 'app_section', destinationSection: 'referidos' },
      { destination: 'app_section', destinationSection: 'estirar' },
      { destination: 'whatsapp_sales', whatsappText: 'hola mundo' },
      { destination: 'whatsapp_sales' },
      { destination: 'app_section', destinationSection: 'inventada', route: '/reservas' },
    ]
    for (const data of payloads) {
      const route = resolveTapRoute(data)
      expect(decideTapNavigation({ isAuthenticated: true, route })).toEqual({
        kind: 'navigate',
        route,
      })
    }
  })
})

interface FakeRouter {
  push: ReturnType<typeof vi.fn>
  currentRoute: { value: { name: string | symbol | null | undefined } }
}

function makeRouter(
  opts: { landsOn?: string; rejects?: Error; rejectsOnLogin?: boolean } = {},
): FakeRouter {
  const router: FakeRouter = {
    currentRoute: { value: { name: 'mi-templo' } },
    push: vi.fn(async (to: string) => {
      if (to === '/login') {
        if (opts.rejectsOnLogin) throw new Error('boom login')
        router.currentRoute.value = { name: 'login' }
        return
      }
      if (opts.rejects) throw opts.rejects
      router.currentRoute.value = { name: opts.landsOn ?? 'destino' }
    }),
  }
  return router
}

describe('applyTapNavigation (los cuatro caminos del toque)', () => {
  it('app abierta o cerrada CON sesión → push directo al destino, sin guardar nada', async () => {
    const router = makeRouter()
    const setPendingRoute = vi.fn()
    await applyTapNavigation({ route: ESTIRAR, isAuthenticated: true, router, setPendingRoute })
    expect(router.push).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith(ESTIRAR)
    expect(setPendingRoute).not.toHaveBeenCalled()
  })

  it('destino existente (reservas) con sesión → igual que antes: push directo', async () => {
    const router = makeRouter()
    const setPendingRoute = vi.fn()
    await applyTapNavigation({
      route: resolveTapRoute({ route: '/reservas' }),
      isAuthenticated: true,
      router,
      setPendingRoute,
    })
    expect(router.push).toHaveBeenCalledWith('/reservas')
    expect(setPendingRoute).not.toHaveBeenCalled()
  })

  it('SIN sesión → guarda el destino y manda al login (no empuja al destino)', async () => {
    const router = makeRouter()
    const setPendingRoute = vi.fn()
    await applyTapNavigation({ route: ESTIRAR, isAuthenticated: false, router, setPendingRoute })
    expect(setPendingRoute).toHaveBeenCalledWith(ESTIRAR)
    expect(router.push).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith('/login')
  })

  it('SIN sesión con /mi-templo → va al login sin guardar destino', async () => {
    const router = makeRouter()
    const setPendingRoute = vi.fn()
    await applyTapNavigation({
      route: '/mi-templo',
      isAuthenticated: false,
      router,
      setPendingRoute,
    })
    expect(setPendingRoute).not.toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledWith('/login')
  })

  it('con sesión pero el guard termina en login (sesión vencida) → el destino queda guardado', async () => {
    const router = makeRouter({ landsOn: 'login' })
    const setPendingRoute = vi.fn()
    await applyTapNavigation({ route: ESTIRAR, isAuthenticated: true, router, setPendingRoute })
    expect(setPendingRoute).toHaveBeenCalledWith(ESTIRAR)
  })

  it('con sesión y la navegación rechaza (router no listo) → destino guardado, sin lanzar', async () => {
    const router = makeRouter({ rejects: new Error('no listo') })
    const setPendingRoute = vi.fn()
    await expect(
      applyTapNavigation({ route: ESTIRAR, isAuthenticated: true, router, setPendingRoute }),
    ).resolves.toBeUndefined()
    expect(setPendingRoute).toHaveBeenCalledWith(ESTIRAR)
  })

  it('sin sesión y el push al login rechaza → no lanza (el destino ya quedó guardado)', async () => {
    const router = makeRouter({ rejectsOnLogin: true })
    const setPendingRoute = vi.fn()
    await expect(
      applyTapNavigation({ route: ESTIRAR, isAuthenticated: false, router, setPendingRoute }),
    ).resolves.toBeUndefined()
    expect(setPendingRoute).toHaveBeenCalledWith(ESTIRAR)
  })

  it('destino inválido (ruta vacía) con sesión → cae a /mi-templo, nunca un push vacío', async () => {
    const router = makeRouter()
    const setPendingRoute = vi.fn()
    await applyTapNavigation({ route: '', isAuthenticated: true, router, setPendingRoute })
    expect(router.push).toHaveBeenCalledWith('/mi-templo')
  })
})

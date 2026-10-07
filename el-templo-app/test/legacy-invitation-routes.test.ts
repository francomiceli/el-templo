import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import routes from 'src/router/routes'
import { APP_SECTIONS, resolveDestinationRoute } from 'src/config/destinations'

// Fase 194-27: la pantalla "Mis referidos" pasó a "Mis invitados". `/mis-referidos` queda como
// REDIRECT porque las builds publicadas, los pushes y los avisos con destino `referidos` siguen
// apuntando a esa ruta (la clave y la ruta de `destinations.ts` son espejo de la API). Los
// componentes son imports dinámicos: `resolve()` no los carga, el test corre en entorno node.

function buildRouter(): Router {
  return createRouter({ history: createMemoryHistory(), routes })
}

/** Resuelve una ruta siguiendo UN redirect de objeto (el único tipo que usa `mis-referidos`). */
function finalPath(router: Router, path: string): string {
  const resolved = router.resolve(path)
  const record = resolved.matched[resolved.matched.length - 1]
  const redirect = record?.redirect
  if (redirect && typeof redirect === 'object') {
    return router.resolve(redirect).path
  }
  return resolved.path
}

describe('rutas legacy de referidos → Mis invitados (194-27)', () => {
  it('/mis-invitados es la pantalla real (sin redirect)', () => {
    const router = buildRouter()
    const resolved = router.resolve({ name: 'mis-invitados' })
    expect(resolved.path).toBe('/mis-invitados')
    const record = resolved.matched[resolved.matched.length - 1]
    expect(record.redirect).toBeUndefined()
  })

  it('/mis-referidos redirige a /mis-invitados (builds publicadas y avisos viejos)', () => {
    const router = buildRouter()
    expect(finalPath(router, '/mis-referidos')).toBe('/mis-invitados')
  })

  it('el destino `referidos` de un push/aviso viejo termina en /mis-invitados', () => {
    const router = buildRouter()
    const section = APP_SECTIONS.find((s) => s.key === 'referidos')
    expect(section).toBeDefined()
    const route = resolveDestinationRoute({
      type: 'app_section',
      section: 'referidos',
      whatsappText: null,
    })
    expect(route).toBe(section?.route)
    expect(finalPath(router, route)).toBe('/mis-invitados')
  })

  it('el label visible del destino `referidos` ya no dice "referidos"', () => {
    const section = APP_SECTIONS.find((s) => s.key === 'referidos')
    expect(section?.label).toBe('Invitaciones')
  })
})

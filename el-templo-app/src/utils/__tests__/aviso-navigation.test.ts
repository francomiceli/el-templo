import { describe, it, expect, vi } from 'vitest'
import type { Router } from 'vue-router'
import { navigateToAvisoDestination } from '../aviso-navigation'
import type { PromptDestination } from 'src/stores/useAvisosStore'

function fakeRouter(): Router {
  return { push: vi.fn() } as unknown as Router
}

describe('navigateToAvisoDestination (D-01/D-03 — plan 193-15)', () => {
  it('whatsapp_sales navega a /contacto-ventas con el texto codificado', () => {
    const router = fakeRouter()
    const destination: PromptDestination = {
      type: 'whatsapp_sales',
      section: null,
      route: '/contacto-ventas',
      whatsappText: 'Hola, me interesa entrenar de forma presencial',
    }

    navigateToAvisoDestination(router, destination)

    expect(router.push).toHaveBeenCalledWith(
      '/contacto-ventas?text=Hola%2C%20me%20interesa%20entrenar%20de%20forma%20presencial',
    )
  })

  it('whatsapp_sales sin whatsappText navega con texto vacío', () => {
    const router = fakeRouter()
    const destination: PromptDestination = {
      type: 'whatsapp_sales',
      section: null,
      route: '/contacto-ventas',
      whatsappText: null,
    }

    navigateToAvisoDestination(router, destination)

    expect(router.push).toHaveBeenCalledWith('/contacto-ventas?text=')
  })

  it('app_section navega directo a destination.route', () => {
    const router = fakeRouter()
    const destination: PromptDestination = {
      type: 'app_section',
      section: 'referidos',
      route: '/mis-referidos',
      whatsappText: null,
    }

    navigateToAvisoDestination(router, destination)

    expect(router.push).toHaveBeenCalledWith('/mis-referidos')
  })
})

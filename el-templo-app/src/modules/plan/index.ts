import type { Router } from 'vue-router'
import type { ModuleManifest } from '../types'
import routes from './routes'

export const manifest: ModuleManifest = {
  name: 'plan',
  label: 'Planes',
  icon: 'card_membership',
  basePath: '/planes',
  routes,
}

export function registerModule(router: Router): void {
  routes.forEach((route) => {
    router.addRoute('layout', route)
  })
}

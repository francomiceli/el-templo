import type { Router } from 'vue-router'
import type { ModuleManifest } from '../types'
import routes from './routes'

export const manifest: ModuleManifest = {
  name: 'training',
  label: 'Entrenamiento',
  icon: 'img:/icons/entrenar.svg',
  basePath: '/training',
  routes,
}

export function registerModule(router: Router): void {
  // Register routes under the 'layout' parent route
  routes.forEach((route) => {
    router.addRoute('layout', route)
  })
}

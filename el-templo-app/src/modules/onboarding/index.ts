import type { Router } from 'vue-router'
import type { ModuleManifest } from '../types'
import routes from './routes'

export const manifest: ModuleManifest = {
  name: 'onboarding',
  label: 'Onboarding',
  icon: 'quiz',
  basePath: '/onboarding',
  routes,
}

export function registerModule(router: Router): void {
  // Onboarding is a top-level route (NOT under 'layout'), so add directly
  routes.forEach((route) => {
    router.addRoute(route)
  })
}

export default manifest

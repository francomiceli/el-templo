import type { Router } from 'vue-router'
import type { ModuleManifest } from '../types'
import routes from './routes'

/**
 * Personalizada module manifest.
 *
 * Provides personalized session selection and session flow
 * for zone-focused training paths.
 */
export const manifest: ModuleManifest = {
  name: 'personalizada',
  label: 'Personalizada',
  icon: 'explore',
  basePath: '/personalizada',
  routes,
}

/**
 * Register personalizada module routes under the layout parent.
 *
 * @param router - Vue Router instance
 */
export function registerModule(router: Router): void {
  routes.forEach((route) => {
    router.addRoute('layout', route)
  })
}

export default manifest

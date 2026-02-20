import type { Router } from 'vue-router'
import type { ModuleManifest } from '../types'
import routes from './routes'

/**
 * Journey module manifest.
 *
 * Provides personalized journey selection and session flow
 * for zone-focused training paths.
 */
export const manifest: ModuleManifest = {
  name: 'journey',
  label: 'Journey',
  icon: 'explore',
  basePath: '/journey',
  routes,
}

/**
 * Register journey module routes under the layout parent.
 *
 * @param router - Vue Router instance
 */
export function registerModule(router: Router): void {
  routes.forEach((route) => {
    router.addRoute('layout', route)
  })
}

export default manifest

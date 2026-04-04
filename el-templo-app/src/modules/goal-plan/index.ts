import type { Router } from 'vue-router'
import type { ModuleManifest } from '../types'
import routes from './routes'

/**
 * Goal Plan module manifest.
 *
 * Provides goal-plan session selection and session flow
 * for zone-focused training paths.
 */
export const manifest: ModuleManifest = {
  name: 'goal-plan',
  label: 'Por Objetivos',
  icon: 'explore',
  basePath: '/goal-plan',
  routes,
}

/**
 * Register goal-plan module routes under the layout parent.
 *
 * @param router - Vue Router instance
 */
export function registerModule(router: Router): void {
  routes.forEach((route) => {
    router.addRoute('layout', route)
  })
}

export default manifest

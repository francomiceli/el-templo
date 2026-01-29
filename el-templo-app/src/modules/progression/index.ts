import type { Router } from 'vue-router';
import type { ModuleManifest } from '../types';
import routes from './routes';

/**
 * Progression module manifest
 *
 * Provides the Mi Camino feature for tracking member progression.
 */
export const manifest: ModuleManifest = {
  name: 'progression',
  label: 'Mi Camino',
  icon: 'trending_up',
  basePath: '/mi-camino',
  routes,
};

/**
 * Register progression module routes
 *
 * @param router - Vue Router instance
 */
export function registerModule(router: Router): void {
  routes.forEach((route) => {
    router.addRoute('layout', route);
  });
}

export default manifest;

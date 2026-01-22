import type { RouteRecordRaw } from 'vue-router'

export interface ModuleManifest {
  name: string           // Internal identifier (e.g., 'training')
  label: string          // Display label in nav (e.g., 'Entrenamiento')
  icon: string           // Material icon name
  basePath: string       // Route base path (e.g., '/training')
  routes: RouteRecordRaw[] // Module routes (lazy-loaded)
}
